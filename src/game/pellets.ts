import { PELLET_RADIUS } from '@shared/constants'

type Pellet = {
  id: number
  x: number
  y: number
  color: string
}

const PELLET_COLORS = ['#1a4a2a', '#1a2a4a', '#2a4a3a', '#1a3a3a', '#2a3a1a', '#3a2a3a']

export class PelletRenderer {
  private pellets: Pellet[] = []

  setPellets(pellets: { id: number; x: number; y: number }[]) {
    this.pellets = pellets.map(p => ({
      ...p,
      color: PELLET_COLORS[p.id % PELLET_COLORS.length],
    }))
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.pellets) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, PELLET_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
    }
  }
}
