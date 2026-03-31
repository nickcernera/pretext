export class Input {
  worldX = 0
  worldY = 0
  screenX = 0
  screenY = 0
  splitPressed = false
  ejectPressed = false

  private canvas: HTMLCanvasElement
  private onPointerMove: (e: PointerEvent) => void
  private onPointerDown: (e: PointerEvent) => void
  private onKeyDown: (e: KeyboardEvent) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    this.onPointerMove = (e) => {
      this.screenX = e.clientX
      this.screenY = e.clientY
    }

    this.onPointerDown = (e) => {
      this.screenX = e.clientX
      this.screenY = e.clientY
    }

    this.onKeyDown = (e) => {
      if (e.code === 'Space') { this.splitPressed = true; e.preventDefault() }
      if (e.code === 'KeyW') this.ejectPressed = true
    }

    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('keydown', this.onKeyDown)
  }

  destroy() {
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  consumeSplit(): boolean {
    if (this.splitPressed) { this.splitPressed = false; return true }
    return false
  }

  consumeEject(): boolean {
    if (this.ejectPressed) { this.ejectPressed = false; return true }
    return false
  }
}
