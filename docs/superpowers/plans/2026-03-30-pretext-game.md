# Pretext Game — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time multiplayer browser game where players are text blobs (rendered with the pretext library) that eat each other. Sign in with X, absorb victims' handles, share kills virally.

**Architecture:** Canvas-rendered client (Vite + TypeScript) connects via WebSocket to a Bun game server. Client handles all rendering + pretext text layout. Server is authoritative for physics, collision, eating. Shared protocol types between both. Landing page + auth on client, share cards generated server-side.

**Tech Stack:** Bun, Vite, TypeScript, `@chenglou/pretext`, Canvas API, WebSocket (Bun native), X OAuth 2.0 PKCE, Fly.io (server), Vercel (client)

**Spec:** `docs/superpowers/specs/2026-03-30-pretext-game-design.md`

---

## File Structure

```
pretext/
├── index.html                  # Game SPA entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/                        # Client (bundled by Vite)
│   ├── main.ts                 # Entry — screen router
│   ├── screens/
│   │   ├── landing.ts          # Title / join screen
│   │   ├── game.ts             # Game screen orchestrator
│   │   └── death.ts            # Death screen + stats
│   ├── game/
│   │   ├── background.ts       # Grain gradient + noise
│   │   ├── rain.ts             # Matrix rain system
│   │   ├── blob.ts             # Text blob renderer (pretext)
│   │   ├── pellets.ts          # Food pellet renderer
│   │   ├── camera.ts           # Viewport / world transform
│   │   ├── input.ts            # Mouse / touch
│   │   ├── hud.ts              # Leaderboard, kill feed, stats
│   │   └── renderer.ts         # Full render pipeline
│   ├── net/
│   │   ├── client.ts           # WebSocket client
│   │   └── interpolation.ts    # State lerping between ticks
│   ├── auth.ts                 # X OAuth client flow
│   └── share.ts                # Share card + X intent helpers
├── server/                     # Bun game server (NOT bundled by Vite)
│   ├── index.ts                # Entry — HTTP + WebSocket
│   ├── room.ts                 # Room lifecycle + player management
│   ├── simulation.ts           # Tick loop, movement, collision, eating
│   ├── spatial.ts              # Grid-based spatial partitioning
│   ├── bot.ts                  # AI bot behavior
│   ├── auth.ts                 # JWT + X OAuth token exchange
│   ├── cards.ts                # Share card PNG generation
│   └── __tests__/
│       ├── simulation.test.ts
│       ├── spatial.test.ts
│       └── room.test.ts
├── shared/                     # Imported by both client + server
│   ├── protocol.ts             # WebSocket message types
│   └── constants.ts            # Tuning values (speeds, decay, etc.)
└── public/
    └── og.png                  # Default OG image
```

---

## Phase 1: Game Client (Single-Player)

### Task 1: Project Restructure + Shared Foundations

**Files:**
- Delete: `src/flow.ts`, `src/render.ts`, `src/shapes.ts`, `src/texts.ts`, `src/main.ts`
- Create: `shared/constants.ts`, `shared/protocol.ts`, `src/main.ts`
- Modify: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`

- [ ] **Step 1: Clean up PoC files and create directory structure**

```bash
rm src/flow.ts src/render.ts src/shapes.ts src/texts.ts src/main.ts
mkdir -p src/screens src/game src/net server/__tests__ shared public
```

- [ ] **Step 2: Update package.json with scripts and new dependencies**

```json
{
  "name": "pretext-game",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:server": "bun --watch server/index.ts",
    "build": "vite build",
    "test": "bun test server/__tests__"
  },
  "dependencies": {
    "@chenglou/pretext": "0.0.3"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vite": "^8.0.0"
  }
}
```

- [ ] **Step 3: Update tsconfig.json for shared imports**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["src", "shared", "server"]
}
```

- [ ] **Step 4: Update vite.config.ts with path aliases**

```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
  },
})
```

- [ ] **Step 5: Write shared/constants.ts**

```typescript
// World
export const WORLD_W = 4000
export const WORLD_H = 4000

// Physics
export const TICK_RATE = 30
export const TICK_MS = 1000 / TICK_RATE
export const BASE_SPEED = 300 // pixels/sec at mass 100
export const SPEED_EXPONENT = 0.43 // speed = BASE_SPEED * (100 / mass) ^ exponent
export const MASS_DECAY_RATE = 0.002 // fraction lost per second
export const MIN_MASS = 50 // can't shrink below this
export const SPLIT_MIN_MASS = 200 // must be this big to split
export const SPLIT_VELOCITY = 600 // initial velocity of split blob
export const EJECT_MASS = 30 // mass ejected per eject action
export const EJECT_VELOCITY = 500
export const MERGE_TIME = 15_000 // ms before split blobs can merge

// Eating
export const EAT_RATIO = 1.15 // must be 15% bigger to eat
export const EAT_OVERLAP = 0.6 // 60% overlap to trigger eat

// Pellets
export const PELLET_COUNT = 800
export const PELLET_MASS = 10
export const PELLET_RADIUS = 4

// Room
export const ROOM_CAPACITY = 30
export const BOT_FILL_THRESHOLD = 8
export const ROOM_IDLE_TIMEOUT = 5 * 60_000 // 5 min
export const LEADERBOARD_INTERVAL = 10 * 60_000 // 10 min

// Visual
export const BLOB_FONT_FAMILY = '"Space Grotesk", system-ui, sans-serif'
export const UI_FONT_FAMILY = '"Space Mono", monospace'
export const BG_COLOR = '#050a08'
export const RAIN_COLOR = '#00ff41'
```

- [ ] **Step 6: Write shared/protocol.ts**

```typescript
// --- Client → Server ---
export type ClientMessage =
  | { t: 'join'; room: string; token?: string; guest?: string }
  | { t: 'input'; x: number; y: number } // target world position
  | { t: 'split' }
  | { t: 'eject' }

// --- Server → Client ---
export type ServerMessage =
  | { t: 'joined'; room: string; playerId: string; world: { w: number; h: number } }
  | { t: 'state'; players: PlayerState[]; pellets: PelletState[] }
  | { t: 'kill'; killerId: string; victimId: string; killerHandle: string; victimHandle: string }
  | { t: 'died'; stats: DeathStats }
  | { t: 'leaderboard'; entries: LeaderboardEntry[]; isSnapshot: boolean }
  | { t: 'error'; msg: string }

export type PlayerState = {
  id: string
  handle: string
  x: number
  y: number
  mass: number
  color: string // hex, hashed from handle
}

export type PelletState = {
  id: number
  x: number
  y: number
}

export type DeathStats = {
  handle: string
  timeAlive: number // ms
  kills: number
  peakMass: number
  victims: string[] // handles
  killedBy: string // handle
}

export type LeaderboardEntry = {
  handle: string
  mass: number
  kills: number
}

// Helpers
export function handleToColor(handle: string): string {
  let hash = 0
  for (let i = 0; i < handle.length; i++) {
    hash = handle.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = ((hash % 160) + 160) % 160 + 100 // range 100-260 (greens, teals, blues)
  return `hsl(${h}, 50%, 65%)`
}

export function massToRadius(mass: number): number {
  return Math.sqrt(mass / Math.PI) * 1.5
}
```

- [ ] **Step 7: Write minimal src/main.ts entry and update index.html**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>pretext</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #050a08; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="canvas"></canvas>
    <div id="ui-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```typescript
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

