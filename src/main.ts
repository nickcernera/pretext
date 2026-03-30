import { drawBackground } from './game/background'
import { MatrixRain } from './game/rain'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const rain = new MatrixRain()
rain.init(window.innerWidth, window.innerHeight)

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  rain.init(window.innerWidth, window.innerHeight)
}

resize()
window.addEventListener('resize', resize)

function render() {
  const w = window.innerWidth
  const h = window.innerHeight
  drawBackground(ctx, w, h)

  rain.update(0.016)
  rain.draw(ctx, w, h)

  ctx.fillStyle = '#00ff41'
  ctx.font = '24px "Space Grotesk"'
  ctx.fillText('pretext', 40, 60)

  requestAnimationFrame(render)
}

render()
