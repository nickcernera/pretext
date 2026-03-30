import { drawBackground } from './background'
import { MatrixRain } from './rain'
import { drawBlob } from './blob'
import { PelletRenderer } from './pellets'
import { Camera } from './camera'
import { HUD } from './hud'
import { massToRadius, type PlayerState } from '@shared/protocol'

export class Renderer {
  readonly rain = new MatrixRain()
  readonly pellets = new PelletRenderer()
  readonly camera = new Camera()
  readonly hud = new HUD()
  private lastTime = 0

  init(screenW: number, screenH: number) {
    this.rain.init(screenW, screenH)
  }

  /** Convert world position to screen position using current camera state */
  worldToScreen(wx: number, wy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (wx - this.camera.x - screenW / 2) * this.camera.scale + screenW / 2,
      y: (wy - this.camera.y - screenH / 2) * this.camera.scale + screenH / 2,
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

    // 1. Update camera FIRST (before any drawing)
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      this.camera.follow(local.x, local.y, local.mass, screenW, screenH)
    }
    this.camera.update(dt)

    // 2. Background (screen space)
    drawBackground(ctx, screenW, screenH)

    // 3. Compute screen-space blob holes for rain exclusion
    const blobHoles = players.map(p => {
      const r = massToRadius(p.mass)
      const screen = this.worldToScreen(p.x, p.y, screenW, screenH)
      return { x: screen.x, y: screen.y, radius: r * this.camera.scale }
    })

    // 4. Compute screen-space word pellet rects for rain exclusion
    const worldRects = this.pellets.getRects()
    const screenRects = worldRects.map(r => {
      const tl = this.worldToScreen(r.x, r.y, screenW, screenH)
      return {
        x: tl.x,
        y: tl.y,
        w: r.w * this.camera.scale,
        h: r.h * this.camera.scale,
      }
    })

    // 5. Matrix rain — text flows around blobs AND word pellets
    this.rain.setBlobHoles(blobHoles)
    this.rain.setWordRects(screenRects)
    this.rain.update(dt, screenH)
    this.rain.draw(ctx, screenW, screenH)

    // 5. World-space elements
    this.camera.applyTransform(ctx, screenW, screenH)

    // 6. Pellets
    this.pellets.draw(ctx)

    // 7. Player blobs (sorted: biggest first so smallest render on top)
    const sorted = [...players].sort((a, b) => b.mass - a.mass)
    for (const p of sorted) {
      const text = playerTexts.get(p.id) || p.handle
      drawBlob(ctx, p.x, p.y, p.mass, text, p.color, p.id === localPlayerId)
    }

    // 8. Restore to screen space
    this.camera.restore(ctx)

    // 9. HUD
    this.hud.draw(ctx, screenW, screenH)
  }
}
