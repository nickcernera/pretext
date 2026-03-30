import { drawBackground } from './game/background'
import { drawBlob } from './game/blob'
import { MatrixRain } from './game/rain'
import { Camera } from './game/camera'
import { Input } from './game/input'
import { PelletRenderer } from './game/pellets'
import { handleToColor } from '@shared/protocol'
import { WORLD_W, WORLD_H, BASE_SPEED, SPEED_EXPONENT } from '@shared/constants'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const rain = new MatrixRain()
const camera = new Camera()
const input = new Input(canvas)
const pelletRenderer = new PelletRenderer()

rain.init(window.innerWidth, window.innerHeight)

// Generate ~200 test pellets scattered across the world
const testPellets = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  x: Math.random() * WORLD_W,
  y: Math.random() * WORLD_H,
}))
pelletRenderer.setPellets(testPellets)

// Test player starting at center of world
const player = {
  x: WORLD_W / 2,
  y: WORLD_H / 2,
  mass: 100,
  handle: '@nickcernera',
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  rain.init(window.innerWidth, window.innerHeight)
}

resize()
window.addEventListener('resize', resize)

let lastTime = performance.now()

function render() {
  const now = performance.now()
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now

  const sw = window.innerWidth
  const sh = window.innerHeight

  // Update input world coords
  const worldCursor = camera.screenToWorld(input.screenX, input.screenY, sw, sh)
  input.worldX = worldCursor.x
  input.worldY = worldCursor.y

  // Move player toward cursor
  const dx = input.worldX - player.x
  const dy = input.worldY - player.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 1) {
    const speed = BASE_SPEED * Math.pow(player.mass, -SPEED_EXPONENT)
    const move = Math.min(dist, speed * dt)
    player.x += (dx / dist) * move
    player.y += (dy / dist) * move
    // Clamp to world bounds
    player.x = Math.max(0, Math.min(WORLD_W, player.x))
    player.y = Math.max(0, Math.min(WORLD_H, player.y))
  }

  // 1. Draw background (screen space)
  drawBackground(ctx, sw, sh)

  // 2. Rain (screen space)
  rain.update(dt)
  rain.draw(ctx, sw, sh)

  // 3. Enter world space
  camera.follow(player.x, player.y, player.mass, sw, sh)
  camera.update(dt)
  camera.applyTransform(ctx, sw, sh)

  // 4. Draw pellets (world space)
  pelletRenderer.draw(ctx)

  // 5. Draw player blob (world space)
  drawBlob(ctx, player.x, player.y, player.mass, player.handle, handleToColor(player.handle), true)

  // 6. Back to screen space
  camera.restore(ctx)

  // HUD
  ctx.fillStyle = '#00ff41'
  ctx.font = '24px "Space Grotesk"'
  ctx.fillText('pretext', 40, 60)

  requestAnimationFrame(render)
}

render()
