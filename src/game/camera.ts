export class Camera {
  x = 0
  y = 0
  scale = 1
  private targetX = 0
  private targetY = 0
  private targetScale = 1

  // Screen shake
  private shakeIntensity = 0
  private shakeDecay = 0
  shakeOffsetX = 0
  shakeOffsetY = 0

  follow(playerX: number, playerY: number, playerMass: number, screenW: number, screenH: number) {
    this.targetX = playerX - screenW / 2
    this.targetY = playerY - screenH / 2
    this.targetScale = Math.max(0.3, Math.min(1.2, 80 / Math.sqrt(playerMass)))
  }

  shake(intensity: number, duration: number) {
    this.shakeIntensity = intensity
    this.shakeDecay = intensity / duration
  }

  update(dt: number) {
    const lerp = 1 - Math.pow(0.004, dt)
    this.x += (this.targetX - this.x) * lerp
    this.y += (this.targetY - this.y) * lerp
    this.scale += (this.targetScale - this.scale) * lerp

    // Shake
    if (this.shakeIntensity > 0) {
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt)
    } else {
      this.shakeOffsetX = 0
      this.shakeOffsetY = 0
    }
  }

  applyTransform(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    ctx.save()
    ctx.translate(screenW / 2 + this.shakeOffsetX, screenH / 2 + this.shakeOffsetY)
    ctx.scale(this.scale, this.scale)
    ctx.translate(-this.x - screenW / 2, -this.y - screenH / 2)
  }

  restore(ctx: CanvasRenderingContext2D) {
    ctx.restore()
  }

  screenToWorld(sx: number, sy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (sx - screenW / 2) / this.scale + this.x + screenW / 2,
      y: (sy - screenH / 2) / this.scale + this.y + screenH / 2,
    }
  }
}
