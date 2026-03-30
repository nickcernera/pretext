import { Renderer } from '../game/renderer'
import { Input } from '../game/input'
import { GameClient } from '../net/client'
import { StateInterpolator } from '../net/interpolation'
import {
  WORLD_W, WORLD_H,
  BASE_SPEED, SPEED_EXPONENT,
  MASS_DECAY_RATE, MIN_MASS,
  EAT_RATIO, EAT_OVERLAP,
  PELLET_COUNT, PELLET_MASS_PER_CHAR,
  SPLIT_MIN_MASS, SPLIT_VELOCITY, SPLIT_DECEL,
  MAX_CELLS, MERGE_TIME, TICK_RATE,
} from '@shared/constants'
import {
  handleToColor, massToRadius,
  type PlayerState, type PelletState, type CellState, type DeathStats, type LeaderboardEntry,
} from '@shared/protocol'
import { triggerSpasm } from '../game/blob'
import { PELLET_WORDS } from '@shared/words'

const BOT_HANDLES = [
  '@synthwave', '@tensorcat', '@pixeldrift', '@neuralnet',
  '@bitshift', '@zeroday', '@kernelpanic', '@darkmode',
  '@overfit', '@gradientdrop', '@quantum_bit', '@nullpointer',
]

// Local cell with momentum + split tracking
type LocalCell = {
  cellId: number
  x: number
  y: number
  mass: number
  vx: number
  vy: number
  splitTime: number
}

type LocalPlayer = {
  id: string
  handle: string
  color: string
  cells: LocalCell[]
  nextCellId: number
}

type Bot = {
  id: string
  handle: string
  color: string
  cells: LocalCell[]
  targetX: number
  targetY: number
  wanderTimer: number
}

type Pellet = { id: number; x: number; y: number; word: string }

export type GameOptions = {
  mode: 'local' | 'online'
  serverUrl?: string
  roomCode?: string | null
  token?: string
}

function totalMass(cells: LocalCell[]): number {
  let m = 0
  for (const c of cells) m += c.mass
  return m
}

function centerOfMass(cells: LocalCell[]): { x: number; y: number } {
  let tm = 0, wx = 0, wy = 0
  for (const c of cells) {
    wx += c.x * c.mass
    wy += c.y * c.mass
    tm += c.mass
  }
  if (tm === 0) return { x: 0, y: 0 }
  return { x: wx / tm, y: wy / tm }
}

function toPlayerState(p: LocalPlayer | Bot): PlayerState {
  const com = centerOfMass(p.cells)
  return {
    id: p.id,
    handle: p.handle,
    x: com.x,
    y: com.y,
    mass: totalMass(p.cells),
    color: p.color,
    cells: p.cells.map(c => ({ cellId: c.cellId, x: c.x, y: c.y, mass: c.mass })),
  }
}

export class GameScreen {
  onDeath: ((stats: DeathStats) => void) | null = null
  roomCode: string | null = null

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private renderer = new Renderer()
  private input: Input
  private handle: string
  private options: GameOptions

  // Shared state
  private playerId = 'local'
  private playerTexts = new Map<string, string>()

  // Local mode state
  private localPlayer!: LocalPlayer
  private bots: Bot[] = []
  private pellets: Pellet[] = []
  private nextPelletId = 0
  private kills = 0
  private peakMass: number = MIN_MASS
  private victims: string[] = []

  // Online mode state
  private client: GameClient | null = null
  private interpolator: StateInterpolator | null = null
  private onlinePlayers: PlayerState[] = []
  private onlinePellets: PelletState[] = []

  // Spectate mode
  private spectating = false
  private spectateOverlay: HTMLDivElement | null = null
  private pendingDeathStats: DeathStats | null = null

  private startTime = 0
  private rafId = 0
  private running = false
  private lastTime = 0

  constructor(canvas: HTMLCanvasElement, handle: string, options?: GameOptions) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.input = new Input(canvas)
    this.handle = handle
    this.options = options || { mode: 'local' }

