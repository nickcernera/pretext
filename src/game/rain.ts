import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { UI_FONT_FAMILY, RAIN_COLOR, WORLD_W, WORLD_H } from '@shared/constants'
import { SEA_WORDS as SEED_WORDS } from '@shared/words'

const FONT = `12px ${UI_FONT_FAMILY}`
const LINE_HEIGHT = 18
const MARGIN = 16
const BLOB_PADDING = 20

type BlobHole = { x: number; y: number; radius: number }
type WordRect = { x: number; y: number; w: number; h: number }

type KillFlash = {
  text: string
  x: number
  y: number
  opacity: number
  createdAt: number
}

export class MatrixRain {
  private corpus = ''
  private prepared: PreparedTextWithSegments | null = null
  private blobHoles: BlobHole[] = []
  private wordRects: WordRect[] = []
  private handles: string[] = []
  private bios: string[] = []
  private killFlashes: KillFlash[] = []
  private corpusDirty = true

  // Precomputed: which corpus cursor to use for each world-space line row
  // This lets us only lay out the visible rows each frame
  private lineStartCursors: LayoutCursor[] = []
  private fullLayoutDone = false

  init() {
    this.rebuildCorpus()
  }

  private rebuildCorpus() {
    const pool = [...SEED_WORDS]
    for (const h of this.handles) pool.push(h, h, h)
    for (const b of this.bios) pool.push(...b.split(/\s+/).slice(0, 6))

    // Need enough text to fill the entire world grid without wrapping.
    // World is 4000px tall, line height 18px = ~223 lines.
    // At 12px monospace ~7px/char, full line ≈ 550 chars ≈ 50 words.
    // 223 * 50 = ~11k words, use 20k for safety margin.
    const words: string[] = []
    for (let i = 0; i < 20000; i++) {
      words.push(pool[Math.floor(Math.random() * pool.length)])
    }
    this.corpus = words.join('  ')
    this.prepared = prepareWithSegments(this.corpus, FONT)
    this.corpusDirty = false
    this.fullLayoutDone = false
    this.lineStartCursors = []
  }

  /**
   * Pre-lay out the entire world grid to cache cursor positions per line.
   * Uses layoutNextLine (same function as rendering) to guarantee cursor
   * compatibility — walkLineRanges can produce subtly different cursors.
   */
  private precomputeLineCursors() {
    if (!this.prepared || this.fullLayoutDone) return

    const totalLines = Math.ceil(WORLD_H / LINE_HEIGHT)
    const lineWidth = WORLD_W - MARGIN * 2
    this.lineStartCursors = []

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

    for (let i = 0; i < totalLines; i++) {
      this.lineStartCursors.push({ ...cursor })
      const line = layoutNextLine(this.prepared, cursor, lineWidth)
      if (!line) {
        // Corpus exhausted — wrap to beginning for remaining lines
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
      } else {
        cursor = line.end
      }
    }

    this.fullLayoutDone = true
  }

  setHandles(handles: string[]) {
    if (handles.join() !== this.handles.join()) {
      this.handles = handles
      this.corpusDirty = true
    }
  }

  setBios(bios: string[]) {
    this.bios = bios
    this.corpusDirty = true
  }

  /** World-space blob positions */
  setBlobHoles(holes: BlobHole[]) {
    this.blobHoles = holes
  }

  /** World-space pellet rectangles */
  setWordRects(rects: WordRect[]) {
    this.wordRects = rects
  }

  addKill(killerHandle: string, victimHandle: string) {
    // Kill flashes in world space — place near a random blob or center
    const blob = this.blobHoles.length > 0
      ? this.blobHoles[Math.floor(Math.random() * this.blobHoles.length)]
      : { x: WORLD_W / 2, y: WORLD_H / 2, radius: 100 }
    this.killFlashes.push({
      text: `${killerHandle} devoured ${victimHandle}`,
      x: blob.x + (Math.random() - 0.5) * 400,
      y: blob.y + (Math.random() - 0.5) * 300,
      opacity: 0.9,
      createdAt: performance.now(),
    })
  }

  update(dt: number) {
    if (this.corpusDirty) {
      this.rebuildCorpus()
    }
    this.precomputeLineCursors()

    const now = performance.now()
    this.killFlashes = this.killFlashes.filter(k => {
      k.opacity = Math.max(0, 0.9 - (now - k.createdAt) / 2500)
      return k.opacity > 0
    })
  }

