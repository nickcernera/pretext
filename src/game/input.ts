export class Input {
  worldX = 0
  worldY = 0
  screenX = 0
  screenY = 0
  splitPressed = false
  ejectPressed = false

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', (e) => {
      this.screenX = e.clientX
      this.screenY = e.clientY
    })

    canvas.addEventListener('pointerdown', (e) => {
      this.screenX = e.clientX
      this.screenY = e.clientY
    })

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { this.splitPressed = true; e.preventDefault() }
      if (e.code === 'KeyW') this.ejectPressed = true
    })
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
