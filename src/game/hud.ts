import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { UI_FONT_FAMILY, BLOB_FONT_FAMILY, RAIN_COLOR, WORLD_W, WORLD_H, MINIMAP_SIZE } from '@shared/constants'
import { massToRadius, type LeaderboardEntry, type PlayerState } from '@shared/protocol'
import { buildShareUrl, copyRoomLink } from '../share'

type KillEvent = { text: string; time: number }
type SnapshotToast = { handle: string; roomCode: string; time: number }
type KillToast = { victimHandle: string; roomCode: string; time: number; el: HTMLDivElement }

export class HUD {
  private leaderboard: LeaderboardEntry[] = []
  private killEvents: KillEvent[] = []
  private killFeedCache = new Map<string, PreparedTextWithSegments>()
  private mass = 0
  private kills = 0
  private roomCode = ''
  private snapshotToast: SnapshotToast | null = null
  private inviteOverlay: HTMLDivElement | null = null
  private inviteVisible = false
  private keyListener: ((e: KeyboardEvent) => void) | null = null
  private killToasts: KillToast[] = []
  private snapshotToastEl: HTMLDivElement | null = null

  setLeaderboard(entries: LeaderboardEntry[]) { this.leaderboard = entries }
  setPlayerStats(mass: number, kills: number) { this.mass = mass; this.kills = kills }
  setRoomCode(code: string) { this.roomCode = code }

  showSnapshotToast(handle: string, roomCode: string) {
    this.snapshotToast = { handle, roomCode, time: performance.now() }

    // Create clickable DOM toast for share reign
    if (this.snapshotToastEl && this.snapshotToastEl.parentNode) {
      this.snapshotToastEl.parentNode.removeChild(this.snapshotToastEl)
    }

    const el = document.createElement('div')
    el.textContent = '\uD83D\uDC51 You\'re #1! Share your reign?'
    el.style.cssText = `
      position: fixed; top: 44px; left: 50%; transform: translateX(-50%); z-index: 40;
      font-family: ${BLOB_FONT_FAMILY}; font-size: 14px; color: #d0ffe0;
      background: #1a2a1a; border: 1px solid #3a5a4a; border-radius: 6px;
      padding: 8px 20px; cursor: pointer; opacity: 0; transition: opacity 0.3s;
      pointer-events: auto;
    `
    el.addEventListener('mouseenter', () => { el.style.borderColor = RAIN_COLOR })
    el.addEventListener('mouseleave', () => { el.style.borderColor = '#3a5a4a' })
    el.addEventListener('click', () => {
      const url = buildShareUrl('leaderboard', undefined, roomCode)
      window.open(url, '_blank', 'noopener')
    })

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(el)
    } else {
      document.body.appendChild(el)
    }

    this.snapshotToastEl = el

    // Animate in
    requestAnimationFrame(() => { el.style.opacity = '1' })

