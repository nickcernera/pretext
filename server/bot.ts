import { WORLD_W, WORLD_H, BOT_FILL_THRESHOLD, MIN_MASS } from '../shared/constants'
import { massToRadius } from '../shared/protocol'
import type { Room, ServerPlayer } from './room'

const BOT_HANDLES = [
  '@synthwave',
  '@tensorcat',
  '@pixeldrift',
  '@neuralnet',
  '@bitshift',
  '@zeroday',
  '@kernelpanic',
  '@darkmode',
  '@overfit',
  '@gradientdrop',
  '@quantum_bit',
  '@nullpointer',
  '@bytecode',
  '@debugger',
  '@stacktrace',
  '@malloc',
  '@segfault',
  '@ioexception',
  '@dockerfile',
  '@k8s_pod',
]

let botIdCounter = 0

function randomTarget(): { x: number; y: number } {
  return {
    x: Math.random() * WORLD_W,
    y: Math.random() * WORLD_H,
  }
}

export function fillBots(room: Room) {
  const needed = BOT_FILL_THRESHOLD - room.playerCount()
  for (let i = 0; i < needed; i++) {
    const handle = BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)]
    const id = `bot_${botIdCounter++}`
    const player = room.addPlayer(id, handle, null)
    // Give bots varied starting mass
    player.mass = MIN_MASS + Math.random() * 100
    player.peakMass = player.mass
    const t = randomTarget()
    player.targetX = t.x
    player.targetY = t.y
  }
}

const WANDER_INTERVAL = 3000 // ms between wander target changes
const FLEE_RANGE = 350
const CHASE_RANGE = 400

// Track last wander time per bot
const lastWanderChange: Map<string, number> = new Map()

export function tickBots(room: Room, dt: number) {
  const now = Date.now()
  const players = Array.from(room.players.values())

  for (const bot of players) {
    if (bot.ws !== null) continue // skip real players

    // Find nearby players
    let closestBigger: ServerPlayer | null = null
    let closestBiggerDist = Infinity
    let closestSmaller: ServerPlayer | null = null
    let closestSmallerDist = Infinity

    for (const other of players) {
      if (other.id === bot.id) continue
      const dx = other.x - bot.x
      const dy = other.y - bot.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (other.mass > bot.mass * 1.15 && dist < FLEE_RANGE) {
        if (dist < closestBiggerDist) {
          closestBigger = other
          closestBiggerDist = dist
        }
      } else if (bot.mass > other.mass * 1.15 && dist < CHASE_RANGE) {
        if (dist < closestSmallerDist) {
          closestSmaller = other
          closestSmallerDist = dist
        }
      }
    }

    // Priority: flee > chase > wander
    if (closestBigger) {
      // Flee: move away from bigger player
      const dx = bot.x - closestBigger.x
      const dy = bot.y - closestBigger.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      bot.targetX = bot.x + (dx / dist) * 500
      bot.targetY = bot.y + (dy / dist) * 500
      // Clamp targets to world bounds
      bot.targetX = Math.max(0, Math.min(WORLD_W, bot.targetX))
      bot.targetY = Math.max(0, Math.min(WORLD_H, bot.targetY))
    } else if (closestSmaller) {
      // Chase: move toward smaller player
      bot.targetX = closestSmaller.x
      bot.targetY = closestSmaller.y
    } else {
      // Wander: occasionally pick a new random target
      const lastChange = lastWanderChange.get(bot.id) ?? 0
      if (now - lastChange > WANDER_INTERVAL + Math.random() * 2000) {
        const t = randomTarget()
        bot.targetX = t.x
        bot.targetY = t.y
        lastWanderChange.set(bot.id, now)
      }
    }
  }
}

export function cleanupBotState(botId: string) {
  lastWanderChange.delete(botId)
}
