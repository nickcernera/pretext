import {
  PELLET_FONT_SIZE, BLOB_FONT_FAMILY,
  PELLET_MAGNET_RANGE, PELLET_MAGNET_STRENGTH, PELLET_GLOW_RANGE,
} from '@shared/constants'
import { pelletRadius } from '@shared/protocol'
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

type CellInfo = { x: number; y: number; radius: number }

const FONT = `bold ${PELLET_FONT_SIZE}px ${BLOB_FONT_FAMILY}`
const PELLET_COLOR = '#80ffa0'

export class PelletRenderer {
  private pellets: RenderedPellet[] = []
  private widthCache = new Map<string, number>()
  private localCells: CellInfo[] = []

  setLocalCells(cells: CellInfo[]) {
    this.localCells = cells
  }

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
      x: p.x - p.measuredWidth / 2 - 6,
      y: p.y - h / 2 - 4,
      w: p.measuredWidth + 12,
      h: h + 8,
    }))
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.font = FONT
    ctx.textBaseline = 'middle'

    for (const p of this.pellets) {
      if (!p.measuredWidth) {
        p.measuredWidth = ctx.measureText(p.word).width
        this.widthCache.set(p.word, p.measuredWidth)
      }

      // Find nearest local cell for magnetism + glow
      let nearDist = Infinity
      let nearCX = 0
      let nearCY = 0
      let nearCR = 0
      if (this.localCells.length === 1) {
        // Fast path: single cell (most common case — no split)
        const cell = this.localCells[0]
        nearCX = cell.x; nearCY = cell.y; nearCR = cell.radius
        const dx = cell.x - p.x, dy = cell.y - p.y
        nearDist = Math.sqrt(dx * dx + dy * dy)
      } else if (this.localCells.length > 1) {
        // Multi-cell: compare squared distances, sqrt only the winner
        let nearDist2 = Infinity
        for (const cell of this.localCells) {
          const dx = cell.x - p.x, dy = cell.y - p.y
          const d2 = dx * dx + dy * dy
          if (d2 < nearDist2) {
            nearDist2 = d2; nearCX = cell.x; nearCY = cell.y; nearCR = cell.radius
          }
        }
        nearDist = Math.sqrt(nearDist2)
      }

      const pr = pelletRadius(p.word)
      const eatRange = nearCR + pr

      // Magnetism: visually pull pellet toward nearest cell
      let drawX = p.x
      let drawY = p.y
      if (nearDist < Infinity) {
        const magnetRange = eatRange * PELLET_MAGNET_RANGE
        if (nearDist < magnetRange && nearDist > 1) {
          const t = 1 - nearDist / magnetRange
          const pull = t * t * PELLET_MAGNET_STRENGTH * eatRange
          drawX += ((nearCX - p.x) / nearDist) * pull
          drawY += ((nearCY - p.y) / nearDist) * pull
        }
      }

      // Glow: intensify when cell is nearby
      let glowBlur = 6
      let alpha = 0.7
      if (nearDist < Infinity) {
        const glowRange = eatRange * PELLET_GLOW_RANGE
        if (nearDist < glowRange) {
          const t = 1 - nearDist / glowRange
          glowBlur = 6 + t * 14
          alpha = 0.7 + t * 0.3
        }
      }

      ctx.shadowColor = PELLET_COLOR
      ctx.shadowBlur = glowBlur
      ctx.globalAlpha = alpha
      ctx.fillStyle = PELLET_COLOR
      ctx.textAlign = 'center'
      ctx.fillText(p.word, drawX, drawY)
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'
  }
}