// Placeholder: clear to bg color to verify setup
ctx.fillStyle = '#050a08'
ctx.fillRect(0, 0, canvas.width, canvas.height)
ctx.fillStyle = '#00ff41'
ctx.font = '24px "Space Grotesk"'
ctx.fillText('pretext', 40, 60)
```

- [ ] **Step 8: Verify setup**

Run: `bun run dev`
Expected: Browser shows dark green background with "pretext" in Space Grotesk at top-left.

- [ ] **Step 9: Commit**

```bash
git init
echo 'node_modules\ndist\n.env*\n.superpowers/' > .gitignore
git add -A
git commit -m "feat: project restructure with shared types and constants"
```

---

### Task 2: Background Rendering (Grain Gradient)

**Files:**
- Create: `src/game/background.ts`

- [ ] **Step 1: Create background.ts with gradient + noise**

```typescript
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
    data[i + 3] = 25 // low alpha for subtle grain
  }
  ctx.putImageData(imageData, 0, 0)
  return c
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Base color
  ctx.fillStyle = '#050a08'
  ctx.fillRect(0, 0, w, h)

  // Green radial gradient (top-left)
  const g1 = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.5)
  g1.addColorStop(0, 'rgba(0, 80, 60, 0.35)')
  g1.addColorStop(1, 'transparent')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, w, h)

  // Blue radial gradient (bottom-right)
  const g2 = ctx.createRadialGradient(w * 0.7, h * 0.6, 0, w * 0.7, h * 0.6, w * 0.45)
  g2.addColorStop(0, 'rgba(20, 50, 120, 0.3)')
  g2.addColorStop(1, 'transparent')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, w, h)

  // Darker gradient at bottom
  const g3 = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, w * 0.4)
  g3.addColorStop(0, 'rgba(0, 60, 40, 0.2)')
  g3.addColorStop(1, 'transparent')
  ctx.fillStyle = g3
  ctx.fillRect(0, 0, w, h)

  // Grain overlay
  if (!noiseCanvas) {
    noiseCanvas = generateNoise(256, 256)
  }
  ctx.globalAlpha = 0.08
  ctx.globalCompositeOperation = 'overlay'
  // Tile the noise across the screen
  const pattern = ctx.createPattern(noiseCanvas, 'repeat')
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
```

- [ ] **Step 2: Wire into main.ts and verify**

Update `src/main.ts` to import and call `drawBackground(ctx, window.innerWidth, window.innerHeight)` in a render loop. Verify in browser: dark background with subtle green/blue gradient blobs and fine grain texture.

- [ ] **Step 3: Commit**

```bash
git add src/game/background.ts src/main.ts
git commit -m "feat: grainy gradient background"
```

---

### Task 3: Matrix Rain System

**Files:**
- Create: `src/game/rain.ts`

- [ ] **Step 1: Create rain.ts**

The rain system manages columns of falling characters. Each column has a speed, position, and draws characters from a text pool. Three layers: seed text (dimmest), handles (bright), kill events (flash).

```typescript
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
  speed: number // px/sec
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
    // Mix in player handles at higher frequency
    for (const h of this.handles) {
      pool.push(h, h) // double weight
    }
    // Occasionally add bios
    for (const b of this.bios) {
      pool.push(...b.split(/\s+/).slice(0, 5))
    }
    // Shuffle and pick 20-40 chars
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
      // When a column goes off screen, reset it
      if (col.y > 2000) {
        col.y = Math.random() * -200
        col.chars = this.pickChars()
        col.charIndex = 0
      }
    }
    // Fade kill flashes
    const now = performance.now()
    this.killFlashes = this.killFlashes.filter(k => {
      k.opacity = Math.max(0, 0.7 - (now - k.createdAt) / 3000)
      return k.opacity > 0
    })
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    ctx.textBaseline = 'top'

    // Rain columns
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

    // Kill flashes (brighter, larger)
    for (const flash of this.killFlashes) {
      ctx.font = `13px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = flash.opacity
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(flash.text, flash.x, flash.y)
    }

    ctx.globalAlpha = 1
  }
}
```

- [ ] **Step 2: Wire rain into main.ts render loop and verify**

Create a `MatrixRain` instance, call `init()` on resize, `update(dt)` and `draw()` each frame. Verify: green text columns fall down the screen over the grain background.

- [ ] **Step 3: Commit**

```bash
git add src/game/rain.ts src/main.ts
git commit -m "feat: matrix rain system with seed text"
```

---

### Task 4: Text Blob Rendering with Pretext

**Files:**
- Create: `src/game/blob.ts`

This is the core visual innovation — text flowing inside a circular blob using pretext's `layoutNextLine()`.

- [ ] **Step 1: Create blob.ts**

```typescript
import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { BLOB_FONT_FAMILY } from '@shared/constants'
import { massToRadius } from '@shared/protocol'

type PreparedBlob = {
  text: string
  fontSize: number
  prepared: PreparedTextWithSegments
}

const cache = new Map<string, PreparedBlob>()

function getPrepared(text: string, fontSize: number): PreparedTextWithSegments {
  const key = `${text}:${fontSize}`
  const cached = cache.get(key)
  if (cached && cached.text === text && cached.fontSize === fontSize) {
    return cached.prepared
  }
  const font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  const prepared = prepareWithSegments(text, font)
  cache.set(key, { text, fontSize, prepared })
  // Evict old entries
  if (cache.size > 200) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  return prepared
}

export function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mass: number,
  text: string,
  color: string,
  isPlayer: boolean,
) {
  const radius = massToRadius(mass)
  const fontSize = Math.max(9, Math.min(22, radius * 0.18))
  const lineHeight = fontSize * 1.5
  const padding = fontSize * 0.8

  // --- Circle body ---
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)

  // Dark fill with slight color tint
  const fillGrad = ctx.createRadialGradient(
    x - radius * 0.2, y - radius * 0.2, 0,
    x, y, radius
  )
  fillGrad.addColorStop(0, colorToFill(color, 0.2))
  fillGrad.addColorStop(1, colorToFill(color, 0.05))
  ctx.fillStyle = fillGrad
  ctx.fill()

  // Glow
  if (isPlayer) {
    ctx.shadowColor = color
    ctx.shadowBlur = radius * 0.4
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // Border
  ctx.strokeStyle = colorToAlpha(color, 0.3)
  ctx.lineWidth = 1
  ctx.stroke()

  // --- Text layout with pretext ---
  const prepared = getPrepared(text, fontSize)
  ctx.font = `${fontSize}px ${BLOB_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = color

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  // Calculate how many lines fit, center vertically
  const usableHeight = (radius - padding) * 2
  const maxLines = Math.floor(usableHeight / lineHeight)
  const lines: { text: string; width: number; maxWidth: number; yOff: number }[] = []

  for (let i = 0; i < maxLines; i++) {
    const yOff = -radius + padding + i * lineHeight + (lineHeight - fontSize) / 2
    const distFromCenter = Math.abs(yOff + fontSize / 2)

    // Skip if too close to edge
    if (distFromCenter >= radius - padding / 2) continue

    // Chord width at this y-offset
    const chordHalf = Math.sqrt(Math.max(0, radius * radius - distFromCenter * distFromCenter))
    const maxWidth = chordHalf * 2 - padding * 2

    if (maxWidth < fontSize * 2) continue

    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break

    lines.push({ text: line.text, width: line.width, maxWidth, yOff })
    cursor = line.end
  }

  // Center the text block vertically within the blob
  const textBlockHeight = lines.length * lineHeight
  const verticalShift = -textBlockHeight / 2 + lineHeight / 2

  for (const line of lines) {
    ctx.fillText(
      line.text,
      x - line.width / 2,
      y + verticalShift + lines.indexOf(line) * lineHeight - fontSize / 2,
    )
  }
}

function colorToFill(hsl: string, alpha: number): string {
  // hsl(H, S%, L%) → hsla(H, S%, L/3%, alpha)
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return `rgba(10, 20, 15, ${alpha})`
  return `hsla(${match[1]}, ${match[2]}%, ${Math.round(Number(match[3]) / 3)}%, ${alpha})`
}

function colorToAlpha(hsl: string, alpha: number): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return `rgba(100, 200, 150, ${alpha})`
  return `hsla(${match[1]}, ${match[2]}%, ${match[3]}%, ${alpha})`
}
```

- [ ] **Step 2: Test blob rendering in main.ts**

Add a test blob to the render loop:

```typescript
import { drawBlob } from './game/blob'
import { handleToColor } from '@shared/protocol'

// In render loop, after background + rain:
drawBlob(ctx, 400, 300, 500, '@nickcernera @victim1 @victim2 @someone', handleToColor('@nickcernera'), true)
drawBlob(ctx, 700, 400, 150, '@smallplayer', handleToColor('@smallplayer'), false)
drawBlob(ctx, 250, 500, 2000, '@massive @a @b @c @d @e @f @g @h @i @j', handleToColor('@massive'), false)
```

Verify: Three blobs at different sizes with text flowing inside, wrapping at the circle boundary. Larger blobs have more visible text. Text is centered in each blob.

- [ ] **Step 3: Commit**

```bash
git add src/game/blob.ts src/main.ts
git commit -m "feat: text blob rendering with pretext layoutNextLine"
```

---

### Task 5: Game World — Pellets, Camera, Input

**Files:**
- Create: `src/game/pellets.ts`, `src/game/camera.ts`, `src/game/input.ts`

- [ ] **Step 1: Create camera.ts**

```typescript
export class Camera {
  x = 0
  y = 0
  scale = 1
  private targetX = 0
  private targetY = 0
  private targetScale = 1

  follow(playerX: number, playerY: number, playerMass: number, screenW: number, screenH: number) {
    this.targetX = playerX - screenW / 2
    this.targetY = playerY - screenH / 2
    // Zoom out as player grows
    this.targetScale = Math.max(0.3, Math.min(1.2, 80 / Math.sqrt(playerMass)))
  }

  update(dt: number) {
    const lerp = 1 - Math.pow(0.02, dt)
    this.x += (this.targetX - this.x) * lerp
    this.y += (this.targetY - this.y) * lerp
    this.scale += (this.targetScale - this.scale) * lerp
  }

  applyTransform(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
    ctx.save()
    ctx.translate(screenW / 2, screenH / 2)
    ctx.scale(this.scale, this.scale)
    ctx.translate(-this.x - screenW / 2, -this.y - screenH / 2)
  }

  restore(ctx: CanvasRenderingContext2D) {
    ctx.restore()
  }

  // Convert screen coords to world coords
  screenToWorld(sx: number, sy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (sx - screenW / 2) / this.scale + this.x + screenW / 2,
      y: (sy - screenH / 2) / this.scale + this.y + screenH / 2,
    }
  }
}
```

- [ ] **Step 2: Create input.ts**

```typescript
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
```

- [ ] **Step 3: Create pellets.ts**

```typescript
import { PELLET_RADIUS } from '@shared/constants'

type Pellet = {
  id: number
  x: number
  y: number
  color: string
}

const PELLET_COLORS = ['#1a4a2a', '#1a2a4a', '#2a4a3a', '#1a3a3a', '#2a3a1a', '#3a2a3a']

export class PelletRenderer {
  private pellets: Pellet[] = []

  setPellets(pellets: { id: number; x: number; y: number }[]) {
    this.pellets = pellets.map(p => ({
      ...p,
      color: PELLET_COLORS[p.id % PELLET_COLORS.length],
    }))
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.pellets) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, PELLET_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
    }
  }
}
```

- [ ] **Step 4: Verify camera + pellets in main.ts**

Create a local player object, scatter test pellets, wire camera to follow player, render pellets in world space. Move mouse to see camera follow (for now, just move a test player toward cursor). Verify: pellets visible, camera follows player smoothly, zoom adjusts with "mass".

- [ ] **Step 5: Commit**

```bash
git add src/game/camera.ts src/game/input.ts src/game/pellets.ts src/main.ts
git commit -m "feat: camera, input, and pellet systems"
```

---

### Task 6: Single-Player Game Loop + HUD

**Files:**
- Create: `src/game/hud.ts`, `src/game/renderer.ts`, `src/screens/game.ts`
- Modify: `src/main.ts`

This task wires everything together into a playable single-player experience with local simulation (no server yet). The player moves, eats pellets, eats AI blobs, with a full HUD.

- [ ] **Step 1: Create hud.ts**

```typescript
import { UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import type { LeaderboardEntry } from '@shared/protocol'

type KillEvent = { text: string; time: number }

export class HUD {
  private leaderboard: LeaderboardEntry[] = []
  private killEvents: KillEvent[] = []
  private mass = 0
  private kills = 0
  private roomCode = ''

  setLeaderboard(entries: LeaderboardEntry[]) { this.leaderboard = entries }
  setPlayerStats(mass: number, kills: number) { this.mass = mass; this.kills = kills }
  setRoomCode(code: string) { this.roomCode = code }

  addKillEvent(killer: string, victim: string) {
    this.killEvents.push({ text: `${killer} devoured ${victim}`, time: performance.now() })
    if (this.killEvents.length > 6) this.killEvents.shift()
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.textBaseline = 'top'

    // Room code — top left
    if (this.roomCode) {
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = 0.4
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(this.roomCode, 16, 16)
    }

    // Leaderboard — top right
    ctx.font = `11px ${UI_FONT_FAMILY}`
    ctx.textBaseline = 'top'
    const lbX = w - 16
    let lbY = 16
    ctx.globalAlpha = 0.5
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    for (let i = 0; i < Math.min(10, this.leaderboard.length); i++) {
      const e = this.leaderboard[i]
      ctx.fillText(`${i + 1}. ${e.handle}  ${Math.round(e.mass)}`, lbX, lbY)
      lbY += 18
    }
    ctx.textAlign = 'left'

    // Kill feed — bottom left
    const now = performance.now()
    let kfY = h - 20
    for (let i = this.killEvents.length - 1; i >= 0; i--) {
      const ev = this.killEvents[i]
      const age = (now - ev.time) / 1000
      if (age > 8) continue
      ctx.globalAlpha = Math.max(0, 0.6 - age * 0.08)
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(ev.text, 16, kfY)
      kfY -= 18
    }

    // Player stats — bottom right
    ctx.globalAlpha = 0.5
    ctx.font = `12px ${UI_FONT_FAMILY}`
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(`mass: ${Math.round(this.mass)}  kills: ${this.kills}`, w - 16, h - 20)
    ctx.textAlign = 'left'

    ctx.globalAlpha = 1
  }
}
```

- [ ] **Step 2: Create renderer.ts — full render pipeline**

```typescript
import { drawBackground } from './background'
import { MatrixRain } from './rain'
import { drawBlob } from './blob'
import { PelletRenderer } from './pellets'
import { Camera } from './camera'
import { HUD } from './hud'
import type { PlayerState, PelletState } from '@shared/protocol'

export class Renderer {
  readonly rain = new MatrixRain()
  readonly pellets = new PelletRenderer()
  readonly camera = new Camera()
  readonly hud = new HUD()

  private lastTime = 0

  init(screenW: number, screenH: number) {
    this.rain.init(screenW, screenH)
  }

  draw(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    players: PlayerState[],
    localPlayerId: string,
    playerTexts: Map<string, string>,
    now: number,
  ) {
    const dt = this.lastTime ? (now - this.lastTime) / 1000 : 0.016
    this.lastTime = now

    // 1. Background (screen space)
    drawBackground(ctx, screenW, screenH)

    // 2. Matrix rain (screen space)
    this.rain.update(dt)
    this.rain.draw(ctx, screenW, screenH)

    // 3. World-space elements
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      this.camera.follow(local.x, local.y, local.mass, screenW, screenH)
    }
    this.camera.update(dt)
    this.camera.applyTransform(ctx, screenW, screenH)

    // 4. Pellets
    this.pellets.draw(ctx)

    // 5. Player blobs (sorted: smallest on top so you can see who's eating whom)
    const sorted = [...players].sort((a, b) => b.mass - a.mass)
    for (const p of sorted) {
      const text = playerTexts.get(p.id) || p.handle
      drawBlob(ctx, p.x, p.y, p.mass, text, p.color, p.id === localPlayerId)
    }

    // 6. Restore to screen space
    this.camera.restore(ctx)

    // 7. HUD
    this.hud.draw(ctx, screenW, screenH)
  }
}
```

- [ ] **Step 3: Create screens/game.ts — local single-player simulation**

```typescript
import { Renderer } from '../game/renderer'
import { Input } from '../game/input'
import { Camera } from '../game/camera'
import { WORLD_W, WORLD_H, PELLET_COUNT, BASE_SPEED, SPEED_EXPONENT, MASS_DECAY_RATE, MIN_MASS, EAT_RATIO, EAT_OVERLAP } from '@shared/constants'
import { type PlayerState, type PelletState, handleToColor, massToRadius } from '@shared/protocol'