    // Auto-remove after 8 seconds
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el)
        if (this.snapshotToastEl === el) this.snapshotToastEl = null
      }, 300)
    }, 8000)
  }

  addKillEvent(killer: string, victim: string) {
    const text = `${killer} devoured ${victim}`
    this.killFeedCache.set(text, prepareWithSegments(text, `11px ${UI_FONT_FAMILY}`))
    this.killEvents.push({ text, time: performance.now() })
    if (this.killEvents.length > 6) {
      const removed = this.killEvents.shift()
      if (removed) this.killFeedCache.delete(removed.text)
    }
  }

  setupKeyListeners(roomCode: string) {
    this.roomCode = roomCode
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener)
    }
    this.keyListener = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        if (this.inviteVisible) {
          this.hideInviteOverlay()
        } else {
          this.showInviteOverlay(roomCode)
        }
      }
      if (e.key === 'Escape' && this.inviteVisible) {
        this.hideInviteOverlay()
      }
    }
    window.addEventListener('keydown', this.keyListener)
  }

  showInviteOverlay(roomCode: string) {
    if (this.inviteOverlay) {
      this.inviteOverlay.style.opacity = '1'
      this.inviteOverlay.style.pointerEvents = 'auto'
      this.inviteVisible = true
      return
    }

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      z-index: 50; background: rgba(5, 10, 8, 0.85); opacity: 0;
      transition: opacity 0.2s; pointer-events: auto;
    `

    const panel = document.createElement('div')
    panel.style.cssText = `
      background: rgba(10, 26, 15, 0.95); border: 1px solid #3a5a4a; border-radius: 12px;
      padding: 32px 40px; text-align: center; min-width: 320px;
      backdrop-filter: blur(12px);
    `

    const title = document.createElement('div')
    title.textContent = 'INVITE PLAYERS'
    title.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #4a7a5a;
      letter-spacing: 2px; margin-bottom: 20px;
    `
    panel.appendChild(title)

    const codeEl = document.createElement('div')
    codeEl.textContent = roomCode
    codeEl.style.cssText = `
      font-family: ${BLOB_FONT_FAMILY}; font-size: 42px; font-weight: 700;
      color: ${RAIN_COLOR}; margin-bottom: 24px; letter-spacing: 2px;
    `
    panel.appendChild(codeEl)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: center; margin-bottom: 16px;'

    const copyBtn = document.createElement('button')
    copyBtn.textContent = 'Copy Link'
    copyBtn.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 13px; padding: 10px 24px;
      border: 1px solid ${RAIN_COLOR}; border-radius: 4px;
      background: #1a2a1a; color: #d0ffe0; cursor: pointer; transition: all 0.15s;
    `
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = '#2a3a2a' })
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = '#1a2a1a' })
    copyBtn.addEventListener('click', () => {
      copyRoomLink(roomCode)
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy Link' }, 2000)
    })
    btnRow.appendChild(copyBtn)

    const shareBtn = document.createElement('button')
    shareBtn.textContent = 'Share on X'
    shareBtn.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 13px; padding: 10px 24px;
      border: 1px solid #3a5a4a; border-radius: 4px;
      background: transparent; color: #4a7a5a; cursor: pointer; transition: all 0.15s;
    `
    shareBtn.addEventListener('mouseenter', () => { shareBtn.style.background = '#1a2a1a'; shareBtn.style.color = '#d0ffe0' })
    shareBtn.addEventListener('mouseleave', () => { shareBtn.style.background = 'transparent'; shareBtn.style.color = '#4a7a5a' })
    shareBtn.addEventListener('click', () => {
      const url = buildShareUrl('invite', undefined, roomCode)
      window.open(url, '_blank', 'noopener')
    })
    btnRow.appendChild(shareBtn)

    panel.appendChild(btnRow)

    const hint = document.createElement('div')
    hint.textContent = 'Press Tab or Esc to close'
    hint.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 10px; color: #3a5a4a;
      margin-top: 8px;
    `
    panel.appendChild(hint)

    overlay.appendChild(panel)

    // Click outside panel to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideInviteOverlay()
    })

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(overlay)
    } else {
      document.body.appendChild(overlay)
    }

    this.inviteOverlay = overlay
    this.inviteVisible = true

    // Trigger reflow then animate in
    requestAnimationFrame(() => { overlay.style.opacity = '1' })
  }

  hideInviteOverlay() {
    if (this.inviteOverlay) {
      this.inviteOverlay.style.opacity = '0'
      this.inviteOverlay.style.pointerEvents = 'none'
      this.inviteVisible = false
    }
  }

  showKillToast(victimHandle: string, roomCode: string) {
    const el = document.createElement('div')
    el.style.cssText = `
      position: fixed; bottom: 160px; left: 16px; z-index: 40;
      font-family: ${UI_FONT_FAMILY}; font-size: 13px; color: #d0ffe0;
      background: rgba(10, 26, 15, 0.9); border: 1px solid #3a5a4a; border-radius: 6px;
      padding: 10px 16px; opacity: 0; transition: opacity 0.3s;
      backdrop-filter: blur(8px);
    `

    const textSpan = document.createElement('span')
    textSpan.textContent = `You devoured ${victimHandle}! `
    el.appendChild(textSpan)

    const shareLink = document.createElement('span')
    shareLink.textContent = '[Share]'
    shareLink.style.cssText = `
      color: ${RAIN_COLOR}; cursor: pointer; text-decoration: underline;
    `
    shareLink.addEventListener('click', () => {
      const url = buildShareUrl('death', { handle: '', timeAlive: 0, kills: 0, peakMass: 0, victims: [victimHandle], killedBy: '' }, roomCode)
      window.open(url, '_blank', 'noopener')
    })
    el.appendChild(shareLink)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(el)
    } else {
      document.body.appendChild(el)
    }

    const toast: KillToast = { victimHandle, roomCode, time: performance.now(), el }
    this.killToasts.push(toast)

    // Animate in
    requestAnimationFrame(() => { el.style.opacity = '1' })

    // Auto-remove after 5 seconds
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el)
        this.killToasts = this.killToasts.filter(t => t !== toast)
      }, 300)
    }, 5000)
  }

  destroy() {
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener)
      this.keyListener = null
    }
    if (this.inviteOverlay && this.inviteOverlay.parentNode) {
      this.inviteOverlay.parentNode.removeChild(this.inviteOverlay)
      this.inviteOverlay = null
    }
    if (this.snapshotToastEl && this.snapshotToastEl.parentNode) {
      this.snapshotToastEl.parentNode.removeChild(this.snapshotToastEl)
      this.snapshotToastEl = null
    }
    for (const toast of this.killToasts) {
      if (toast.el.parentNode) toast.el.parentNode.removeChild(toast.el)
    }
    this.killToasts = []
    this.killFeedCache.clear()
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, players?: PlayerState[], localPlayerId?: string) {
    ctx.textBaseline = 'top'

    // Room code — top left
    if (this.roomCode) {
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = 0.4
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(this.roomCode, 16, 16)
    }

    // Leaderboard — top right
    ctx.font = `11px ${UI_FONT_FAMILY}`
    ctx.textBaseline = 'top'
    const lbX = w - 16
    let lbY = 16
    ctx.globalAlpha = 0.5
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    for (let i = 0; i < Math.min(10, this.leaderboard.length); i++) {
      const e = this.leaderboard[i]
      ctx.fillText(`${i + 1}. ${e.handle}  ${Math.round(e.mass)}`, lbX, lbY)
      lbY += 18
    }
    ctx.textAlign = 'left'

    // Kill feed — bottom left, wraps long handles with pretext layout
    const now = performance.now()
    const feedMaxWidth = Math.min(300, w * 0.4)
    let kfY = h - 20
    for (let i = this.killEvents.length - 1; i >= 0; i--) {
      const ev = this.killEvents[i]
      const age = (now - ev.time) / 1000
      if (age > 8) continue
      ctx.globalAlpha = Math.max(0, 0.6 - age * 0.08)
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.fillStyle = RAIN_COLOR

      const prepared = this.killFeedCache.get(ev.text)
      if (prepared) {
        // Collect lines using pretext layout
        const lines: string[] = []
        let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
        let line = layoutNextLine(prepared, cursor, feedMaxWidth)
        while (line) {
          lines.push(line.text)
          cursor = line.end
          line = layoutNextLine(prepared, cursor, feedMaxWidth)
        }
        // Draw bottom-up (most recent lines at bottom)
        for (let j = lines.length - 1; j >= 0; j--) {
          ctx.fillText(lines[j], 16, kfY)
          kfY -= 14
        }
      } else {
        ctx.fillText(ev.text, 16, kfY)
        kfY -= 14
      }
      kfY -= 4 // gap between events
    }

    // Player stats — bottom right (above minimap)
    const minimapBottom = MINIMAP_SIZE + 32
    ctx.globalAlpha = 0.5
    ctx.font = `12px ${UI_FONT_FAMILY}`
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(`mass: ${Math.round(this.mass)}  kills: ${this.kills}`, w - 16, h - minimapBottom - 8)
    ctx.textAlign = 'left'

    // Minimap — bottom right
    if (players && localPlayerId) {
      this.drawMinimap(ctx, w, h, players, localPlayerId)
    }

    ctx.globalAlpha = 1
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    players: PlayerState[],
    localPlayerId: string,
  ) {
    const size = MINIMAP_SIZE
    const padding = 16
    const mx = w - size - padding
    const my = h - size - padding

    // Background
    ctx.globalAlpha = 0.15
    ctx.fillStyle = '#0a1a0f'
    ctx.fillRect(mx, my, size, size)

    // Border
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = RAIN_COLOR
    ctx.lineWidth = 1
    ctx.strokeRect(mx, my, size, size)

    // Player dots — draw others first, then local on top
    const scaleX = size / WORLD_W
    const scaleY = size / WORLD_H
    const now = performance.now()

    // Other players
    for (const p of players) {
      if (p.id === localPlayerId) continue
      for (const c of p.cells) {
        const dotX = mx + c.x * scaleX
        const dotY = my + c.y * scaleY
        const dotR = Math.max(1.5, massToRadius(c.mass) * scaleX * 2)

        ctx.globalAlpha = 0.45
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(dotX, dotY, Math.min(dotR, 5), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Local player — pulsing glow + larger dot + ring
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      const pulse = 0.6 + Math.sin(now * 0.004) * 0.4 // 0.2–1.0
      for (const c of local.cells) {
        const dotX = mx + c.x * scaleX
        const dotY = my + c.y * scaleY
        const dotR = Math.max(3, massToRadius(c.mass) * scaleX * 2.5)
        const r = Math.min(dotR, 8)

        // Outer glow ring
        ctx.globalAlpha = 0.3 * pulse
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(dotX, dotY, r + 3, 0, Math.PI * 2)
        ctx.stroke()

        // Bright filled dot
        ctx.globalAlpha = 0.95
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
        ctx.fill()

        // Colored inner
        ctx.globalAlpha = 0.8
        ctx.fillStyle = local.color
        ctx.beginPath()
        ctx.arc(dotX, dotY, r * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
  }
}
