import { samples } from './texts'
import { createShapes, hitTest, type Shape } from './shapes'
import { computeFlow } from './flow'
import { render } from './render'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const ui = document.getElementById('ui')!
const perf = document.getElementById('perf')!

let dpr = window.devicePixelRatio || 1
let shapes: Shape[] = []
let currentSample = 0
let dragging: number = -1
let hovered: number = -1
let dragOffset = { x: 0, y: 0 }
let needsRender = true

// --- sizing ---
function resize() {
  dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  shapes = createShapes(window.innerWidth, window.innerHeight)
  needsRender = true
}

// --- ui buttons ---
function buildUI() {
  while (ui.firstChild) ui.removeChild(ui.firstChild)
  samples.forEach((s, i) => {
    const btn = document.createElement('button')
    btn.textContent = s.label
    if (i === currentSample) btn.classList.add('active')
    btn.onclick = () => {
      currentSample = i
      buildUI()
      needsRender = true
    }
    ui.appendChild(btn)
  })
}

// --- pointer ---
function getXY(e: PointerEvent) {
  return { x: e.clientX, y: e.clientY }
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = getXY(e)
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], x, y)) {
      dragging = i
      dragOffset = { x: x - shapes[i].x, y: y - shapes[i].y }
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
      return
    }
  }
})

canvas.addEventListener('pointermove', (e) => {
  const { x, y } = getXY(e)

  if (dragging >= 0) {
    shapes[dragging].x = x - dragOffset.x
    shapes[dragging].y = y - dragOffset.y
    needsRender = true
    return
  }

  // hover detection
  let newHover = -1
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], x, y)) { newHover = i; break }
  }
  if (newHover !== hovered) {
    hovered = newHover
    canvas.style.cursor = hovered >= 0 ? 'grab' : 'default'
    needsRender = true
  }
})

canvas.addEventListener('pointerup', () => {
  if (dragging >= 0) {
    dragging = -1
    canvas.style.cursor = hovered >= 0 ? 'grab' : 'default'
  }
})

// --- render loop ---
function frame() {
  if (needsRender) {
    needsRender = false
    const result = computeFlow(
      samples[currentSample].text,
      window.innerWidth,
      window.innerHeight,
      shapes,
    )
    render(ctx, result.lines, shapes, hovered, dpr)
    perf.textContent = `layout: ${result.layoutMs.toFixed(2)}ms · ${result.lines.length} lines`
  }
  requestAnimationFrame(frame)
}

// --- init ---
resize()
buildUI()
window.addEventListener('resize', resize)
requestAnimationFrame(frame)
