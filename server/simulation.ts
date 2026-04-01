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
  SPLIT_MIN_MASS,
  SPLIT_VELOCITY,
  SPLIT_DECEL,
  MAX_CELLS,
  MERGE_TIME,
} from '../shared/constants'
import { massToRadius, pelletRadius } from '../shared/protocol'
import type { ServerMessage, PlayerState, PelletState, CellState } from '../shared/protocol'
import type { Room, ServerPlayer, ServerCell } from './room'
import { playerTotalMass, playerMassAndCenter } from './room'
import type { RoomManager } from './room'
import { SpatialGrid } from './spatial'
import { tickBots, fillBots, cleanupBotState } from './bot'
import type { StatsTracker } from './stats'

type CellEntry = {
  playerId: string
  cellId: number
  cell: ServerCell
  player: ServerPlayer
}

export function splitPlayer(player: ServerPlayer, now: number) {
  const toAdd: ServerCell[] = []
  for (const cell of player.cells) {
    if (cell.mass < SPLIT_MIN_MASS) continue
    if (player.cells.length + toAdd.length >= MAX_CELLS) break

    const halfMass = cell.mass / 2
    cell.mass = halfMass

    // Direction toward cursor
    const dx = player.targetX - cell.x
    const dy = player.targetY - cell.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / dist
    const ny = dy / dist

    const newCell: ServerCell = {
      cellId: player.nextCellId++,
      x: cell.x + nx * massToRadius(halfMass),
      y: cell.y + ny * massToRadius(halfMass),
      mass: halfMass,
      vx: nx * SPLIT_VELOCITY,
      vy: ny * SPLIT_VELOCITY,
      splitTime: now,
    }
    cell.splitTime = now
    toAdd.push(newCell)
  }
  player.cells.push(...toAdd)
}

export class Simulation {
  private timeout: ReturnType<typeof setTimeout> | null = null
  private lastTickTime = 0
  private roomManager: RoomManager
  private stats: StatsTracker
  private lastPelletIds = new Map<string, Set<number>>() // roomCode → pellet IDs last broadcast
  private grid = new SpatialGrid()
  private entries: CellEntry[] = []

  constructor(roomManager: RoomManager, stats: StatsTracker) {
    this.roomManager = roomManager
    this.stats = stats
  }

