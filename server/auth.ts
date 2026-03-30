const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || ''
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:5173/callback'
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

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
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return (await res.json()).access_token
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch('https://api.x.com/2/users/me?user.fields=description,profile_image_url', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`User fetch failed: ${res.status}`)
  const data = await res.json()
  return {
    handle: `@${data.data.username}`,
    displayName: data.data.name,
    avatar: data.data.profile_image_url || '',
    bio: data.data.description || '',
  }
}

export function createJWT(userInfo: UserInfo): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ ...userInfo, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }))
  const signature = btoa(JWT_SECRET + header + payload)
  return `${header}.${payload}.${signature}`
}

export function verifyJWT(token: string): UserInfo | null {
  try {
    const [header, payload, sig] = token.split('.')
    if (sig !== btoa(JWT_SECRET + header + payload)) return null
    const data = JSON.parse(atob(payload))
    if (data.exp < Date.now()) return null
    return { handle: data.handle, displayName: data.displayName, avatar: data.avatar, bio: data.bio }
  } catch { return null }
}

export function getTwitterAuthUrl(codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'tweet.read users.read offline.access',
    state: 'pretext',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://x.com/i/oauth2/authorize?${params.toString()}`
}
