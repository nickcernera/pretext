import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { drawBackground } from '../game/background'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, BG_COLOR, RAIN_COLOR } from '@shared/constants'
import { getStoredUser, startXAuth, logout } from '../auth'
import { cursor as customCursor } from '../game/cursor'

const SEA_FONT = `12px ${UI_FONT_FAMILY}`
const SEA_LINE_HEIGHT = 18

const SEA_WORDS = [
  'transformer', 'attention', 'gradient∇', 'softmax', 'backprop',
  'embeddings', 'CUDA', 'inference', 'tokenizer', 'hallucinate',
  'latency:0.09ms', 'pid:4847', '0x7fff', 'batch_size=32',
  'epoch', 'loss=0.003', 'checkpoint', 'tensor', 'dropout',
  'optimizer', 'scheduler', 'normalize', 'pooling', 'residual',
  'malloc', 'fork()', 'pipe', 'mutex', 'semaphore',
  'heap', 'stack', 'queue', 'btree', 'hashmap',
  '∂f/∂x', '∫dx', 'Σ', 'λ', '∞', '@pretext',
]

type Span = { left: number; right: number; align: 'left' | 'right' }

/** Split spans around a horizontal exclusion range [exclL, exclR] */
function excludeRange(spans: Span[], exclL: number, exclR: number): Span[] {
  const next: Span[] = []
  for (const span of spans) {
    if (exclR <= span.left || exclL >= span.right) {
      next.push(span)
    } else {
      if (exclL > span.left + 10) next.push({ left: span.left, right: exclL, align: 'right' })
      if (exclR < span.right - 10) next.push({ left: exclR, right: span.right, align: 'left' })
    }
  }
  return next
}

export type LandingResult =
  | { action: 'play'; handle: string; token?: string; room?: string }
  | { action: 'auth' }

