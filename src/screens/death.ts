import { drawBackground } from '../game/background'
import { MatrixRain } from '../game/rain'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import type { DeathStats } from '@shared/protocol'
import { buildShareUrl } from '../share'

export class DeathScreen {
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
  }

  show(stats: DeathStats, roomCode: string): Promise<'play' | 'landing'> {
    return new Promise((resolve) => {
      this.startBackground()
      this.buildUI(stats, roomCode, resolve)
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

  private buildUI(stats: DeathStats, roomCode: string, resolve: (action: 'play' | 'landing') => void) {
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
    const devouredLabel = document.createElement('p')
    devouredLabel.textContent = `devoured by ${stats.killedBy}`
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

    // Buttons
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; gap: 12px; margin-bottom: 20px;'

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

    const playAgainBtn = makeButton('Play Again', true)
    playAgainBtn.addEventListener('click', () => {
      cleanup()
      resolve('play')
    })
    btnRow.appendChild(playAgainBtn)

    const shareBtn = makeButton('Share on X', false)
    shareBtn.addEventListener('click', () => {
      const url = buildShareUrl('death', stats, roomCode)
      window.open(url, '_blank', 'noopener')
    })
    btnRow.appendChild(shareBtn)

    container.appendChild(btnRow)

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
    coffeeLink.textContent = 'Enjoying pretext? \u2615'
    coffeeLink.style.cssText = `
      font-family: ${UI_FONT_FAMILY}; font-size: 11px; color: #3a5a4a;
      text-decoration: none; opacity: 0.6;
    `
    coffeeLink.addEventListener('mouseenter', () => { coffeeLink.style.opacity = '1' })
    coffeeLink.addEventListener('mouseleave', () => { coffeeLink.style.opacity = '0.6' })
    container.appendChild(coffeeLink)

    const uiRoot = document.getElementById('ui-root')
    if (uiRoot) {
      uiRoot.appendChild(container)
    } else {
      document.body.appendChild(container)
    }
  }
}
