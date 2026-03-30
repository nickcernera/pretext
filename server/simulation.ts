import {
  TICK_RATE,
  TICK_MS,
  BASE_SPEED,
  SPEED_EXPONENT,
  MASS_DECAY_RATE,
  MIN_MASS,
  EAT_RATIO,
  EAT_OVERLAP,
  WORLD_W,
  WORLD_H,
  PELLET_MASS_PER_CHAR,
} from '../shared/constants'
import { massToRadius } from '../shared/protocol'
import type { ServerMessage, PlayerState, PelletState, DeathStats } from '../shared/protocol'
import type { Room, ServerPlayer } from './room'
import type { RoomManager } from './room'
import { SpatialGrid } from './spatial'
import { tickBots, fillBots, cleanupBotState } from './bot'

export class Simulation {
  private interval: ReturnType<typeof setInterval> | null = null
  private roomManager: RoomManager

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager
  }

  start() {
    this.interval = setInterval(() => {
      const dt = TICK_MS / 1000
      for (const room of this.roomManager.allRooms()) {
        fillBots(room)
        this.tickRoom(room, dt)
        this.broadcastState(room)
        this.broadcastLeaderboard(room)
      }
    }, TICK_MS)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  tickRoom(room: Room, dt: number) {
    // 1. Bot AI
    tickBots(room, dt)

    const players = Array.from(room.players.values())

    // 2. Build spatial grid with players
    const grid = new SpatialGrid()
    const playerById = new Map<number, ServerPlayer>()
    let idx = 0
    for (const p of players) {
      const r = massToRadius(p.mass)
      grid.insert(idx, p.x, p.y, r)
      playerById.set(idx, p)
      idx++
    }

    // 3. Move players toward targets
    for (const p of players) {
      const dx = p.targetX - p.x
      const dy = p.targetY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1) continue

      const speed = BASE_SPEED * Math.pow(100 / p.mass, SPEED_EXPONENT)
      const move = Math.min(dist, speed * dt)
      p.x += (dx / dist) * move
      p.y += (dy / dist) * move

      // Clamp to world bounds
      p.x = Math.max(0, Math.min(WORLD_W, p.x))
      p.y = Math.max(0, Math.min(WORLD_H, p.y))
    }

    // 4. Player-vs-player eating
    const eaten = new Set<string>()
    for (let i = 0; i < players.length; i++) {
      const a = players[i]
      if (eaten.has(a.id)) continue
      const ra = massToRadius(a.mass)
      const nearby = grid.query(a.x, a.y, ra + 200) // query with generous radius

      for (const ni of nearby) {
        const b = playerById.get(ni)!
        if (b.id === a.id || eaten.has(b.id)) continue

        // Check eat ratio
        if (a.mass < b.mass * EAT_RATIO && b.mass < a.mass * EAT_RATIO) continue

        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const rb = massToRadius(b.mass)

        // Determine who eats whom
        let killer: ServerPlayer, victim: ServerPlayer, killerR: number, victimR: number
        if (a.mass >= b.mass * EAT_RATIO) {
          killer = a
          victim = b
          killerR = ra
          victimR = rb
        } else if (b.mass >= a.mass * EAT_RATIO) {
          killer = b
          victim = a
          killerR = rb
          victimR = ra
        } else {
          continue
        }

        // Check overlap: victim center must be within EAT_OVERLAP * killer radius from killer edge
        if (dist < killerR * EAT_OVERLAP + victimR * (1 - EAT_OVERLAP)) {
          // Eat!
          killer.mass += victim.mass
          if (killer.mass > killer.peakMass) killer.peakMass = killer.mass
          killer.kills++
          killer.victims.push(victim.handle)
          killer.text = `ate ${victim.handle}`
          eaten.add(victim.id)

          // Send kill message to room
          const killMsg: ServerMessage = {
            t: 'kill',
            killerId: killer.id,
            victimId: victim.id,
            killerHandle: killer.handle,
            victimHandle: victim.handle,
          }
          this.broadcastToRoom(room, killMsg)

          // Send died message to victim
          if (victim.ws) {
            const diedMsg: ServerMessage = {
              t: 'died',
              stats: {
                handle: victim.handle,
                timeAlive: Date.now() - victim.joinedAt,
                kills: victim.kills,
                peakMass: Math.round(victim.peakMass),
                victims: victim.victims,
                killedBy: killer.handle,
              },
            }
            victim.ws.send(JSON.stringify(diedMsg))
          }
        }
      }
    }

    // Remove eaten players
    for (const id of eaten) {
      cleanupBotState(id)
      room.removePlayer(id)
    }

    // 5. Player-vs-pellet eating
    for (const p of players) {
      if (eaten.has(p.id)) continue
      const pr = massToRadius(p.mass)

      room.pellets = room.pellets.filter((pellet) => {
        const dx = p.x - pellet.x
        const dy = p.y - pellet.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < pr) {
          p.mass += pellet.word.length * PELLET_MASS_PER_CHAR
          p.text += ' ' + pellet.word
          if (p.mass > p.peakMass) p.peakMass = p.mass
          return false
        }
        return true
      })
    }

    // 6. Respawn pellets
    room.respawnPellets()

    // 7. Mass decay
    for (const p of room.players.values()) {
      if (p.mass > MIN_MASS) {
        p.mass -= p.mass * MASS_DECAY_RATE * dt
        if (p.mass < MIN_MASS) p.mass = MIN_MASS
      }
    }
  }

  private broadcastState(room: Room) {
    const players: PlayerState[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      handle: p.handle,
      x: Math.round(p.x),
      y: Math.round(p.y),
      mass: Math.round(p.mass),
      color: p.color,
    }))

    const pellets: PelletState[] = room.pellets

    const msg: ServerMessage = { t: 'state', players, pellets }
    const json = JSON.stringify(msg)

    for (const p of room.players.values()) {
      if (p.ws) {
        try {
          p.ws.send(json)
        } catch {
          // Connection might be closed
        }
      }
    }
  }

  private broadcastLeaderboard(room: Room) {
    const isSnapshot = room.shouldSnapshot()
    // Only send leaderboard periodically or as snapshot
    // For now, piggyback on every tick via state message — leaderboard sent less often
    // We'll send leaderboard every ~1 second (every 30 ticks)
    if (!isSnapshot && Math.random() > 1 / 30) return

    const entries = room.getLeaderboard()
    const msg: ServerMessage = { t: 'leaderboard', entries, isSnapshot }
    const json = JSON.stringify(msg)

    for (const p of room.players.values()) {
      if (p.ws) {
        try {
          p.ws.send(json)
        } catch {
          // Connection might be closed
        }
      }
    }
  }

  private broadcastToRoom(room: Room, msg: ServerMessage) {
    const json = JSON.stringify(msg)
    for (const p of room.players.values()) {
      if (p.ws) {
        try {
          p.ws.send(json)
        } catch {
          // Connection might be closed
        }
      }
    }
  }
}
