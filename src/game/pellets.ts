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

const FONT = `bold ${PELLET_FONT_SIZE}px ${BLOB_FONT_FAMILY}`
const PELLET_COLOR = '#80ffa0'

export class PelletRenderer {
  private pellets: RenderedPellet[] = []
  private widthCache = new Map<string, number>()

  setPellets(pellets: PelletState[]) {
    this.pellets = pellets.map(p => ({
      ...p,
      measuredWidth: this.widthCache.get(p.word) ?? 0,
    }))
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

    ctx.shadowColor = PELLET_COLOR
    ctx.shadowBlur = 6
    for (const p of this.pellets) {
      if (!p.measuredWidth) {
        p.measuredWidth = ctx.measureText(p.word).width
        this.widthCache.set(p.word, p.measuredWidth)
      }
      ctx.globalAlpha = 0.7
      ctx.fillStyle = PELLET_COLOR
      ctx.fillText(p.word, p.x, p.y)
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }
}
