import { drawBackground } from './background'
import { MatrixRain } from './rain'
import { drawBlob } from './blob'
import { PelletRenderer } from './pellets'
import { Camera } from './camera'
import { HUD } from './hud'
import type { PlayerState } from '@shared/protocol'

export class Renderer {
  readonly rain = new MatrixRain()
  readonly pellets = new PelletRenderer()
  readonly camera = new Camera()
  readonly hud = new HUD()
  private lastTime = 0

  init(screenW: number, screenH: number) {
    this.rain.init(screenW, screenH)
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

    // 1. Background (screen space)
    drawBackground(ctx, screenW, screenH)

    // 2. Matrix rain (screen space)
    this.rain.update(dt)
    this.rain.draw(ctx, screenW, screenH)

    // 3. World-space elements
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      this.camera.follow(local.x, local.y, local.mass, screenW, screenH)
    }
    this.camera.update(dt)
    this.camera.applyTransform(ctx, screenW, screenH)

    // 4. Pellets
    this.pellets.draw(ctx)

    // 5. Player blobs (sorted: biggest first so smallest render on top)
    const sorted = [...players].sort((a, b) => b.mass - a.mass)
    for (const p of sorted) {
      const text = playerTexts.get(p.id) || p.handle
      drawBlob(ctx, p.x, p.y, p.mass, text, p.color, p.id === localPlayerId)
    }

    // 6. Restore to screen space
    this.camera.restore(ctx)

    // 7. HUD
    this.hud.draw(ctx, screenW, screenH)
  }
}
