import { WORLD_W, WORLD_H, BOT_FILL_THRESHOLD, EAT_RATIO } from '../shared/constants'
import type { Room, ServerPlayer } from './room'
import { playerTotalMass } from './room'

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
    const mass = 100 + Math.random() * 300
    player.cells[0].mass = mass
    player.peakMass = mass
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

    // Bot is always single-cell, use its cell's mass for decisions
    const botMass = bot.cells[0]?.mass ?? 0
    const botX = bot.cells[0]?.x ?? 0
    const botY = bot.cells[0]?.y ?? 0

    // Find nearby threats and prey by checking individual cells of other players
    let closestBiggerX = 0, closestBiggerY = 0
    let closestBiggerDist = Infinity
    let fleeing = false

    let closestSmallerX = 0, closestSmallerY = 0
    let closestSmallerDist = Infinity
    let chasing = false

    for (const other of players) {
      if (other.id === bot.id) continue

      // Check each cell of the other player
      for (const cell of other.cells) {
        const dx = cell.x - botX
        const dy = cell.y - botY
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Flee from any cell that can eat us
        if (cell.mass > botMass * EAT_RATIO && dist < FLEE_RANGE) {
          if (dist < closestBiggerDist) {
            closestBiggerX = cell.x
            closestBiggerY = cell.y
            closestBiggerDist = dist
            fleeing = true
          }
        }
        // Chase any cell we can eat
        else if (botMass > cell.mass * EAT_RATIO && dist < CHASE_RANGE) {
          if (dist < closestSmallerDist) {
            closestSmallerX = cell.x
            closestSmallerY = cell.y
            closestSmallerDist = dist
            chasing = true
          }
        }
      }
    }

    if (fleeing) {
      // Flee away from biggest threat
      const dx = botX - closestBiggerX
      const dy = botY - closestBiggerY
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      bot.targetX = Math.max(0, Math.min(WORLD_W, botX + (dx / dist) * 500))
      bot.targetY = Math.max(0, Math.min(WORLD_H, botY + (dy / dist) * 500))
    } else if (chasing) {
      bot.targetX = closestSmallerX
      bot.targetY = closestSmallerY
    } else {
      // Wander
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
