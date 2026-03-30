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

  // --- Circle body ---
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)

  const fillGrad = ctx.createRadialGradient(
    x - radius * 0.2, y - radius * 0.2, 0,
    x, y, radius
  )
  fillGrad.addColorStop(0, colorToFill(color, 0.25))
  fillGrad.addColorStop(1, colorToFill(color, 0.06))
  ctx.fillStyle = fillGrad
  ctx.fill()

  // Glow for the local player
  if (isPlayer) {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 0.5
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // Border
  ctx.strokeStyle = colorToAlpha(color, 0.35)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // --- ALWAYS use pretext for text layout ---
  // Font scales with blob: small blobs get small text, big blobs get big flowing text
  const fontSize = Math.max(8, Math.min(26, radius * 0.22))
  const lineHeight = fontSize * 1.35
  const padding = fontSize * 0.3

  const prepared = getPrepared(text, fontSize)
  ctx.font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = color

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

  // Compute all lines that fit inside the circle
  const lines: { text: string; width: number }[] = []
  const maxIter = Math.ceil((radius * 2) / lineHeight) + 2

  for (let i = 0; i < maxIter; i++) {
    // y position of this line relative to blob center
    const yOff = -radius + padding + i * lineHeight
    const lineMid = yOff + fontSize / 2
    const distFromCenter = Math.abs(lineMid)

    // Skip lines outside the circle
    if (distFromCenter >= radius - padding) continue

    // Chord width at this y position — this is the key pretext integration:
    // each line gets a DIFFERENT maxWidth based on the circle geometry
    const chordHalf = Math.sqrt(radius * radius - distFromCenter * distFromCenter)
    const maxWidth = chordHalf * 2 - padding * 2

    if (maxWidth < fontSize) continue

    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break

    lines.push({ text: line.text, width: line.width })
    cursor = line.end
  }

  // Vertically center the text block
  const blockHeight = lines.length * lineHeight
  const startY = -blockHeight / 2 + lineHeight * 0.15

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i].text,
      x - lines[i].width / 2,
      y + startY + i * lineHeight,
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
