import { prepareWithSegments, layoutNextLine, layout, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY } from '@shared/constants'
import { massToRadius, handleToColor } from '@shared/protocol'

// --- Text cache ---
const textCache = new Map<string, PreparedTextWithSegments>()

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}|${text}`
  const cached = textCache.get(key)
  if (cached) return cached
  const prepared = prepareWithSegments(text, font)
  textCache.set(key, prepared)
  if (textCache.size > 300) {
    const first = textCache.keys().next().value
    if (first) textCache.delete(first)
  }
  return prepared
}

// --- Physics tracking for text sloshing ---
type BlobPhysics = { prevX: number; prevY: number; offX: number; offY: number }
const blobPhysics = new Map<string, BlobPhysics>()

// --- Spasm effect (failed split feedback) ---
const spasmMap = new Map<string, number>() // blobId -> spasm end time

export function triggerSpasm(blobId: string) {
  spasmMap.set(blobId, performance.now() + 300) // 300ms spasm
}

// --- Types ---
type Obstacle = { cx: number; cy: number; radius: number }

// --- Constants ---
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const MIN_SEA_RADIUS = 28
const MAX_VICTIM_AVATARS = 30

function getInitials(handle: string): string {
  const clean = handle.replace(/^@/, '')
  if (clean.length === 0) return '?'
  return clean.slice(0, 2).toUpperCase()
}

// --- Avatar image cache ---
const avatarImages = new Map<string, HTMLImageElement | null>() // url -> loaded img or null (failed)

function getAvatarImage(url: string): HTMLImageElement | null {
  if (!url) return null
  const cached = avatarImages.get(url)
  if (cached !== undefined) return cached
  // Start loading
  const img = new Image()
  img.crossOrigin = 'anonymous'
  avatarImages.set(url, null) // mark as loading
  img.onload = () => avatarImages.set(url, img)
  img.onerror = () => avatarImages.set(url, null)
  img.src = url
  return null
}

export function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mass: number,
  text: string,
  color: string,
  isPlayer: boolean,
  handle: string,
  blobId: string,
  dt: number,
  avatar = '',
) {
  const radius = massToRadius(mass)
  const now = performance.now()

  // === Wobble: compute velocity for deformation ===
  let physW = blobPhysics.get(blobId)
  if (!physW) {
    physW = { prevX: x, prevY: y, offX: 0, offY: 0 }
    blobPhysics.set(blobId, physW)
  }
  const speed = Math.sqrt(
    ((x - physW.prevX) / Math.max(dt, 0.001)) ** 2 +
    ((y - physW.prevY) / Math.max(dt, 0.001)) ** 2,
  )
  const movementWobble = Math.min(speed * 0.002, 1)

  // === Spasm: check for active spasm on this blob ===
  const spasmEnd = spasmMap.get(blobId) ?? 0
  let spasmFactor = 0
  if (now < spasmEnd) {
    const remaining = (spasmEnd - now) / 300
    spasmFactor = remaining // 1.0 → 0.0 over 300ms
  } else if (spasmMap.has(blobId)) {
    spasmMap.delete(blobId)
  }

  // === Circle body with wobble deformation ===
  const WOBBLE_SEGMENTS = 32
  const baseWobble = Math.min(radius * 0.06, 12)
  const wobbleAmount = baseWobble + spasmFactor * radius * 0.15 // spasm adds intense wobble

  function wobblePath() {
    ctx.beginPath()
    for (let i = 0; i <= WOBBLE_SEGMENTS; i++) {
      const angle = (i / WOBBLE_SEGMENTS) * Math.PI * 2
      const wobble = wobbleAmount * (
        Math.sin(angle * 3 + now * 0.002) * 0.3 +
        Math.sin(angle * 5 - now * 0.003) * 0.2 +
        movementWobble * Math.sin(angle * 2 + now * 0.004) * 0.5 +
        spasmFactor * Math.sin(angle * 7 + now * 0.015) * 0.8 // fast, chaotic spasm
      )
      const r = radius + wobble
      const px = x + Math.cos(angle) * r
      const py = y + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  wobblePath()

  const fillGrad = ctx.createRadialGradient(
    x - radius * 0.2, y - radius * 0.2, 0,
    x, y, radius,
  )
  fillGrad.addColorStop(0, colorToFill(color, 0.25))
  fillGrad.addColorStop(1, colorToFill(color, 0.06))
  ctx.fillStyle = fillGrad
  ctx.fill()

  if (isPlayer) {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 0.5
    wobblePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  ctx.strokeStyle = colorToAlpha(color, 0.35)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // === For tiny blobs, just show handle text ===
  if (radius < MIN_SEA_RADIUS) {
    const fontSize = Math.max(7, Math.min(16, radius * 0.5))
    ctx.font = `bold ${fontSize}px ${BLOB_FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(handle, x, y)
    ctx.textAlign = 'start'
    return
  }

  // === Parse accumulated text into words (pellets) and victims (eaten players) ===
  const tokens = text.trim().split(/\s+/)
  const words: string[] = []
  const victims: string[] = []
  for (const t of tokens) {
    if (t.startsWith('@') && t !== handle) {
      victims.push(t)
    } else if (!t.startsWith('@') && t.length > 0) {
      words.push(t)
    }
  }

  // === Physics: velocity-based text offset (sloshing) ===
  let phys = blobPhysics.get(blobId)
  if (!phys) {
    phys = { prevX: x, prevY: y, offX: 0, offY: 0 }
    blobPhysics.set(blobId, phys)
  }

  const safeDt = Math.max(dt, 0.001)
  const vx = (x - phys.prevX) / safeDt
  const vy = (y - phys.prevY) / safeDt
  phys.prevX = x
  phys.prevY = y

  const maxOff = radius * 0.12
  const targetX = Math.max(-maxOff, Math.min(maxOff, -vx * 0.015))
  const targetY = Math.max(-maxOff, Math.min(maxOff, -vy * 0.015))
  const spring = Math.min(1, 4 * safeDt)
  phys.offX += (targetX - phys.offX) * spring
  phys.offY += (targetY - phys.offY) * spring

  const textOffX = phys.offX
  const textOffY = phys.offY

  // === Compute avatar sizes ===
  const avatarR = Math.max(8, radius * 0.16)
  const handleSize = Math.max(7, Math.min(16, radius * 0.13))

  // Victim avatar radius — shrink when many victims
  const numVictims = Math.min(victims.length, MAX_VICTIM_AVATARS)
  const baseVictimR = Math.max(5, radius * 0.09)
  const victimR = numVictims > 15
    ? Math.max(3, baseVictimR * (15 / numVictims))
    : baseVictimR

  // Center identity: avatar circle + handle text below
  const blockH = avatarR * 2 + 3 + handleSize
  const avatarCY = y - blockH / 2 + avatarR

  // === Compute obstacles for text sea exclusion ===
  const obstacles: Obstacle[] = []

  // Center identity block (covers avatar + handle text)
  obstacles.push({ cx: x, cy: y, radius: blockH / 2 + 2 })

  // Victim avatar positions (golden angle spiral)
  const victimPos: { cx: number; cy: number; handle: string }[] = []

  for (let i = 0; i < numVictims; i++) {
    const angle = i * GOLDEN_ANGLE
    const dist = radius * (0.35 + (i / Math.max(numVictims, 1)) * 0.35)
    let vcx = x + Math.cos(angle) * dist
    let vcy = y + Math.sin(angle) * dist

    // Clamp inside blob boundary
    const dx = vcx - x
    const dy = vcy - y
    const d = Math.sqrt(dx * dx + dy * dy)
    const maxDist = radius - victimR - 4
    if (d > maxDist) {
      vcx = x + (dx / d) * maxDist
      vcy = y + (dy / d) * maxDist
    }

    obstacles.push({ cx: vcx, cy: vcy, radius: victimR + 3 })
    victimPos.push({ cx: vcx, cy: vcy, handle: victims[i] })
  }

  // === Text sea (clipped to blob circle) ===
  if (words.length > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, radius - 1, 0, Math.PI * 2)
    ctx.clip()

    drawBlobTextSea(ctx, x, y, radius, words, obstacles, color, textOffX, textOffY)

    ctx.restore()
  }

  // === Draw center avatar ===
  const avatarImg = getAvatarImage(avatar)
  drawAvatar(ctx, x, avatarCY, avatarR, getInitials(handle), color, true, avatarImg)

  // Handle text below avatar
  const handleY = avatarCY + avatarR + 3
  ctx.font = `bold ${handleSize}px ${BLOB_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.fillText(handle, x, handleY)
  ctx.textAlign = 'start'

  // === Draw victim avatars ===
  for (const vp of victimPos) {
    const vc = handleToColor(vp.handle)
    drawAvatar(ctx, vp.cx, vp.cy, victimR, getInitials(vp.handle), vc, false)
  }
}

// --- Internal renderers ---

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  initials: string,
  color: string,
  isOwner: boolean,
  img: HTMLImageElement | null = null,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)

  if (img) {
    ctx.clip()
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
    ctx.restore()
    // Draw border on top
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = colorToAlpha(color, isOwner ? 0.7 : 0.5)
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.fillStyle = isOwner ? colorToFill(color, 0.5) : colorToFill(color, 0.35)
    ctx.fill()
    ctx.strokeStyle = colorToAlpha(color, isOwner ? 0.7 : 0.5)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    const fs = Math.max(5, r * 0.85)
    ctx.font = `bold ${fs}px ${BLOB_FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(initials, cx, cy)
    ctx.textAlign = 'start'
  }
}

