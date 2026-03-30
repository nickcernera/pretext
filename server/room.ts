import type { ServerWebSocket } from 'bun'
import {
  WORLD_W,
  WORLD_H,
  PELLET_COUNT,
  ROOM_CAPACITY,
  ROOM_IDLE_TIMEOUT,
  LEADERBOARD_INTERVAL,
  MIN_MASS,
  PELLET_MASS,
} from '../shared/constants'
import { handleToColor } from '../shared/protocol'
import type { PelletState, LeaderboardEntry } from '../shared/protocol'

export type ServerPlayer = {
  id: string
  handle: string
  bio: string
  x: number
  y: number
  mass: number
  color: string
  targetX: number
  targetY: number
  kills: number
  victims: string[]
  text: string
  peakMass: number
  joinedAt: number
  ws: ServerWebSocket<WsData> | null // null for bots
}

export type WsData = {
  playerId: string
  roomCode: string
}

export class Room {
  code: string
  players: Map<string, ServerPlayer> = new Map()
  pellets: PelletState[] = []
  private nextPelletId = 0
  private lastSnapshotAt = 0

  constructor(code: string) {
    this.code = code
    this.spawnInitialPellets()
  }

  private spawnInitialPellets() {
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push({
        id: this.nextPelletId++,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
    }
  }

  addPlayer(id: string, handle: string, ws: ServerWebSocket<WsData> | null): ServerPlayer {
    const player: ServerPlayer = {
      id,
      handle,
      bio: '',
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      mass: 200,
      color: handleToColor(handle),
      targetX: 0,
      targetY: 0,
      kills: 0,
      victims: [],
      text: handle,
      peakMass: 200,
      joinedAt: Date.now(),
      ws,
    }
    player.targetX = player.x
    player.targetY = player.y
    this.players.set(id, player)
    return player
  }

  removePlayer(id: string) {
    this.players.delete(id)
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
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((p) => ({ handle: p.handle, mass: Math.round(p.mass), kills: p.kills }))
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
      this.pellets.push({
        id: this.nextPelletId++,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
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
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map()

  getOrCreateRoom(code: string): Room {
    let room = this.rooms.get(code)
    if (!room) {
      room = new Room(code)
      this.rooms.set(code, room)
    }
    return room
  }

  getPublicRoom(): Room {
    // Find a room with space that isn't a private code
    for (const room of this.rooms.values()) {
      if (room.playerCount() < ROOM_CAPACITY) {
        return room
      }
    }
    // Create a new public room with random code
    const code = Math.random().toString(36).substring(2, 8)
    return this.getOrCreateRoom(code)
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
