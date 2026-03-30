import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { BLOB_FONT_FAMILY } from '@shared/constants'
import { massToRadius } from '@shared/protocol'

const cache = new Map<string, PreparedTextWithSegments>()

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}|${text}`
  const cached = cache.get(key)
  if (cached) return cached
  const prepared = prepareWithSegments(text, font)
  cache.set(key, prepared)
  if (cache.size > 300) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  return prepared
}

/** Split blob text into handles (@words, higher value) and plain words (lower value) */
function splitText(text: string): { handles: string; words: string } {
  const tokens = text.trim().split(/\s+/)
  const handles: string[] = []
  const words: string[] = []
  for (const t of tokens) {
    if (t.startsWith('@')) handles.push(t)
    else if (t.length > 0) words.push(t)
  }
  return {
    handles: handles.join('  '),
    words: words.join('  '),
  }
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

  if (isPlayer) {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 0.5
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  ctx.strokeStyle = colorToAlpha(color, 0.35)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // --- Two-layer text rendering ---
  const { handles, words } = splitText(text)

  // Layer 1: Handles — larger, brighter, centered
  const handleSize = Math.max(10, Math.min(28, radius * 0.24))
  const handleLines = layoutInCircle(handles, handleSize, radius, 0.3)

  // Layer 2: Words — smaller, dimmer, fills remaining space
  const wordSize = Math.max(7, Math.min(16, radius * 0.13))
  // Offset words below handles
  const handleBlockHeight = handleLines.length * handleSize * 1.35
  const wordLines = words.length > 0
    ? layoutInCircle(words, wordSize, radius, 0.25)
    : []

  // Compute total block height and center everything
  const handleLH = handleSize * 1.35
  const wordLH = wordSize * 1.35
  const gap = handleLines.length > 0 && wordLines.length > 0 ? handleSize * 0.3 : 0
  const totalHeight = handleLines.length * handleLH + gap + wordLines.length * wordLH
  let drawY = y - totalHeight / 2

  // Draw handles (bright)
  ctx.textBaseline = 'top'
  ctx.fillStyle = color
  ctx.font = `bold ${handleSize}px ${BLOB_FONT_FAMILY}`
  for (const line of handleLines) {
    ctx.fillText(line.text, x - line.width / 2, drawY)
    drawY += handleLH
  }

  // Draw words (dimmer)
  if (wordLines.length > 0) {
    drawY += gap
    ctx.fillStyle = colorToAlpha(color, 0.5)
    ctx.font = `${wordSize}px ${BLOB_FONT_FAMILY}`
    for (const line of wordLines) {
      ctx.fillText(line.text, x - line.width / 2, drawY)
      drawY += wordLH
    }
  }
}

type LayoutLine = { text: string; width: number }

function layoutInCircle(
  text: string,
  fontSize: number,
  radius: number,
  padding: number, // fraction of fontSize
): LayoutLine[] {
  if (!text || text.trim().length === 0) return []

  const font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  const prepared = getPrepared(text, font)
  const lineHeight = fontSize * 1.35
  const pad = fontSize * padding

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  const lines: LayoutLine[] = []
  const maxIter = Math.ceil((radius * 2) / lineHeight) + 2

  for (let i = 0; i < maxIter; i++) {
    const yOff = -radius + pad + i * lineHeight
    const lineMid = yOff + fontSize / 2
    const distFromCenter = Math.abs(lineMid)

    if (distFromCenter >= radius - pad) continue

    const chordHalf = Math.sqrt(radius * radius - distFromCenter * distFromCenter)
    const maxWidth = chordHalf * 2 - pad * 2

    if (maxWidth < fontSize) continue

    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break

    lines.push({ text: line.text, width: line.width })
    cursor = line.end
  }

  return lines
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