function drawBlobTextSea(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  words: string[],
  obstacles: Obstacle[],
  color: string,
  offX: number,
  offY: number,
) {
  // Adaptive font sizing: binary search using layout() for accurate height estimation
  // layout() computes height without constructing line strings — cheap per iteration
  const baseFontSize = Math.max(8, Math.min(14, radius * 0.12))
  const corpusStr = words.join('  ')
  const diameter = radius * 2
  // Average chord width ≈ radius × √2 (geometric mean of circle cross-sections)
  const avgChordWidth = radius * 1.4

  let fontSize = baseFontSize
  // Binary search: find largest font size where text fits within blob diameter
  let lo = 5, hi = baseFontSize
  for (let i = 0; i < 5; i++) {
    const mid = (lo + hi) / 2
    const font = `${mid}px ${UI_FONT_FAMILY}`
    const prepared = getPrepared(corpusStr, font)
    const { height } = layout(prepared, avgChordWidth, mid * 1.4)
    if (height > diameter * 0.85) hi = mid
    else lo = mid
  }
  fontSize = Math.max(5, Math.min(14, lo))

  const lineHeight = fontSize * 1.4
  const font = `${fontSize}px ${UI_FONT_FAMILY}`

  const linesNeeded = Math.ceil((radius * 2) / lineHeight) + 2
  const prepared = getPrepared(corpusStr, font)

  ctx.font = font
  ctx.textBaseline = 'top'

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  const pad = 3

  for (let i = 0; i < linesNeeded; i++) {
    const lineY = cy - radius + pad + i * lineHeight
    const lineTop = lineY
    const lineBot = lineY + lineHeight

    // Chord width at this Y
    const dy = (lineTop + lineHeight / 2) - cy
    if (Math.abs(dy) >= radius - pad) continue

    const chordHalf = Math.sqrt(radius * radius - dy * dy)
    let spans = [{ left: cx - chordHalf + pad, right: cx + chordHalf - pad }]

    // Subtract obstacle exclusion zones
    for (const obs of obstacles) {
      const exc = getCircleExclusion(obs, lineTop, lineBot)
      if (!exc) continue
      spans = subtractExclusion(spans, exc[0], exc[1])
    }

    // Lay out text across available spans
    for (const span of spans) {
      const maxW = span.right - span.left
      if (maxW < fontSize * 1.5) continue

      let line = layoutNextLine(prepared, cursor, maxW)
      if (!line) {
        // Corpus exhausted — wrap around and keep filling
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        line = layoutNextLine(prepared, cursor, maxW)
        if (!line) break // truly empty corpus
      }

      ctx.globalAlpha = 0.45
      ctx.fillStyle = color
      // Center text within the chord span using pretext's measured line width
      const xCenter = (maxW - line.width) / 2
      ctx.fillText(line.text, span.left + xCenter + offX, lineY + offY)
      cursor = line.end
    }
  }

  ctx.globalAlpha = 1
}

// --- Geometry helpers ---

function subtractExclusion(
  spans: { left: number; right: number }[],
  exLeft: number,
  exRight: number,
): { left: number; right: number }[] {
  const next: { left: number; right: number }[] = []
  for (const span of spans) {
    if (exRight <= span.left || exLeft >= span.right) {
      next.push(span)
    } else {
      if (exLeft > span.left + 8) next.push({ left: span.left, right: exLeft })
      if (exRight < span.right - 8) next.push({ left: exRight, right: span.right })
    }
  }
  return next
}

function getCircleExclusion(
  obs: Obstacle,
  lineTop: number,
  lineBot: number,
): [number, number] | null {
  const r = obs.radius
  if (lineBot < obs.cy - r || lineTop > obs.cy + r) return null
  const closestY = Math.max(lineTop, Math.min(lineBot, obs.cy))
  const dy = closestY - obs.cy
  const halfW = Math.sqrt(Math.max(0, r * r - dy * dy))
  return [obs.cx - halfW, obs.cx + halfW]
}

// --- Color helpers ---

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