export class LandingScreen {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rafId = 0
  private lastTime = 0
  private container: HTMLDivElement | null = null
  private panel: HTMLDivElement | null = null
  private seaPrepared: PreparedTextWithSegments | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.buildSeaCorpus()
  }

  private buildSeaCorpus() {
    const words: string[] = []
    for (let i = 0; i < 5000; i++) {
      words.push(SEA_WORDS[Math.floor(Math.random() * SEA_WORDS.length)])
    }
    this.seaPrepared = prepareWithSegments(words.join('  '), SEA_FONT)
  }

  show(): Promise<LandingResult> {
    return new Promise((resolve) => {
      this.buildUI(resolve)
      // Start background after UI is in DOM so we can measure exclusion rects
      requestAnimationFrame(() => this.startBackground())
    })
  }

  private getUIExclusionRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.panel) return null
    const rect = this.panel.getBoundingClientRect()
    const pad = 8
    return {
      x: rect.left - pad,
      y: rect.top - pad,
      w: rect.width + pad * 2,
      h: rect.height + pad * 2,
    }
  }

  private startBackground() {
    this.lastTime = performance.now()
    const loop = () => {
      const now = performance.now()
      this.lastTime = now

      const sw = window.innerWidth
      const sh = window.innerHeight

      drawBackground(this.ctx, sw, sh)
      this.drawSea(this.ctx, sw, sh)

      this.rafId = requestAnimationFrame(loop)
    }
    loop()
  }

  private drawSea(ctx: CanvasRenderingContext2D, sw: number, sh: number) {
    if (!this.seaPrepared) return

    const exclusion = this.getUIExclusionRect()
    ctx.font = SEA_FONT
    ctx.textBaseline = 'top'

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let y = 8

    while (y < sh) {
      const lineTop = y
      const lineBottom = y + SEA_LINE_HEIGHT

      let spans: Span[] = [{ left: 8, right: sw - 8, align: 'left' }]

      // Exclude the UI panel area (rounded rect)
      if (exclusion) {
        const midY = (lineTop + lineBottom) / 2
        if (midY > exclusion.y && midY < exclusion.y + exclusion.h) {
          const cr = 48
          let inset = 0
          if (midY < exclusion.y + cr) {
            const dy = exclusion.y + cr - midY
            inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy))
          } else if (midY > exclusion.y + exclusion.h - cr) {
            const dy = midY - (exclusion.y + exclusion.h - cr)
            inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy))
          }
          spans = excludeRange(spans, exclusion.x + inset, exclusion.x + exclusion.w - inset)
        }
      }

      // Exclude area around cursor (circle)
      const cursorR = 30
      const midLineY = (lineTop + lineBottom) / 2
      const cdy = midLineY - customCursor.y
      if (Math.abs(cdy) < cursorR) {
        const halfW = Math.sqrt(cursorR * cursorR - cdy * cdy)
        spans = excludeRange(spans, customCursor.x - halfW, customCursor.x + halfW)
      }

      for (const span of spans) {
        const maxWidth = span.right - span.left
        if (maxWidth < 30) continue

        const line = layoutNextLine(this.seaPrepared, cursor, maxWidth)
        if (!line) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          break
        }

        const midX = (span.left + span.right) / 2
        const midY = (lineTop + lineBottom) / 2

        // Brighter near the UI exclusion — min distance between span rect and panel rect
        let alpha = 0.08
        if (exclusion) {
          const dx = Math.max(0, exclusion.x - span.right, span.left - (exclusion.x + exclusion.w))
          const dy = Math.max(0, exclusion.y - lineBottom, lineTop - (exclusion.y + exclusion.h))
          const dist = Math.sqrt(dx * dx + dy * dy)
          const halo = 200
          if (dist < halo) {
            const proximity = 1 - dist / halo
            alpha = Math.max(alpha, 0.08 + proximity * 0.22)
          }
        }

        // Spotlight near cursor — distance to nearest point on the text line
        const nearX = Math.max(span.left, Math.min(span.right, customCursor.x))
        const nearY = Math.max(lineTop, Math.min(lineBottom, customCursor.y))
        const cursorDist = Math.sqrt((nearX - customCursor.x) ** 2 + (nearY - customCursor.y) ** 2)
        if (cursorDist < 150) {
          const proximity = 1 - cursorDist / 150
          alpha = Math.max(alpha, 0.1 + proximity * 0.6)
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = RAIN_COLOR
        if (span.align === 'right') {
          const textW = ctx.measureText(line.text).width
          ctx.fillText(line.text, span.right - textW, y)
        } else {
          ctx.fillText(line.text, span.left, y)
        }
        cursor = line.end
      }

      y += SEA_LINE_HEIGHT
    }

    ctx.globalAlpha = 1
  }

  private buildUI(resolve: (result: LandingResult) => void) {
    const user = getStoredUser()

    const pathname = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    let roomFromUrl: string | undefined
    const roomMatch = pathname.match(/^\/r\/([A-Za-z0-9_-]+)/)
    if (roomMatch) {
      roomFromUrl = roomMatch[1]
    } else if (params.has('r')) {
      roomFromUrl = params.get('r') || undefined
    }

    const container = document.createElement('div')
    this.container = container
    container.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 10;
      font-family: ${UI_FONT_FAMILY}; pointer-events: none;
    `

    // Inner panel — pointer events only on this, also used for sea exclusion
    const panel = document.createElement('div')
    this.panel = panel
    panel.style.cssText = `
      display: flex; flex-direction: column; align-items: center;
      pointer-events: auto; padding: 40px 60px; border-radius: 8px;
    `

    // Title
    const title = document.createElement('h1')
    title.textContent = 'pretext'
    title.style.cssText = `
      font-family: ${BLOB_FONT_FAMILY}; font-size: 64px; font-weight: 700;
      color: #d0ffe0; margin: 0 0 8px 0; letter-spacing: -2px;
    `
    panel.appendChild(title)

    // Tagline
    const tagline = document.createElement('p')
    tagline.textContent = 'you are your text. eat or be eaten.'
    tagline.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 14px; color: #4a7a5a;
      margin: 0 0 40px 0;
    `
    panel.appendChild(tagline)

    const cleanup = () => {
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0 }
      if (this.container?.parentNode) { this.container.parentNode.removeChild(this.container); this.container = null }
    }

    const makeButton = (text: string, primary: boolean): HTMLButtonElement => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 14px; padding: 12px 32px;
        border: 1px solid ${primary ? RAIN_COLOR : '#3a5a4a'}; border-radius: 4px;
        background: ${primary ? '#1a2a1a' : 'transparent'}; color: ${primary ? '#d0ffe0' : '#4a7a5a'};
        cursor: pointer; margin: 6px; min-width: 220px; transition: all 0.15s;
      `
      btn.addEventListener('mouseenter', () => { btn.style.background = primary ? '#2a3a2a' : '#1a2a1a'; btn.style.color = '#d0ffe0' })
      btn.addEventListener('mouseleave', () => { btn.style.background = primary ? '#1a2a1a' : 'transparent'; btn.style.color = primary ? '#d0ffe0' : '#4a7a5a' })
      return btn
    }

    if (user) {
      // User identity row: avatar + handle
      const identity = document.createElement('div')
      identity.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:20px;'

      const avatar = document.createElement('img')
      avatar.src = user.avatar
      avatar.alt = user.handle
      avatar.style.cssText = 'width:40px;height:40px;border-radius:50%;border:2px solid #3a5a4a;'
      avatar.onerror = () => { avatar.style.display = 'none' }
      identity.appendChild(avatar)

      const nameCol = document.createElement('div')
      const displayName = document.createElement('div')
      displayName.textContent = user.displayName
      displayName.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:14px;color:#d0ffe0;font-weight:600;`
      nameCol.appendChild(displayName)

      const handle = document.createElement('div')
      handle.textContent = user.handle
      handle.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;color:#4a7a5a;`
      nameCol.appendChild(handle)

      const signOutLink = document.createElement('button')
      signOutLink.textContent = 'sign out'
      signOutLink.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#3a5a4a;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;margin-left:auto;`
      signOutLink.addEventListener('click', () => { logout(); cleanup(); const fresh = new LandingScreen(this.canvas); fresh.show().then(resolve) })

      identity.appendChild(nameCol)
      identity.appendChild(signOutLink)
      panel.appendChild(identity)

      const playBtn = makeButton('Play', true)
      playBtn.addEventListener('click', () => { cleanup(); resolve({ action: 'play', handle: user.handle, token: user.jwt, room: roomFromUrl }) })
      panel.appendChild(playBtn)
    } else {
      const xBtn = makeButton('Sign in with X', false)
      xBtn.addEventListener('click', () => { cleanup(); startXAuth() })
      panel.appendChild(xBtn)
    }

    const guestBtn = makeButton('Play as Guest', !user)
    guestBtn.addEventListener('click', () => {
      cleanup()
      const guestHandle = '@guest_' + Math.random().toString(36).substring(2, 6)
      resolve({ action: 'play', handle: guestHandle, room: roomFromUrl })
    })
    panel.appendChild(guestBtn)

    if (!roomFromUrl) {
      const roomRow = document.createElement('div')
      roomRow.style.cssText = 'display:flex;align-items:center;margin-top:24px;gap:8px;'

      const roomInput = document.createElement('input')
      roomInput.type = 'text'
      roomInput.placeholder = 'Room code'
      roomInput.maxLength = 12
      roomInput.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;padding:10px 14px;background:#0a150e;border:1px solid #3a5a4a;border-radius:4px;color:#d0ffe0;width:140px;outline:none;`
      roomInput.addEventListener('focus', () => { roomInput.style.borderColor = RAIN_COLOR })
      roomInput.addEventListener('blur', () => { roomInput.style.borderColor = '#3a5a4a' })

      const joinBtn = document.createElement('button')
      joinBtn.textContent = 'Join'
      joinBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;padding:10px 20px;background:#1a2a1a;border:1px solid #3a5a4a;border-radius:4px;color:#4a7a5a;cursor:pointer;`
      joinBtn.addEventListener('click', () => {
        const code = roomInput.value.trim()
        if (!code) return
        cleanup()
        const handle = user ? user.handle : '@guest_' + Math.random().toString(36).substring(2, 6)
        resolve({ action: 'play', handle, token: user?.jwt, room: code })
      })
      roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click() })

      roomRow.appendChild(roomInput)
      roomRow.appendChild(joinBtn)
      panel.appendChild(roomRow)
    } else {
      const roomLabel = document.createElement('p')
      roomLabel.textContent = `Joining room: ${roomFromUrl}`
      roomLabel.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;color:${RAIN_COLOR};margin-top:20px;opacity:0.6;`
      panel.appendChild(roomLabel)
    }

    container.appendChild(panel)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(container)
    } else {
      document.body.appendChild(container)
    }
  }
}
