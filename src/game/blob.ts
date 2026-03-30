import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { BLOB_FONT_FAMILY } from '@shared/constants'
import { massToRadius } from '@shared/protocol'

type PreparedBlob = {
  text: string
  fontSize: number
  prepared: PreparedTextWithSegments
}

const cache = new Map<string, PreparedBlob>()

function getPrepared(text: string, fontSize: number): PreparedTextWithSegments {
  const key = `${text}:${fontSize}`
  const cached = cache.get(key)
  if (cached && cached.text === text && cached.fontSize === fontSize) {
    return cached.prepared
  }
  const font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  const prepared = prepareWithSegments(text, font)
  cache.set(key, { text, fontSize, prepared })
  if (cache.size > 200) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  return prepared
}

export function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mass: number,
  text: string,
  color: string,
  isPlayer: boolean,
) {
  const radius = massToRadius(mass)
  const fontSize = Math.max(9, Math.min(22, radius * 0.18))
  const lineHeight = fontSize * 1.5
  const padding = fontSize * 0.8

  // --- Circle body ---
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)

  // Dark fill with slight color tint
  const fillGrad = ctx.createRadialGradient(
    x - radius * 0.2, y - radius * 0.2, 0,
    x, y, radius
  )
  fillGrad.addColorStop(0, colorToFill(color, 0.2))
  fillGrad.addColorStop(1, colorToFill(color, 0.05))
  ctx.fillStyle = fillGrad
  ctx.fill()

  // Glow for the local player
  if (isPlayer) {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 0.4
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // Border
  ctx.strokeStyle = colorToAlpha(color, 0.3)
  ctx.lineWidth = 1
  ctx.stroke()

  // --- Text layout with pretext ---
  const prepared = getPrepared(text, fontSize)
  ctx.font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = color

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  const usableHeight = (radius - padding) * 2
  const maxLines = Math.floor(usableHeight / lineHeight)
  const lines: { text: string; width: number; yOff: number }[] = []

  for (let i = 0; i < maxLines; i++) {
    const yOff = -radius + padding + i * lineHeight + (lineHeight - fontSize) / 2
    const distFromCenter = Math.abs(yOff + fontSize / 2)

    if (distFromCenter >= radius - padding / 2) continue

    // Chord width at this y-offset from center
    const chordHalf = Math.sqrt(Math.max(0, radius * radius - distFromCenter * distFromCenter))
    const maxWidth = chordHalf * 2 - padding * 2

    if (maxWidth < fontSize * 2) continue

    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break

    lines.push({ text: line.text, width: line.width, yOff })
    cursor = line.end
  }

  // Center the text block vertically within the blob
  const textBlockHeight = lines.length * lineHeight
  const verticalShift = -textBlockHeight / 2 + lineHeight / 2

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    ctx.fillText(
      line.text,
      x - line.width / 2,
      y + verticalShift + i * lineHeight - fontSize / 2,
    )
  }
}

function colorToFill(hsl: string, alpha: number): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return `rgba(10, 20, 15, ${alpha})`
  return `hsla(${match[1]}, ${match[2]}%, ${Math.round(Number(match[3]) / 3)}%, ${alpha})`
}

function colorToAlpha(hsl: string, alpha: number): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return `rgba(100, 200, 150, ${alpha})`
  return `hsla(${match[1]}, ${match[2]}%, ${match[3]}%, ${alpha})`
}
