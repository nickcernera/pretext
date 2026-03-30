import { RAIN_COLOR } from '@shared/constants'

const SIZE = 24
const HALF = SIZE / 2
const SVG_NS = 'http://www.w3.org/2000/svg'

function createCrosshairSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(SIZE))
  svg.setAttribute('height', String(SIZE))
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`)

  const arms: [number, number, number, number][] = [
    [HALF, 2, HALF, HALF - 4],       // top
    [HALF, HALF + 4, HALF, SIZE - 2], // bottom
    [2, HALF, HALF - 4, HALF],        // left
    [HALF + 4, HALF, SIZE - 2, HALF], // right
  ]

  for (const [x1, y1, x2, y2] of arms) {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x1))
    line.setAttribute('y1', String(y1))
    line.setAttribute('x2', String(x2))
    line.setAttribute('y2', String(y2))
    line.setAttribute('stroke', RAIN_COLOR)
    line.setAttribute('stroke-width', '1.5')
    line.setAttribute('stroke-linecap', 'round')
    svg.appendChild(line)
  }

  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('cx', String(HALF))
  dot.setAttribute('cy', String(HALF))
  dot.setAttribute('r', '1.5')
  dot.setAttribute('fill', RAIN_COLOR)
  svg.appendChild(dot)

  return svg
}

class Cursor {
  x = -100
  y = -100
  private el: HTMLDivElement | null = null

  init() {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes cursor-pulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 1; }
      }
    `
    document.head.appendChild(style)

    const el = document.createElement('div')
    this.el = el
    el.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: ${SIZE}px; height: ${SIZE}px;
      pointer-events: none; z-index: 99999;
      filter: drop-shadow(0 0 2px ${RAIN_COLOR}) drop-shadow(0 0 6px ${RAIN_COLOR}) drop-shadow(0 0 14px rgba(0,255,65,0.4));
      animation: cursor-pulse 2s ease-in-out infinite;
      will-change: transform;
    `
    el.appendChild(createCrosshairSvg())
    document.body.appendChild(el)

    document.addEventListener('mousemove', (e) => {
      this.x = e.clientX
      this.y = e.clientY
      el.style.transform = `translate3d(${e.clientX - HALF}px, ${e.clientY - HALF}px, 0)`
    })

    document.addEventListener('mouseleave', () => {
      if (this.el) this.el.style.visibility = 'hidden'
    })
    document.addEventListener('mouseenter', () => {
      if (this.el) this.el.style.visibility = 'visible'
    })
  }
}

export const cursor = new Cursor()
