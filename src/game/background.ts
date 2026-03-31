let noiseCanvas: HTMLCanvasElement | null = null

// Gradient + pattern cache — only recreated on resize or context change
let cachedCtx: CanvasRenderingContext2D | null = null
let cachedW = 0
let cachedH = 0
let cachedG1: CanvasGradient | null = null
let cachedG2: CanvasGradient | null = null
let cachedG3: CanvasGradient | null = null
let cachedPattern: CanvasPattern | null = null

function generateNoise(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const imageData = ctx.createImageData(w, h)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 25
  }
  ctx.putImageData(imageData, 0, 0)
  return c
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Recreate gradients + pattern only when dimensions or context change
  if (ctx !== cachedCtx || w !== cachedW || h !== cachedH) {
    cachedCtx = ctx
    cachedW = w
    cachedH = h

    cachedG1 = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.5)
    cachedG1.addColorStop(0, 'rgba(0, 80, 60, 0.35)')
    cachedG1.addColorStop(1, 'transparent')

    cachedG2 = ctx.createRadialGradient(w * 0.7, h * 0.6, 0, w * 0.7, h * 0.6, w * 0.45)
    cachedG2.addColorStop(0, 'rgba(20, 50, 120, 0.3)')
    cachedG2.addColorStop(1, 'transparent')

    cachedG3 = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, w * 0.4)
    cachedG3.addColorStop(0, 'rgba(0, 60, 40, 0.2)')
    cachedG3.addColorStop(1, 'transparent')

    if (!noiseCanvas) {
      noiseCanvas = generateNoise(256, 256)
    }
    cachedPattern = ctx.createPattern(noiseCanvas, 'repeat')
  }

  ctx.fillStyle = '#050a08'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = cachedG1!
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = cachedG2!
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = cachedG3!
  ctx.fillRect(0, 0, w, h)

  if (cachedPattern) {
    ctx.globalAlpha = 0.08
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = cachedPattern
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
