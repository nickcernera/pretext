import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'

// --- Seed corpus ---
const SEED_WORDS = [
  'transformer', 'attention', 'gradient∇', 'softmax', 'backprop',
  'embeddings', 'CUDA', 'inference', 'tokenizer', 'hallucinate',
  'latency:0.09ms', 'pid:4847', '0x7fff', 'batch_size=32',
  'epoch', 'loss=0.003', 'checkpoint', 'tensor', 'dropout',
  'learning_rate', 'conv2d', 'relu', 'sigmoid', 'entropy',
  'optimizer', 'scheduler', 'normalize', 'pooling', 'residual',
  'conn.established', 'ACK', 'SYN', 'RST', 'TTL=64',
  'malloc', 'fork()', 'pipe', 'mutex', 'semaphore',
  'heap', 'stack', 'queue', 'btree', 'hashmap',
  'tcp.syn', 'udp', 'http/2', 'tls1.3', 'dns',
  '∂f/∂x', '∫dx', 'Σ', 'λ', '∞',
]

const FONT = `12px ${UI_FONT_FAMILY}`
const LINE_HEIGHT = 18
const SCROLL_SPEED = 0 // static — blobs carve through the text
const MARGIN = 8
const BLOB_PADDING = 18 // extra space around blobs

type BlobHole = { x: number; y: number; radius: number }

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
  private scrollOffset = 0
  private blobHoles: BlobHole[] = []
  private handles: string[] = []
  private bios: string[] = []
  private killFlashes: KillFlash[] = []
  private corpusDirty = true

  init(_screenW: number, _screenH: number) {
    this.rebuildCorpus()
  }

  private rebuildCorpus() {
    // Build a long repeating corpus from seed + player data
    const pool = [...SEED_WORDS]
    for (const h of this.handles) pool.push(h, h, h)
    for (const b of this.bios) pool.push(...b.split(/\s+/).slice(0, 6))

    // Shuffle and repeat to fill ~3000 words
    const words: string[] = []
    for (let i = 0; i < 3000; i++) {
      words.push(pool[Math.floor(Math.random() * pool.length)])
    }
    this.corpus = words.join('  ')
    this.prepared = prepareWithSegments(this.corpus, FONT)
    this.corpusDirty = false
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

  setBlobHoles(holes: BlobHole[]) {
    this.blobHoles = holes
  }

  addKill(killerHandle: string, victimHandle: string, screenW: number, screenH: number) {
    this.killFlashes.push({
      text: `${killerHandle} devoured ${victimHandle}`,
      x: Math.random() * screenW * 0.5 + screenW * 0.15,
      y: Math.random() * screenH * 0.4 + screenH * 0.2,
      opacity: 0.9,
      createdAt: performance.now(),
    })
  }

  update(dt: number, screenH: number) {
    this.scrollOffset += SCROLL_SPEED * dt

    // Wrap scroll offset to prevent infinity
    // We use a large buffer so text repeats seamlessly
    const wrapHeight = screenH * 3
    if (this.scrollOffset > wrapHeight) {
      this.scrollOffset -= wrapHeight
    }

    // Rebuild corpus if player data changed (throttled)
    if (this.corpusDirty) {
      this.rebuildCorpus()
    }

    // Fade kill flashes
    const now = performance.now()
    this.killFlashes = this.killFlashes.filter(k => {
      k.opacity = Math.max(0, 0.9 - (now - k.createdAt) / 2500)
      return k.opacity > 0
    })
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    if (!this.prepared) return

    ctx.font = FONT
    ctx.textBaseline = 'top'

    // Lay out text flowing around blobs, starting from scroll offset
    const startY = -(this.scrollOffset % LINE_HEIGHT) - LINE_HEIGHT
    // Start reading from beginning of corpus each frame. Since the corpus is
    // long (~3000 words) and we only render ~40 lines, we won't exhaust it.
    // The scroll offset controls Y position, not text position — this means
    // the text content stays stable while the "window" scrolls over it.
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

    let y = startY
    let lineIndex = 0

    while (y < screenH + LINE_HEIGHT) {
      const lineTop = y
      const lineBottom = y + LINE_HEIGHT

      // Compute available horizontal spans by subtracting blob exclusions
      let spans = [{ left: MARGIN, right: screenW - MARGIN }]

      for (const blob of this.blobHoles) {
        const exc = getCircleExclusion(blob, lineTop, lineBottom)
        if (!exc) continue
        const [exLeft, exRight] = exc

        const next: typeof spans = []
        for (const span of spans) {
          if (exRight <= span.left || exLeft >= span.right) {
            next.push(span)
          } else {
            if (exLeft > span.left + 20) next.push({ left: span.left, right: exLeft })
            if (exRight < span.right - 20) next.push({ left: exRight, right: span.right })
          }
        }
        spans = next
      }

      // Lay out text in each available span
      for (const span of spans) {
        const maxWidth = span.right - span.left
        if (maxWidth < 30) continue

        const line = layoutNextLine(this.prepared, cursor, maxWidth)
        if (!line) {
          // Wrap back to start of corpus
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          break
        }

        // Base opacity — clearly visible
        let alpha = 0.25
        // Brighter near blobs (halo effect — text glows as it bends around)
        for (const blob of this.blobHoles) {
          const dx = (span.left + span.right) / 2 - blob.x
          const dy = (lineTop + lineBottom) / 2 - blob.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const haloZone = blob.radius + 100
          if (dist < haloZone) {
            const proximity = 1 - dist / haloZone
            alpha = Math.max(alpha, 0.25 + proximity * 0.35)
          }
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = RAIN_COLOR
        ctx.fillText(line.text, span.left, y)

        cursor = line.end
      }

      y += LINE_HEIGHT
      lineIndex++
    }

    // Kill flashes — brighter, on top
    for (const flash of this.killFlashes) {
      ctx.font = `bold 14px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = flash.opacity
      ctx.fillStyle = '#80ffa0'
      ctx.fillText(flash.text, flash.x, flash.y)
    }

    ctx.globalAlpha = 1
  }
}

/** For a circle at (cx, cy) with radius r, return horizontal exclusion [left, right]
 *  for a line band [lineTop, lineBottom], or null if no overlap. */
function getCircleExclusion(
  blob: BlobHole,
  lineTop: number,
  lineBottom: number,
): [number, number] | null {
  const r = blob.radius + BLOB_PADDING

  if (lineBottom < blob.y - r || lineTop > blob.y + r) return null

  // Find the closest y in the line band to the circle center
  const closestY = Math.max(lineTop, Math.min(lineBottom, blob.y))
  const dy = closestY - blob.y
  const halfWidth = Math.sqrt(Math.max(0, r * r - dy * dy))

  return [blob.x - halfWidth, blob.x + halfWidth]
}
