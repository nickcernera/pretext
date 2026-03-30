import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { drawBackground } from '../game/background'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, BG_COLOR, RAIN_COLOR } from '@shared/constants'
import { SEA_WORDS } from '@shared/words'
import { getStoredUser, startXAuth, logout } from '../auth'
import { cursor as customCursor } from '../game/cursor'
import { httpFromWs, copyRoomLink, buildShareUrl } from '../share'
import type { RoomsResponse, RoomInfo, ActivityEvent } from '@shared/protocol'

const SEA_FONT = `12px ${UI_FONT_FAMILY}`
const SEA_LINE_HEIGHT = 18

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
  | { action: 'spectate'; room?: string }
  | { action: 'auth' }

export class LandingScreen {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rafId = 0
  private lastTime = 0
  private container: HTMLDivElement | null = null
  private panel: HTMLDivElement | null = null
  private seaPrepared: PreparedTextWithSegments | null = null
  private serverUrl: string
  private activityInterval: ReturnType<typeof setInterval> | null = null

  constructor(canvas: HTMLCanvasElement, serverUrl: string) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.serverUrl = serverUrl
    this.buildSeaCorpus()
  }

  private async fetchRooms(): Promise<RoomsResponse | null> {
    try {
      const httpUrl = httpFromWs(this.serverUrl)
      const res = await fetch(`${httpUrl}/rooms`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
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
          // Use pretext's measured line.width — avoids redundant ctx.measureText call
          ctx.fillText(line.text, span.right - line.width, y)
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
      pointer-events: auto; padding: 32px 48px; border-radius: 8px;
      max-width: 420px; width: 100%;
    `

    // Title
    const title = document.createElement('h1')
    title.textContent = 'pretext'
    title.style.cssText = `
      font-family: ${BLOB_FONT_FAMILY}; font-size: 64px; font-weight: 700;
      color: #d0ffe0; margin: 0 0 4px 0; letter-spacing: -2px;
    `
    panel.appendChild(title)

    // Tagline
    const tagline = document.createElement('p')
    tagline.textContent = 'you are your text. eat or be eaten.'
    tagline.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 14px; color: #4a7a5a;
      margin: 0 0 8px 0;
    `
    panel.appendChild(tagline)

    // Player count badge — filled async
    const playerCountEl = document.createElement('div')
    playerCountEl.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 12px; color: ${RAIN_COLOR};
      margin-bottom: 28px; opacity: 0; transition: opacity 0.4s;
    `
    panel.appendChild(playerCountEl)

    const cleanup = () => {
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0 }
      if (this.activityInterval) { clearInterval(this.activityInterval); this.activityInterval = null }
      if (this.container?.parentNode) { this.container.parentNode.removeChild(this.container); this.container = null }
    }

    const getHandle = (): string => {
      return user ? user.handle : '@guest_' + Math.random().toString(36).substring(2, 6)
    }

    const getToken = (): string | undefined => user?.jwt

    const makeButton = (text: string, primary: boolean, size: 'normal' | 'large' = 'normal'): HTMLButtonElement => {
      const btn = document.createElement('button')
      btn.textContent = text
      const pad = size === 'large' ? '14px 40px' : '10px 28px'
      const fontSize = size === 'large' ? '15px' : '13px'
      btn.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: ${fontSize}; padding: ${pad};
        border: 1px solid ${primary ? RAIN_COLOR : '#3a5a4a'}; border-radius: 4px;
        background: ${primary ? '#1a2a1a' : 'transparent'}; color: ${primary ? '#d0ffe0' : '#4a7a5a'};
        cursor: pointer; min-width: 200px; transition: all 0.15s;
      `
      btn.addEventListener('mouseenter', () => { btn.style.background = primary ? '#2a3a2a' : '#1a2a1a'; btn.style.color = '#d0ffe0' })
      btn.addEventListener('mouseleave', () => { btn.style.background = primary ? '#1a2a1a' : 'transparent'; btn.style.color = primary ? '#d0ffe0' : '#4a7a5a' })
      return btn
    }

    // --- Auth row ---
    if (user) {
      const identity = document.createElement('div')
      identity.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;'

      const avatar = document.createElement('img')
      avatar.src = user.avatar
      avatar.alt = user.handle
      avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;border:1px solid #3a5a4a;'
      avatar.onerror = () => { avatar.style.display = 'none' }
      identity.appendChild(avatar)

      const nameCol = document.createElement('div')
      const displayName = document.createElement('div')
      displayName.textContent = user.displayName
      displayName.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;color:#d0ffe0;font-weight:600;`
      nameCol.appendChild(displayName)

      const handle = document.createElement('div')
      handle.textContent = user.handle
      handle.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#4a7a5a;`
      nameCol.appendChild(handle)

      const signOutLink = document.createElement('button')
      signOutLink.textContent = 'sign out'
      signOutLink.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#3a5a4a;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;margin-left:auto;`
      signOutLink.addEventListener('click', () => { logout(); cleanup(); const fresh = new LandingScreen(this.canvas, this.serverUrl); fresh.show().then(resolve) })

      identity.appendChild(nameCol)
      identity.appendChild(signOutLink)
      panel.appendChild(identity)
    }

    // --- Main CTAs ---

    if (roomFromUrl) {
      // Direct room join
      const roomLabel = document.createElement('p')
      roomLabel.textContent = `Joining room: ${roomFromUrl}`
      roomLabel.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;color:${RAIN_COLOR};margin-bottom:16px;opacity:0.8;`
      panel.appendChild(roomLabel)

      const joinRoomBtn = makeButton('Join Game', true, 'large')
      joinRoomBtn.addEventListener('click', () => { cleanup(); resolve({ action: 'play', handle: getHandle(), token: getToken(), room: roomFromUrl }) })
      panel.appendChild(joinRoomBtn)

      if (!user) {
        const xBtn = makeButton('Sign in with X first', false)
        xBtn.style.marginTop = '8px'
        xBtn.addEventListener('click', () => { cleanup(); startXAuth() })
        panel.appendChild(xBtn)
      }
    } else {
      // Quick Play — primary CTA
      const quickPlayBtn = makeButton('Quick Play', true, 'large')
      quickPlayBtn.addEventListener('click', () => { cleanup(); resolve({ action: 'play', handle: getHandle(), token: getToken() }) })
      panel.appendChild(quickPlayBtn)

      // Create Room + Sign in row
      const secondaryRow = document.createElement('div')
      secondaryRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;width:100%;justify-content:center;'

      const createRoomBtn = makeButton('Create Room', false)
      createRoomBtn.style.minWidth = '120px'
      createRoomBtn.addEventListener('click', () => {
        const code = Math.random().toString(36).substring(2, 8)
        showCreateRoomPanel(code)
      })
      secondaryRow.appendChild(createRoomBtn)

      if (!user) {
        const xBtn = makeButton('Sign in with X', false)
        xBtn.style.minWidth = '120px'
        xBtn.addEventListener('click', () => { cleanup(); startXAuth() })
        secondaryRow.appendChild(xBtn)
      }

      panel.appendChild(secondaryRow)

      // Join by code row
      const joinRow = document.createElement('div')
      joinRow.style.cssText = 'display:flex;align-items:center;margin-top:16px;gap:6px;'

      const roomInput = document.createElement('input')
      roomInput.type = 'text'
      roomInput.placeholder = 'Room code'
      roomInput.maxLength = 12
      roomInput.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;padding:8px 12px;background:#0a150e;border:1px solid #3a5a4a;border-radius:4px;color:#d0ffe0;width:120px;outline:none;`
      roomInput.addEventListener('focus', () => { roomInput.style.borderColor = RAIN_COLOR })
      roomInput.addEventListener('blur', () => { roomInput.style.borderColor = '#3a5a4a' })

      const joinBtn = document.createElement('button')
      joinBtn.textContent = 'Join'
      joinBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;padding:8px 16px;background:#1a2a1a;border:1px solid #3a5a4a;border-radius:4px;color:#4a7a5a;cursor:pointer;transition:all 0.15s;`
      joinBtn.addEventListener('mouseenter', () => { joinBtn.style.color = '#d0ffe0' })
      joinBtn.addEventListener('mouseleave', () => { joinBtn.style.color = '#4a7a5a' })
      joinBtn.addEventListener('click', () => {
        const code = roomInput.value.trim()
        if (!code) return
        cleanup()
        resolve({ action: 'play', handle: getHandle(), token: getToken(), room: code })
      })
      roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click() })

      joinRow.appendChild(roomInput)
      joinRow.appendChild(joinBtn)
      panel.appendChild(joinRow)

      // --- Live Rooms browser ---
      const roomsSection = document.createElement('div')
      roomsSection.style.cssText = `
        width: 100%; margin-top: 24px; border-top: 1px solid #1a2a1a;
        padding-top: 16px;
      `

      const roomsHeader = document.createElement('div')
      roomsHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;'

      const roomsTitle = document.createElement('div')
      roomsTitle.textContent = 'LIVE ARENAS'
      roomsTitle.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#4a7a5a;letter-spacing:1.5px;`
      roomsHeader.appendChild(roomsTitle)

      const watchBtn = document.createElement('button')
      watchBtn.textContent = 'Watch Live'
      watchBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#3a5a4a;background:none;border:none;cursor:pointer;text-decoration:underline;transition:color 0.15s;`
      watchBtn.addEventListener('mouseenter', () => { watchBtn.style.color = '#d0ffe0' })
      watchBtn.addEventListener('mouseleave', () => { watchBtn.style.color = '#3a5a4a' })
      watchBtn.addEventListener('click', () => { cleanup(); resolve({ action: 'spectate' }) })
      roomsHeader.appendChild(watchBtn)

      roomsSection.appendChild(roomsHeader)

      const roomsList = document.createElement('div')
      roomsList.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto;'
      roomsSection.appendChild(roomsList)

      panel.appendChild(roomsSection)

      // --- Activity ticker ---
      const activitySection = document.createElement('div')
      activitySection.style.cssText = `
        width: 100%; margin-top: 16px; border-top: 1px solid #1a2a1a;
        padding-top: 12px; max-height: 80px; overflow: hidden;
      `
      const activityTitle = document.createElement('div')
      activityTitle.textContent = 'LIVE FEED'
      activityTitle.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#4a7a5a;letter-spacing:1.5px;margin-bottom:8px;`
      activitySection.appendChild(activityTitle)

      const activityList = document.createElement('div')
      activityList.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
      activitySection.appendChild(activityList)
      panel.appendChild(activitySection)

      // Fetch rooms + activity and populate
      const populateRooms = (data: RoomsResponse) => {
        // Player count badge
        if (data.totalPlayers > 0) {
          playerCountEl.textContent = `${data.totalPlayers} player${data.totalPlayers !== 1 ? 's' : ''} online`
          playerCountEl.style.opacity = '1'
        }

        // Room cards — clear and rebuild
        while (roomsList.firstChild) roomsList.removeChild(roomsList.firstChild)
        const activeRooms = data.rooms.filter(r => r.playerCount > 0).sort((a, b) => b.playerCount - a.playerCount)

        if (activeRooms.length === 0) {
          const empty = document.createElement('div')
          empty.textContent = 'No active arenas — start one!'
          empty.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#3a5a4a;padding:8px 0;`
          roomsList.appendChild(empty)
        } else {
          for (const room of activeRooms.slice(0, 5)) {
            roomsList.appendChild(this.buildRoomCard(room, cleanup, resolve, getHandle, getToken))
          }
        }

        // Activity feed — clear and rebuild
        while (activityList.firstChild) activityList.removeChild(activityList.firstChild)
        const recent = data.activity.slice(-6).reverse()
        if (recent.length === 0) {
          const empty = document.createElement('div')
          empty.textContent = 'Waiting for action...'
          empty.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#3a5a4a;`
          activityList.appendChild(empty)
        } else {
          for (const ev of recent) {
            const evEl = document.createElement('div')
            evEl.textContent = ev.text
            evEl.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#4a7a5a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
            activityList.appendChild(evEl)
          }
        }
      }

      // Initial fetch + polling
      this.fetchRooms().then(data => { if (data) populateRooms(data) })
      this.activityInterval = setInterval(() => {
        this.fetchRooms().then(data => { if (data) populateRooms(data) })
      }, 5000)
    }

    container.appendChild(panel)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(container)
    } else {
      document.body.appendChild(container)
    }

    // --- Create Room sub-panel ---
    const showCreateRoomPanel = (code: string) => {
      // Clear panel content safely
      while (panel.firstChild) panel.removeChild(panel.firstChild)

      const backBtn = document.createElement('button')
      backBtn.textContent = '\u2190 Back'
      backBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#3a5a4a;background:none;border:none;cursor:pointer;align-self:flex-start;margin-bottom:16px;`
      backBtn.addEventListener('click', () => { cleanup(); const fresh = new LandingScreen(this.canvas, this.serverUrl); fresh.show().then(resolve) })
      panel.appendChild(backBtn)

      const createTitle = document.createElement('div')
      createTitle.textContent = 'YOUR ARENA'
      createTitle.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#4a7a5a;letter-spacing:2px;margin-bottom:12px;`
      panel.appendChild(createTitle)

      const codeEl = document.createElement('div')
      codeEl.textContent = code
      codeEl.style.cssText = `font-family:${BLOB_FONT_FAMILY};font-size:48px;font-weight:700;color:${RAIN_COLOR};margin-bottom:20px;letter-spacing:3px;`
      panel.appendChild(codeEl)

      const linkRow = document.createElement('div')
      linkRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;'

      const copyBtn = document.createElement('button')
      copyBtn.textContent = 'Copy Link'
      copyBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;padding:10px 20px;border:1px solid ${RAIN_COLOR};border-radius:4px;background:#1a2a1a;color:#d0ffe0;cursor:pointer;transition:all 0.15s;`
      copyBtn.addEventListener('click', () => {
        copyRoomLink(code)
        copyBtn.textContent = 'Copied!'
        setTimeout(() => { copyBtn.textContent = 'Copy Link' }, 2000)
      })
      linkRow.appendChild(copyBtn)

      const shareXBtn = document.createElement('button')
      shareXBtn.textContent = 'Share on X'
      shareXBtn.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;padding:10px 20px;border:1px solid #3a5a4a;border-radius:4px;background:transparent;color:#4a7a5a;cursor:pointer;transition:all 0.15s;`
      shareXBtn.addEventListener('mouseenter', () => { shareXBtn.style.background = '#1a2a1a'; shareXBtn.style.color = '#d0ffe0' })
      shareXBtn.addEventListener('mouseleave', () => { shareXBtn.style.background = 'transparent'; shareXBtn.style.color = '#4a7a5a' })
      shareXBtn.addEventListener('click', () => {
        window.open(buildShareUrl('invite', undefined, code), '_blank', 'noopener')
      })
      linkRow.appendChild(shareXBtn)

      panel.appendChild(linkRow)

      const startBtn = makeButton('Start Game', true, 'large')
      startBtn.addEventListener('click', () => { cleanup(); resolve({ action: 'play', handle: getHandle(), token: getToken(), room: code }) })
      panel.appendChild(startBtn)
    }
  }

  private buildRoomCard(
    room: RoomInfo,
    cleanup: () => void,
    resolve: (result: LandingResult) => void,
    getHandle: () => string,
    getToken: () => string | undefined,
  ): HTMLDivElement {
    const card = document.createElement('div')
    card.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border: 1px solid #1a2a1a; border-radius: 4px;
      cursor: pointer; transition: all 0.15s;
    `
    card.addEventListener('mouseenter', () => { card.style.borderColor = '#3a5a4a'; card.style.background = 'rgba(0,255,65,0.03)' })
    card.addEventListener('mouseleave', () => { card.style.borderColor = '#1a2a1a'; card.style.background = 'transparent' })
    card.addEventListener('click', () => { cleanup(); resolve({ action: 'play', handle: getHandle(), token: getToken(), room: room.code }) })

    const left = document.createElement('div')
    const codeLabel = document.createElement('div')
    codeLabel.textContent = room.code
    codeLabel.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;color:#d0ffe0;font-weight:600;`
    left.appendChild(codeLabel)

    if (room.topPlayer) {
      const topEl = document.createElement('div')
      topEl.textContent = `${room.topPlayer} leading`
      topEl.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:10px;color:#3a5a4a;margin-top:2px;`
      left.appendChild(topEl)
    }

    const right = document.createElement('div')
    right.style.cssText = 'text-align:right;'
    const countEl = document.createElement('div')
    countEl.textContent = `${room.playerCount} player${room.playerCount !== 1 ? 's' : ''}`
    countEl.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:${RAIN_COLOR};`
    right.appendChild(countEl)

    card.appendChild(left)
    card.appendChild(right)
    return card
  }
}
