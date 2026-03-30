import { drawBackground } from './background'
import { MatrixRain } from './rain'
import { drawBlob } from './blob'
import { PelletRenderer } from './pellets'
import { Camera } from './camera'
import { HUD } from './hud'
import { massToRadius, type PlayerState } from '@shared/protocol'
import { WORLD_W, WORLD_H, RAIN_COLOR } from '@shared/constants'

export class Renderer {
  readonly rain = new MatrixRain()
  readonly pellets = new PelletRenderer()
  readonly camera = new Camera()
  readonly hud = new HUD()
  private lastTime = 0

  init(_screenW: number, _screenH: number) {
    this.rain.init()
  }

  /** Convert world position to screen position */
  worldToScreen(wx: number, wy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (wx - this.camera.x - screenW / 2) * this.camera.scale + screenW / 2,
      y: (wy - this.camera.y - screenH / 2) * this.camera.scale + screenH / 2,
    }
  }

  /** Get world-space viewport bounds */
  getViewport(screenW: number, screenH: number) {
    const invScale = 1 / this.camera.scale
    const halfW = (screenW / 2) * invScale
    const halfH = (screenH / 2) * invScale
    const cx = this.camera.x + screenW / 2
    const cy = this.camera.y + screenH / 2
    return {
      x: cx - halfW,
      y: cy - halfH,
      w: halfW * 2,
      h: halfH * 2,
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    players: PlayerState[],
    localPlayerId: string,
    playerTexts: Map<string, string>,
    now: number,
  ) {
    const dt = this.lastTime ? (now - this.lastTime) / 1000 : 0.016
    this.lastTime = now

    // 1. Update camera
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      this.camera.follow(local.x, local.y, local.mass, screenW, screenH)
    }
    this.camera.update(dt)

    // 2. Background (screen space)
    drawBackground(ctx, screenW, screenH)

    // 3. Set world-space exclusions for rain
    const blobHoles = players.map(p => ({
      x: p.x,
      y: p.y,
      radius: massToRadius(p.mass),
    }))
    const wordRects = this.pellets.getRects()
    this.rain.setBlobHoles(blobHoles)
    this.rain.setWordRects(wordRects)
    this.rain.update(dt)

    // 4. Enter world space
    this.camera.applyTransform(ctx, screenW, screenH)

    const vp = this.getViewport(screenW, screenH)

    // 5. Text sea (world space — flows around blobs and pellets)
    this.rain.drawWorld(ctx, vp.x, vp.y, vp.w, vp.h)

    // 6. World boundary
    drawWorldBoundary(ctx, vp)

    // 7. Pellets (word pellets in world space)
    this.pellets.draw(ctx)

    // 8. Player blobs
    const sorted = [...players].sort((a, b) => b.mass - a.mass)
    for (const p of sorted) {
      const text = playerTexts.get(p.id) || p.handle
      drawBlob(ctx, p.x, p.y, p.mass, text, p.color, p.id === localPlayerId, p.handle, p.id, dt)
    }

    // 9. Restore to screen space
    this.camera.restore(ctx)

    // 10. HUD
    this.hud.draw(ctx, screenW, screenH)
  }
}

function drawWorldBoundary(
  ctx: CanvasRenderingContext2D,
  vp: { x: number; y: number; w: number; h: number },
) {
  // Only draw boundary segments that are visible
  const BORDER_W = 3
  const GLOW = 15

  ctx.save()

  // Glow
  ctx.shadowColor = RAIN_COLOR
  ctx.shadowBlur = GLOW
  ctx.strokeStyle = RAIN_COLOR
  ctx.globalAlpha = 0.5
  ctx.lineWidth = BORDER_W

  ctx.beginPath()
  ctx.rect(0, 0, WORLD_W, WORLD_H)
  ctx.stroke()

  // Inner darker fill outside the world (dim the area beyond the border)
  ctx.globalAlpha = 0.6
  ctx.fillStyle = '#020504'

  // Draw rectangles outside the world bounds that overlap the viewport
  const pad = 2000 // draw far enough to cover any visible area outside
  // Top
  if (vp.y < 0) ctx.fillRect(vp.x - pad, vp.y - pad, vp.w + pad * 2, -vp.y + pad)
  // Bottom
  if (vp.y + vp.h > WORLD_H) ctx.fillRect(vp.x - pad, WORLD_H, vp.w + pad * 2, vp.y + vp.h - WORLD_H + pad)
  // Left
  if (vp.x < 0) ctx.fillRect(vp.x - pad, 0, -vp.x + pad, WORLD_H)
  // Right
  if (vp.x + vp.w > WORLD_W) ctx.fillRect(WORLD_W, 0, vp.x + vp.w - WORLD_W + pad, WORLD_H)

  ctx.restore()
}
