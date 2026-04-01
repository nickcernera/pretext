import { drawBlob } from './blob'
import { massToRadius, handleToColor } from '@shared/protocol'
import { BASE_SPEED, SPEED_EXPONENT, EAT_RATIO } from '@shared/constants'

type LandingBlob = {
  id: string
  x: number
  y: number
  mass: number
  color: string
  targetX: number
  targetY: number
  nextRetarget: number
}

const BLOB_MASSES = [5000, 400, 250, 180, 120, 80, 300, 150]

const NAME_POOL = [
  'echo', 'drift', 'pulse', 'void', 'flux', 'haze',
  'nova', 'grim', 'fern', 'dusk', 'byte', 'static',
  'phantom', 'signal', 'cipher', 'rune', 'glitch',
]

type UIRect = { x: number; y: number; w: number; h: number }

export class LandingBlobs {
  private blobs: LandingBlob[] = []
  private screenW = 0
  private screenH = 0
  private uiBounds: UIRect = { x: 0, y: 0, w: 0, h: 0 }

  init(sw: number, sh: number) {
    this.screenW = sw
    this.screenH = sh
    this.blobs = []

    for (let i = 0; i < BLOB_MASSES.length; i++) {
      const name = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]
      const mass = BLOB_MASSES[i]
      const r = massToRadius(mass)

      let x = 0, y = 0
      for (let attempt = 0; attempt < 30; attempt++) {
        x = Math.random() * sw
        y = Math.random() * sh
        if (!this.insideUIZone(x, y, r)) break
      }

      this.blobs.push({
        id: `landing-${i}`,
        x, y, mass,
        color: handleToColor(name),
        targetX: 0,
        targetY: 0,
        nextRetarget: 0,
      })
    }
  }

  resize(sw: number, sh: number) {
    this.screenW = sw
    this.screenH = sh
  }

  setUIExclusionRects(rects: UIRect[]) {
    if (rects.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const r of rects) {
      minX = Math.min(minX, r.x)
      minY = Math.min(minY, r.y)
      maxX = Math.max(maxX, r.x + r.w)
      maxY = Math.max(maxY, r.y + r.h)
    }
    const inset = 30
    this.uiBounds = {
      x: minX + inset,
      y: minY + inset,
      w: (maxX - minX) - inset * 2,
      h: (maxY - minY) - inset * 2,
    }
  }

  private insideUIZone(x: number, y: number, radius: number): boolean {
    const b = this.uiBounds
    if (b.w <= 0 || b.h <= 0) return false
    const closestX = Math.max(b.x, Math.min(b.x + b.w, x))
    const closestY = Math.max(b.y, Math.min(b.y + b.h, y))
    const dx = x - closestX
    const dy = y - closestY
    return (dx * dx + dy * dy) < (radius * radius)
  }

  private enforceUIBounds(blob: LandingBlob) {
    const r = massToRadius(blob.mass)
    if (!this.insideUIZone(blob.x, blob.y, r)) return

    const b = this.uiBounds
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const dx = blob.x - cx
    const dy = blob.y - cy

    if (Math.abs(dx) / (b.w / 2) > Math.abs(dy) / (b.h / 2)) {
      if (dx < 0) blob.x = b.x - r
      else blob.x = b.x + b.w + r
    } else {
      if (dy < 0) blob.y = b.y - r
      else blob.y = b.y + b.h + r
    }
  }

  private pickTarget(blob: LandingBlob): { x: number; y: number } {
    const r = massToRadius(blob.mass)
    const isMassive = blob.mass > 1000

    for (let attempt = 0; attempt < 30; attempt++) {
      const margin = isMassive ? -r * 0.6 : r + 20
      const x = margin + Math.random() * (this.screenW - margin * 2)
      const y = margin + Math.random() * (this.screenH - margin * 2)
      if (!this.insideUIZone(x, y, r * 0.5)) {
        return { x, y }
      }
    }
    const cornerX = Math.random() < 0.5 ? r + 40 : this.screenW - r - 40
    const cornerY = Math.random() < 0.5 ? r + 40 : this.screenH - r - 40
    return { x: cornerX, y: cornerY }
  }

  update(dt: number) {
    const now = performance.now()

    for (const blob of this.blobs) {
      const isMassive = blob.mass > 1000
      const r = massToRadius(blob.mass)

      // Retarget periodically
      if (now > blob.nextRetarget) {
        const target = this.pickTarget(blob)
        blob.targetX = target.x
        blob.targetY = target.y
        blob.nextRetarget = now + (isMassive ? 5000 : 3000) + Math.random() * 4000
      }

      // Retarget early when close to target — never stop
      const tdx = blob.targetX - blob.x
      const tdy = blob.targetY - blob.y
      if (Math.sqrt(tdx * tdx + tdy * tdy) < r + 20) {
        const target = this.pickTarget(blob)
        blob.targetX = target.x
        blob.targetY = target.y
        blob.nextRetarget = now + 3000 + Math.random() * 3000
      }

      // Movement — massive blob gets a flat speed override
      const speed = isMassive
        ? 60
        : BASE_SPEED * Math.pow(100 / blob.mass, SPEED_EXPONENT) * 0.4

      // Movement toward wander target
      const dx = blob.targetX - blob.x
      const dy = blob.targetY - blob.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 1) {
        const move = Math.min(dist, speed * dt)
        blob.x += (dx / dist) * move
        blob.y += (dy / dist) * move
      }

      // Separation: hard positional push away from other blobs (applied after movement)
      for (const other of this.blobs) {
        if (other === blob) continue
        const odx = blob.x - other.x
        const ody = blob.y - other.y
        const odist = Math.sqrt(odx * odx + ody * ody)
        if (odist < 0.1) continue
        const otherR = massToRadius(other.mass)
        const minGap = r + otherR + 60 // keep 60px gap between edges
        if (odist < minGap) {
          const pushStrength = (minGap - odist) * 3 * dt
          blob.x += (odx / odist) * pushStrength
          blob.y += (ody / odist) * pushStrength
        }
      }

      // Boundaries
      this.enforceUIBounds(blob)
      if (!isMassive) {
        blob.x = Math.max(r, Math.min(this.screenW - r, blob.x))
        blob.y = Math.max(r, Math.min(this.screenH - r, blob.y))
      }
    }
  }

  getExclusions(): { x: number; y: number; radius: number }[] {
    return this.blobs.map(b => ({
      x: b.x,
      y: b.y,
      radius: massToRadius(b.mass),
    }))
  }

  draw(ctx: CanvasRenderingContext2D, dt: number) {
    const sorted = [...this.blobs].sort((a, b) => a.mass - b.mass)
    for (const blob of sorted) {
      // Reduce opacity for larger blobs so the fill gradient doesn't cast a dark shadow
      const r = massToRadius(blob.mass)
      const alpha = r > 60 ? 0.5 : r > 40 ? 0.7 : 1
      if (alpha < 1) ctx.globalAlpha = alpha
      drawBlob(
        ctx, blob.x, blob.y, blob.mass,
        '', blob.color, false, '',
        blob.id, dt, '',
      )
      if (alpha < 1) ctx.globalAlpha = 1
    }
  }
}