  start() {
    const tick = () => {
      const now = performance.now()
      const realDt = this.lastTickTime ? (now - this.lastTickTime) / 1000 : TICK_MS / 1000
      this.lastTickTime = now
      const dt = Math.min(realDt, TICK_MS * 3 / 1000) // cap at 3x to prevent death spiral

      const tickStart = now
      const rooms = this.roomManager.allRooms()
      this.stats.roomCount = rooms.length
      for (const room of rooms) {
        const hasAudience = room.realPlayerCount() > 0 || room.spectators.size > 0
        if (!hasAudience) continue // skip bot-only rooms entirely
        fillBots(room)
        this.tickRoom(room, dt)
        this.broadcastState(room)
        this.broadcastLeaderboard(room)
      }
      // Prune pellet delta tracking for deleted rooms
      if (this.lastPelletIds.size > rooms.length + 10) {
        const activeCodes = new Set(rooms.map(r => r.code))
        for (const code of this.lastPelletIds.keys()) {
          if (!activeCodes.has(code)) this.lastPelletIds.delete(code)
        }
      }
      this.stats.onTick(performance.now() - tickStart)

      // Self-correcting: schedule next tick relative to target cadence
      const elapsed = performance.now() - now
      const nextDelay = Math.max(1, TICK_MS - elapsed)
      this.timeout = setTimeout(tick, nextDelay)
    }
    this.timeout = setTimeout(tick, TICK_MS)
  }

  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.lastTickTime = 0
  }

  tickRoom(room: Room, dt: number) {
    const now = Date.now()

    // 1. Bot AI
    tickBots(room, dt)

    const players = Array.from(room.players.values())

    // 2. Build spatial grid with individual cells (reuse grid + array to reduce GC)
    this.grid.clear()
    this.entries.length = 0
    let idx = 0
    for (const p of players) {
      for (const c of p.cells) {
        const r = massToRadius(c.mass)
        this.grid.insert(idx, c.x, c.y, r)
        this.entries.push({ playerId: p.id, cellId: c.cellId, cell: c, player: p })
        idx++
      }
    }

    // 3. Move each cell independently
    for (const p of players) {
      for (const c of p.cells) {
        // Apply momentum (from splitting)
        c.x += c.vx * dt
        c.y += c.vy * dt
        const decel = Math.pow(SPLIT_DECEL, dt * TICK_RATE)
        c.vx *= decel
        c.vy *= decel
        if (Math.abs(c.vx) < 1 && Math.abs(c.vy) < 1) {
          c.vx = 0
          c.vy = 0
        }

        // Move toward cursor
        const dx = p.targetX - c.x
        const dy = p.targetY - c.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 1) {
          const speed = BASE_SPEED * Math.pow(100 / c.mass, SPEED_EXPONENT)
          const move = Math.min(dist, speed * dt)
          c.x += (dx / dist) * move
          c.y += (dy / dist) * move
        }

        // Clamp to world bounds
        const r = massToRadius(c.mass)
        c.x = Math.max(r, Math.min(WORLD_W - r, c.x))
        c.y = Math.max(r, Math.min(WORLD_H - r, c.y))
      }
    }

    // 4. Sibling cell repulsion + merge
    for (const p of players) {
      if (p.cells.length < 2) continue
      for (let i = 0; i < p.cells.length; i++) {
        for (let j = i + 1; j < p.cells.length; j++) {
          const a = p.cells[i]
          const b = p.cells[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
          const ra = massToRadius(a.mass)
          const rb = massToRadius(b.mass)
          const overlap = ra + rb - dist

          if (overlap <= 0) continue

          const canMerge =
            (now - a.splitTime >= MERGE_TIME) &&
            (now - b.splitTime >= MERGE_TIME)

          if (canMerge) {
            // Merge: keep larger, absorb smaller
            const [keep, absorb] = a.mass >= b.mass ? [a, b] : [b, a]
            const totalMass = keep.mass + absorb.mass
            // Move to center of mass
            keep.x = (keep.x * keep.mass + absorb.x * absorb.mass) / totalMass
            keep.y = (keep.y * keep.mass + absorb.y * absorb.mass) / totalMass
            keep.mass = totalMass
            p.cells.splice(p.cells.indexOf(absorb), 1)
            j-- // re-check this index
          } else {
            // Push apart
            const pushDist = overlap / 2
            const nx = dx / dist
            const ny = dy / dist
            a.x -= nx * pushDist
            a.y -= ny * pushDist
            b.x += nx * pushDist
            b.y += ny * pushDist
          }
        }
      }
    }

    // 5. Cell-vs-cell eating (inter-player)
    const eatenCells = new Set<number>() // grid indices of eaten cells
    const deadPlayers = new Set<string>()

    for (let i = 0; i < idx; i++) {
      if (eatenCells.has(i)) continue
      const a = this.entries[i]
      if (deadPlayers.has(a.playerId)) continue

      const ra = massToRadius(a.cell.mass)
      const nearby = this.grid.query(a.cell.x, a.cell.y, ra + 200)

      for (const ni of nearby) {
        if (ni === i) continue
        if (eatenCells.has(ni)) continue
        const b = this.entries[ni]
        if (b.playerId === a.playerId) continue // siblings never eat each other
        if (deadPlayers.has(b.playerId)) continue

        // Check eat ratio between cells
        if (a.cell.mass < b.cell.mass * EAT_RATIO && b.cell.mass < a.cell.mass * EAT_RATIO) continue

        const dx = a.cell.x - b.cell.x
        const dy = a.cell.y - b.cell.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const rb = massToRadius(b.cell.mass)

        let killer: CellEntry, victim: CellEntry, killerR: number, victimR: number
        if (a.cell.mass >= b.cell.mass * EAT_RATIO) {
          killer = a; victim = b; killerR = ra; victimR = rb
        } else if (b.cell.mass >= a.cell.mass * EAT_RATIO) {
          killer = b; victim = a; killerR = rb; victimR = ra
        } else {
          continue
        }

        // Overlap check
        if (dist < killerR * EAT_OVERLAP + victimR * (1 - EAT_OVERLAP)) {
          // Eat the victim cell
          killer.cell.mass += victim.cell.mass
          eatenCells.add(killer === a ? ni : i)

          // Remove victim cell from their player
          const victimPlayer = victim.player
          victimPlayer.cells = victimPlayer.cells.filter(c => c.cellId !== victim.cellId)

          // Update killer player stats
          const killerPlayer = killer.player
          const totalMass = playerTotalMass(killerPlayer)
          if (totalMass > killerPlayer.peakMass) killerPlayer.peakMass = totalMass

          // If victim player has no cells left, they die
          if (victimPlayer.cells.length === 0) {
            deadPlayers.add(victimPlayer.id)
            killerPlayer.kills++
            killerPlayer.victims.push(victimPlayer.handle)
            killerPlayer.text = `ate ${victimPlayer.handle}`
            // Only track stats for kills involving real players (not bot-on-bot)
            if (killerPlayer.ws || victimPlayer.ws) {
              this.stats.onKill()
            }
            if (victimPlayer.ws) {
              this.stats.onPlayerDeath(now - victimPlayer.joinedAt, victimPlayer.handle)
            }

            // Kill message
            const killMsg: ServerMessage = {
              t: 'kill',
              killerId: killerPlayer.id,
              victimId: victimPlayer.id,
              killerHandle: killerPlayer.handle,
              victimHandle: victimPlayer.handle,
            }
            this.broadcastToRoom(room, killMsg)

            this.roomManager.pushActivity({
              type: 'kill',
              text: `${killerPlayer.handle} devoured ${victimPlayer.handle}`,
              ts: Date.now(),
            })

            // Death message
            if (victimPlayer.ws) {
              const diedMsg: ServerMessage = {
                t: 'died',
                stats: {
                  handle: victimPlayer.handle,
                  timeAlive: now - victimPlayer.joinedAt,
                  kills: victimPlayer.kills,
                  peakMass: Math.round(victimPlayer.peakMass),
                  victims: victimPlayer.victims,
                  killedBy: killerPlayer.handle,
                },
              }
              victimPlayer.ws.send(JSON.stringify(diedMsg))
              // Move to spectators
              room.addSpectator(victimPlayer.ws)
            }
          }
        }
      }
    }

    // Remove dead players
    for (const id of deadPlayers) {
      cleanupBotState(id)
      room.removePlayer(id)
    }

    // 6. Cell-vs-pellet eating (mark-and-sweep: one filter at end)
    const eatenPelletIds = new Set<number>()
    for (const p of players) {
      if (deadPlayers.has(p.id)) continue
      for (const c of p.cells) {
        const cr = massToRadius(c.mass)
        for (const pellet of room.pellets) {
          if (eatenPelletIds.has(pellet.id)) continue
          const dx = c.x - pellet.x
          const dy = c.y - pellet.y
          const threshold = cr + pelletRadius(pellet.word)
          if (dx * dx + dy * dy < threshold * threshold) {
            c.mass += pellet.word.length * PELLET_MASS_PER_CHAR
            if (p.text.length < 500) p.text += ' ' + pellet.word
            eatenPelletIds.add(pellet.id)
          }
        }
      }
      // Update peak mass once per player (not per pellet eaten)
      const totalMass = playerTotalMass(p)
      if (totalMass > p.peakMass) p.peakMass = totalMass
    }
    if (eatenPelletIds.size > 0) {
      room.pellets = room.pellets.filter(p => !eatenPelletIds.has(p.id))
    }

    // 7. Respawn pellets
    room.respawnPellets()

    // 8. Mass decay — per cell
    for (const p of room.players.values()) {
      for (const c of p.cells) {
        if (c.mass > MIN_MASS) {
          c.mass -= c.mass * MASS_DECAY_RATE * dt
          if (c.mass < MIN_MASS) c.mass = MIN_MASS
        }
      }
    }
  }

  private broadcastState(room: Room) {
    const players: PlayerState[] = Array.from(room.players.values()).map((p) => {
      const { totalMass, x: comX, y: comY } = playerMassAndCenter(p)
      return {
        id: p.id,
        handle: p.handle,
        x: Math.round(comX),
        y: Math.round(comY),
        mass: Math.round(totalMass),
        color: p.color,
        avatar: p.avatar,
        cells: p.cells.map(c => ({
          cellId: c.cellId,
          x: Math.round(c.x),
          y: Math.round(c.y),
          mass: Math.round(c.mass),
        })),
      }
    })

    // Pellet delta compression: only send added/removed since last broadcast
    const currentIds = new Set(room.pellets.map(p => p.id))
    const prevIds = this.lastPelletIds.get(room.code)

    let msg: ServerMessage
    if (!prevIds) {
      // First broadcast for this room — send full pellets
      msg = { t: 'state', players, pellets: room.pellets }
    } else {
      const pAdd: PelletState[] = []
      const pRem: number[] = []
      for (const p of room.pellets) {
        if (!prevIds.has(p.id)) pAdd.push(p)
      }
      for (const id of prevIds) {
        if (!currentIds.has(id)) pRem.push(id)
      }
      if (pAdd.length === 0 && pRem.length === 0) {
        msg = { t: 'state', players, pellets: [] }
      } else {
        msg = { t: 'state', players, pellets: [], pAdd, pRem }
      }
    }
    this.lastPelletIds.set(room.code, currentIds)

    const json = JSON.stringify(msg)
    for (const p of room.players.values()) {
      if (p.ws) {
        try { p.ws.send(json) } catch { /* closed */ }
      }
    }
    for (const ws of room.spectators) {
      try { ws.send(json) } catch { room.spectators.delete(ws) }
    }
  }

  private broadcastLeaderboard(room: Room) {
    const isSnapshot = room.shouldSnapshot()
    if (!isSnapshot && Math.random() > 1 / 30) return

    const entries = room.getLeaderboard()
    const msg: ServerMessage = { t: 'leaderboard', entries, isSnapshot }
    const json = JSON.stringify(msg)

    for (const p of room.players.values()) {
      if (p.ws) {
        try { p.ws.send(json) } catch { /* closed */ }
      }
    }
    for (const ws of room.spectators) {
      try { ws.send(json) } catch { room.spectators.delete(ws) }
    }
  }

  private broadcastToRoom(room: Room, msg: ServerMessage) {
    const json = JSON.stringify(msg)
    for (const p of room.players.values()) {
      if (p.ws) {
        try { p.ws.send(json) } catch { /* closed */ }
      }
    }
    for (const ws of room.spectators) {
      try { ws.send(json) } catch { room.spectators.delete(ws) }
    }
  }
}
