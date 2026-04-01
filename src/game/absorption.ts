import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { BLOB_FONT_FAMILY } from '@shared/constants'

const MAX_FLOWS = 10

type AbsorptionFlow = {
  text: string
  prepared: PreparedTextWithSegments
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  startTime: number
  duration: number
}

export class AbsorptionRenderer {
  private flows: AbsorptionFlow[] = []

  add(
    text: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    duration: number,
  ) {
    // Cap active flows
    if (this.flows.length >= MAX_FLOWS) {
      this.flows.shift()
    }

    const font = `bold 14px ${BLOB_FONT_FAMILY}`
    const prepared = prepareWithSegments(text, font)

    this.flows.push({
      text,
      prepared,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      color,
      startTime: 0, // will be set on first draw
      duration,
    })
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.flows.length - 1; i >= 0; i--) {
      const flow = this.flows[i]

      // Lazily set start time on first draw frame
      if (flow.startTime === 0) {
        flow.startTime = now
      }

      const elapsed = now - flow.startTime
      const t = Math.min(elapsed / flow.duration, 1)

      // Remove expired flows
      if (t >= 1) {
        this.flows.splice(i, 1)
        continue
      }

      // Cubic-out easing: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - t, 3)

      // Lerp position
      const x = flow.fromX + (flow.toX - flow.fromX) * eased
      const y = flow.fromY + (flow.toY - flow.fromY) * eased

      // Font size: 14px -> 8px
      const fontSize = 14 - 6 * eased

      // Alpha: fade in to peak at t=0.3, then fade out
      let alpha: number
      if (t < 0.3) {
        alpha = t / 0.3
      } else {
        alpha = 1 - (t - 0.3) / 0.7
      }
      alpha = Math.max(0, Math.min(1, alpha))

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = flow.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const font = `bold ${Math.round(fontSize)}px ${BLOB_FONT_FAMILY}`
      ctx.font = font

      // For kill events (longer text), demonstrate cursor continuation:
      // lay out first portion near source, continue cursor closer to target
      const isKillText = flow.text.startsWith('@')
      if (isKillText && flow.text.length > 8) {
        const cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
        const maxWidth = 120
        const line1 = layoutNextLine(flow.prepared, cursor, maxWidth)

        if (line1) {
          // Draw first portion closer to source
          const srcWeight = Math.max(0, 1 - eased * 1.5)
          const x1 = flow.fromX + (flow.toX - flow.fromX) * (eased * 0.6)
          const y1 = flow.fromY + (flow.toY - flow.fromY) * (eased * 0.6)
          ctx.fillText(flow.text.slice(0, Math.ceil(flow.text.length * 0.5)), x1, y1)

          // Continue cursor — draw remainder closer to target
          const x2 = flow.fromX + (flow.toX - flow.fromX) * (eased * 0.85)
          const y2 = flow.fromY + (flow.toY - flow.fromY) * (eased * 0.85) + fontSize * 0.8
          ctx.globalAlpha = alpha * srcWeight
          ctx.fillText(flow.text.slice(Math.ceil(flow.text.length * 0.5)), x2, y2)
        }
      } else {
        // Simple single-line rendering for pellet words
        const cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
        layoutNextLine(flow.prepared, cursor, 200)
        ctx.fillText(flow.text, x, y)
      }

      ctx.restore()
    }
  }
}
