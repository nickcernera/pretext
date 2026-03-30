// --- Client → Server ---
export type ClientMessage =
  | { t: 'join'; room: string; token?: string; guest?: string }
  | { t: 'input'; x: number; y: number }
  | { t: 'split' }
  | { t: 'eject' }

// --- Server → Client ---
export type ServerMessage =
  | { t: 'joined'; room: string; playerId: string; world: { w: number; h: number } }
  | { t: 'state'; players: PlayerState[]; pellets: PelletState[] }
  | { t: 'kill'; killerId: string; victimId: string; killerHandle: string; victimHandle: string }
  | { t: 'died'; stats: DeathStats }
  | { t: 'leaderboard'; entries: LeaderboardEntry[]; isSnapshot: boolean }
  | { t: 'error'; msg: string }

export type CellState = {
  cellId: number
  x: number
  y: number
  mass: number
}

export type PlayerState = {
  id: string
  handle: string
  x: number        // center-of-mass X
  y: number        // center-of-mass Y
  mass: number     // total mass
  color: string
  cells: CellState[]
}

export type PelletState = {
  id: number
  x: number
  y: number
  word: string
}

export type DeathStats = {
  handle: string
  timeAlive: number
  kills: number
  peakMass: number
  victims: string[]
  killedBy: string
}

export type LeaderboardEntry = {
  handle: string
  mass: number
  kills: number
}

export function handleToColor(handle: string): string {
  let hash = 0
  for (let i = 0; i < handle.length; i++) {
    hash = handle.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = ((hash % 160) + 160) % 160 + 100
  return `hsl(${h}, 50%, 65%)`
}

export function massToRadius(mass: number): number {
  return Math.sqrt(mass / Math.PI) * 4
}