    if (this.options.mode === 'local') {
      this.initLocal()
    }
  }

  private initLocal() {
    this.localPlayer = {
      id: this.playerId,
      handle: this.handle,
      color: handleToColor(this.handle),
      cells: [{ cellId: 0, x: WORLD_W / 2, y: WORLD_H / 2, mass: 200, vx: 0, vy: 0, splitTime: 0 }],
      nextCellId: 1,
    }
    this.playerTexts.set(this.playerId, this.handle)
    this.peakMass = 200

    for (const bh of BOT_HANDLES) {
      this.bots.push(this.createBot(bh))
    }

    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet())
    }
  }

  private initOnline() {
    this.interpolator = new StateInterpolator()
    this.client = new GameClient({
      onJoined: (room, playerId, _world) => {
        this.playerId = playerId
        this.roomCode = room
        this.renderer.hud.setRoomCode(room)
      },
      onState: (players, pellets) => {
        // Detect eaten pellets by diffing with previous tick
        if (this.onlinePellets.length > 0 && players.length > 0) {
          const currentIds = new Set(pellets.map(p => p.id))
          for (const prev of this.onlinePellets) {
            if (!currentIds.has(prev.id)) {
              // Find nearest player cell
              let closest: { id: string; handle: string; dist: number } | null = null
              for (const p of players) {
                for (const c of p.cells) {
                  const dx = c.x - prev.x
                  const dy = c.y - prev.y
                  const dist = dx * dx + dy * dy
                  if (!closest || dist < closest.dist) {
                    closest = { id: p.id, handle: p.handle, dist }
                  }
                }
              }
              if (closest) {
                const existing = this.playerTexts.get(closest.id) || closest.handle
                this.playerTexts.set(closest.id, existing + ' ' + prev.word)
              }
            }
          }
        }

        this.onlinePlayers = players
        this.onlinePellets = pellets
        this.interpolator!.update(players)
        this.renderer.pellets.setPellets(pellets)

        const handles = players.map(p => p.handle)
        this.renderer.rain.setHandles(handles)
      },
      onKill: (killerId, _victimId, killerHandle, victimHandle) => {
        const existing = this.playerTexts.get(killerId) || killerHandle
        this.playerTexts.set(killerId, existing + ' ' + victimHandle)

        this.renderer.hud.addKillEvent(killerHandle, victimHandle)
        this.renderer.rain.addKill(killerHandle, victimHandle)
      },
      onDied: (stats) => {
        // Don't stop immediately — offer spectate
        this.pendingDeathStats = stats
        this.showSpectateOverlay(stats)
      },
      onLeaderboard: (entries, isSnapshot) => {
        this.renderer.hud.setLeaderboard(entries)
        if (isSnapshot && entries.length > 0 && entries[0].handle === this.handle) {
          this.renderer.hud.showSnapshotToast(this.handle, this.roomCode || 'PUBLIC')
        }
      },
      onError: (msg) => {
        console.error('[GameClient] error:', msg)
      },
      onDisconnect: () => {
        console.warn('[GameClient] disconnected')
        if (!this.spectating) {
          this.stop()
        }
      },
    })
  }

  setOnDeath(cb: (stats: DeathStats) => void) {
    this.onDeath = cb
  }

  async start() {
    this.running = true
    this.startTime = performance.now()
    this.lastTime = performance.now()

    const sw = window.innerWidth
    const sh = window.innerHeight
    this.renderer.init(sw, sh)

    if (this.options.mode === 'online') {
      this.initOnline()
      try {
        await this.client!.connect(this.options.serverUrl!)
        this.client!.join(this.options.roomCode || null, this.options.token, this.handle)
      } catch (e) {
        console.error('[GameClient] failed to connect:', e)
        return
      }
    } else {
      this.renderer.rain.setHandles([this.handle, ...BOT_HANDLES])
      this.renderer.pellets.setPellets(this.pellets)
    }

    this.loop()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
    this.removeSpectateOverlay()
    this.removeEscListener()
  }

  // --- Spectate mode ---

  private showSpectateOverlay(stats: DeathStats) {
    this.spectating = true

    const overlay = document.createElement('div')
    this.spectateOverlay = overlay
    overlay.style.cssText = `
      position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 12px; z-index: 20;
      font-family: "Space Mono", monospace;
    `

    const makeBtn = (text: string, primary: boolean): HTMLButtonElement => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        font-family: "Space Mono", monospace; font-size: 13px; padding: 10px 24px;
        border: 1px solid ${primary ? '#00ff41' : '#3a5a4a'}; border-radius: 4px;
        background: ${primary ? '#1a2a1a' : 'transparent'}; color: ${primary ? '#d0ffe0' : '#4a7a5a'};
        cursor: pointer; transition: all 0.15s;
      `
      return btn
    }

    const spectateBtn = makeBtn('Spectating...', true)
    spectateBtn.style.pointerEvents = 'none'
    spectateBtn.style.opacity = '0.6'
    overlay.appendChild(spectateBtn)

    const exitBtn = makeBtn('Exit (ESC)', false)
    exitBtn.addEventListener('click', () => this.exitSpectate())
    overlay.appendChild(exitBtn)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) uiRoot.appendChild(overlay)
    else document.body.appendChild(overlay)

    // ESC key handler
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.exitSpectate()
    }
    window.addEventListener('keydown', this.escHandler)
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null

  private removeEscListener() {
    if (this.escHandler) {
      window.removeEventListener('keydown', this.escHandler)
      this.escHandler = null
    }
  }

  private removeSpectateOverlay() {
    if (this.spectateOverlay?.parentNode) {
      this.spectateOverlay.parentNode.removeChild(this.spectateOverlay)
    }
    this.spectateOverlay = null
  }

  private exitSpectate() {
    this.spectating = false
    this.removeSpectateOverlay()
    this.removeEscListener()
    this.stop()
    if (this.pendingDeathStats && this.onDeath) {
      this.onDeath(this.pendingDeathStats)
    }
  }

  // --- Private ---

  private loop = () => {
    if (!this.running) return

    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    if (this.options.mode === 'local') {
      this.simulateLocal(dt)
      this.renderLocal(now)
    } else {
      this.simulateOnline(dt)
      this.renderOnline(now, dt)
    }

    this.rafId = requestAnimationFrame(this.loop)
  }

  // === LOCAL MODE ===

  private simulateLocal(dt: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight
    const now = Date.now()

    const worldCursor = this.renderer.camera.screenToWorld(
      this.input.screenX, this.input.screenY, sw, sh,
    )
    this.input.worldX = worldCursor.x
    this.input.worldY = worldCursor.y

    // Handle split
    if (this.input.consumeSplit()) {
      const canSplit = this.localPlayer.cells.some(c => c.mass >= SPLIT_MIN_MASS) &&
        this.localPlayer.cells.length < MAX_CELLS
      if (canSplit) {
        this.splitLocalPlayer(now)
      } else {
        // Failed split feedback: shake + spasm
        this.renderer.camera.shake(4, 0.25)
        for (const c of this.localPlayer.cells) {
          triggerSpasm(`${this.playerId}:${c.cellId}`)
        }
      }
    }

    // Move all player cells
    for (const c of this.localPlayer.cells) {
      // Momentum
      c.x += c.vx * dt
      c.y += c.vy * dt
      const decel = Math.pow(SPLIT_DECEL, dt * TICK_RATE)
      c.vx *= decel
      c.vy *= decel
      if (Math.abs(c.vx) < 1 && Math.abs(c.vy) < 1) { c.vx = 0; c.vy = 0 }

      // Move toward cursor
      this.moveCellToward(c, this.input.worldX, this.input.worldY, dt)
    }

    // Sibling repulsion + merge
    this.resolvePlayerCells(this.localPlayer, now)

    // Mass decay
    for (const c of this.localPlayer.cells) {
      if (c.mass > MIN_MASS) {
        c.mass -= c.mass * MASS_DECAY_RATE * dt
        if (c.mass < MIN_MASS) c.mass = MIN_MASS
      }
    }

    const tm = totalMass(this.localPlayer.cells)
    if (tm > this.peakMass) this.peakMass = tm

    // Bot updates
    this.updateBots(dt)

    // Eat pellets — per cell
    for (const c of this.localPlayer.cells) {
      this.eatPelletsForCell(c, this.playerId)
    }
    for (const bot of this.bots) {
      for (const c of bot.cells) {
        this.eatPelletsForCell(c, bot.id)
      }
    }

    // Player cells vs bot cells
    this.checkPlayerBotCellCollisions()
    // Bot cells vs bot cells
    this.checkBotBotCellCollisions()

    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push(this.spawnPellet())
    }
    this.renderer.pellets.setPellets(this.pellets)
    this.updateHUDLocal()
  }

  private splitLocalPlayer(now: number) {
    const p = this.localPlayer
    const toAdd: LocalCell[] = []
    for (const cell of p.cells) {
      if (cell.mass < SPLIT_MIN_MASS) continue
      if (p.cells.length + toAdd.length >= MAX_CELLS) break

      const halfMass = cell.mass / 2
      cell.mass = halfMass

      const dx = this.input.worldX - cell.x
      const dy = this.input.worldY - cell.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = dx / dist
      const ny = dy / dist

      toAdd.push({
        cellId: p.nextCellId++,
        x: cell.x + nx * massToRadius(halfMass),
        y: cell.y + ny * massToRadius(halfMass),
        mass: halfMass,
        vx: nx * SPLIT_VELOCITY,
        vy: ny * SPLIT_VELOCITY,
        splitTime: now,
      })
      cell.splitTime = now
    }
    p.cells.push(...toAdd)
  }

  private resolvePlayerCells(p: LocalPlayer | Bot, now: number) {
    if (p.cells.length < 2) return
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
          const [keep, absorb] = a.mass >= b.mass ? [a, b] : [b, a]
          const tm = keep.mass + absorb.mass
          keep.x = (keep.x * keep.mass + absorb.x * absorb.mass) / tm
          keep.y = (keep.y * keep.mass + absorb.y * absorb.mass) / tm
          keep.mass = tm
          p.cells.splice(p.cells.indexOf(absorb), 1)
          j--
        } else {
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

  private moveCellToward(cell: LocalCell, tx: number, ty: number, dt: number) {
    const dx = tx - cell.x
    const dy = ty - cell.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 1) {
      const speed = BASE_SPEED * Math.pow(100 / cell.mass, SPEED_EXPONENT)
      const move = Math.min(dist, speed * dt)
      cell.x += (dx / dist) * move
      cell.y += (dy / dist) * move
    }
    const r = massToRadius(cell.mass)
    cell.x = Math.max(r, Math.min(WORLD_W - r, cell.x))
    cell.y = Math.max(r, Math.min(WORLD_H - r, cell.y))
  }

  private renderLocal(now: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight

    const playerPS = toPlayerState(this.localPlayer)
    const allPlayers: PlayerState[] = [playerPS, ...this.bots.map(toPlayerState)]

    this.playerTexts.set(this.playerId, this.playerTexts.get(this.playerId) || this.handle)
    for (const bot of this.bots) {
      if (!this.playerTexts.has(bot.id)) {
        this.playerTexts.set(bot.id, bot.handle)
      }
    }

    this.renderer.draw(this.ctx, sw, sh, allPlayers, this.playerId, this.playerTexts, now)
  }

  // === ONLINE MODE ===

  private simulateOnline(_dt: number) {
    if (this.spectating) return // don't send input while spectating

    const sw = window.innerWidth
    const sh = window.innerHeight

    const worldCursor = this.renderer.camera.screenToWorld(
      this.input.screenX, this.input.screenY, sw, sh,
    )
    this.input.worldX = worldCursor.x
    this.input.worldY = worldCursor.y

    this.client?.sendInput(this.input.worldX, this.input.worldY)

    if (this.input.consumeSplit()) {
      const localPlayer = this.onlinePlayers.find(p => p.id === this.playerId)
      const canSplit = localPlayer &&
        localPlayer.cells.some(c => c.mass >= SPLIT_MIN_MASS) &&
        localPlayer.cells.length < MAX_CELLS
      if (canSplit) {
        this.client?.sendSplit()
      } else if (localPlayer) {
        // Failed split feedback: shake + spasm
        this.renderer.camera.shake(4, 0.25)
        for (const c of localPlayer.cells) {
          triggerSpasm(`${localPlayer.id}:${c.cellId}`)
        }
      }
    }
    if (this.input.consumeEject()) {
      this.client?.sendEject()
    }

    const localPlayer = this.onlinePlayers.find(p => p.id === this.playerId)
    if (localPlayer) {
      const text = this.playerTexts.get(this.playerId) || ''
      const words = text.trim().split(/\s+/)
      const killCount = Math.max(0, words.length - 1)
      this.renderer.hud.setPlayerStats(localPlayer.mass, killCount)
    }
  }

  private renderOnline(now: number, dt: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight

    const interpolated = this.interpolator!.getInterpolated(dt)

    for (const p of interpolated) {
      if (!this.playerTexts.has(p.id)) {
        this.playerTexts.set(p.id, p.handle)
      }
    }

    // During spectate, follow the top player
    let viewPlayerId = this.playerId
    if (this.spectating && interpolated.length > 0) {
      // Find largest player
      let maxMass = 0
      for (const p of interpolated) {
        if (p.mass > maxMass) {
          maxMass = p.mass
          viewPlayerId = p.id
        }
      }
    }

    this.renderer.draw(this.ctx, sw, sh, interpolated, viewPlayerId, this.playerTexts, now)
  }

  // === LOCAL-ONLY HELPERS ===

  private eatPelletsForCell(cell: LocalCell, entityId: string) {
    const radius = massToRadius(cell.mass)
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const p = this.pellets[i]
      const dx = cell.x - p.x
      const dy = cell.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < radius) {
        cell.mass += p.word.length * PELLET_MASS_PER_CHAR
        const existing = this.playerTexts.get(entityId) || ''
        this.playerTexts.set(entityId, existing + ' ' + p.word)
        this.pellets.splice(i, 1)
      }
    }
  }

  private checkPlayerBotCellCollisions() {
    for (let bi = this.bots.length - 1; bi >= 0; bi--) {
      const bot = this.bots[bi]
      let botDead = false

      for (const pc of this.localPlayer.cells) {
        if (botDead) break
        const pcR = massToRadius(pc.mass)

        for (let ci = bot.cells.length - 1; ci >= 0; ci--) {
          const bc = bot.cells[ci]
          const bcR = massToRadius(bc.mass)
          const dx = pc.x - bc.x
          const dy = pc.y - bc.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          // Player cell eats bot cell
          if (pc.mass >= bc.mass * EAT_RATIO) {
            if (dist < pcR * EAT_OVERLAP + bcR * (1 - EAT_OVERLAP)) {
              pc.mass += bc.mass
              bot.cells.splice(ci, 1)
              if (bot.cells.length === 0) {
                this.kills++
                this.victims.push(bot.handle)
                const existing = this.playerTexts.get(this.playerId) || this.handle
                this.playerTexts.set(this.playerId, existing + ' ' + bot.handle)
                this.renderer.hud.addKillEvent(this.handle, bot.handle)
                this.renderer.rain.addKill(this.handle, bot.handle)
                this.bots[bi] = this.createBot(bot.handle)
                botDead = true
              }
            }
          }
          // Bot cell eats player cell
          else if (bc.mass >= pc.mass * EAT_RATIO) {
            if (dist < bcR * EAT_OVERLAP + pcR * (1 - EAT_OVERLAP)) {
              bc.mass += pc.mass
              this.localPlayer.cells = this.localPlayer.cells.filter(c => c.cellId !== pc.cellId)
              if (this.localPlayer.cells.length === 0) {
                this.die(bot.handle)
                return
              }
              break // this player cell is gone, move to next
            }
          }
        }
      }
    }
  }

  private checkBotBotCellCollisions() {
    for (let i = 0; i < this.bots.length; i++) {
      for (let j = i + 1; j < this.bots.length; j++) {
        const a = this.bots[i]
        const b = this.bots[j]

        for (const ac of a.cells) {
          const acR = massToRadius(ac.mass)
          for (let ci = b.cells.length - 1; ci >= 0; ci--) {
            const bc = b.cells[ci]
            const bcR = massToRadius(bc.mass)
            const dx = ac.x - bc.x
            const dy = ac.y - bc.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (ac.mass >= bc.mass * EAT_RATIO) {
              if (dist < acR * EAT_OVERLAP + bcR * (1 - EAT_OVERLAP)) {
                ac.mass += bc.mass
                b.cells.splice(ci, 1)
                if (b.cells.length === 0) {
                  this.renderer.hud.addKillEvent(a.handle, b.handle)
                  this.renderer.rain.addKill(a.handle, b.handle)
                  this.bots[j] = this.createBot(b.handle)
                  break
                }
              }
            } else if (bc.mass >= ac.mass * EAT_RATIO) {
              if (dist < bcR * EAT_OVERLAP + acR * (1 - EAT_OVERLAP)) {
                bc.mass += ac.mass
                a.cells = a.cells.filter(c => c.cellId !== ac.cellId)
                if (a.cells.length === 0) {
                  this.renderer.hud.addKillEvent(b.handle, a.handle)
                  this.renderer.rain.addKill(b.handle, a.handle)
                  this.bots[i] = this.createBot(a.handle)
                }
                break
              }
            }
          }
          if (a.cells.length === 0) break
        }
      }
    }
  }

  private updateBots(dt: number) {
    const now = Date.now()
    const playerCom = centerOfMass(this.localPlayer.cells)
    const playerCells = this.localPlayer.cells

    for (const bot of this.bots) {
      // Mass decay per cell
      for (const c of bot.cells) {
        if (c.mass > MIN_MASS) {
          c.mass -= c.mass * MASS_DECAY_RATE * dt
          if (c.mass < MIN_MASS) c.mass = MIN_MASS
        }
      }

      bot.wanderTimer -= dt
      if (bot.wanderTimer <= 0) {
        bot.targetX = Math.random() * WORLD_W
        bot.targetY = Math.random() * WORLD_H
        bot.wanderTimer = 3 + Math.random() * 5
      }

      const botCell = bot.cells[0]
      if (!botCell) continue

      const visionRange = 400
      let fleeX = 0, fleeY = 0, fleeing = false

      // Check player cells
      for (const pc of playerCells) {
        const dpx = pc.x - botCell.x
        const dpy = pc.y - botCell.y
        const distP = Math.sqrt(dpx * dpx + dpy * dpy)
        if (distP < visionRange && pc.mass > botCell.mass * EAT_RATIO) {
          fleeX -= dpx / distP
          fleeY -= dpy / distP
          fleeing = true
        }
      }

      // Check other bot cells
      for (const other of this.bots) {
        if (other === bot) continue
        for (const oc of other.cells) {
          const dx = oc.x - botCell.x
          const dy = oc.y - botCell.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < visionRange && oc.mass > botCell.mass * EAT_RATIO) {
            fleeX -= dx / dist
            fleeY -= dy / dist
            fleeing = true
          }
        }
      }

      let chaseX = 0, chaseY = 0, chasing = false, closestPreyDist = Infinity

      if (!fleeing) {
        // Chase player cells
        for (const pc of playerCells) {
          const dpx = pc.x - botCell.x
          const dpy = pc.y - botCell.y
          const distP = Math.sqrt(dpx * dpx + dpy * dpy)
          if (distP < visionRange && botCell.mass > pc.mass * EAT_RATIO && distP < closestPreyDist) {
            chaseX = dpx / distP
            chaseY = dpy / distP
            chasing = true
            closestPreyDist = distP
          }
        }

        // Chase other bots
        for (const other of this.bots) {
          if (other === bot) continue
          for (const oc of other.cells) {
            const dx = oc.x - botCell.x
            const dy = oc.y - botCell.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < visionRange && botCell.mass > oc.mass * EAT_RATIO && dist < closestPreyDist) {
              chaseX = dx / dist
              chaseY = dy / dist
              chasing = true
              closestPreyDist = dist
            }
          }
        }
      }

      let tx: number, ty: number

      if (fleeing) {
        const mag = Math.sqrt(fleeX * fleeX + fleeY * fleeY) || 1
        tx = botCell.x + (fleeX / mag) * 500
        ty = botCell.y + (fleeY / mag) * 500
      } else if (chasing) {
        tx = botCell.x + chaseX * 500
        ty = botCell.y + chaseY * 500
      } else {
        tx = bot.targetX
        ty = bot.targetY
      }

      this.moveCellToward(botCell, tx, ty, dt)
    }
  }

  private die(killedBy: string) {
    this.stop()
    const stats: DeathStats = {
      handle: this.handle,
      timeAlive: performance.now() - this.startTime,
      kills: this.kills,
      peakMass: this.peakMass,
      victims: this.victims,
      killedBy,
    }
    if (this.onDeath) {
      this.onDeath(stats)
    }
  }

  private updateHUDLocal() {
    const all: LeaderboardEntry[] = [
      { handle: this.handle, mass: totalMass(this.localPlayer.cells), kills: this.kills },
      ...this.bots.map(b => ({ handle: b.handle, mass: totalMass(b.cells), kills: 0 })),
    ]
    all.sort((a, b) => b.mass - a.mass)

    this.renderer.hud.setLeaderboard(all)
    this.renderer.hud.setPlayerStats(totalMass(this.localPlayer.cells), this.kills)
  }

  private createBot(handle: string): Bot {
    const mass = 100 + Math.random() * 300
    return {
      id: `bot-${handle}`,
      handle,
      color: handleToColor(handle),
      cells: [{ cellId: 0, x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, mass, vx: 0, vy: 0, splitTime: 0 }],
      targetX: Math.random() * WORLD_W,
      targetY: Math.random() * WORLD_H,
      wanderTimer: 3 + Math.random() * 5,
    }
  }

  private spawnPellet(): Pellet {
    return {
      id: this.nextPelletId++,
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      word: PELLET_WORDS[Math.floor(Math.random() * PELLET_WORDS.length)],
    }
  }
}
