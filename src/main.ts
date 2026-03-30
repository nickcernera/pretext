const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

resize()
window.addEventListener('resize', resize)

ctx.fillStyle = '#050a08'
ctx.fillRect(0, 0, canvas.width, canvas.height)
ctx.fillStyle = '#00ff41'
ctx.font = '24px "Space Grotesk"'
ctx.fillText('pretext', 40, 60)
