import type { DeathStats } from '@shared/protocol'

const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://pretextarena.io'

export function buildShareUrl(
  type: 'death' | 'leaderboard' | 'invite' | 'challenge',
  stats?: DeathStats,
  roomCode?: string,
): string {
  let text: string
  const url = roomCode ? `${BASE_URL}/r/${roomCode}` : BASE_URL
  const killer = stats?.killedBy || 'the arena'

  switch (type) {
    case 'death':
      if (stats && stats.kills > 0) {
        text = `Just devoured ${stats.kills} player${stats.kills > 1 ? 's' : ''} on Pretext Arena before ${killer} got me`
      } else {
        text = `Just got devoured by ${killer} on Pretext Arena`
      }
      break
    case 'challenge':
      text = `I'm coming for you ${killer} on Pretext Arena`
      break
    case 'leaderboard':
      text = 'Ruling the arena on Pretext Arena — come dethrone me'
      break
    case 'invite':
      text = `Who can eat me? ${url}`
      break
    default:
      text = 'Playing Pretext Arena — you are your text'
  }

  const intentUrl = new URL('https://x.com/intent/tweet')
  intentUrl.searchParams.set('text', text)
  if (type !== 'invite') intentUrl.searchParams.set('url', url)
  return intentUrl.toString()
}

export function copyRoomLink(roomCode: string) {
  const url = `${BASE_URL}/r/${roomCode}`
  navigator.clipboard.writeText(url)
}

export function httpFromWs(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
}

export function buildCardUrl(
  stats: DeathStats,
  roomCode: string,
  serverUrl: string,
): string {
  const httpUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
  const payload = JSON.stringify({
    h: stats.handle,
    t: stats.timeAlive,
    k: stats.kills,
    p: stats.peakMass,
    v: stats.victims.slice(0, 5),
    b: stats.killedBy,
    r: roomCode,
  })
  const encoded = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${httpUrl}/card/${encoded}`
}
