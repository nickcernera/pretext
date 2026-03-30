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
import { massToRadius } from '../shared/protocol'
import type { ServerMessage, PlayerState, PelletState, CellState } from '../shared/protocol'
import type { Room, ServerPlayer, ServerCell } from './room'
import { playerTotalMass, playerCenterOfMass } from './room'
import type { RoomManager } from './room'
import { SpatialGrid } from './spatial'
import { tickBots, fillBots, cleanupBotState } from './bot'

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
    const now = Date.now()

    // 1. Bot AI
    tickBots(room, dt)

    const players = Array.from(room.players.values())

    // 2. Build spatial grid with individual cells
    const grid = new SpatialGrid()
    const entryById = new Map<number, CellEntry>()
    let idx = 0
    for (const p of players) {
      for (const c of p.cells) {
        const r = massToRadius(c.mass)
        grid.insert(idx, c.x, c.y, r)
        entryById.set(idx, { playerId: p.id, cellId: c.cellId, cell: c, player: p })
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
    const eatenCells = new Set<string>() // "playerId:cellId"
    const deadPlayers = new Set<string>()

    const cellKey = (playerId: string, cellId: number) => `${playerId}:${cellId}`

    for (let i = 0; i < idx; i++) {
      const a = entryById.get(i)
      if (!a) continue
      if (eatenCells.has(cellKey(a.playerId, a.cellId))) continue
      if (deadPlayers.has(a.playerId)) continue

      const ra = massToRadius(a.cell.mass)
      const nearby = grid.query(a.cell.x, a.cell.y, ra + 200)

      for (const ni of nearby) {
        if (ni === i) continue
        const b = entryById.get(ni)
        if (!b) continue
        if (b.playerId === a.playerId) continue // siblings never eat each other
        if (eatenCells.has(cellKey(b.playerId, b.cellId))) continue
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
          eatenCells.add(cellKey(victim.playerId, victim.cellId))

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

            // Kill message
            const killMsg: ServerMessage = {
              t: 'kill',
              killerId: killerPlayer.id,
              victimId: victimPlayer.id,
              killerHandle: killerPlayer.handle,
              victimHandle: victimPlayer.handle,
            }
            this.broadcastToRoom(room, killMsg)

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

    // 6. Cell-vs-pellet eating
    for (const p of players) {
      if (deadPlayers.has(p.id)) continue
      for (const c of p.cells) {
        const cr = massToRadius(c.mass)
        room.pellets = room.pellets.filter((pellet) => {
          const dx = c.x - pellet.x
          const dy = c.y - pellet.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < cr) {
            c.mass += pellet.word.length * PELLET_MASS_PER_CHAR
            p.text += ' ' + pellet.word
            const totalMass = playerTotalMass(p)
            if (totalMass > p.peakMass) p.peakMass = totalMass
            return false
          }
          return true
        })
      }
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
      const com = playerCenterOfMass(p)
      const totalMass = playerTotalMass(p)
      return {
        id: p.id,
        handle: p.handle,
        x: Math.round(com.x),
        y: Math.round(com.y),
        mass: Math.round(totalMass),
        color: p.color,
        cells: p.cells.map(c => ({
          cellId: c.cellId,
          x: Math.round(c.x),
          y: Math.round(c.y),
          mass: Math.round(c.mass),
        })),
      }
    })

    const pellets: PelletState[] = room.pellets
    const msg: ServerMessage = { t: 'state', players, pellets }
    const json = JSON.stringify(msg)

    for (const p of room.players.values()) {
      if (p.ws) {
        try { p.ws.send(json) } catch { /* closed */ }
      }
    }
    // Also send to spectators
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