type LocalPlayer = PlayerState & { kills: number; text: string; peakMass: number; victims: string[] }

const BOT_HANDLES = [
  '@synthwave', '@tensorcat', '@pixeldrift', '@neuralnet', '@bitshift',
  '@zeroday', '@kernelpanic', '@darkmode', '@overfit', '@gradientdrop',
  '@quantum_bit', '@nullpointer', '@bytecode', '@debugger', '@stacktrace',
]

export class GameScreen {
  private renderer = new Renderer()
  private input: Input
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  private player: LocalPlayer
  private bots: LocalPlayer[] = []
  private pellets: PelletState[] = []
  private playerTexts = new Map<string, string>()
  private running = false
  private onDeath: ((stats: { kills: number; peakMass: number; victims: string[]; timeAlive: number }) => void) | null = null
  private startTime = 0

  constructor(canvas: HTMLCanvasElement, handle: string) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.input = new Input(canvas)

    // Init player
    const color = handleToColor(handle)
    this.player = {
      id: 'local',
      handle,
      x: WORLD_W / 2 + (Math.random() - 0.5) * 500,
      y: WORLD_H / 2 + (Math.random() - 0.5) * 500,
      mass: 100,
      color,
      kills: 0,
      text: handle,
      peakMass: 100,
      victims: [],
    }
    this.playerTexts.set('local', handle)

    // Init bots
    for (let i = 0; i < 12; i++) {
      const botHandle = BOT_HANDLES[i % BOT_HANDLES.length]
      const bot: LocalPlayer = {
        id: `bot-${i}`,
        handle: botHandle,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        mass: 60 + Math.random() * 300,
        color: handleToColor(botHandle),
        kills: 0,
        text: botHandle,
        peakMass: 0,
        victims: [],
      }
      bot.peakMass = bot.mass
      this.bots.push(bot)
      this.playerTexts.set(bot.id, botHandle)
    }

    // Init pellets
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push({
        id: i,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
    }

    this.renderer.init(window.innerWidth, window.innerHeight)
    this.renderer.hud.setRoomCode('LOCAL')
    this.renderer.rain.setHandles([handle, ...BOT_HANDLES.slice(0, 12)])
    this.startTime = performance.now()
  }

  setOnDeath(cb: typeof this.onDeath) { this.onDeath = cb }

  start() {
    this.running = true
    this.loop(performance.now())
  }

  stop() {
    this.running = false
  }

  private loop = (now: number) => {
    if (!this.running) return
    this.update(now)
    this.render(now)
    requestAnimationFrame(this.loop)
  }

  private update(now: number) {
    const dt = 1 / 60

    // Player movement toward cursor
    const sw = window.innerWidth
    const sh = window.innerHeight
    const target = this.renderer.camera.screenToWorld(this.input.screenX, this.input.screenY, sw, sh)
    const speed = BASE_SPEED * Math.pow(100 / this.player.mass, SPEED_EXPONENT)
    const dx = target.x - this.player.x
    const dy = target.y - this.player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 5) {
      this.player.x += (dx / dist) * speed * dt
      this.player.y += (dy / dist) * speed * dt
    }

    // Clamp to world
    const r = massToRadius(this.player.mass)
    this.player.x = Math.max(r, Math.min(WORLD_W - r, this.player.x))
    this.player.y = Math.max(r, Math.min(WORLD_H - r, this.player.y))

    // Bot AI — simple: wander + flee bigger + chase smaller
    for (const bot of this.bots) {
      if (bot.mass <= 0) continue
      const botSpeed = BASE_SPEED * Math.pow(100 / bot.mass, SPEED_EXPONENT) * 0.7
      // Find nearest threat or prey
      let tx = bot.x + (Math.random() - 0.5) * 200
      let ty = bot.y + (Math.random() - 0.5) * 200
      const dxP = this.player.x - bot.x
      const dyP = this.player.y - bot.y
      const distP = Math.sqrt(dxP * dxP + dyP * dyP)
      if (distP < 400) {
        if (this.player.mass > bot.mass * EAT_RATIO) {
          // Flee
          tx = bot.x - dxP
          ty = bot.y - dyP
        } else if (bot.mass > this.player.mass * EAT_RATIO) {
          // Chase
          tx = this.player.x
          ty = this.player.y
        }
      }
      const bdx = tx - bot.x
      const bdy = ty - bot.y
      const bdist = Math.sqrt(bdx * bdx + bdy * bdy)
      if (bdist > 5) {
        bot.x += (bdx / bdist) * botSpeed * dt
        bot.y += (bdy / bdist) * botSpeed * dt
      }
      const br = massToRadius(bot.mass)
      bot.x = Math.max(br, Math.min(WORLD_W - br, bot.x))
      bot.y = Math.max(br, Math.min(WORLD_H - br, bot.y))
    }

    // Player eats pellets
    const pr = massToRadius(this.player.mass)
    this.pellets = this.pellets.filter(p => {
      const dx = p.x - this.player.x
      const dy = p.y - this.player.y
      if (dx * dx + dy * dy < pr * pr) {
        this.player.mass += 10
        return false
      }
      return true
    })
    // Respawn pellets
    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push({
        id: Math.floor(Math.random() * 100000),
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
    }

    // Player eats bots / bots eat player
    for (const bot of this.bots) {
      if (bot.mass <= 0) continue
      const dx = this.player.x - bot.x
      const dy = this.player.y - bot.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const overlap = (pr + massToRadius(bot.mass)) - dist

      if (overlap > massToRadius(Math.min(this.player.mass, bot.mass)) * EAT_OVERLAP) {
        if (this.player.mass > bot.mass * EAT_RATIO) {
          // Player eats bot
          this.player.mass += bot.mass
          this.player.kills++
          this.player.victims.push(bot.handle)
          this.player.text += ` ${bot.handle}`
          this.playerTexts.set('local', this.player.text)
          this.renderer.hud.addKillEvent(this.player.handle, bot.handle)
          this.renderer.rain.addKill(this.player.handle, bot.handle, window.innerWidth, window.innerHeight)
          // Respawn bot
          bot.x = Math.random() * WORLD_W
          bot.y = Math.random() * WORLD_H
          bot.mass = 60 + Math.random() * 200
          bot.text = bot.handle
          this.playerTexts.set(bot.id, bot.handle)
        } else if (bot.mass > this.player.mass * EAT_RATIO) {
          // Bot eats player
          this.running = false
          this.onDeath?.({
            kills: this.player.kills,
            peakMass: this.player.peakMass,
            victims: this.player.victims,
            timeAlive: performance.now() - this.startTime,
          })
          return
        }
      }
    }

    // Mass decay
    if (this.player.mass > MIN_MASS) {
      this.player.mass -= this.player.mass * MASS_DECAY_RATE * dt
    }
    this.player.peakMass = Math.max(this.player.peakMass, this.player.mass)

    // Update HUD
    this.renderer.hud.setPlayerStats(this.player.mass, this.player.kills)
    const allPlayers = [this.player, ...this.bots.filter(b => b.mass > 0)]
    const sorted = allPlayers.sort((a, b) => b.mass - a.mass)
    this.renderer.hud.setLeaderboard(sorted.slice(0, 10).map(p => ({
      handle: p.handle,
      mass: p.mass,
      kills: p.kills,
    })))

    this.renderer.pellets.setPellets(this.pellets)
  }

  private render(now: number) {
    const sw = window.innerWidth
    const sh = window.innerHeight
    const allPlayers: PlayerState[] = [
      this.player,
      ...this.bots.filter(b => b.mass > 0),
    ]
    this.renderer.draw(this.ctx, sw, sh, allPlayers, 'local', this.playerTexts, now)
  }
}
```

- [ ] **Step 4: Update main.ts to launch GameScreen**

```typescript
import { GameScreen } from './screens/game'

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

// For now, jump straight into game with a test handle
const game = new GameScreen(canvas, '@nickcernera')
game.setOnDeath((stats) => {
  console.log('DIED', stats)
  // Restart after a beat
  setTimeout(() => {
    const g2 = new GameScreen(canvas, '@nickcernera')
    g2.setOnDeath(game.onDeath)
    g2.start()
  }, 2000)
})
game.start()
```

- [ ] **Step 5: Verify the full single-player experience**

Run `bun run dev`. Expected:
- Grain gradient background with matrix rain
- Player blob with "@nickcernera" text that reflows as mass changes
- 12 bot blobs wandering around with handles
- Pellets scattered across world
- Move mouse → player follows
- Eat pellets → grow
- Eat smaller bots → their handle appears in your blob text, kill event in feed
- Get eaten by bigger bot → "DIED" logged
- Leaderboard updates live
- Camera zooms out as you grow

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: playable single-player game loop with HUD"
```

---

## Phase 2: Game Server + Networking

### Task 7: Server Core + Room Management

