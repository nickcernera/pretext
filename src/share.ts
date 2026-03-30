import type { DeathStats } from '@shared/protocol'

const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://pretext.io'

export function buildShareUrl(
  type: 'death' | 'leaderboard' | 'invite',
  stats?: DeathStats,
  roomCode?: string,
): string {
  let text: string
  const url = roomCode ? `${BASE_URL}/r/${roomCode}` : BASE_URL

  switch (type) {
    case 'death':
      if (stats && stats.kills > 0) {
        text = `Just devoured ${stats.kills} player${stats.kills > 1 ? 's' : ''} on pretext.io before ${stats.killedBy} got me`
      } else {
        text = `Just got devoured by ${stats?.killedBy} on pretext.io`
      }
      break
    case 'leaderboard':
      text = 'Ruling the arena on pretext.io — come dethrone me'
      break
    case 'invite':
      text = `Who can eat me? ${url}`
      break
    default:
      text = 'Playing pretext.io — you are your text'
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
