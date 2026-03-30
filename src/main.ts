import { drawBackground } from './game/background'
import { drawBlob } from './game/blob'
import { MatrixRain } from './game/rain'
import { handleToColor } from '@shared/protocol'

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

  // Test blobs
  drawBlob(ctx, 400, 300, 500, '@nickcernera @victim1 @victim2 @someone', handleToColor('@nickcernera'), true)
  drawBlob(ctx, 700, 400, 150, '@smallplayer', handleToColor('@smallplayer'), false)
  drawBlob(ctx, 250, 500, 2000, '@massive @a @b @c @d @e @f @g @h @i @j', handleToColor('@massive'), false)

  ctx.fillStyle = '#00ff41'
  ctx.font = '24px "Space Grotesk"'
  ctx.fillText('pretext', 40, 60)

  requestAnimationFrame(render)
}

render()