**Files:**
- Create: `server/index.ts`, `server/room.ts`
- Create: `server/__tests__/room.test.ts`

- [ ] **Step 1: Write room.test.ts**

```typescript
import { describe, test, expect } from 'bun:test'
import { RoomManager } from '../room'

describe('RoomManager', () => {
  test('creates public room and assigns player', () => {
    const mgr = new RoomManager()
    const room = mgr.getPublicRoom()
    expect(room.code).toHaveLength(4)
    expect(room.playerCount()).toBe(0)
  })

  test('creates private room with custom code', () => {
    const mgr = new RoomManager()
    const room = mgr.getOrCreateRoom('TEST')
    expect(room.code).toBe('TEST')
  })

  test('reuses existing room by code', () => {
    const mgr = new RoomManager()
    const r1 = mgr.getOrCreateRoom('ABC')
    const r2 = mgr.getOrCreateRoom('ABC')
    expect(r1).toBe(r2)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun test server/__tests__/room.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write server/room.ts**

```typescript
import { ROOM_CAPACITY, BOT_FILL_THRESHOLD, ROOM_IDLE_TIMEOUT, WORLD_W, WORLD_H, PELLET_COUNT, LEADERBOARD_INTERVAL } from '../shared/constants'
import { type PlayerState, type PelletState, type LeaderboardEntry, handleToColor, massToRadius } from '../shared/protocol'
import type { ServerWebSocket } from 'bun'

export type ServerPlayer = {
  id: string
  handle: string
  bio: string
  x: number
  y: number
  mass: number
  color: string
  targetX: number
  targetY: number
  kills: number
  victims: string[]
  text: string
  peakMass: number
  joinedAt: number
  ws: ServerWebSocket<{ playerId: string; roomCode: string }> | null // null for bots
}

export class Room {
  readonly code: string
  readonly players = new Map<string, ServerPlayer>()
  readonly pellets: PelletState[] = []
  lastActivity = Date.now()
  private lastSnapshot = Date.now()
  private nextPelletId = 0

  constructor(code: string) {
    this.code = code
    // Init pellets
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push({
        id: this.nextPelletId++,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
    }
  }

  addPlayer(id: string, handle: string, bio: string, ws: ServerWebSocket<any> | null): ServerPlayer {
    const player: ServerPlayer = {
      id,
      handle,
      bio,
      x: Math.random() * (WORLD_W - 400) + 200,
      y: Math.random() * (WORLD_H - 400) + 200,
      mass: 100,
      color: handleToColor(handle),
      targetX: WORLD_W / 2,
      targetY: WORLD_H / 2,
      kills: 0,
      victims: [],
      text: handle,
      peakMass: 100,
      joinedAt: Date.now(),
      ws,
    }
    this.players.set(id, player)
    this.lastActivity = Date.now()
    return player
  }

  removePlayer(id: string) {
    this.players.delete(id)
    this.lastActivity = Date.now()
  }

  playerCount(): number {
    return this.players.size
  }

  realPlayerCount(): number {
    let count = 0
    for (const p of this.players.values()) {
      if (p.ws !== null) count++
    }
    return count
  }

  getLeaderboard(): LeaderboardEntry[] {
    return [...this.players.values()]
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map(p => ({ handle: p.handle, mass: p.mass, kills: p.kills }))
  }

  shouldSnapshot(): boolean {
    if (Date.now() - this.lastSnapshot >= LEADERBOARD_INTERVAL) {
      this.lastSnapshot = Date.now()
      return true
    }
    return false
  }

  respawnPellets() {
    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push({
        id: this.nextPelletId++,
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
      })
    }
  }

  isIdle(): boolean {
    return this.realPlayerCount() === 0 && Date.now() - this.lastActivity > ROOM_IDLE_TIMEOUT
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>()
  private publicRoomCodes: string[] = []

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
    let code: string
    do {
      code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    } while (this.rooms.has(code))
    return code
  }

  getOrCreateRoom(code: string): Room {
    let room = this.rooms.get(code)
    if (!room) {
      room = new Room(code)
      this.rooms.set(code, room)
    }
    return room
  }

  getPublicRoom(): Room {
    // Find a public room with space
    for (const code of this.publicRoomCodes) {
      const room = this.rooms.get(code)
      if (room && room.playerCount() < ROOM_CAPACITY) return room
    }
    // Create new public room
    const code = this.generateCode()
    const room = new Room(code)
    this.rooms.set(code, room)
    this.publicRoomCodes.push(code)
    return room
  }

