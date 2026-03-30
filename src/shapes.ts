export type Shape = {
  x: number
  y: number
  radius: number
  color: string
  hoverColor: string
}

export function createShapes(w: number, h: number): Shape[] {
  return [
    { x: w * 0.35, y: h * 0.3, radius: 70, color: '#1a1a2e', hoverColor: '#252545', },
    { x: w * 0.65, y: h * 0.55, radius: 55, color: '#1a2e1a', hoverColor: '#254525', },
    { x: w * 0.45, y: h * 0.75, radius: 45, color: '#2e1a1a', hoverColor: '#452525', },
  ]
}

export function hitTest(shape: Shape, mx: number, my: number): boolean {
  const dx = mx - shape.x
  const dy = my - shape.y
  return dx * dx + dy * dy <= shape.radius * shape.radius
}

/** For a given y-range [lineTop, lineBottom], return the horizontal exclusion [left, right] caused by a circle, or null. */
export function getExclusion(
  shape: Shape,
  lineTop: number,
  lineBottom: number,
): [number, number] | null {
  const cy = shape.y
  const r = shape.radius + 12 // padding

  // check if line band overlaps the circle vertically
  if (lineBottom < cy - r || lineTop > cy + r) return null

  // find the widest horizontal chord within the line band
  const closestY = Math.max(lineTop, Math.min(lineBottom, cy))
  const dy = closestY - cy
  const halfWidth = Math.sqrt(r * r - dy * dy)

  return [shape.x - halfWidth, shape.x + halfWidth]
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape, hovered: boolean) {
  ctx.beginPath()
  ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
  ctx.fillStyle = hovered ? s.hoverColor : s.color
  ctx.fill()

  // subtle ring
  ctx.strokeStyle = hovered ? '#555' : '#333'
  ctx.lineWidth = 1
  ctx.stroke()
}
