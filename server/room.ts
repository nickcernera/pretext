import type { ServerWebSocket } from 'bun'
import {
  WORLD_W,
  WORLD_H,
  PELLET_COUNT,
  ROOM_CAPACITY,
  ROOM_IDLE_TIMEOUT,
  LEADERBOARD_INTERVAL,
  MIN_MASS,
  MAX_ROOMS,
} from '../shared/constants'
import { handleToColor } from '../shared/protocol'
import { createPelletBag } from '../shared/words'
import type { PelletState, LeaderboardEntry, RoomInfo, ActivityEvent, RoomsResponse } from '../shared/protocol'

export type ServerCell = {
  cellId: number
  x: number
  y: number
  mass: number
  vx: number
  vy: number
  splitTime: number  // timestamp when created by split (0 = original)
}

export type ServerPlayer = {
  id: string
  handle: string
  bio: string
  avatar: string
  cells: ServerCell[]
  color: string
  targetX: number
  targetY: number
  kills: number
  victims: string[]
  text: string
  peakMass: number
  joinedAt: number
  ws: ServerWebSocket<WsData> | null // null for bots
  nextCellId: number
}

export function playerTotalMass(p: ServerPlayer): number {
  let total = 0
  for (const c of p.cells) total += c.mass
  return total
}

export function playerCenterOfMass(p: ServerPlayer): { x: number; y: number } {
  let totalMass = 0, wx = 0, wy = 0
  for (const c of p.cells) {
    wx += c.x * c.mass
    wy += c.y * c.mass
    totalMass += c.mass
  }
  if (totalMass === 0) return { x: 0, y: 0 }
  return { x: wx / totalMass, y: wy / totalMass }
}

/** Combined mass + center of mass in a single pass (avoids iterating cells twice) */
export function playerMassAndCenter(p: ServerPlayer): { totalMass: number; x: number; y: number } {
  let totalMass = 0, wx = 0, wy = 0
  for (const c of p.cells) {
    wx += c.x * c.mass
    wy += c.y * c.mass
    totalMass += c.mass
  }
  if (totalMass === 0) return { totalMass: 0, x: 0, y: 0 }
  return { totalMass, x: wx / totalMass, y: wy / totalMass }
}

export type WsData = {
  playerId: string
  roomCode: string
  msgCount: number
  msgWindowStart: number
  lastJoinAt: number
}

export class Room {
  code: string
  isPublic: boolean
  players: Map<string, ServerPlayer> = new Map()
  spectators: Set<ServerWebSocket<WsData>> = new Set()
  pellets: PelletState[] = []
  private nextPelletId = 0
  private lastSnapshotAt = 0
  private nextPelletWord = createPelletBag()

  constructor(code: string, isPublic = false) {
    this.code = code
    this.isPublic = isPublic
    this.spawnInitialPellets()
  }

