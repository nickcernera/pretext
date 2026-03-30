import { createHmac, timingSafeEqual } from 'crypto'

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || ''
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:5173/callback'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production')
}
const EFFECTIVE_SECRET = JWT_SECRET || 'dev-only-' + crypto.randomUUID()

export type UserInfo = { handle: string; displayName: string; avatar: string; bio: string }

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: TWITTER_CLIENT_ID,
    code_verifier: codeVerifier,
  })
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`)}`,
    },
    body: params.toString(),
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error('Token exchange failed:', res.status, errBody)
    throw new Error('Authentication failed')
  }
  return (await res.json()).access_token
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch('https://api.x.com/2/users/me?user.fields=description,profile_image_url', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error('User fetch failed:', res.status, errBody)
    throw new Error('Could not fetch user profile')
  }
  console.log('User info fetched successfully')
  const data = await res.json()
  return {
    handle: `@${data.data.username}`,
    displayName: data.data.name,
    avatar: data.data.profile_image_url || '',
    bio: data.data.description || '',
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function base64urlEncode(str: string): string {
  return Buffer.from(str).toString('base64url')
}

export function createJWT(userInfo: UserInfo): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64urlEncode(JSON.stringify({
    ...userInfo,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  }))
  const signature = base64url(
    createHmac('sha256', EFFECTIVE_SECRET).update(`${header}.${payload}`).digest()
  )
  return `${header}.${payload}.${signature}`
}

export function verifyJWT(token: string): UserInfo | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, sig] = parts

    const expected = createHmac('sha256', EFFECTIVE_SECRET)
      .update(`${header}.${payload}`)
      .digest()
    const actual = Buffer.from(sig, 'base64url')

    if (expected.length !== actual.length) return null
    if (!timingSafeEqual(expected, actual)) return null

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null

    return {
      handle: data.handle,
      displayName: data.displayName,
      avatar: data.avatar,
      bio: data.bio,
    }
  } catch {
    return null
  }
}

export function getTwitterAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'tweet.read users.read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://x.com/i/oauth2/authorize?${params.toString()}`
}