  /**
   * Draw the text sea in WORLD SPACE.
   * Called inside the camera transform — coordinates are world pixels.
   * viewportX/Y/W/H define the visible world region (for culling).
   *
   * Each line seeds its cursor from the precomputed cache so blob-induced
   * reflow on one line cannot cascade to subsequent lines.
   */
  drawWorld(
    ctx: CanvasRenderingContext2D,
    viewportX: number,
    viewportY: number,
    viewportW: number,
    viewportH: number,
  ) {
    if (!this.prepared || this.lineStartCursors.length === 0) return

    ctx.font = FONT
    ctx.textBaseline = 'top'

    // Determine which line rows are visible
    const firstLine = Math.max(0, Math.floor(viewportY / LINE_HEIGHT) - 1)
    const lastLine = Math.min(
      this.lineStartCursors.length - 1,
      Math.ceil((viewportY + viewportH) / LINE_HEIGHT) + 1,
    )

    for (let li = firstLine; li <= lastLine; li++) {
      const worldY = li * LINE_HEIGHT
      const lineTop = worldY
      const lineBottom = worldY + LINE_HEIGHT

      // Start with full world width
      let spans = [{ left: MARGIN, right: WORLD_W - MARGIN }]

      // Subtract blob exclusions
      for (const blob of this.blobHoles) {
        const exc = getCircleExclusion(blob, lineTop, lineBottom)
        if (!exc) continue
        spans = subtractExclusion(spans, exc[0], exc[1])
      }

      // Subtract word pellet exclusions
      for (const rect of this.wordRects) {
        if (lineBottom < rect.y || lineTop > rect.y + rect.h) continue
        spans = subtractExclusion(spans, rect.x, rect.x + rect.w)
      }

      // Seed cursor from precomputed cache on EVERY line so reflow on one
      // line never cascades to subsequent lines
      let cursor = { ...this.lineStartCursors[li] }

      for (const span of spans) {
        // Cull spans entirely outside viewport
        if (span.right < viewportX - 100 || span.left > viewportX + viewportW + 100) {
          // Still advance the cursor so text stays consistent within this line
          const skip = layoutNextLine(this.prepared, cursor, span.right - span.left)
          if (skip) {
            cursor = skip.end
          } else {
            cursor = { segmentIndex: 0, graphemeIndex: 0 }
          }
          continue
        }

        const maxWidth = span.right - span.left
        if (maxWidth < 30) continue

        let line = layoutNextLine(this.prepared, cursor, maxWidth)
        if (!line) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          line = layoutNextLine(this.prepared, cursor, maxWidth)
          if (!line) break
        }

        // Opacity: base + halo near blobs
        let alpha = 0.22
        const midX = (span.left + span.right) / 2
        const midY = (lineTop + lineBottom) / 2
        for (const blob of this.blobHoles) {
          const dx = midX - blob.x
          const dy = midY - blob.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const haloZone = blob.radius + 120
          if (dist < haloZone) {
            const proximity = 1 - dist / haloZone
            alpha = Math.max(alpha, 0.22 + proximity * 0.35)
          }
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = RAIN_COLOR
        ctx.fillText(line.text, span.left, worldY)

        cursor = line.end
      }
    }

    // Kill flashes (world space)
    for (const flash of this.killFlashes) {
      ctx.font = `bold 14px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = flash.opacity
      ctx.fillStyle = '#80ffa0'
      ctx.fillText(flash.text, flash.x, flash.y)
    }

    ctx.globalAlpha = 1
  }
}

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
      if (exLeft > span.left + 20) next.push({ left: span.left, right: exLeft })
      if (exRight < span.right - 20) next.push({ left: exRight, right: span.right })
    }
  }
  return next
}

function getCircleExclusion(
  blob: BlobHole,
  lineTop: number,
  lineBottom: number,
): [number, number] | null {
  const r = blob.radius + BLOB_PADDING
  if (lineBottom < blob.y - r || lineTop > blob.y + r) return null
  const closestY = Math.max(lineTop, Math.min(lineBottom, blob.y))
  const dy = closestY - blob.y
  const halfWidth = Math.sqrt(Math.max(0, r * r - dy * dy))
  return [blob.x - halfWidth, blob.x + halfWidth]
}