  private spawnInitialPellets() {
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet())
    }
  }

  private static readonly MIN_PELLET_DIST = 120

  /** Spawn radius around a player for biased pellet placement */
  private static readonly SPAWN_RADIUS = 800

  spawnPellet(): PelletState {
    const word = this.nextPelletWord()
    let x: number, y: number
    let attempts = 0

    // 50% chance to spawn near a random player (if any exist)
    const players = Array.from(this.players.values())
    const nearPlayer = players.length > 0 && Math.random() < 0.5
      ? players[Math.floor(Math.random() * players.length)]
      : null

    do {
      if (nearPlayer) {
        // Spawn within SPAWN_RADIUS of the chosen player, clamped to world
        const angle = Math.random() * Math.PI * 2
        const dist = Math.random() * Room.SPAWN_RADIUS
        const cell = nearPlayer.cells[0]
        x = Math.max(0, Math.min(WORLD_W, cell.x + Math.cos(angle) * dist))
        y = Math.max(0, Math.min(WORLD_H, cell.y + Math.sin(angle) * dist))
      } else {
        x = Math.random() * WORLD_W
        y = Math.random() * WORLD_H
      }
      attempts++
    } while (attempts < 20 && this.pellets.some(p => {
      const dx = p.x - x, dy = p.y - y
      return dx * dx + dy * dy < Room.MIN_PELLET_DIST * Room.MIN_PELLET_DIST
    }))
    return { id: this.nextPelletId++, x, y, word }
  }

  addPlayer(id: string, handle: string, ws: ServerWebSocket<WsData> | null, avatar = ''): ServerPlayer {
    const x = Math.random() * WORLD_W
    const y = Math.random() * WORLD_H
    const player: ServerPlayer = {
      id,
      handle,
      bio: '',
      avatar,
      cells: [{ cellId: 0, x, y, mass: 200, vx: 0, vy: 0, splitTime: 0 }],
      color: handleToColor(handle),
      targetX: x,
      targetY: y,
      kills: 0,
      victims: [],
      text: handle,
      peakMass: 200,
      joinedAt: Date.now(),
      ws,
      nextCellId: 1,
    }
    this.players.set(id, player)
    return player
  }

  removePlayer(id: string) {
    this.players.delete(id)
  }

  addSpectator(ws: ServerWebSocket<WsData>) {
    this.spectators.add(ws)
  }

  removeSpectator(ws: ServerWebSocket<WsData>) {
    this.spectators.delete(ws)
  }

  playerCount(): number {
    return this.players.size
  }

  realPlayerCount(): number {
    let count = 0
    for (const p of this.players.values()) {
      if (p.ws !== null) count++
    }
    return count
  }

  getLeaderboard(): LeaderboardEntry[] {
    return Array.from(this.players.values())
      .map(p => ({ p, mass: playerTotalMass(p) }))
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map(({ p, mass }) => ({ handle: p.handle, mass: Math.round(mass), kills: p.kills }))
  }

  shouldSnapshot(): boolean {
    const now = Date.now()
    if (now - this.lastSnapshotAt >= LEADERBOARD_INTERVAL) {
      this.lastSnapshotAt = now
      return true
    }
    return false
  }

  respawnPellets() {
    const deficit = PELLET_COUNT - this.pellets.length
    for (let i = 0; i < deficit; i++) {
      this.pellets.push(this.spawnPellet())
    }
  }

  isIdle(): boolean {
    if (this.realPlayerCount() > 0) return false
    // Consider idle if no real players for ROOM_IDLE_TIMEOUT
    // We check joinedAt of remaining bots - if all bots joined long ago and no real players, idle
    const now = Date.now()
    for (const p of this.players.values()) {
      if (now - p.joinedAt < ROOM_IDLE_TIMEOUT) return false
    }
    return true
  }

  getInfo(): RoomInfo {
    let topPlayer: string | null = null
    let topMass = 0
    for (const p of this.players.values()) {
      const mass = playerTotalMass(p)
      if (mass > topMass) {
        topMass = mass
        topPlayer = p.handle
      }
    }
    return {
      code: this.code,
      playerCount: this.playerCount(),
      topPlayer,
      topMass: Math.round(topMass),
    }
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map()
  recentActivity: ActivityEvent[] = []

  pushActivity(event: ActivityEvent) {
    this.recentActivity.push(event)
    if (this.recentActivity.length > 50) {
      this.recentActivity.shift()
    }
  }

  getRoomsResponse(): RoomsResponse {
    const rooms: RoomInfo[] = []
    let totalPlayers = 0
    for (const room of this.rooms.values()) {
      rooms.push(room.getInfo())
      totalPlayers += room.playerCount()
    }
    return {
      rooms,
      totalPlayers,
      activity: this.recentActivity,
    }
  }

  getOrCreateRoom(code: string): Room | null {
    let room = this.rooms.get(code)
    if (!room) {
      if (this.rooms.size >= MAX_ROOMS) return null
      room = new Room(code, false)
      this.rooms.set(code, room)
    }
    return room
  }

  getPublicRoom(): Room | null {
    // Only consider rooms explicitly marked as public
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.playerCount() < ROOM_CAPACITY) {
        return room
      }
    }
    // Create a new public room with random code
    if (this.rooms.size >= MAX_ROOMS) return null
    const code = Math.random().toString(36).substring(2, 8)
    const room = new Room(code, true)
    this.rooms.set(code, room)
    return room
  }

  roomCount(): number {
    return this.rooms.size
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  cleanup() {
    for (const [code, room] of this.rooms) {
      if (room.playerCount() === 0 || room.isIdle()) {
        this.rooms.delete(code)
      }
    }
  }

  allRooms(): Room[] {
    return Array.from(this.rooms.values())
  }
}
