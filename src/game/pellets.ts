import { PELLET_FONT_SIZE, BLOB_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import type { PelletState } from '@shared/protocol'

type RenderedPellet = PelletState & {
  measuredWidth: number
}

export type PelletRect = {
  x: number
  y: number
  w: number
  h: number
}

const FONT = `${PELLET_FONT_SIZE}px ${BLOB_FONT_FAMILY}`

export class PelletRenderer {
  private pellets: RenderedPellet[] = []
  private measured = false

  setPellets(pellets: PelletState[]) {
    this.pellets = pellets.map(p => ({
      ...p,
      measuredWidth: 0,
    }))
    this.measured = false
  }

  /** Get bounding rects in world space for rain exclusion */
  getRects(): PelletRect[] {
    const h = PELLET_FONT_SIZE * 1.4
    return this.pellets.map(p => ({
      x: p.x - 6,
      y: p.y - h / 2 - 4,
      w: p.measuredWidth + 12,
      h: h + 8,
    }))
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.font = FONT
    ctx.textBaseline = 'middle'

    if (!this.measured) {
      for (const p of this.pellets) {
        p.measuredWidth = ctx.measureText(p.word).width
      }
      this.measured = true
    }

    for (const p of this.pellets) {
      ctx.globalAlpha = 0.45
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(p.word, p.x, p.y)
    }
    ctx.globalAlpha = 1
  }
}