  cleanup() {
    for (const [code, room] of this.rooms) {
      if (room.isIdle()) {
        this.rooms.delete(code)
        this.publicRoomCodes = this.publicRoomCodes.filter(c => c !== code)
      }
    }
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  allRooms(): Room[] {
    return [...this.rooms.values()]
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `bun test server/__tests__/room.test.ts`
Expected: 3 tests pass

- [ ] **Step 5: Write server/index.ts — HTTP + WebSocket entry**

```typescript
import { RoomManager } from './room'
import { Simulation } from './simulation'
import type { ServerMessage, ClientMessage } from '../shared/protocol'

const PORT = Number(process.env.PORT) || 3001
const rooms = new RoomManager()
const simulation = new Simulation(rooms)

let nextPlayerId = 1

type WSData = { playerId: string; roomCode: string }

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, { data: { playerId: '', roomCode: '' } as WSData })
      if (!upgraded) return new Response('WebSocket upgrade failed', { status: 400 })
      return undefined
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok')
    }

    return new Response('pretext game server', { status: 200 })
  },
  websocket: {
    open(ws) {
      // Player sends 'join' message after connecting
    },
    message(ws, message) {
      try {
        const msg = JSON.parse(String(message)) as ClientMessage
        const data = ws.data as WSData

        switch (msg.t) {
          case 'join': {
            const id = `p${nextPlayerId++}`
            const handle = msg.token ? msg.token : (msg.guest || `@anon${id}`)
            const room = msg.room ? rooms.getOrCreateRoom(msg.room) : rooms.getPublicRoom()
            room.addPlayer(id, handle, '', ws)
            data.playerId = id
            data.roomCode = room.code

            const response: ServerMessage = {
              t: 'joined',
              room: room.code,
              playerId: id,
              world: { w: 4000, h: 4000 },
            }
            ws.send(JSON.stringify(response))
            break
          }
          case 'input': {
            const room = rooms.getRoom(data.roomCode)
            const player = room?.players.get(data.playerId)
            if (player) {
              player.targetX = msg.x
              player.targetY = msg.y
            }
            break
          }
          case 'split': {
            // TODO: implemented in simulation task
            break
          }
          case 'eject': {
            // TODO: implemented in simulation task
            break
          }
        }
      } catch (e) {
        // Ignore malformed messages
      }
    },
    close(ws) {
      const data = ws.data as WSData
      const room = rooms.getRoom(data.roomCode)
      if (room) {
        room.removePlayer(data.playerId)
      }
    },
  },
})

// Start simulation tick
simulation.start()

// Room cleanup every 30s
setInterval(() => rooms.cleanup(), 30_000)

console.log(`pretext server running on :${PORT}`)
```

- [ ] **Step 6: Verify server starts**

Run: `bun run server/index.ts`
Expected: "pretext server running on :3001"

Test health check: `curl http://localhost:3001/health` → "ok"

- [ ] **Step 7: Commit**

```bash
git add server/ shared/
git commit -m "feat: game server with room management and WebSocket"
```

---

### Task 8: Server Simulation — Physics, Collision, Eating

**Files:**
- Create: `server/simulation.ts`, `server/spatial.ts`
- Create: `server/__tests__/simulation.test.ts`, `server/__tests__/spatial.test.ts`

- [ ] **Step 1: Write spatial.test.ts**

```typescript
import { describe, test, expect } from 'bun:test'
import { SpatialGrid } from '../spatial'

describe('SpatialGrid', () => {
  test('finds entities in range', () => {
    const grid = new SpatialGrid(1000, 1000, 200)
    grid.clear()
    grid.insert('a', 100, 100, 20)
    grid.insert('b', 120, 110, 20)
    grid.insert('c', 900, 900, 20)

    const near = grid.query(100, 100, 50)
    expect(near).toContain('a')
    expect(near).toContain('b')
    expect(near).not.toContain('c')
  })

  test('handles edge cells', () => {
    const grid = new SpatialGrid(1000, 1000, 200)
    grid.clear()
    grid.insert('a', 0, 0, 20)
    const near = grid.query(10, 10, 50)
    expect(near).toContain('a')
  })
})
```

- [ ] **Step 2: Run test, verify fail**

Run: `bun test server/__tests__/spatial.test.ts`
Expected: FAIL

- [ ] **Step 3: Write server/spatial.ts**

```typescript
export class SpatialGrid {
  private cellSize: number
  private cols: number
  private rows: number
  private cells: Map<number, string[]> = new Map()

  constructor(worldW: number, worldH: number, cellSize: number) {
    this.cellSize = cellSize
    this.cols = Math.ceil(worldW / cellSize)
    this.rows = Math.ceil(worldH / cellSize)
  }

  clear() {
    this.cells.clear()
  }

  private key(col: number, row: number): number {
    return row * this.cols + col
  }

  insert(id: string, x: number, y: number, radius: number) {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize))
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize))
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize))
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize))

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const k = this.key(c, r)
        let cell = this.cells.get(k)
        if (!cell) {
          cell = []
          this.cells.set(k, cell)
        }
        cell.push(id)
      }
    }
  }

  query(x: number, y: number, radius: number): string[] {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize))
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize))
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize))
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize))

    const seen = new Set<string>()
    const result: string[] = []

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.cells.get(this.key(c, r))
        if (!cell) continue
        for (const id of cell) {
          if (!seen.has(id)) {
            seen.add(id)
            result.push(id)
          }
        }
      }
    }
    return result
  }
}
```

- [ ] **Step 4: Run spatial test, verify pass**

Run: `bun test server/__tests__/spatial.test.ts`
Expected: PASS

- [ ] **Step 5: Write simulation.test.ts**

```typescript
import { describe, test, expect } from 'bun:test'
import { RoomManager } from '../room'
import { Simulation } from '../simulation'

describe('Simulation', () => {
  test('moves player toward target', () => {
    const mgr = new RoomManager()
    const sim = new Simulation(mgr)
    const room = mgr.getOrCreateRoom('TEST')
    const player = room.addPlayer('p1', '@test', '', null)
    player.targetX = player.x + 1000
    player.targetY = player.y

    const startX = player.x
    sim.tickRoom(room, 1 / 30)
    expect(player.x).toBeGreaterThan(startX)
  })

  test('bigger player eats smaller on overlap', () => {
    const mgr = new RoomManager()
    const sim = new Simulation(mgr)
    const room = mgr.getOrCreateRoom('TEST')
    const big = room.addPlayer('p1', '@big', '', null)
    const small = room.addPlayer('p2', '@small', '', null)
    big.mass = 500
    small.mass = 100
    big.x = 100; big.y = 100
    small.x = 105; small.y = 100 // overlapping

    sim.tickRoom(room, 1 / 30)
    expect(room.players.has('p2')).toBe(false)
    expect(big.mass).toBeGreaterThan(500)
    expect(big.text).toContain('@small')
  })

  test('equal-size players do not eat each other', () => {
    const mgr = new RoomManager()
    const sim = new Simulation(mgr)
    const room = mgr.getOrCreateRoom('TEST')
    const a = room.addPlayer('p1', '@a', '', null)
    const b = room.addPlayer('p2', '@b', '', null)
    a.mass = 200; b.mass = 200
    a.x = 100; a.y = 100
    b.x = 105; b.y = 100

    sim.tickRoom(room, 1 / 30)
    expect(room.players.has('p1')).toBe(true)
    expect(room.players.has('p2')).toBe(true)
  })
})
```

- [ ] **Step 6: Run test, verify fail**

Run: `bun test server/__tests__/simulation.test.ts`
Expected: FAIL

- [ ] **Step 7: Write server/simulation.ts**

```typescript
import { TICK_RATE, TICK_MS, BASE_SPEED, SPEED_EXPONENT, MASS_DECAY_RATE, MIN_MASS, EAT_RATIO, EAT_OVERLAP, WORLD_W, WORLD_H } from '../shared/constants'
import { type ServerMessage, massToRadius } from '../shared/protocol'
import { SpatialGrid } from './spatial'
import { type Room, type ServerPlayer, RoomManager } from './room'
import { tickBots } from './bot'

export class Simulation {
  private rooms: RoomManager
  private interval: ReturnType<typeof setInterval> | null = null
  private grid = new SpatialGrid(WORLD_W, WORLD_H, 200)

  constructor(rooms: RoomManager) {
    this.rooms = rooms
  }

  start() {
    this.interval = setInterval(() => this.tick(), TICK_MS)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  private tick() {
    const dt = 1 / TICK_RATE
    for (const room of this.rooms.allRooms()) {
      this.tickRoom(room, dt)
      this.broadcastState(room)

      if (room.shouldSnapshot()) {
        this.broadcastLeaderboard(room, true)
      }
    }
  }

  tickRoom(room: Room, dt: number) {
    // Bot AI
    tickBots(room, dt)

    // Build spatial grid
    this.grid.clear()
    for (const [id, p] of room.players) {
      this.grid.insert(id, p.x, p.y, massToRadius(p.mass))
    }

    // Move players toward targets
    for (const [, p] of room.players) {
      const speed = BASE_SPEED * Math.pow(100 / p.mass, SPEED_EXPONENT)
      const dx = p.targetX - p.x
      const dy = p.targetY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 5) {
        p.x += (dx / dist) * speed * dt
        p.y += (dy / dist) * speed * dt
      }
      // Clamp
      const r = massToRadius(p.mass)
      p.x = Math.max(r, Math.min(WORLD_W - r, p.x))
      p.y = Math.max(r, Math.min(WORLD_H - r, p.y))
    }

    // Check eating (player vs player)
    const toRemove: string[] = []
    for (const [id, p] of room.players) {
      if (toRemove.includes(id)) continue
      const r = massToRadius(p.mass)
      const nearby = this.grid.query(p.x, p.y, r + 200)

      for (const otherId of nearby) {
        if (otherId === id || toRemove.includes(otherId)) continue
        const other = room.players.get(otherId)
        if (!other) continue

        const dx = p.x - other.x
        const dy = p.y - other.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const otherR = massToRadius(other.mass)
        const overlap = (r + otherR) - dist
        const minR = Math.min(r, otherR)

        if (overlap > minR * EAT_OVERLAP) {
          if (p.mass > other.mass * EAT_RATIO) {
            // p eats other
            p.mass += other.mass
            p.kills++
            p.victims.push(other.handle)
            p.text += ` ${other.handle}`
            p.peakMass = Math.max(p.peakMass, p.mass)

            // Notify victim
            if (other.ws) {
              const deathMsg: ServerMessage = {
                t: 'died',
                stats: {
                  handle: other.handle,
                  timeAlive: Date.now() - other.joinedAt,
                  kills: other.kills,
                  peakMass: other.peakMass,
                  victims: other.victims,
                  killedBy: p.handle,
                },
              }
              other.ws.send(JSON.stringify(deathMsg))
            }

            // Broadcast kill
            const killMsg: ServerMessage = {
              t: 'kill',
              killerId: id,
              victimId: otherId,
              killerHandle: p.handle,
              victimHandle: other.handle,
            }
            this.broadcast(room, killMsg)
            toRemove.push(otherId)
          }
        }
      }
    }

    for (const id of toRemove) {
      room.removePlayer(id)
    }

    // Player eats pellets
    for (const [, p] of room.players) {
      const r = massToRadius(p.mass)
      for (let i = room.pellets.length - 1; i >= 0; i--) {
        const pel = room.pellets[i]
        const dx = pel.x - p.x
        const dy = pel.y - p.y
        if (dx * dx + dy * dy < r * r) {
          p.mass += 10
          room.pellets.splice(i, 1)
        }
      }
    }
    room.respawnPellets()

    // Mass decay
    for (const [, p] of room.players) {
      if (p.mass > MIN_MASS) {
        p.mass -= p.mass * MASS_DECAY_RATE * dt
      }
    }
  }

  private broadcastState(room: Room) {
    const players = [...room.players.values()].map(p => ({
      id: p.id,
      handle: p.handle,
      x: Math.round(p.x),
      y: Math.round(p.y),
      mass: Math.round(p.mass),
      color: p.color,
    }))

    // Send visible pellets per player (within viewport)
    for (const [, p] of room.players) {
      if (!p.ws) continue
      // Simple: send all pellets. Optimize later if needed.
      const msg: ServerMessage = {
        t: 'state',
        players,
        pellets: room.pellets,
      }
      p.ws.send(JSON.stringify(msg))
    }
  }

  private broadcastLeaderboard(room: Room, isSnapshot: boolean) {
    const msg: ServerMessage = {
      t: 'leaderboard',
      entries: room.getLeaderboard(),
      isSnapshot,
    }
    this.broadcast(room, msg)
  }

  private broadcast(room: Room, msg: ServerMessage) {
    const json = JSON.stringify(msg)
    for (const [, p] of room.players) {
      if (p.ws) p.ws.send(json)
    }
  }
}
```

- [ ] **Step 8: Run simulation tests, verify pass**

Run: `bun test server/__tests__/simulation.test.ts`
Expected: PASS (the `tickBots` import will fail — create bot.ts stub first)

- [ ] **Step 9: Commit**

```bash
git add server/
git commit -m "feat: server simulation with physics, spatial grid, and eating"
```

---

### Task 9: Bot AI

**Files:**
- Create: `server/bot.ts`

- [ ] **Step 1: Write server/bot.ts**

```typescript
import { BOT_FILL_THRESHOLD, BASE_SPEED, SPEED_EXPONENT, WORLD_W, WORLD_H, EAT_RATIO } from '../shared/constants'
import { handleToColor, massToRadius } from '../shared/protocol'
import type { Room, ServerPlayer } from './room'

const BOT_HANDLES = [
  '@synthwave', '@tensorcat', '@pixeldrift', '@neuralnet', '@bitshift',
  '@zeroday', '@kernelpanic', '@darkmode', '@overfit', '@gradientdrop',
  '@quantum_bit', '@nullpointer', '@bytecode', '@debugger', '@stacktrace',
  '@malloc', '@segfault', '@ioexception', '@dockerfile', '@k8s_pod',
]

let botIdCounter = 0

export function fillBots(room: Room) {
  const realCount = room.realPlayerCount()
  const botCount = room.playerCount() - realCount
  const needed = Math.max(0, BOT_FILL_THRESHOLD - room.playerCount())

  for (let i = 0; i < needed; i++) {
    const handle = BOT_HANDLES[(botIdCounter + i) % BOT_HANDLES.length]
    const id = `bot-${botIdCounter++}`
    const player = room.addPlayer(id, handle, '', null)
    player.mass = 60 + Math.random() * 300
    player.peakMass = player.mass
    // Set initial wander target
    player.targetX = Math.random() * WORLD_W
    player.targetY = Math.random() * WORLD_H
  }
}

export function tickBots(room: Room, dt: number) {
  // Fill bots if needed
  fillBots(room)

  for (const [id, bot] of room.players) {
    if (bot.ws !== null) continue // skip real players

    // Occasionally change wander target
    if (Math.random() < 0.02) {
      bot.targetX = Math.random() * WORLD_W
      bot.targetY = Math.random() * WORLD_H
    }

    // React to nearby players
    let nearestThreat: ServerPlayer | null = null
    let nearestPrey: ServerPlayer | null = null
    let threatDist = Infinity
    let preyDist = Infinity

    for (const [otherId, other] of room.players) {
      if (otherId === id) continue
      const dx = other.x - bot.x
      const dy = other.y - bot.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 500) {
        if (other.mass > bot.mass * EAT_RATIO && dist < threatDist) {
          nearestThreat = other
          threatDist = dist
        }
        if (bot.mass > other.mass * EAT_RATIO && dist < preyDist) {
          nearestPrey = other
          preyDist = dist
        }
      }
    }

    // Priority: flee threats > chase prey > wander
    if (nearestThreat && threatDist < 350) {
      // Flee
      bot.targetX = bot.x - (nearestThreat.x - bot.x) * 2
      bot.targetY = bot.y - (nearestThreat.y - bot.y) * 2
    } else if (nearestPrey && preyDist < 400) {
      // Chase
      bot.targetX = nearestPrey.x
      bot.targetY = nearestPrey.y
    }

    // Clamp targets to world
    bot.targetX = Math.max(50, Math.min(WORLD_W - 50, bot.targetX))
    bot.targetY = Math.max(50, Math.min(WORLD_H - 50, bot.targetY))
  }

  // Respawn dead bots (bots removed by simulation get re-filled by fillBots)
}
```

- [ ] **Step 2: Run all server tests**

Run: `bun test server/__tests__/`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/bot.ts
git commit -m "feat: bot AI with flee/chase/wander behavior"
```

---

### Task 10: Client Networking + Server Integration

**Files:**
- Create: `src/net/client.ts`, `src/net/interpolation.ts`
- Modify: `src/screens/game.ts`, `src/main.ts`

- [ ] **Step 1: Create src/net/client.ts**

```typescript
import type { ClientMessage, ServerMessage, PlayerState, PelletState, DeathStats, LeaderboardEntry } from '@shared/protocol'

export type GameEvents = {
  onJoined: (room: string, playerId: string, world: { w: number; h: number }) => void
  onState: (players: PlayerState[], pellets: PelletState[]) => void
  onKill: (killerId: string, victimId: string, killerHandle: string, victimHandle: string) => void
  onDied: (stats: DeathStats) => void
  onLeaderboard: (entries: LeaderboardEntry[], isSnapshot: boolean) => void
  onError: (msg: string) => void
  onDisconnect: () => void
}

export class GameClient {
  private ws: WebSocket | null = null
  private events: GameEvents

  constructor(events: GameEvents) {
    this.events = events
  }

  connect(serverUrl: string) {
    this.ws = new WebSocket(serverUrl)

    this.ws.onopen = () => {
      // Connection ready, caller sends 'join'
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerMessage
        switch (msg.t) {
          case 'joined':
            this.events.onJoined(msg.room, msg.playerId, msg.world)
            break
          case 'state':
            this.events.onState(msg.players, msg.pellets)
            break
          case 'kill':
            this.events.onKill(msg.killerId, msg.victimId, msg.killerHandle, msg.victimHandle)
            break
          case 'died':
            this.events.onDied(msg.stats)
            break
          case 'leaderboard':
            this.events.onLeaderboard(msg.entries, msg.isSnapshot)
            break
          case 'error':
            this.events.onError(msg.msg)
            break
        }
      } catch {
        // ignore malformed
      }
    }

    this.ws.onclose = () => this.events.onDisconnect()
  }

  join(room: string | null, token?: string, guest?: string) {
    this.send({ t: 'join', room: room || '', token, guest })
  }

  sendInput(x: number, y: number) {
    this.send({ t: 'input', x: Math.round(x), y: Math.round(y) })
  }

  sendSplit() {
    this.send({ t: 'split' })
  }

  sendEject() {
    this.send({ t: 'eject' })
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
```

- [ ] **Step 2: Create src/net/interpolation.ts**

```typescript
import type { PlayerState } from '@shared/protocol'

type InterpolatedPlayer = PlayerState & {
  prevX: number
  prevY: number
  prevMass: number
  lastUpdate: number
}

export class StateInterpolator {
  private players = new Map<string, InterpolatedPlayer>()
  private readonly lerpSpeed = 10 // higher = snappier

  update(serverPlayers: PlayerState[]) {
    const now = performance.now()
    const seen = new Set<string>()

    for (const sp of serverPlayers) {
      seen.add(sp.id)
      const existing = this.players.get(sp.id)
      if (existing) {
        existing.prevX = existing.x
        existing.prevY = existing.y
        existing.prevMass = existing.mass
        existing.x = sp.x
        existing.y = sp.y
        existing.mass = sp.mass
        existing.handle = sp.handle
        existing.color = sp.color
        existing.lastUpdate = now
      } else {
        this.players.set(sp.id, {
          ...sp,
          prevX: sp.x,
          prevY: sp.y,
          prevMass: sp.mass,
          lastUpdate: now,
        })
      }
    }

    // Remove disconnected players
    for (const [id] of this.players) {
      if (!seen.has(id)) this.players.delete(id)
    }
  }

  getInterpolated(dt: number): PlayerState[] {
    const result: PlayerState[] = []
    const t = Math.min(1, dt * this.lerpSpeed)

    for (const [, p] of this.players) {
      result.push({
        id: p.id,
        handle: p.handle,
        x: p.prevX + (p.x - p.prevX) * t,
        y: p.prevY + (p.y - p.prevY) * t,
        mass: p.prevMass + (p.mass - p.prevMass) * t,
        color: p.color,
      })
    }
    return result
  }
}
```

- [ ] **Step 3: Update src/screens/game.ts to support both local and networked modes**

Add a `mode: 'local' | 'online'` parameter to `GameScreen` constructor. In `online` mode, create a `GameClient` and `StateInterpolator`. Send mouse position to server each frame. Receive state updates and pass to renderer. Kill events update `playerTexts` map and rain. On death, call `onDeath` callback.

The local mode code from Task 6 stays as-is for offline play/testing. The online mode replaces the local simulation with server state.

Key changes to game.ts constructor for online mode:

```typescript
if (this.mode === 'online') {
  this.client = new GameClient({
    onJoined: (room, id, world) => {
      this.playerId = id
      this.renderer.hud.setRoomCode(room)
    },
    onState: (players, pellets) => {
      this.interpolator.update(players)
      this.renderer.pellets.setPellets(pellets)
      // Update rain with current handles
      this.renderer.rain.setHandles(players.map(p => p.handle))
    },
    onKill: (killerId, victimId, killerHandle, victimHandle) => {
      // Update texts
      const existing = this.playerTexts.get(killerId) || killerHandle
      this.playerTexts.set(killerId, existing + ' ' + victimHandle)
      this.renderer.hud.addKillEvent(killerHandle, victimHandle)
      this.renderer.rain.addKill(killerHandle, victimHandle, window.innerWidth, window.innerHeight)
    },
    onDied: (stats) => {
      this.stop()
      this.onDeath?.(stats)
    },
    onLeaderboard: (entries, isSnapshot) => {
      this.renderer.hud.setLeaderboard(entries)
    },
    onError: (msg) => console.error('Server error:', msg),
    onDisconnect: () => console.warn('Disconnected from server'),
  })
  this.client.connect(serverUrl)
  this.client.join(roomCode, token, guestHandle)
}
```

In the online mode update loop, send input each frame:

```typescript
if (this.mode === 'online' && this.client) {
  const target = this.renderer.camera.screenToWorld(this.input.screenX, this.input.screenY, sw, sh)
  this.client.sendInput(target.x, target.y)
  if (this.input.consumeSplit()) this.client.sendSplit()
  if (this.input.consumeEject()) this.client.sendEject()
}
```

In the online mode render, use interpolated state instead of local:

```typescript
const players = this.mode === 'online'
  ? this.interpolator.getInterpolated(dt)
  : [this.player, ...this.bots.filter(b => b.mass > 0)]
```

- [ ] **Step 4: Verify end-to-end**

Terminal 1: `bun run server/index.ts`
Terminal 2: `bun run dev`

Open browser to localhost:5173. Game should connect to ws://localhost:3001/ws, join a public room, and be playable with bots. Movement should feel smooth with interpolation.

- [ ] **Step 5: Commit**

```bash
git add src/net/ src/screens/game.ts src/main.ts
git commit -m "feat: client networking with WebSocket and state interpolation"
```

---

## Phase 3: Auth & Web Layer

### Task 11: X OAuth + Guest Play

**Files:**
- Create: `src/auth.ts`
- Modify: `server/index.ts`, `server/auth.ts`

- [ ] **Step 1: Create server/auth.ts — X OAuth server-side**

```typescript
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || ''
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:5173/callback'
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

export type UserInfo = {
  handle: string
  displayName: string
  avatar: string
  bio: string
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: TWITTER_CLIENT_ID,
    code_verifier: codeVerifier,
  })

  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`)}`,
    },
    body: params.toString(),
  })

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch('https://api.x.com/2/users/me?user.fields=description,profile_image_url', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`User fetch failed: ${res.status}`)
  const data = await res.json()
  return {
    handle: `@${data.data.username}`,
    displayName: data.data.name,
    avatar: data.data.profile_image_url || '',
    bio: data.data.description || '',
  }
}

