import { UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'

const SEED_WORDS = [
  'transformer', 'attention', 'gradient∇', 'softmax', 'backprop',
  'embeddings', 'CUDA', 'inference', 'tokenizer', 'hallucinate',
  'latency:0.09ms', 'pid:4847', '0x7fff', 'batch_size=32',
  'epoch', 'loss=0.003', 'checkpoint', 'tensor', 'dropout',
  'learning_rate', 'conv2d', 'relu', 'sigmoid', 'entropy',
  'optimizer', 'scheduler', 'normalize', 'pooling', 'residual',
  'conn.established', 'ACK', 'SYN', 'RST', 'TTL=64',
]

type RainColumn = {
  x: number
  y: number
  speed: number
  chars: string[]
  charIndex: number
  opacity: number
  fontSize: number
}

type KillFlash = {
  text: string
  x: number
  y: number
  opacity: number
  createdAt: number
}

export class MatrixRain {
  private columns: RainColumn[] = []
  private handles: string[] = []
  private bios: string[] = []
  private killFlashes: KillFlash[] = []
  private lastTime = 0

  init(screenW: number, screenH: number) {
    this.columns = []
    const colSpacing = 80
    const numCols = Math.ceil(screenW / colSpacing) + 2

    for (let i = 0; i < numCols; i++) {
      this.columns.push({
        x: i * colSpacing + (Math.random() - 0.5) * 30,
        y: Math.random() * -screenH,
        speed: 20 + Math.random() * 40,
        chars: this.pickChars(),
        charIndex: 0,
        opacity: 0.06 + Math.random() * 0.12,
        fontSize: 10 + Math.random() * 3,
      })
    }
  }

  private pickChars(): string[] {
    const pool: string[] = [...SEED_WORDS]
    for (const h of this.handles) {
      pool.push(h, h)
    }
    for (const b of this.bios) {
      pool.push(...b.split(/\s+/).slice(0, 5))
    }
    const shuffled = pool.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 20 + Math.floor(Math.random() * 20))
  }

  setHandles(handles: string[]) {
    this.handles = handles
  }

  setBios(bios: string[]) {
    this.bios = bios
  }

  addKill(killerHandle: string, victimHandle: string, screenW: number, screenH: number) {
    this.killFlashes.push({
      text: `${killerHandle} devoured ${victimHandle}`,
      x: Math.random() * screenW * 0.6 + screenW * 0.05,
      y: Math.random() * screenH * 0.6 + screenH * 0.1,
      opacity: 0.7,
      createdAt: performance.now(),
    })
  }

  update(dt: number) {
    for (const col of this.columns) {
      col.y += col.speed * dt
      if (col.y > 2000) {
        col.y = Math.random() * -200
        col.chars = this.pickChars()
        col.charIndex = 0
      }
    }
    const now = performance.now()
    this.killFlashes = this.killFlashes.filter(k => {
      k.opacity = Math.max(0, 0.7 - (now - k.createdAt) / 3000)
      return k.opacity > 0
    })
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    ctx.textBaseline = 'top'

    for (const col of this.columns) {
      ctx.font = `${col.fontSize}px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = col.opacity
      ctx.fillStyle = RAIN_COLOR

      let y = col.y
      for (let i = 0; i < col.chars.length && y < screenH + 20; i++) {
        if (y > -20) {
          ctx.fillText(col.chars[i], col.x, y)
        }
        y += col.fontSize * 2
      }
    }

    for (const flash of this.killFlashes) {
      ctx.font = `13px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = flash.opacity
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(flash.text, flash.x, flash.y)
    }

    ctx.globalAlpha = 1
  }
}
