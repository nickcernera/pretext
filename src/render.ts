import type { FlowLine } from './flow'
import { FONT, LINE_HEIGHT } from './flow'
import type { Shape } from './shapes'
import { drawShape } from './shapes'

export function render(
  ctx: CanvasRenderingContext2D,
  lines: FlowLine[],
  shapes: Shape[],
  hoveredShape: number,
  dpr: number,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  // clear
  ctx.clearRect(0, 0, w, h)

  // draw shapes (behind text)
  for (let i = 0; i < shapes.length; i++) {
    drawShape(ctx, shapes[i], i === hoveredShape)
  }

  // draw text
  ctx.font = FONT
  ctx.textBaseline = 'top'

  for (const line of lines) {
    // subtle color variation based on line position
    const t = line.y / (h / dpr)
    const r = Math.round(140 + t * 40)
    const g = Math.round(140 + t * 20)
    const b = Math.round(140 + t * 50)
    ctx.fillStyle = `rgb(${r},${g},${b})`

    // vertically center text within line height
    const textY = line.y + (LINE_HEIGHT - 16) / 2
    ctx.fillText(line.text, line.x, textY)
  }
}