export async function createJWT(userInfo: UserInfo): Promise<string> {
  // Simple base64 JWT (use a proper lib in production)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    ...userInfo,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  }))
  const signature = btoa(JWT_SECRET + header + payload) // simplified — use HMAC in prod
  return `${header}.${payload}.${signature}`
}

export function verifyJWT(token: string): UserInfo | null {
  try {
    const [header, payload, sig] = token.split('.')
    const expectedSig = btoa(JWT_SECRET + header + payload)
    if (sig !== expectedSig) return null
    const data = JSON.parse(atob(payload))
    if (data.exp < Date.now()) return null
    return { handle: data.handle, displayName: data.displayName, avatar: data.avatar, bio: data.bio }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add auth routes to server/index.ts**

Add these routes to the `fetch` handler:

```typescript
// GET /auth/twitter — redirect to X OAuth
if (url.pathname === '/auth/twitter') {
  const state = crypto.randomUUID()
  const codeChallenge = url.searchParams.get('code_challenge') || ''
  const authUrl = new URL('https://x.com/i/oauth2/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', process.env.TWITTER_CLIENT_ID || '')
  authUrl.searchParams.set('redirect_uri', process.env.REDIRECT_URI || 'http://localhost:5173/callback')
  authUrl.searchParams.set('scope', 'tweet.read users.read')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  return Response.redirect(authUrl.toString())
}

// POST /auth/callback — exchange code for token, return JWT
if (url.pathname === '/auth/callback' && req.method === 'POST') {
  const body = await req.json()
  const accessToken = await exchangeCodeForToken(body.code, body.codeVerifier)
  const userInfo = await fetchUserInfo(accessToken)
  const jwt = await createJWT(userInfo)
  return Response.json({ jwt, user: userInfo })
}
```

- [ ] **Step 3: Create src/auth.ts — client-side OAuth PKCE flow**

```typescript
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type AuthUser = {
  handle: string
  displayName: string
  avatar: string
  bio: string
  jwt: string
}

export async function startXAuth(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('oauth_verifier', verifier)
  window.location.href = `${SERVER_URL}/auth/twitter?code_challenge=${challenge}`
}

export async function handleCallback(code: string): Promise<AuthUser> {
  const verifier = sessionStorage.getItem('oauth_verifier') || ''
  const res = await fetch(`${SERVER_URL}/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  })
  if (!res.ok) throw new Error('Auth failed')
  const data = await res.json()
  localStorage.setItem('pretext_jwt', data.jwt)
  localStorage.setItem('pretext_user', JSON.stringify(data.user))
  return { ...data.user, jwt: data.jwt }
}

export function getStoredUser(): AuthUser | null {
  const jwt = localStorage.getItem('pretext_jwt')
  const user = localStorage.getItem('pretext_user')
  if (!jwt || !user) return null
  try {
    return { ...JSON.parse(user), jwt }
  } catch {
    return null
  }
}

export function logout() {
  localStorage.removeItem('pretext_jwt')
  localStorage.removeItem('pretext_user')
}
```

- [ ] **Step 4: Update server join handling to accept JWT**

In `server/index.ts`, when processing `join` message, if `msg.token` is provided, verify it as JWT and extract handle/bio. Otherwise use guest name.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts server/auth.ts server/index.ts
git commit -m "feat: X OAuth PKCE flow with JWT sessions"
```

---

### Task 12: Landing Page + Screen Management

**Files:**
- Create: `src/screens/landing.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create src/screens/landing.ts**

```typescript
import { drawBackground } from '../game/background'
import { MatrixRain } from '../game/rain'
import { startXAuth, getStoredUser } from '../auth'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'

type LandingResult =
  | { action: 'play'; handle: string; token?: string; room?: string }
  | { action: 'auth' }

