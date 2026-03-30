import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutLine, type LayoutCursor } from '@chenglou/pretext'
import type { Shape } from './shapes'
import { getExclusion } from './shapes'

export type FlowLine = LayoutLine & {
  x: number
  y: number
}

export type FlowResult = {
  lines: FlowLine[]
  layoutMs: number
}

const FONT = '16px Inter, system-ui, sans-serif'
const LINE_HEIGHT = 26
const MARGIN = 60

let cached: { text: string; prepared: PreparedTextWithSegments } | null = null

function getPrepared(text: string): PreparedTextWithSegments {
  if (cached && cached.text === text) return cached.prepared
  const prepared = prepareWithSegments(text, FONT)
  cached = { text, prepared }
  return prepared
}

export function computeFlow(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  shapes: Shape[],
): FlowResult {
  const t0 = performance.now()
  const prepared = getPrepared(text)
  const lines: FlowLine[] = []

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let y = MARGIN

  while (y + LINE_HEIGHT < canvasHeight + LINE_HEIGHT) {
    const lineTop = y
    const lineBottom = y + LINE_HEIGHT

    // compute available horizontal spans by subtracting shape exclusions
    let spans = [{ left: MARGIN, right: canvasWidth - MARGIN }]

    for (const shape of shapes) {
      const exc = getExclusion(shape, lineTop, lineBottom)
      if (!exc) continue
      const [exLeft, exRight] = exc
      const next: typeof spans = []
      for (const span of spans) {
        if (exRight <= span.left || exLeft >= span.right) {
          next.push(span) // no overlap
        } else {
          if (exLeft > span.left) next.push({ left: span.left, right: exLeft })
          if (exRight < span.right) next.push({ left: exRight, right: span.right })
        }
      }
      spans = next
    }

    // use the widest span for this line
    if (spans.length === 0) {
      y += LINE_HEIGHT
      continue
    }

    const best = spans.reduce((a, b) => (b.right - b.left > a.right - a.left ? b : a))
    const maxWidth = best.right - best.left

    if (maxWidth < 40) {
      y += LINE_HEIGHT
      continue
    }

    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break

    lines.push({ ...line, x: best.left, y: lineTop })
    cursor = line.end
    y += LINE_HEIGHT
  }

  return { lines, layoutMs: performance.now() - t0 }
}

export { FONT, LINE_HEIGHT }
