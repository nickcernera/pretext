import { drawBackground } from './background'
import { MatrixRain } from './rain'
import { drawBlob } from './blob'
import { PelletRenderer } from './pellets'
import { AbsorptionRenderer } from './absorption'
import { Camera } from './camera'
import { HUD } from './hud'
import { massToRadius, type PlayerState, type CellState } from '@shared/protocol'
import { WORLD_W, WORLD_H, RAIN_COLOR, GRID_LINE_SPACING } from '@shared/constants'

// Reusable pool for blob holes — avoids per-frame array allocation
const blobHolesPool: { x: number; y: number; radius: number }[] = []

export class Renderer {
  readonly rain = new MatrixRain()
  readonly pellets = new PelletRenderer()
  readonly absorption = new AbsorptionRenderer()
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

    // 3. Set world-space exclusions for rain — include all cells
    let holeIdx = 0
    for (const p of players) {
      for (const c of p.cells) {
        if (holeIdx < blobHolesPool.length) {
          blobHolesPool[holeIdx].x = c.x
          blobHolesPool[holeIdx].y = c.y
          blobHolesPool[holeIdx].radius = massToRadius(c.mass)
        } else {
          blobHolesPool.push({ x: c.x, y: c.y, radius: massToRadius(c.mass) })
        }
        holeIdx++
      }
    }
    blobHolesPool.length = holeIdx
    const wordRects = this.pellets.getRects()
    this.rain.setBlobHoles(blobHolesPool)
    this.rain.setWordRects(wordRects)
    this.rain.update(dt)

    // 4. Enter world space
    this.camera.applyTransform(ctx, screenW, screenH)

    const vp = this.getViewport(screenW, screenH)

    // 5. Text sea (world space — flows around blobs and pellets)
    this.rain.drawWorld(ctx, vp.x, vp.y, vp.w, vp.h)

    // 6. World boundary
    drawWorldBoundary(ctx, vp)

    // 6.5. Grid background
    drawGrid(ctx, vp)

    // 7. Pellets (word pellets in world space)
    this.pellets.draw(ctx)

    // 7.5. Absorption flow effects (above pellets, below blobs)
    this.absorption.draw(ctx, now)

    // 8. Player blobs — flatten all cells, sort by mass, draw each
    type CellDraw = { cell: CellState; player: PlayerState; isLocal: boolean }
    const allCells: CellDraw[] = []
    for (const p of players) {
      const isLocal = p.id === localPlayerId
      for (const c of p.cells) {
        allCells.push({ cell: c, player: p, isLocal })
      }
    }
    allCells.sort((a, b) => a.cell.mass - b.cell.mass) // smallest first (back-to-front)

    for (const { cell, player, isLocal } of allCells) {
      // Viewport culling — skip blobs entirely outside view
      const blobR = massToRadius(cell.mass)
      if (
        cell.x + blobR < vp.x - 50 ||
        cell.x - blobR > vp.x + vp.w + 50 ||
        cell.y + blobR < vp.y - 50 ||
        cell.y - blobR > vp.y + vp.h + 50
      ) continue

      const text = playerTexts.get(player.id) || player.handle
      drawBlob(
        ctx, cell.x, cell.y, cell.mass, text, player.color,
        isLocal, player.handle, `${player.id}:${cell.cellId}`, dt, player.avatar,
      )
    }

    // 9. Restore to screen space
    this.camera.restore(ctx)

    // 10. HUD
    this.hud.draw(ctx, screenW, screenH, players, localPlayerId)
  }
}

function drawWorldBoundary(
  ctx: CanvasRenderingContext2D,
  vp: { x: number; y: number; w: number; h: number },
) {
  const BORDER_W = 3
  const GLOW = 15

  ctx.save()

  ctx.shadowColor = RAIN_COLOR
  ctx.shadowBlur = GLOW
  ctx.strokeStyle = RAIN_COLOR
  ctx.globalAlpha = 0.5
  ctx.lineWidth = BORDER_W

  ctx.beginPath()
  ctx.rect(0, 0, WORLD_W, WORLD_H)
  ctx.stroke()

  ctx.globalAlpha = 0.6
  ctx.fillStyle = '#020504'

  const pad = 2000
  if (vp.y < 0) ctx.fillRect(vp.x - pad, vp.y - pad, vp.w + pad * 2, -vp.y + pad)
  if (vp.y + vp.h > WORLD_H) ctx.fillRect(vp.x - pad, WORLD_H, vp.w + pad * 2, vp.y + vp.h - WORLD_H + pad)
  if (vp.x < 0) ctx.fillRect(vp.x - pad, 0, -vp.x + pad, WORLD_H)
  if (vp.x + vp.w > WORLD_W) ctx.fillRect(WORLD_W, 0, vp.x + vp.w - WORLD_W + pad, WORLD_H)

  ctx.restore()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: { x: number; y: number; w: number; h: number },
) {
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 255, 65, 0.04)'
  ctx.lineWidth = 1

  const spacing = GRID_LINE_SPACING
  const startX = Math.floor(Math.max(0, vp.x) / spacing) * spacing
  const startY = Math.floor(Math.max(0, vp.y) / spacing) * spacing
  const endX = Math.min(WORLD_W, vp.x + vp.w)
  const endY = Math.min(WORLD_H, vp.y + vp.h)

  ctx.beginPath()
  for (let x = startX; x <= endX; x += spacing) {
    ctx.moveTo(x, Math.max(0, vp.y))
    ctx.lineTo(x, Math.min(WORLD_H, vp.y + vp.h))
  }
  for (let y = startY; y <= endY; y += spacing) {
    ctx.moveTo(Math.max(0, vp.x), y)
    ctx.lineTo(Math.min(WORLD_W, vp.x + vp.w), y)
  }
  ctx.stroke()

  ctx.restore()
}
