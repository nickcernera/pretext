import { drawBackground } from '../game/background'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import type { DeathStats } from '@shared/protocol'
import { buildShareUrl, buildCardUrl } from '../share'

export class DeathScreen {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rafId = 0
  private lastTime = 0
  private container: HTMLDivElement | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  show(stats: DeathStats, roomCode: string, serverUrl: string): Promise<'play' | 'landing'> {
    return new Promise((resolve) => {
      this.startBackground()
      this.buildUI(stats, roomCode, serverUrl, resolve)
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

      this.rafId = requestAnimationFrame(loop)
    }
    loop()
  }

  private buildUI(stats: DeathStats, roomCode: string, serverUrl: string, resolve: (action: 'play' | 'landing') => void) {
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

    const container = document.createElement('div')
    this.container = container
    container.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 10;
      font-family: ${UI_FONT_FAMILY};
    `

    // "devoured by" label
    const killer = stats.killedBy || 'the arena'
    const devouredLabel = document.createElement('p')
    devouredLabel.textContent = `devoured by ${killer}`
    devouredLabel.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 14px; color: #4a7a5a;
      margin: 0 0 12px 0;
    `
    container.appendChild(devouredLabel)

    // Your handle large
    const handleEl = document.createElement('h1')
    handleEl.textContent = stats.handle
    handleEl.style.cssText = `
      font-family: ${BLOB_FONT_FAMILY}; font-size: 56px; font-weight: 700;
      color: #d0ffe0; margin: 0 0 32px 0; letter-spacing: -1px;
    `
    container.appendChild(handleEl)

    // Stats grid
    const statsGrid = document.createElement('div')
    statsGrid.style.cssText = `
      display: flex; gap: 48px; margin-bottom: 28px;
    `

    const timeAlive = Math.round(stats.timeAlive / 1000)
    const minutes = Math.floor(timeAlive / 60)
    const seconds = timeAlive % 60
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    const statItems = [
      { label: 'KILLS', value: String(stats.kills) },
      { label: 'TIME ALIVE', value: timeStr },
      { label: 'PEAK MASS', value: String(Math.round(stats.peakMass)) },
    ]

    for (const item of statItems) {
      const statEl = document.createElement('div')
      statEl.style.cssText = 'text-align: center;'

      const label = document.createElement('div')
      label.textContent = item.label
      label.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #4a7a5a;
        margin-bottom: 4px; letter-spacing: 1px;
      `
      statEl.appendChild(label)

      const value = document.createElement('div')
      value.textContent = item.value
      value.style.cssText = `
        font-family: ${BLOB_FONT_FAMILY}; font-size: 36px; font-weight: 700;
        color: #d0ffe0;
      `
      statEl.appendChild(value)

      statsGrid.appendChild(statEl)
    }
    container.appendChild(statsGrid)

    // Victims
    if (stats.victims.length > 0) {
      const victimsLabel = document.createElement('div')
      victimsLabel.textContent = 'VICTIMS'
      victimsLabel.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #4a7a5a;
        letter-spacing: 1px; margin-bottom: 6px;
      `
      container.appendChild(victimsLabel)

      const victimsList = document.createElement('div')
      victimsList.textContent = stats.victims.slice(0, 8).join('  ')
      victimsList.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 13px; color: #d0ffe0;
        margin-bottom: 28px; opacity: 0.7;
      `
      container.appendChild(victimsList)
    }

    // Card preview area (above buttons)
    const cardPreview = document.createElement('div')
    cardPreview.style.cssText = 'margin-bottom: 20px; opacity: 0; transition: opacity 0.3s;'
    container.appendChild(cardPreview)

    // Card preview (deterministic URL — no POST needed, survives restarts)
    const cardUrl = buildCardUrl(stats, roomCode, serverUrl)
    const img = document.createElement('img')
    img.src = cardUrl
    img.style.cssText = 'width: 400px; max-width: 90vw; border-radius: 8px; border: 1px solid #3a5a4a;'
    img.onload = () => { cardPreview.style.opacity = '1' }
    cardPreview.appendChild(img)

    // Buttons
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; gap: 12px; margin-bottom: 12px;'

    const makeButton = (text: string, primary: boolean): HTMLButtonElement => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 14px; padding: 12px 32px;
        border: 1px solid ${primary ? RAIN_COLOR : '#3a5a4a'}; border-radius: 4px;
        background: ${primary ? '#1a2a1a' : 'transparent'}; color: ${primary ? '#d0ffe0' : '#4a7a5a'};
        cursor: pointer; min-width: 160px; transition: all 0.15s;
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

    const shareBtn = makeButton('Share on X', true)
    shareBtn.addEventListener('click', () => {
      const url = buildShareUrl('death', stats, roomCode)
      window.open(url, '_blank', 'noopener')
    })
    btnRow.appendChild(shareBtn)

    const playAgainBtn = makeButton('Play Again', false)
    playAgainBtn.addEventListener('click', () => {
      cleanup()
      resolve('play')
    })
    btnRow.appendChild(playAgainBtn)

    container.appendChild(btnRow)

    // Challenge killer button
    const challengeBtn = document.createElement('button')
    challengeBtn.textContent = `Challenge ${killer}`
    challengeBtn.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 12px; color: #4a7a5a;
      background: none; border: 1px solid #2a3a2a; border-radius: 4px;
      cursor: pointer; padding: 8px 20px; margin-bottom: 12px; transition: all 0.15s;
    `
    challengeBtn.addEventListener('mouseenter', () => { challengeBtn.style.borderColor = '#3a5a4a'; challengeBtn.style.color = '#d0ffe0' })
    challengeBtn.addEventListener('mouseleave', () => { challengeBtn.style.borderColor = '#2a3a2a'; challengeBtn.style.color = '#4a7a5a' })
    challengeBtn.addEventListener('click', () => {
      const url = buildShareUrl('challenge', stats, roomCode)
      window.open(url, '_blank', 'noopener')
    })
    container.appendChild(challengeBtn)

    // Back to menu
    const menuBtn = document.createElement('button')
    menuBtn.textContent = 'Back to Menu'
    menuBtn.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #3a5a4a;
      background: none; border: none; cursor: pointer; margin-bottom: 20px;
      text-decoration: underline;
    `
    menuBtn.addEventListener('click', () => {
      cleanup()
      resolve('landing')
    })
    container.appendChild(menuBtn)

    // Coffee link
    const coffeeLink = document.createElement('a')
    coffeeLink.href = 'https://buymeacoffee.com/nickcernera'
    coffeeLink.target = '_blank'
    coffeeLink.rel = 'noopener'
    coffeeLink.textContent = 'Enjoying Pretext Arena? \u2615'
    coffeeLink.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #3a5a4a;
      text-decoration: none; opacity: 0.6;
    `
    coffeeLink.addEventListener('mouseenter', () => { coffeeLink.style.opacity = '1' })
    coffeeLink.addEventListener('mouseleave', () => { coffeeLink.style.opacity = '0.6' })
    container.appendChild(coffeeLink)

    // Attribution footer
    const footer = document.createElement('div')
    footer.style.cssText = `
      position: fixed; bottom: 16px; left: 0; right: 0;
      display: flex; justify-content: center; align-items: center; gap: 12px;
    `
    const makeFooterLink = (text: string, href: string): HTMLAnchorElement => {
      const a = document.createElement('a')
      a.textContent = text
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener'
      a.style.cssText = `
        font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #3a5a4a;
        text-decoration: none; transition: color 0.15s;
      `
      a.addEventListener('mouseenter', () => { a.style.color = '#4a7a5a' })
      a.addEventListener('mouseleave', () => { a.style.color = '#3a5a4a' })
      return a
    }
    footer.appendChild(makeFooterLink('Created by Cernera Design', 'https://x.com/cerneradesign'))
    const sep = document.createElement('span')
    sep.textContent = '\u00b7'
    sep.style.cssText = `font-size: 11px; color: #2a3a2a;`
    footer.appendChild(sep)
    footer.appendChild(makeFooterLink('Powered by Pretext', 'https://github.com/chenglou/pretext'))
    container.appendChild(footer)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(container)
    } else {
      document.body.appendChild(container)
    }
  }
}
