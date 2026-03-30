let noiseCanvas: HTMLCanvasElement | null = null

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
  ctx.fillStyle = '#050a08'
  ctx.fillRect(0, 0, w, h)

  const g1 = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.5)
  g1.addColorStop(0, 'rgba(0, 80, 60, 0.35)')
  g1.addColorStop(1, 'transparent')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, w, h)

  const g2 = ctx.createRadialGradient(w * 0.7, h * 0.6, 0, w * 0.7, h * 0.6, w * 0.45)
  g2.addColorStop(0, 'rgba(20, 50, 120, 0.3)')
  g2.addColorStop(1, 'transparent')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, w, h)

  const g3 = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, w * 0.4)
  g3.addColorStop(0, 'rgba(0, 60, 40, 0.2)')
  g3.addColorStop(1, 'transparent')
  ctx.fillStyle = g3
  ctx.fillRect(0, 0, w, h)

  if (!noiseCanvas) {
    noiseCanvas = generateNoise(256, 256)
  }
  ctx.globalAlpha = 0.08
  ctx.globalCompositeOperation = 'overlay'
  const pattern = ctx.createPattern(noiseCanvas, 'repeat')
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
