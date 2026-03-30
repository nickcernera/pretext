import { Renderer } from '../game/renderer'
import { Input } from '../game/input'
import {
  WORLD_W, WORLD_H,
  BASE_SPEED, SPEED_EXPONENT,
  MASS_DECAY_RATE, MIN_MASS,
  EAT_RATIO, EAT_OVERLAP,
  PELLET_COUNT, PELLET_MASS,
} from '@shared/constants'
import {
  handleToColor, massToRadius,
  type PlayerState, type DeathStats, type LeaderboardEntry,
} from '@shared/protocol'

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

type Pellet = { id: number; x: number; y: number }

export class GameScreen {
  onDeath: ((stats: DeathStats) => void) | null = null

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private renderer = new Renderer()
  private input: Input
  private handle: string

  private playerId = 'local'
  private player: PlayerState
  private playerText: string
  private bots: Bot[] = []
  private pellets: Pellet[] = []
  private nextPelletId = 0

  private kills = 0
  private peakMass: number
  private victims: string[] = []
  private startTime = 0

  private rafId = 0
  private running = false
  private lastTime = 0

  constructor(canvas: HTMLCanvasElement, handle: string) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.input = new Input(canvas)
    this.handle = handle

    // Init player
    this.player = {
      id: this.playerId,
      handle,
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      mass: MIN_MASS,
      color: handleToColor(handle),
    }
    this.playerText = handle
    this.peakMass = MIN_MASS

    // Init bots
    for (const bh of BOT_HANDLES) {
      this.bots.push(this.createBot(bh))
    }

    // Init pellets
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet())
    }
  }

  setOnDeath(cb: (stats: DeathStats) => void) {
    this.onDeath = cb
  }

  start() {
    this.running = true
    this.startTime = performance.now()
    this.lastTime = performance.now()

    const sw = window.innerWidth
    const sh = window.innerHeight
    this.renderer.init(sw, sh)
    this.renderer.rain.setHandles([this.handle, ...BOT_HANDLES])

    this.renderer.pellets.setPellets(this.pellets)

    this.loop()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  // --- Private ---

  private loop = () => {
    if (!this.running) return

    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    this.simulate(dt)
    this.render(now)

    this.rafId = requestAnimationFrame(this.loop)
  }

  private simulate(dt: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight

    // Update cursor in world coords
    const worldCursor = this.renderer.camera.screenToWorld(
      this.input.screenX, this.input.screenY, sw, sh,
    )
    this.input.worldX = worldCursor.x
    this.input.worldY = worldCursor.y

    // Move player toward cursor
    this.moveToward(this.player, this.input.worldX, this.input.worldY, dt)

    // Mass decay
    this.player.mass = Math.max(MIN_MASS, this.player.mass * (1 - MASS_DECAY_RATE * dt))
    if (this.player.mass > this.peakMass) this.peakMass = this.player.mass

    // Bot AI + movement
    this.updateBots(dt)

    // Player eats pellets
    this.eatPellets(this.player)

    // Bot eats pellets
    for (const bot of this.bots) {
      this.eatPellets(bot)
    }

    // Player eats bots / bots eat player
    this.checkPlayerBotCollisions()

    // Bot-on-bot eating
    this.checkBotBotCollisions()

    // Respawn pellets to maintain count
    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push(this.spawnPellet())
    }
    this.renderer.pellets.setPellets(this.pellets)

    // Update HUD
    this.updateHUD()
  }

  private render(now: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight

    const allPlayers: PlayerState[] = [this.player, ...this.bots]
    const playerTexts = new Map<string, string>()
    playerTexts.set(this.playerId, this.playerText)
    for (const bot of this.bots) {
      playerTexts.set(bot.id, bot.handle)
    }

    this.renderer.draw(this.ctx, sw, sh, allPlayers, this.playerId, playerTexts, now)
  }

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

  private eatPellets(entity: PlayerState) {
    const radius = massToRadius(entity.mass)
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const p = this.pellets[i]
      const dx = entity.x - p.x
      const dy = entity.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < radius) {
        entity.mass += PELLET_MASS
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
        // Player eats bot
        this.player.mass += bot.mass * 0.8
        this.kills++
        this.victims.push(bot.handle)
        this.playerText += ' ' + bot.handle
        this.renderer.hud.addKillEvent(this.handle, bot.handle)
        this.renderer.rain.addKill(this.handle, bot.handle, window.innerWidth, window.innerHeight)

        // Respawn bot
        this.bots[i] = this.createBot(bot.handle)
      } else if (bot.mass > this.player.mass * EAT_RATIO) {
        // Bot eats player
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
          this.renderer.rain.addKill(a.handle, b.handle, window.innerWidth, window.innerHeight)
          this.bots[j] = this.createBot(b.handle)
        } else if (b.mass > a.mass * EAT_RATIO) {
          b.mass += a.mass * 0.8
          this.renderer.hud.addKillEvent(b.handle, a.handle)
          this.renderer.rain.addKill(b.handle, a.handle, window.innerWidth, window.innerHeight)
          this.bots[i] = this.createBot(a.handle)
        }
      }
    }
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      // Mass decay
      bot.mass = Math.max(MIN_MASS, bot.mass * (1 - MASS_DECAY_RATE * dt))

      // Wander timer
      bot.wanderTimer -= dt
      if (bot.wanderTimer <= 0) {
        bot.targetX = Math.random() * WORLD_W
        bot.targetY = Math.random() * WORLD_H
        bot.wanderTimer = 3 + Math.random() * 5
      }

      // Threat detection: flee from bigger entities within vision range
      const visionRange = 400
      let fleeX = 0
      let fleeY = 0
      let fleeing = false

      // Check player as threat
      const dpx = this.player.x - bot.x
      const dpy = this.player.y - bot.y
      const distP = Math.sqrt(dpx * dpx + dpy * dpy)
      if (distP < visionRange && this.player.mass > bot.mass * EAT_RATIO) {
        fleeX -= dpx / distP
        fleeY -= dpy / distP
        fleeing = true
      }

      // Check other bots as threats
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

      // Chase detection: pursue smaller entities within vision range
      let chaseX = 0
      let chaseY = 0
      let chasing = false
      let closestPreyDist = Infinity

      if (!fleeing) {
        // Check player as prey
        if (distP < visionRange && bot.mass > this.player.mass * EAT_RATIO && distP < closestPreyDist) {
          chaseX = dpx / distP
          chaseY = dpy / distP
          chasing = true
          closestPreyDist = distP
        }

        // Check other bots as prey
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

  private updateHUD() {
    // Build leaderboard from all entities
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
      mass: MIN_MASS + Math.random() * 80,
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
    }
  }
}
