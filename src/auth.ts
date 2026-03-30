const SERVER_URL = import.meta.env.VITE_SERVER_URL?.replace(/^wss?/, (m: string) => m === 'wss' ? 'https' : 'http') || 'http://localhost:3001'

export type AuthUser = {
  handle: string
  displayName: string
  avatar: string
  bio: string
  jwt: string
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function startXAuth(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state = crypto.randomUUID()
  sessionStorage.setItem('oauth_verifier', verifier)
  sessionStorage.setItem('oauth_state', state)
  window.location.href = `${SERVER_URL}/auth/twitter?code_challenge=${challenge}&state=${state}`
}

export async function handleCallback(code: string, returnedState: string): Promise<AuthUser> {
  const expectedState = sessionStorage.getItem('oauth_state')
  if (!expectedState || returnedState !== expectedState) {
    sessionStorage.removeItem('oauth_state')
    sessionStorage.removeItem('oauth_verifier')
    throw new Error('Invalid OAuth state — possible CSRF attack')
  }
  sessionStorage.removeItem('oauth_state')

  const verifier = sessionStorage.getItem('oauth_verifier') || ''
  sessionStorage.removeItem('oauth_verifier')

  const res = await fetch(`${SERVER_URL}/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  })
  if (!res.ok) throw new Error('Auth failed')
  const data = await res.json()
  localStorage.setItem('pretext_jwt', data.jwt)
  localStorage.setItem('pretext_user', JSON.stringify(data.user))
  return { ...data.user, jwt: data.jwt }
}

export function getStoredUser(): AuthUser | null {
  const jwt = localStorage.getItem('pretext_jwt')
  const user = localStorage.getItem('pretext_user')
  if (!jwt || !user) return null
  try { return { ...JSON.parse(user), jwt } } catch { return null }
}

export function logout() {
  localStorage.removeItem('pretext_jwt')
  localStorage.removeItem('pretext_user')
}
