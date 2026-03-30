import { drawBackground } from '../game/background'
import { MatrixRain } from '../game/rain'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, BG_COLOR, RAIN_COLOR } from '@shared/constants'
import { getStoredUser, startXAuth, logout } from '../auth'

export type LandingResult =
  | { action: 'play'; handle: string; token?: string; room?: string }
  | { action: 'auth' }

export class LandingScreen {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rain: MatrixRain
  private rafId = 0
  private lastTime = 0
  private container: HTMLDivElement | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.rain = new MatrixRain()
    this.rain.init(window.innerWidth, window.innerHeight)
    this.rain.setHandles(['@pretext', '@you', '@them', '@devour'])
  }

  show(): Promise<LandingResult> {
    return new Promise((resolve) => {
      this.startBackground()
      this.buildUI(resolve)
    })
  }

  private startBackground() {
    this.lastTime = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = Math.min((now - this.lastTime) / 1000, 0.1)
      this.lastTime = now

      const sw = window.innerWidth
      const sh = window.innerHeight
      drawBackground(this.ctx, sw, sh)
      this.rain.update(dt)
      this.rain.draw(this.ctx, sw, sh)

      this.rafId = requestAnimationFrame(loop)
    }
    loop()
  }

  private buildUI(resolve: (result: LandingResult) => void) {
    const user = getStoredUser()

    // Detect room from URL
    const pathname = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    let roomFromUrl: string | undefined
    const roomMatch = pathname.match(/^\/r\/([A-Za-z0-9_-]+)/)
    if (roomMatch) {
      roomFromUrl = roomMatch[1]
    } else if (params.has('r')) {
      roomFromUrl = params.get('r') || undefined
    }

    // Container
    const container = document.createElement('div')
    this.container = container
    container.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 10;
      font-family: ${UI_FONT_FAMILY};
    `

    // Title
    const title = document.createElement('h1')
    title.textContent = 'pretext'
    title.style.cssText = `
      font-family: ${BLOB_FONT_FAMILY}; font-size: 64px; font-weight: 700;
      color: #d0ffe0; margin: 0 0 8px 0; letter-spacing: -2px;
    `
    container.appendChild(title)

    // Tagline
    const tagline = document.createElement('p')
    tagline.textContent = 'you are your text. eat or be eaten.'
    tagline.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 14px; color: #4a7a5a;
      margin: 0 0 40px 0;
    `
    container.appendChild(tagline)

    const cleanup = () => {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId)
        this.rafId = 0
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container)
        this.container = null
      }
    }

    // Button helper
    const makeButton = (text: string, primary: boolean): HTMLButtonElement => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 14px; padding: 12px 32px;
        border: 1px solid ${primary ? RAIN_COLOR : '#3a5a4a'}; border-radius: 4px;
        background: ${primary ? '#1a2a1a' : 'transparent'}; color: ${primary ? '#d0ffe0' : '#4a7a5a'};
        cursor: pointer; margin: 6px; min-width: 220px; transition: all 0.15s;
      `
      btn.addEventListener('mouseenter', () => {
        btn.style.background = primary ? '#2a3a2a' : '#1a2a1a'
        btn.style.color = '#d0ffe0'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = primary ? '#1a2a1a' : 'transparent'
        btn.style.color = primary ? '#d0ffe0' : '#4a7a5a'
      })
      return btn
    }

    if (user) {
      // Signed in: "Play as @handle"
      const playBtn = makeButton(`Play as ${user.handle}`, true)
      playBtn.addEventListener('click', () => {
        cleanup()
        resolve({ action: 'play', handle: user.handle, token: user.jwt, room: roomFromUrl })
      })
      container.appendChild(playBtn)

      // Sign out link
      const signOutLink = document.createElement('button')
      signOutLink.textContent = 'Sign out'
      signOutLink.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #3a5a4a;
        background: none; border: none; cursor: pointer; margin: 4px 0 16px 0;
        text-decoration: underline;
      `
      signOutLink.addEventListener('click', () => {
        logout()
        cleanup()
        // Re-show landing
        const fresh = new LandingScreen(this.canvas)
        fresh.show().then(resolve)
      })
      container.appendChild(signOutLink)
    } else {
      // Sign in with X
      const xBtn = makeButton('Sign in with X', false)
      xBtn.addEventListener('click', () => {
        cleanup()
        startXAuth()
      })
      container.appendChild(xBtn)
    }

    // Guest play
    const guestBtn = makeButton('Play as Guest', !user)
    guestBtn.addEventListener('click', () => {
      cleanup()
      const guestHandle = '@guest_' + Math.random().toString(36).substring(2, 6)
      resolve({ action: 'play', handle: guestHandle, room: roomFromUrl })
    })
    container.appendChild(guestBtn)

    // Room code input (if no room in URL)
    if (!roomFromUrl) {
      const roomRow = document.createElement('div')
      roomRow.style.cssText = 'display: flex; align-items: center; margin-top: 24px; gap: 8px;'

      const roomInput = document.createElement('input')
      roomInput.type = 'text'
      roomInput.placeholder = 'Room code'
      roomInput.maxLength = 12
      roomInput.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 13px; padding: 10px 14px;
        background: #0a150e; border: 1px solid #3a5a4a; border-radius: 4px;
        color: #d0ffe0; width: 140px; outline: none;
      `
      roomInput.addEventListener('focus', () => { roomInput.style.borderColor = RAIN_COLOR })
      roomInput.addEventListener('blur', () => { roomInput.style.borderColor = '#3a5a4a' })

      const joinBtn = document.createElement('button')
      joinBtn.textContent = 'Join'
      joinBtn.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 13px; padding: 10px 20px;
        background: #1a2a1a; border: 1px solid #3a5a4a; border-radius: 4px;
        color: #4a7a5a; cursor: pointer;
      `
      joinBtn.addEventListener('click', () => {
        const code = roomInput.value.trim()
        if (!code) return
        cleanup()
        const handle = user ? user.handle : '@guest_' + Math.random().toString(36).substring(2, 6)
        resolve({ action: 'play', handle, token: user?.jwt, room: code })
      })
      roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinBtn.click()
      })

      roomRow.appendChild(roomInput)
      roomRow.appendChild(joinBtn)
      container.appendChild(roomRow)
    } else {
      // Show which room we're joining
      const roomLabel = document.createElement('p')
      roomLabel.textContent = `Joining room: ${roomFromUrl}`
      roomLabel.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 12px; color: ${RAIN_COLOR};
        margin-top: 20px; opacity: 0.6;
      `
      container.appendChild(roomLabel)
    }

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(container)
    } else {
      document.body.appendChild(container)
    }
  }
}
