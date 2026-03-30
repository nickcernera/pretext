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
} from '@shared/constants'
import {
  handleToColor, massToRadius,
  type PlayerState, type PelletState, type DeathStats, type LeaderboardEntry,
} from '@shared/protocol'

const PELLET_WORDS = [
  'transformer', 'attention', 'gradient', 'softmax', 'backprop',
  'embeddings', 'CUDA', 'inference', 'tokenizer', 'dropout',
  'entropy', 'optimizer', 'tensor', 'sigmoid', 'relu',
  'pipeline', 'latency', 'throughput', 'shard', 'replica',
  'vector', 'matrix', 'epoch', 'batch', 'kernel',
  'lambda', 'mutex', 'malloc', 'stack', 'heap',
  'queue', 'hashmap', 'btree', 'socket', 'daemon',
]

const BOT_HANDLES = [
  '@synthwave', '@tensorcat', '@pixeldrift', '@neuralnet',
  '@bitshift', '@zeroday', '@kernelpanic', '@darkmode',
  '@overfit', '@gradientdrop', '@quantum_bit', '@nullpointer',
]

type Bot = PlayerState & {
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
  private player!: PlayerState
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
    this.player = {
      id: this.playerId,
      handle: this.handle,
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      mass: 200,
      color: handleToColor(this.handle),
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
        this.onlinePlayers = players
        this.onlinePellets = pellets
        this.interpolator!.update(players)
        this.renderer.pellets.setPellets(pellets)

        // Update rain with all current handles
        const handles = players.map(p => p.handle)
        this.renderer.rain.setHandles(handles)
      },
      onKill: (killerId, _victimId, killerHandle, victimHandle) => {
        // Update playerTexts: append victim handle to killer's text
        const existing = this.playerTexts.get(killerId) || killerHandle
        this.playerTexts.set(killerId, existing + ' ' + victimHandle)

        this.renderer.hud.addKillEvent(killerHandle, victimHandle)
        this.renderer.rain.addKill(killerHandle, victimHandle)
      },
      onDied: (stats) => {
        this.stop()
        if (this.onDeath) {
          this.onDeath(stats)
        }
      },
      onLeaderboard: (entries, isSnapshot) => {
        this.renderer.hud.setLeaderboard(entries)
        // If this is a snapshot and we're #1, show share toast
        if (isSnapshot && entries.length > 0 && entries[0].handle === this.handle) {
          this.renderer.hud.showSnapshotToast(this.handle, this.roomCode || 'PUBLIC')
        }
      },
      onError: (msg) => {
        console.error('[GameClient] error:', msg)
      },
      onDisconnect: () => {
        console.warn('[GameClient] disconnected')
        this.stop()
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

    const worldCursor = this.renderer.camera.screenToWorld(
      this.input.screenX, this.input.screenY, sw, sh,
    )
    this.input.worldX = worldCursor.x
    this.input.worldY = worldCursor.y

    this.moveToward(this.player, this.input.worldX, this.input.worldY, dt)
    this.player.mass = Math.max(MIN_MASS, this.player.mass * (1 - MASS_DECAY_RATE * dt))
    if (this.player.mass > this.peakMass) this.peakMass = this.player.mass

    this.updateBots(dt)
    this.eatPellets(this.player, this.playerId)
    for (const bot of this.bots) {
      this.eatPellets(bot, bot.id)
    }
    this.checkPlayerBotCollisions()
    this.checkBotBotCollisions()

    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push(this.spawnPellet())
    }
    this.renderer.pellets.setPellets(this.pellets)
    this.updateHUDLocal()
  }

  private renderLocal(now: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight

    const allPlayers: PlayerState[] = [this.player, ...this.bots]
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
    const sw = window.innerWidth
    const sh = window.innerHeight

    const worldCursor = this.renderer.camera.screenToWorld(
      this.input.screenX, this.input.screenY, sw, sh,
    )
    this.input.worldX = worldCursor.x
    this.input.worldY = worldCursor.y

    // Send input to server each frame
    this.client?.sendInput(this.input.worldX, this.input.worldY)

    // Handle split/eject inputs
    if (this.input.consumeSplit()) {
      this.client?.sendSplit()
    }
    if (this.input.consumeEject()) {
      this.client?.sendEject()
    }

    // Update HUD player stats from server state
    const localPlayer = this.onlinePlayers.find(p => p.id === this.playerId)
    if (localPlayer) {
      // Count kills from playerTexts (words beyond handle)
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

    // Build playerTexts for any new players we haven't seen
    for (const p of interpolated) {
      if (!this.playerTexts.has(p.id)) {
        this.playerTexts.set(p.id, p.handle)
      }
    }

    this.renderer.draw(this.ctx, sw, sh, interpolated, this.playerId, this.playerTexts, now)
  }

  // === LOCAL-ONLY HELPERS ===

  private moveToward(entity: PlayerState, tx: number, ty: number, dt: number) {
    const dx = tx - entity.x
    const dy = ty - entity.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 1) {
      const speed = BASE_SPEED * Math.pow(100 / entity.mass, SPEED_EXPONENT)
      const move = Math.min(dist, speed * dt)
      entity.x += (dx / dist) * move
      entity.y += (dy / dist) * move
      entity.x = Math.max(0, Math.min(WORLD_W, entity.x))
      entity.y = Math.max(0, Math.min(WORLD_H, entity.y))
    }
  }

  private eatPellets(entity: PlayerState, entityId: string) {
    const radius = massToRadius(entity.mass)
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const p = this.pellets[i]
      const dx = entity.x - p.x
      const dy = entity.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < radius) {
        entity.mass += p.word.length * PELLET_MASS_PER_CHAR
        // Add eaten word to this entity's blob text
        const existing = this.playerTexts.get(entityId) || ''
        this.playerTexts.set(entityId, existing + ' ' + p.word)
        this.pellets.splice(i, 1)
      }
    }
  }

  private checkPlayerBotCollisions() {
    const playerRadius = massToRadius(this.player.mass)

    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i]
      const botRadius = massToRadius(bot.mass)
      const dx = this.player.x - bot.x
      const dy = this.player.y - bot.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const overlap = (playerRadius + botRadius - dist) / Math.min(playerRadius, botRadius)

      if (overlap < EAT_OVERLAP) continue

      if (this.player.mass > bot.mass * EAT_RATIO) {
        this.player.mass += bot.mass * 0.8
        this.kills++
        this.victims.push(bot.handle)
        const existing = this.playerTexts.get(this.playerId) || this.handle
        this.playerTexts.set(this.playerId, existing + ' ' + bot.handle)
        this.renderer.hud.addKillEvent(this.handle, bot.handle)
        this.renderer.rain.addKill(this.handle, bot.handle)

        this.bots[i] = this.createBot(bot.handle)
      } else if (bot.mass > this.player.mass * EAT_RATIO) {
        bot.mass += this.player.mass * 0.8
        this.die(bot.handle)
        return
      }
    }
  }

  private checkBotBotCollisions() {
    for (let i = 0; i < this.bots.length; i++) {
      for (let j = i + 1; j < this.bots.length; j++) {
        const a = this.bots[i]
        const b = this.bots[j]
        const ar = massToRadius(a.mass)
        const br = massToRadius(b.mass)
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const overlap = (ar + br - dist) / Math.min(ar, br)

        if (overlap < EAT_OVERLAP) continue

        if (a.mass > b.mass * EAT_RATIO) {
          a.mass += b.mass * 0.8
          this.renderer.hud.addKillEvent(a.handle, b.handle)
          this.renderer.rain.addKill(a.handle, b.handle)
          this.bots[j] = this.createBot(b.handle)
        } else if (b.mass > a.mass * EAT_RATIO) {
          b.mass += a.mass * 0.8
          this.renderer.hud.addKillEvent(b.handle, a.handle)
          this.renderer.rain.addKill(b.handle, a.handle)
          this.bots[i] = this.createBot(a.handle)
        }
      }
    }
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      bot.mass = Math.max(MIN_MASS, bot.mass * (1 - MASS_DECAY_RATE * dt))

      bot.wanderTimer -= dt
      if (bot.wanderTimer <= 0) {
        bot.targetX = Math.random() * WORLD_W
        bot.targetY = Math.random() * WORLD_H
        bot.wanderTimer = 3 + Math.random() * 5
      }

      const visionRange = 400
      let fleeX = 0
      let fleeY = 0
      let fleeing = false

      const dpx = this.player.x - bot.x
      const dpy = this.player.y - bot.y
      const distP = Math.sqrt(dpx * dpx + dpy * dpy)
      if (distP < visionRange && this.player.mass > bot.mass * EAT_RATIO) {
        fleeX -= dpx / distP
        fleeY -= dpy / distP
        fleeing = true
      }

      for (const other of this.bots) {
        if (other === bot) continue
        const dx = other.x - bot.x
        const dy = other.y - bot.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < visionRange && other.mass > bot.mass * EAT_RATIO) {
          fleeX -= dx / dist
          fleeY -= dy / dist
          fleeing = true
        }
      }

      let chaseX = 0
      let chaseY = 0
      let chasing = false
      let closestPreyDist = Infinity

      if (!fleeing) {
        if (distP < visionRange && bot.mass > this.player.mass * EAT_RATIO && distP < closestPreyDist) {
          chaseX = dpx / distP
          chaseY = dpy / distP
          chasing = true
          closestPreyDist = distP
        }

        for (const other of this.bots) {
          if (other === bot) continue
          const dx = other.x - bot.x
          const dy = other.y - bot.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < visionRange && bot.mass > other.mass * EAT_RATIO && dist < closestPreyDist) {
            chaseX = dx / dist
            chaseY = dy / dist
            chasing = true
            closestPreyDist = dist
          }
        }
      }

      let tx: number
      let ty: number

      if (fleeing) {
        const mag = Math.sqrt(fleeX * fleeX + fleeY * fleeY) || 1
        tx = bot.x + (fleeX / mag) * 500
        ty = bot.y + (fleeY / mag) * 500
      } else if (chasing) {
        tx = bot.x + chaseX * 500
        ty = bot.y + chaseY * 500
      } else {
        tx = bot.targetX
        ty = bot.targetY
      }

      this.moveToward(bot, tx, ty, dt)
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
      { handle: this.handle, mass: this.player.mass, kills: this.kills },
      ...this.bots.map(b => ({ handle: b.handle, mass: b.mass, kills: 0 })),
    ]
    all.sort((a, b) => b.mass - a.mass)

    this.renderer.hud.setLeaderboard(all)
    this.renderer.hud.setPlayerStats(this.player.mass, this.kills)
  }

  private createBot(handle: string): Bot {
    return {
      id: `bot-${handle}`,
      handle,
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      mass: 100 + Math.random() * 300,
      color: handleToColor(handle),
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