export class LandingScreen {
  private rain = new MatrixRain()
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private resolve: ((result: LandingResult) => void) | null = null
  private uiRoot: HTMLElement
  private destroyed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.uiRoot = document.getElementById('ui-root')!
    this.rain.init(window.innerWidth, window.innerHeight)
  }

  show(): Promise<LandingResult> {
    return new Promise((resolve) => {
      this.resolve = resolve
      this.buildUI()
      this.animate(performance.now())
    })
  }

  private buildUI() {
    const user = getStoredUser()
    const roomFromUrl = new URLSearchParams(window.location.search).get('r')
      || window.location.pathname.match(/\/r\/(\w+)/)?.[1]

    const container = document.createElement('div')
    container.style.cssText = `
      position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;
      font-family:${BLOB_FONT_FAMILY};color:#d0ffe0;
    `

    // Title
    const title = document.createElement('h1')
    title.textContent = 'pretext'
    title.style.cssText = `font-size:64px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px;color:#d0ffe0;text-shadow:0 0 40px rgba(0,255,65,0.15);`
    container.appendChild(title)

    // Subtitle
    const sub = document.createElement('p')
    sub.textContent = 'you are your text. eat or be eaten.'
    sub.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:13px;color:#4a7a5a;margin-bottom:40px;`
    container.appendChild(sub)

    // Buttons
    const btnContainer = document.createElement('div')
    btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:260px;'

    if (user) {
      // Signed in — show handle + play button
      const label = document.createElement('div')
      label.textContent = `signed in as ${user.handle}`
      label.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#4a7a5a;text-align:center;margin-bottom:4px;`
      btnContainer.appendChild(label)

      const playBtn = this.makeButton(`Play as ${user.handle}`, () => {
        this.cleanup()
        this.resolve?.({ action: 'play', handle: user.handle, token: user.jwt, room: roomFromUrl || undefined })
      })
      btnContainer.appendChild(playBtn)
    } else {
      // Sign in with X
      const authBtn = this.makeButton('Sign in with 𝕏', () => {
        startXAuth()
      })
      btnContainer.appendChild(authBtn)
    }

    // Guest play
    const guestBtn = this.makeButton('Play as Guest', () => {
      const handle = `@anon${Math.floor(Math.random() * 9999)}`
      this.cleanup()
      this.resolve?.({ action: 'play', handle, room: roomFromUrl || undefined })
    })
    guestBtn.style.background = 'transparent'
    guestBtn.style.borderColor = '#2a4a3a'
    guestBtn.style.color = '#4a7a5a'
    btnContainer.appendChild(guestBtn)

    // Room code input
    if (!roomFromUrl) {
      const roomRow = document.createElement('div')
      roomRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;'
      const roomInput = document.createElement('input')
      roomInput.placeholder = 'Room code'
      roomInput.maxLength = 4
      roomInput.style.cssText = `
        flex:1;padding:10px 14px;border:1px solid #2a4a3a;border-radius:8px;
        background:#0a1a10;color:#d0ffe0;font-family:${UI_FONT_FAMILY};font-size:13px;
        outline:none;text-transform:uppercase;
      `
      const joinBtn = this.makeButton('Join', () => {
        const code = roomInput.value.trim().toUpperCase()
        if (code.length === 4) {
          this.cleanup()
          const u = getStoredUser()
          this.resolve?.({ action: 'play', handle: u?.handle || `@anon${Math.floor(Math.random() * 9999)}`, token: u?.jwt, room: code })
        }
      })
      joinBtn.style.width = '80px'
      roomRow.appendChild(roomInput)
      roomRow.appendChild(joinBtn)
      btnContainer.appendChild(roomRow)
    } else {
      const roomLabel = document.createElement('div')
      roomLabel.textContent = `joining room: ${roomFromUrl}`
      roomLabel.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:${RAIN_COLOR};text-align:center;margin-top:8px;opacity:0.6;`
      btnContainer.appendChild(roomLabel)
    }

    container.appendChild(btnContainer)
    this.uiRoot.appendChild(container)
  }

  private makeButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.onclick = onClick
    btn.style.cssText = `
      padding:12px 20px;border:1px solid #3a5a4a;border-radius:8px;
      background:#1a2a1a;color:#d0ffe0;font-family:${BLOB_FONT_FAMILY};
      font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;
      width:100%;
    `
    btn.onmouseenter = () => { btn.style.background = '#2a3a2a'; btn.style.borderColor = '#5a8a6a' }
    btn.onmouseleave = () => { btn.style.background = '#1a2a1a'; btn.style.borderColor = '#3a5a4a' }
    return btn
  }

  private animate = (now: number) => {
    if (this.destroyed) return
    const ctx = this.ctx
    const w = window.innerWidth
    const h = window.innerHeight
    drawBackground(ctx, w, h)
    this.rain.update(0.016)
    this.rain.draw(ctx, w, h)
    requestAnimationFrame(this.animate)
  }

  private cleanup() {
    this.destroyed = true
    this.uiRoot.replaceChildren()
  }
}
```

- [ ] **Step 2: Update src/main.ts — screen router**

```typescript
import { LandingScreen } from './screens/landing'
import { GameScreen } from './screens/game'
import { handleCallback, getStoredUser } from './auth'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:3001'

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

async function main() {
  // Handle OAuth callback
  const params = new URLSearchParams(window.location.search)
  if (params.has('code')) {
    await handleCallback(params.get('code')!)
    window.history.replaceState({}, '', '/')
  }

  showLanding()
}

async function showLanding() {
  const landing = new LandingScreen(canvas)
  const result = await landing.show()

  if (result.action === 'play') {
    startGame(result.handle, result.token, result.room)
  }
}

function startGame(handle: string, token?: string, room?: string) {
  const game = new GameScreen(canvas, handle, {
    mode: 'online',
    serverUrl: `${SERVER_URL}/ws`,
    roomCode: room || null,
    token,
  })
  game.setOnDeath((stats) => {
    // Show death screen, then return to landing
    // For now, restart after a beat
    setTimeout(() => showLanding(), 3000)
  })
  game.start()
}

main()
```

- [ ] **Step 3: Add CORS headers to server for dev**

In `server/index.ts` fetch handler, add CORS headers for local dev:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// At the start of fetch handler:
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders })
}
```

Add `headers: corsHeaders` to all Response objects.

- [ ] **Step 4: Verify full flow**

Run both servers. Open browser → landing screen with "pretext" title, animated rain background. Click "Play as Guest" → enters game, plays against bots. Close tab → room eventually cleans up.

- [ ] **Step 5: Commit**

```bash
git add src/ server/
git commit -m "feat: landing page, screen router, and auth flow"
```

---

## Phase 4: Viral & Share Mechanics

### Task 13: Death Screen with Stats

**Files:**
- Create: `src/screens/death.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create src/screens/death.ts**

```typescript
import { drawBackground } from '../game/background'
import { MatrixRain } from '../game/rain'
import type { DeathStats } from '@shared/protocol'
import { BLOB_FONT_FAMILY, UI_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import { buildShareUrl } from '../share'

export class DeathScreen {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private uiRoot: HTMLElement
  private rain = new MatrixRain()
  private resolve: ((action: 'play' | 'landing') => void) | null = null
  private destroyed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.uiRoot = document.getElementById('ui-root')!
    this.rain.init(window.innerWidth, window.innerHeight)
  }

  show(stats: DeathStats, roomCode: string): Promise<'play' | 'landing'> {
    return new Promise((resolve) => {
      this.resolve = resolve
      this.buildUI(stats, roomCode)
      this.animate(performance.now())
    })
  }

  private buildUI(stats: DeathStats, roomCode: string) {
    const timeStr = formatTime(stats.timeAlive)
    const container = document.createElement('div')
    container.style.cssText = `
      position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;
      font-family:${BLOB_FONT_FAMILY};color:#d0ffe0;
    `

    // "devoured by" header
    const header = document.createElement('div')
    header.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:12px;color:#4a7a5a;margin-bottom:8px;`
    header.textContent = `devoured by ${stats.killedBy}`
    container.appendChild(header)

    // Handle
    const handle = document.createElement('h2')
    handle.textContent = stats.handle
    handle.style.cssText = `font-size:36px;font-weight:700;margin-bottom:24px;color:#d0ffe0;`
    container.appendChild(handle)

    // Stats grid
    const grid = document.createElement('div')
    grid.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px;text-align:center;`
    grid.appendChild(statBlock('kills', String(stats.kills)))
    grid.appendChild(statBlock('alive', timeStr))
    grid.appendChild(statBlock('peak mass', String(Math.round(stats.peakMass))))
    container.appendChild(grid)

    // Victims
    if (stats.victims.length > 0) {
      const victims = document.createElement('div')
      victims.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#3a6a4a;margin-bottom:24px;max-width:400px;text-align:center;line-height:1.8;`
      victims.textContent = `devoured: ${stats.victims.join(' ')}`
      container.appendChild(victims)
    }

    // Buttons
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:12px;'

    const playBtn = document.createElement('button')
    playBtn.textContent = 'Play Again'
    playBtn.style.cssText = `
      padding:12px 24px;border:1px solid #3a5a4a;border-radius:8px;
      background:#1a2a1a;color:#d0ffe0;font-family:${BLOB_FONT_FAMILY};
      font-size:14px;font-weight:600;cursor:pointer;
    `
    playBtn.onclick = () => { this.cleanup(); this.resolve?.('play') }
    btnRow.appendChild(playBtn)

    const shareBtn = document.createElement('button')
    shareBtn.textContent = 'Share on 𝕏'
    shareBtn.style.cssText = `
      padding:12px 24px;border:1px solid #2a4a3a;border-radius:8px;
      background:transparent;color:#4a7a5a;font-family:${BLOB_FONT_FAMILY};
      font-size:14px;font-weight:600;cursor:pointer;
    `
    shareBtn.onclick = () => {
      const url = buildShareUrl('death', stats, roomCode)
      window.open(url, '_blank', 'width=550,height=420')
    }
    btnRow.appendChild(shareBtn)
    container.appendChild(btnRow)

    // Coffee link
    const coffee = document.createElement('a')
    coffee.href = 'https://buymeacoffee.com/nickcernera'
    coffee.target = '_blank'
    coffee.textContent = 'Enjoying pretext? ☕'
    coffee.style.cssText = `font-family:${UI_FONT_FAMILY};font-size:11px;color:#2a4a3a;margin-top:32px;text-decoration:none;`
    container.appendChild(coffee)

    this.uiRoot.appendChild(container)
  }

  private animate = (now: number) => {
    if (this.destroyed) return
    drawBackground(this.ctx, window.innerWidth, window.innerHeight)
    this.rain.update(0.016)
    this.rain.draw(this.ctx, window.innerWidth, window.innerHeight)
    requestAnimationFrame(this.animate)
  }

  private cleanup() {
    this.destroyed = true
    this.uiRoot.replaceChildren()
  }
}

function statBlock(label: string, value: string): HTMLElement {
  const el = document.createElement('div')
  const valEl = document.createElement('div')
  valEl.textContent = value
  valEl.style.cssText = `font-size:28px;font-weight:700;color:#d0ffe0;`
  const labelEl = document.createElement('div')
  labelEl.textContent = label
  labelEl.style.cssText = `font-size:11px;color:#4a7a5a;font-family:"Space Mono",monospace;margin-top:4px;`
  el.appendChild(valEl)
  el.appendChild(labelEl)
  return el
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}
```

- [ ] **Step 2: Wire death screen into main.ts game flow**

Update `startGame`'s `onDeath` handler to show `DeathScreen`, then either restart or return to landing.

- [ ] **Step 3: Commit**

```bash
git add src/screens/death.ts src/main.ts
git commit -m "feat: death screen with stats and share button"
```

---

### Task 14: Share Cards + X Share Intents

**Files:**
- Create: `src/share.ts`
- Modify: `server/cards.ts`

- [ ] **Step 1: Create src/share.ts — client-side share helpers**

```typescript
import type { DeathStats } from '@shared/protocol'

const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://pretext.io'

export function buildShareUrl(
  type: 'death' | 'leaderboard' | 'invite',
  stats?: DeathStats,
  roomCode?: string,
): string {
  let text: string
  const url = roomCode ? `${BASE_URL}/r/${roomCode}` : BASE_URL

  switch (type) {
    case 'death':
      if (stats && stats.kills > 0) {
        text = `Just devoured ${stats.kills} player${stats.kills > 1 ? 's' : ''} on pretext.io before ${stats.killedBy} got me 💀`
      } else {
        text = `Just got devoured by ${stats?.killedBy} on pretext.io 💀`
      }
      break
    case 'leaderboard':
      text = `Ruling the arena on pretext.io 👑 come dethrone me`
      break
    case 'invite':
      text = `Who can eat me? ${url} 🎯`
      break
    default:
      text = `Playing pretext.io — you are your text 🕳️`
  }

  const intentUrl = new URL('https://x.com/intent/tweet')
  intentUrl.searchParams.set('text', text)
  if (type !== 'invite') {
    intentUrl.searchParams.set('url', url)
  }
  return intentUrl.toString()
}

export function copyRoomLink(roomCode: string) {
  const url = `${import.meta.env.VITE_BASE_URL || 'https://pretext.io'}/r/${roomCode}`
  navigator.clipboard.writeText(url)
}
```

- [ ] **Step 2: Create server/cards.ts — server-side share card generation**

This generates a 1200x675 PNG share card. Since we're on the server (Bun), we'll use a canvas-like approach. For v1, generate an SVG string and convert to PNG via a simple endpoint. A full canvas solution (e.g., `@napi-rs/canvas`) can be added later.

```typescript
import type { DeathStats } from '../shared/protocol'

export function generateShareCardSVG(stats: DeathStats, roomCode: string): string {
  const timeStr = formatTime(stats.timeAlive)
  const victims = stats.victims.slice(0, 8).join('  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <defs>
      <radialGradient id="g1" cx="30%" cy="40%" r="50%">
        <stop offset="0%" stop-color="rgba(0,80,60,0.35)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <radialGradient id="g2" cx="70%" cy="60%" r="45%">
        <stop offset="0%" stop-color="rgba(20,50,120,0.3)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="675" fill="#050a08"/>
    <rect width="1200" height="675" fill="url(#g1)"/>
    <rect width="1200" height="675" fill="url(#g2)"/>

    <!-- Handle -->
    <text x="600" y="240" text-anchor="middle" font-family="Space Grotesk,system-ui" font-size="72" font-weight="700" fill="#d0ffe0">${escapeXml(stats.handle)}</text>

    <!-- Stats -->
    <text x="300" y="340" text-anchor="middle" font-family="Space Grotesk,system-ui" font-size="48" font-weight="700" fill="#d0ffe0">${stats.kills}</text>
    <text x="300" y="370" text-anchor="middle" font-family="Space Mono,monospace" font-size="14" fill="#4a7a5a">kills</text>

    <text x="600" y="340" text-anchor="middle" font-family="Space Grotesk,system-ui" font-size="48" font-weight="700" fill="#d0ffe0">${timeStr}</text>
    <text x="600" y="370" text-anchor="middle" font-family="Space Mono,monospace" font-size="14" fill="#4a7a5a">alive</text>

    <text x="900" y="340" text-anchor="middle" font-family="Space Grotesk,system-ui" font-size="48" font-weight="700" fill="#d0ffe0">${Math.round(stats.peakMass)}</text>
    <text x="900" y="370" text-anchor="middle" font-family="Space Mono,monospace" font-size="14" fill="#4a7a5a">peak mass</text>

    <!-- Victims -->
    <text x="600" y="440" text-anchor="middle" font-family="Space Mono,monospace" font-size="16" fill="#3a6a4a">devoured: ${escapeXml(victims)}</text>

    <!-- Footer -->
    <text x="600" y="600" text-anchor="middle" font-family="Space Grotesk,system-ui" font-size="24" font-weight="600" fill="#2a4a3a">pretext.io</text>
    <text x="600" y="630" text-anchor="middle" font-family="Space Mono,monospace" font-size="13" fill="#1a3a2a">${roomCode}</text>
  </svg>`
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 3: Add card endpoint to server/index.ts**

```typescript
// GET /card/:id — serve share card SVG (or PNG via conversion later)
if (url.pathname.startsWith('/card/')) {
  // For v1, serve SVG directly. Browsers and X previews handle SVG fine.
  // Store cards in memory for now, keyed by game event ID.
  const cardId = url.pathname.split('/card/')[1]
  const card = cardStore.get(cardId)
  if (!card) return new Response('Not found', { status: 404 })
  return new Response(card, {
    headers: { 'Content-Type': 'image/svg+xml', ...corsHeaders },
  })
}
```

Add a `cardStore` Map and save cards when players die or leaderboard snapshots fire.

- [ ] **Step 4: Commit**

```bash
git add src/share.ts server/cards.ts server/index.ts
git commit -m "feat: share cards and X share intents"
```

---

### Task 15: Leaderboard Snapshots + OG Tags

**Files:**
- Modify: `server/simulation.ts`, `server/index.ts`
- Modify: `index.html`

- [ ] **Step 1: Trigger share prompt for #1 on leaderboard snapshot**

In `simulation.ts`, when `room.shouldSnapshot()` returns true, find the #1 player. If they have a WebSocket connection, send a special leaderboard message with `isSnapshot: true`. The client shows a toast: "You're #1! Share your reign?" with share button.

Add to hud.ts:

```typescript
showSnapshotToast(handle: string, roomCode: string) {
  // Render a temporary toast in the HUD for 8 seconds
  this.snapshotToast = {
    text: `👑 You're #1! Share your reign?`,
    roomCode,
    expiry: performance.now() + 8000,
  }
}
```

Draw the toast in `hud.draw()` when active — positioned top-center with a clickable area.

- [ ] **Step 2: Add OG meta tags to index.html**

```html
<meta property="og:title" content="pretext — you are your text">
<meta property="og:description" content="Real-time multiplayer text arena. Sign in with X, eat other players, absorb their handles.">
<meta property="og:image" content="https://pretext.io/og.png">
<meta property="og:url" content="https://pretext.io">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="pretext">
<meta name="twitter:description" content="you are your text. eat or be eaten.">
<meta name="twitter:image" content="https://pretext.io/og.png">
```

- [ ] **Step 3: Create a static OG image**

Create a simple `public/og.png` — can be a screenshot of the game or a designed card. For now, create a placeholder with the game's visual identity (grain gradient + "pretext" title + tagline). This can be replaced with a polished version later.

- [ ] **Step 4: Commit**

```bash
git add server/ src/ index.html public/
git commit -m "feat: leaderboard snapshots, share toasts, and OG meta tags"
```

---

## Phase 5: Deployment

### Task 16: Game Server Deployment (Fly.io)

**Files:**
- Create: `server/Dockerfile`, `fly.toml`

- [ ] **Step 1: Create server/Dockerfile**

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY shared/ ./shared/
COPY server/ ./server/

RUN bun install --production

EXPOSE 3001

CMD ["bun", "run", "server/index.ts"]
```

- [ ] **Step 2: Create fly.toml**

```toml
app = "pretext-game"
primary_region = "ewr"

[build]
  dockerfile = "server/Dockerfile"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[env]
  PORT = "3001"
  NODE_ENV = "production"
```

- [ ] **Step 3: Deploy to Fly.io**

```bash
cd /path/to/pretext
fly launch --no-deploy
# Set secrets:
fly secrets set TWITTER_CLIENT_ID=xxx TWITTER_CLIENT_SECRET=xxx JWT_SECRET=xxx REDIRECT_URI=https://pretext.io/callback
fly deploy
```

Verify: `curl https://pretext-game.fly.dev/health` → "ok"

- [ ] **Step 4: Commit**

```bash
git add server/Dockerfile fly.toml
git commit -m "feat: Fly.io deployment config for game server"
```

---

### Task 17: Client Deployment (Vercel) + Domain

**Files:**
- Create: `vercel.json` (or `vercel.ts`)
- Modify: `.env` references

- [ ] **Step 1: Create vercel.json for client deployment**

```json
{
  "buildCommand": "bunx vite build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/r/:code", "destination": "/" },
    { "source": "/callback", "destination": "/" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Set environment variables**

```bash
vercel env add VITE_SERVER_URL production
# Value: wss://pretext-game.fly.dev
vercel env add VITE_BASE_URL production
# Value: https://pretext.io
```

- [ ] **Step 3: Deploy to Vercel**

```bash
vercel --prod
```

- [ ] **Step 4: Configure domain**

Set up `pretext.io` (or chosen domain) in Vercel dashboard. Point DNS records.

- [ ] **Step 5: End-to-end production verification**

1. Open `https://pretext.io` → landing page renders with rain + grain
2. Click "Play as Guest" → connects to Fly.io WebSocket, enters game
3. Play against bots → text reflows in blobs, kill feed works
4. Die → death screen shows stats + "Share on X" works
5. Share link opens X intent with pre-filled text + room link
6. Open `pretext.io/r/TEST` → goes directly to that room

- [ ] **Step 6: Commit**

```bash
git add vercel.json
git commit -m "feat: Vercel deployment config with rewrites"
```

---

## Known Simplifications (Fast-Follow)

Split and eject mechanics are defined in the protocol and constants but not fully implemented in the server simulation. Full split requires multi-fragment tracking per player (each fragment has its own position, mass, and a merge timer). Eject requires spawning inert mass blobs. Both are gameplay-deepening features that can be added after the core eat-or-be-eaten loop is proven fun. The client input (`Space` for split, `W` for eject) is already wired — only server-side handling is missing.

Player bios from X auth are stored on the server (`ServerPlayer.bio`) but not yet forwarded to the client rain system. Wire this through the `state` or `joined` messages and call `rain.setBios()`.

## Post-Deployment Checklist

- [ ] Implement split mechanic in simulation.ts (multi-fragment blobs, merge timer)
- [ ] Implement eject mechanic in simulation.ts (mass projectiles)
- [ ] Wire player bios to client rain system
- [ ] Create a polished OG image (screenshot or designed card)
- [ ] Test X OAuth flow end-to-end in production
- [ ] Verify share cards render correctly in X link previews
- [ ] Update Buy Me a Coffee URL in death screen to actual account
- [ ] Play test with friends, tune game constants (speeds, decay, eat ratio)
- [ ] Post first clip on X to seed the viral loop
