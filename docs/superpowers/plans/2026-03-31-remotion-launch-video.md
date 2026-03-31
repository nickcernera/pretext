# Remotion Launch Video — Real Gameplay Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder React-based blob scene with actual Pretext game rendering — the real renderer, real simulation, real text sea — driven frame-by-frame inside Remotion.

**Architecture:** Import the game's renderer and simulation logic directly into the Remotion project via webpack aliases. Create a deterministic simulation class (seeded PRNG, scripted player path) that re-runs from frame 0 on each render, ensuring scrub-friendly determinism. A Remotion `<canvas>` component drives the game renderer at each frame.

**Tech Stack:** Remotion 4.x, game renderer (Canvas2D), `@chenglou/pretext` (text layout), seeded PRNG

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `video/remotion.config.ts` | Add webpack aliases for `@shared`, `@game` |
| Modify | `video/tsconfig.json` | Add path aliases matching webpack |
| Modify | `video/package.json` | Add `@chenglou/pretext` dependency |
| Create | `video/src/seededRandom.ts` | Deterministic PRNG (mulberry32) |
| Create | `video/src/Simulation.ts` | Headless game simulation, frame-by-frame, seeded |
| Create | `video/src/GameCanvas.tsx` | Remotion component: simulate → render to canvas |
| Create | `video/src/NoopHUD.ts` | Stub HUD that skips DOM operations |
| Modify | `video/src/GlitchTitle.tsx` | Change "PRETEXT" → "PRETEXT ARENA" |
| Modify | `video/src/LaunchVideo.tsx` | Replace BlobScene with GameCanvas, adjust timing |
| Modify | `video/src/Root.tsx` | Update composition ID/metadata |
| Delete | `video/src/BlobScene.tsx` | Replaced by GameCanvas |
| Delete | `video/src/MatrixRain.tsx` | Game renderer handles rain |

---

### Task 1: Configure build system to import game code

**Files:**
- Modify: `video/remotion.config.ts`
- Modify: `video/tsconfig.json`

The game code lives in `../src/game/` and `../shared/`. Remotion uses webpack — add resolve aliases so `@shared/protocol` and `@game/renderer` resolve correctly.

- [ ] **Step 1: Update `remotion.config.ts` with webpack aliases**

```ts
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import path from "path";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig((config) => {
  config.resolve = config.resolve || {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "@shared": path.resolve(__dirname, "../shared"),
    "@game": path.resolve(__dirname, "../src/game"),
  };
  return enableTailwind(config);
});
```

- [ ] **Step 2: Update `tsconfig.json` with matching paths**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2020",
    "lib": ["ES2023", "DOM"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"],
      "@game/*": ["../src/game/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Install `@chenglou/pretext` in the video project**

```bash
cd video && npm install @chenglou/pretext
```

- [ ] **Step 4: Verify imports resolve**

Create a temp test file `video/src/_test_imports.ts`:
```ts
import type { PlayerState } from "@shared/protocol";
import { WORLD_W } from "@shared/constants";
import { Renderer } from "@game/renderer";
const _: PlayerState | typeof WORLD_W | typeof Renderer = null!;
```

Run: `cd video && npx tsc --noEmit`
Expected: PASS — no resolution errors. Delete the test file after.

- [ ] **Step 5: Commit**

```bash
git add video/remotion.config.ts video/tsconfig.json video/package.json video/package-lock.json
git commit -m "feat(video): configure webpack/ts aliases to import game code"
```

---

### Task 2: Create seeded PRNG

**Files:**
- Create: `video/src/seededRandom.ts`

The game simulation uses `Math.random()` extensively (bot positions, wander targets, pellet spawns). For deterministic video rendering, we need a seeded replacement that produces identical sequences given the same seed.

- [ ] **Step 1: Write seeded PRNG (mulberry32)**

```ts
// video/src/seededRandom.ts

/**
 * Mulberry32 — fast 32-bit seeded PRNG.
 * Returns a function that produces deterministic floats in [0, 1).
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add video/src/seededRandom.ts
git commit -m "feat(video): add seeded PRNG for deterministic simulation"
```

---

### Task 3: Create NoopHUD stub

**Files:**
- Create: `video/src/NoopHUD.ts`

The game `Renderer` instantiates a `HUD` class which creates DOM elements (toasts, overlays) and imports `../share` (browser-only). For the video we skip HUD entirely — cleaner promo look, no DOM side effects.

- [ ] **Step 1: Write the NoopHUD class**

Must match the interface that `Renderer.draw()` calls: `hud.draw(ctx, w, h, players, localId)`.

```ts
// video/src/NoopHUD.ts
import type { LeaderboardEntry, PlayerState } from "@shared/protocol";

/** Drop-in HUD replacement that draws nothing and creates no DOM elements. */
export class NoopHUD {
  setLeaderboard(_entries: LeaderboardEntry[]) {}
  setPlayerStats(_mass: number, _kills: number) {}
  setRoomCode(_code: string) {}
  addKillEvent(_killer: string, _victim: string) {}
  showKillToast(_victim: string, _room: string) {}
  showSnapshotToast(_handle: string, _room: string) {}
  setupKeyListeners(_room: string) {}
  destroy() {}
  draw(
    _ctx: CanvasRenderingContext2D,
    _w: number,
    _h: number,
    _players: PlayerState[],
    _localId: string,
  ) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add video/src/NoopHUD.ts
git commit -m "feat(video): add NoopHUD stub for headless rendering"
```

---

### Task 4: Create deterministic simulation

**Files:**
- Create: `video/src/Simulation.ts`

Extracts the local-mode simulation from `GameScreen` into a standalone class that:
- Uses seeded PRNG (not `Math.random()`)
- Accepts a scripted player path (waypoints) instead of cursor input
- Advances state with `step(dt)` and returns `PlayerState[]` + `PelletState[]`
- Can be **reset and re-run** from any starting state (enables scrub-friendly Remotion rendering)

The player follows a predetermined path through the world, eating pellets and encountering bots naturally.

- [ ] **Step 1: Write the Simulation class**

```ts
// video/src/Simulation.ts
import {
  WORLD_W, WORLD_H, BASE_SPEED, SPEED_EXPONENT,
  MASS_DECAY_RATE, MIN_MASS, EAT_RATIO, EAT_OVERLAP,
  PELLET_COUNT, PELLET_MASS_PER_CHAR,
} from "@shared/constants";
import {
  handleToColor, massToRadius, pelletRadius,
  type PlayerState, type PelletState,
} from "@shared/protocol";
import { createRng } from "./seededRandom";

// --- Types (mirrored from GameScreen, no browser deps) ---

type LocalCell = {
  cellId: number;
  x: number;
  y: number;
  mass: number;
  vx: number;
  vy: number;
};

type Entity = {
  id: string;
  handle: string;
  color: string;
  cells: LocalCell[];
};

type Bot = Entity & {
  targetX: number;
  targetY: number;
  wanderTimer: number;
};

type Pellet = { id: number; x: number; y: number; word: string };

type Waypoint = { x: number; y: number };

// --- Constants ---

const BOT_HANDLES = [
  "@synthwave", "@tensorcat", "@pixeldrift", "@neuralnet",
  "@bitshift", "@zeroday", "@kernelpanic", "@darkmode",
  "@overfit", "@gradientdrop", "@quantum_bit", "@nullpointer",
];

const PELLET_WORDS = [
  "async", "await", "void", "null", "fork", "malloc", "mutex",
  "pipe", "exec", "sudo", "chmod", "grep", "awk", "curl",
  "ssh", "git", "npm", "lint", "parse", "eval", "yield",
  "defer", "panic", "spawn", "kill", "trace", "dump", "push",
  "pop", "peek", "shift", "splice", "slice", "map", "reduce",
  "filter", "bind", "call", "apply", "proxy", "reflect",
  "tensor", "epoch", "batch", "dropout", "relu", "softmax",
];

export class Simulation {
  private rng: () => number;
  private player: Entity;
  private bots: Bot[];
  private pellets: Pellet[];
  private nextPelletId: number;
  private playerTexts: Map<string, string>;
  private waypoints: Waypoint[];
  private waypointIndex = 0;
  private waypointProgress = 0;

  constructor(seed: number, waypoints: Waypoint[]) {
    this.rng = createRng(seed);
    this.waypoints = waypoints;
    this.playerTexts = new Map();

    // Spawn player near first waypoint
    const start = waypoints[0] || { x: WORLD_W / 2, y: WORLD_H / 2 };
    this.player = {
      id: "player",
      handle: "@you",
      color: handleToColor("@you"),
      cells: [{ cellId: 0, x: start.x, y: start.y, mass: 150, vx: 0, vy: 0 }],
    };
    this.playerTexts.set("player", "@you");

    // Spawn bots
    this.bots = BOT_HANDLES.map((h) => this.createBot(h));

    // Spawn pellets
    this.pellets = [];
    this.nextPelletId = 0;
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet());
    }
  }

  /** Clone the full simulation state for reset-and-replay. */
  static fromSeed(seed: number, waypoints: Waypoint[]): Simulation {
    return new Simulation(seed, waypoints);
  }

  /** Advance simulation by dt seconds. */
  step(dt: number): void {
    this.movePlayerAlongPath(dt);
    this.updateBots(dt);
    this.decayMass(dt);
    this.eatPellets();
    this.checkCollisions();
    this.replenishPellets();
  }

  /** Run N steps of 1/fps duration each. */
  runToFrame(frame: number, fps: number): void {
    const dt = 1 / fps;
    for (let i = 0; i < frame; i++) {
      this.step(dt);
    }
  }

  getPlayers(): PlayerState[] {
    return [this.toPS(this.player), ...this.bots.map((b) => this.toPS(b))];
  }

  getPellets(): PelletState[] {
    return this.pellets;
  }

  getPlayerTexts(): Map<string, string> {
    return this.playerTexts;
  }

  getLocalPlayerId(): string {
    return "player";
  }

  // --- Internal ---

  private toPS(e: Entity): PlayerState {
    let tm = 0, wx = 0, wy = 0;
    for (const c of e.cells) { wx += c.x * c.mass; wy += c.y * c.mass; tm += c.mass; }
    if (tm === 0) tm = 1;
    return {
      id: e.id, handle: e.handle,
      x: wx / tm, y: wy / tm, mass: tm,
      color: e.color, avatar: "",
      cells: e.cells.map((c) => ({ cellId: c.cellId, x: c.x, y: c.y, mass: c.mass })),
    };
  }

  private movePlayerAlongPath(dt: number) {
    const cell = this.player.cells[0];
    if (!cell || this.waypoints.length < 2) return;

    const from = this.waypoints[this.waypointIndex % this.waypoints.length];
    const to = this.waypoints[(this.waypointIndex + 1) % this.waypoints.length];

    // Advance along path
    const speed = BASE_SPEED * Math.pow(100 / cell.mass, SPEED_EXPONENT);
    const segDx = to.x - from.x;
    const segDy = to.y - from.y;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy) || 1;
    this.waypointProgress += (speed * dt) / segLen;

    if (this.waypointProgress >= 1) {
      this.waypointProgress -= 1;
      this.waypointIndex++;
    }

    const t = this.waypointProgress;
    const tx = from.x + (to.x - from.x) * t;
    const ty = from.y + (to.y - from.y) * t;

    // Move toward target
    const dx = tx - cell.x;
    const dy = ty - cell.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      const move = Math.min(dist, speed * dt);
      cell.x += (dx / dist) * move;
      cell.y += (dy / dist) * move;
    }

    const r = massToRadius(cell.mass);
    cell.x = Math.max(r, Math.min(WORLD_W - r, cell.x));
    cell.y = Math.max(r, Math.min(WORLD_H - r, cell.y));
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      const cell = bot.cells[0];
      if (!cell) continue;

      bot.wanderTimer -= dt;
      if (bot.wanderTimer <= 0) {
        bot.targetX = this.rng() * WORLD_W;
        bot.targetY = this.rng() * WORLD_H;
        bot.wanderTimer = 3 + this.rng() * 5;
      }

      // Simple flee/chase vs player
      const pc = this.player.cells[0];
      if (pc) {
        const dx = pc.x - cell.x;
        const dy = pc.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400) {
          if (pc.mass > cell.mass * EAT_RATIO) {
            // Flee
            const nx = -dx / (dist || 1);
            const ny = -dy / (dist || 1);
            bot.targetX = cell.x + nx * 500;
            bot.targetY = cell.y + ny * 500;
          } else if (cell.mass > pc.mass * EAT_RATIO) {
            // Chase
            bot.targetX = pc.x;
            bot.targetY = pc.y;
          }
        }
      }

      // Bot vs bot chase/flee
      for (const other of this.bots) {
        if (other === bot) continue;
        const oc = other.cells[0];
        if (!oc) continue;
        const dx = oc.x - cell.x;
        const dy = oc.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400 && oc.mass > cell.mass * EAT_RATIO) {
          bot.targetX = cell.x - dx;
          bot.targetY = cell.y - dy;
        }
      }

      // Move toward target
      const dx = bot.targetX - cell.x;
      const dy = bot.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const speed = BASE_SPEED * Math.pow(100 / cell.mass, SPEED_EXPONENT);
        const move = Math.min(dist, speed * dt);
        cell.x += (dx / dist) * move;
        cell.y += (dy / dist) * move;
      }
      const r = massToRadius(cell.mass);
      cell.x = Math.max(r, Math.min(WORLD_W - r, cell.x));
      cell.y = Math.max(r, Math.min(WORLD_H - r, cell.y));
    }
  }

  private decayMass(dt: number) {
    const decay = (cells: LocalCell[]) => {
      for (const c of cells) {
        if (c.mass > MIN_MASS) {
          c.mass -= c.mass * MASS_DECAY_RATE * dt;
          if (c.mass < MIN_MASS) c.mass = MIN_MASS;
        }
      }
    };
    decay(this.player.cells);
    for (const b of this.bots) decay(b.cells);
  }

  private eatPellets() {
    const eat = (entity: Entity) => {
      for (const cell of entity.cells) {
        const cr = massToRadius(cell.mass);
        for (let i = this.pellets.length - 1; i >= 0; i--) {
          const p = this.pellets[i];
          const dx = cell.x - p.x;
          const dy = cell.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < cr + pelletRadius(p.word)) {
            cell.mass += p.word.length * PELLET_MASS_PER_CHAR;
            const existing = this.playerTexts.get(entity.id) || entity.handle;
            this.playerTexts.set(entity.id, existing + " " + p.word);
            this.pellets.splice(i, 1);
          }
        }
      }
    };
    eat(this.player);
    for (const b of this.bots) eat(b);
  }

  private checkCollisions() {
    // Player eats bots
    for (let bi = this.bots.length - 1; bi >= 0; bi--) {
      const bot = this.bots[bi];
      const bc = bot.cells[0];
      if (!bc) continue;
      for (const pc of this.player.cells) {
        const pcR = massToRadius(pc.mass);
        const bcR = massToRadius(bc.mass);
        const dx = pc.x - bc.x;
        const dy = pc.y - bc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pc.mass >= bc.mass * EAT_RATIO && dist < pcR * EAT_OVERLAP + bcR * (1 - EAT_OVERLAP)) {
          pc.mass += bc.mass;
          const existing = this.playerTexts.get("player") || "@you";
          this.playerTexts.set("player", existing + " " + bot.handle);
          this.bots[bi] = this.createBot(bot.handle);
          break;
        }
      }
    }

    // Bot-on-bot
    for (let i = 0; i < this.bots.length; i++) {
      for (let j = i + 1; j < this.bots.length; j++) {
        const ac = this.bots[i].cells[0];
        const bc = this.bots[j].cells[0];
        if (!ac || !bc) continue;
        const dx = ac.x - bc.x;
        const dy = ac.y - bc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const acR = massToRadius(ac.mass);
        const bcR = massToRadius(bc.mass);
        if (ac.mass >= bc.mass * EAT_RATIO && dist < acR * EAT_OVERLAP + bcR * (1 - EAT_OVERLAP)) {
          ac.mass += bc.mass;
          this.bots[j] = this.createBot(this.bots[j].handle);
        } else if (bc.mass >= ac.mass * EAT_RATIO && dist < bcR * EAT_OVERLAP + acR * (1 - EAT_OVERLAP)) {
          bc.mass += ac.mass;
          this.bots[i] = this.createBot(this.bots[i].handle);
        }
      }
    }
  }

  private replenishPellets() {
    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push(this.spawnPellet());
    }
  }

  private createBot(handle: string): Bot {
    const mass = 100 + this.rng() * 300;
    return {
      id: `bot-${handle}`,
      handle,
      color: handleToColor(handle),
      cells: [{
        cellId: 0,
        x: this.rng() * WORLD_W,
        y: this.rng() * WORLD_H,
        mass, vx: 0, vy: 0,
      }],
      targetX: this.rng() * WORLD_W,
      targetY: this.rng() * WORLD_H,
      wanderTimer: 3 + this.rng() * 5,
    };
  }

  private spawnPellet(): Pellet {
    return {
      id: this.nextPelletId++,
      x: this.rng() * WORLD_W,
      y: this.rng() * WORLD_H,
      word: PELLET_WORDS[Math.floor(this.rng() * PELLET_WORDS.length)],
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd video && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add video/src/Simulation.ts
git commit -m "feat(video): add deterministic headless simulation for video rendering"
```

---

### Task 5: Create GameCanvas Remotion component

**Files:**
- Create: `video/src/GameCanvas.tsx`

This is the core integration piece. A Remotion component that:
1. Creates a fresh `Simulation` + game `Renderer` on mount
2. On each frame: re-simulates from frame 0 (deterministic) → feeds state to renderer → draws to canvas
3. Uses `delayRender`/`continueRender` to wait for font loading

**Key design decisions:**
- **Re-simulation per frame** ensures scrub-friendly rendering. At 480 frames max, this costs ~1ms per render (simulation is pure math).
- **NoopHUD** replaces the real HUD to avoid DOM side effects.
- **`performance.now()`** in blob.ts uses real time for wobble — this is fine since blob physics are visual-only and don't need strict determinism.

- [ ] **Step 1: Write the GameCanvas component**

```tsx
// video/src/GameCanvas.tsx
import { useCallback, useEffect, useRef } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Renderer } from "@game/renderer";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";

const SEED = 42;

/**
 * Player path: a scenic route through the world that passes near pellets
 * and bots. Coordinates are world-space (0–4000).
 */
const WAYPOINTS = [
  { x: 1800, y: 1800 },
  { x: 2200, y: 1600 },
  { x: 2600, y: 1800 },
  { x: 2800, y: 2200 },
  { x: 2400, y: 2600 },
  { x: 2000, y: 2400 },
  { x: 1600, y: 2000 },
  { x: 1800, y: 1800 }, // loop back
];

export const GameCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const delayRef = useRef<number | null>(null);

  // Initialize renderer once
  useEffect(() => {
    const renderer = new Renderer();
    // Replace HUD with noop to avoid DOM side effects
    (renderer as any).hud = new NoopHUD();
    renderer.init(width, height);
    // Set handles for rain corpus
    const handles = ["@you", ...["@synthwave", "@tensorcat", "@pixeldrift", "@neuralnet",
      "@bitshift", "@zeroday", "@kernelpanic", "@darkmode",
      "@overfit", "@gradientdrop", "@quantum_bit", "@nullpointer"]];
    renderer.rain.setHandles(handles);
    rendererRef.current = renderer;
  }, [width, height]);

  // Render each frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Re-simulate from scratch for this frame (deterministic)
    const sim = Simulation.fromSeed(SEED, WAYPOINTS);
    sim.runToFrame(frame, fps);

    const players = sim.getPlayers();
    const pellets = sim.getPellets();
    const playerTexts = sim.getPlayerTexts();

    // Feed state to renderer subsystems
    renderer.pellets.setPellets(pellets);
    // Feed local cell positions for pellet magnetism
    const localPlayer = players.find((p) => p.id === "player");
    if (localPlayer) {
      renderer.pellets.setLocalCells(
        localPlayer.cells.map((c) => ({
          x: c.x,
          y: c.y,
          radius: Math.sqrt(c.mass / Math.PI) * 4,
        })),
      );
    }

    // Render frame — use frame-based timestamp for animations
    const now = (frame / fps) * 1000;
    renderer.draw(ctx, width, height, players, "player", playerTexts, now);
  }, [frame, fps, width, height]);

  return (
    <AbsoluteFill>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
```

**Note on `performance.now()` in blob.ts:** The blob wobble/spasm animations call `performance.now()` internally. In Remotion's Chromium renderer, this returns real wall-clock time. For the video, this means wobble won't be perfectly deterministic between renders, but wobble is subtle enough that this is invisible. If needed later, we can monkey-patch `performance.now` to return the frame timestamp.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd video && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add video/src/GameCanvas.tsx
git commit -m "feat(video): add GameCanvas component with real renderer integration"
```

---

### Task 6: Update title and wire into composition

**Files:**
- Modify: `video/src/GlitchTitle.tsx` — change title text
- Modify: `video/src/LaunchVideo.tsx` — replace BlobScene, adjust timing
- Modify: `video/src/Root.tsx` — update composition ID
- Delete: `video/src/BlobScene.tsx`
- Delete: `video/src/MatrixRain.tsx`

- [ ] **Step 1: Update GlitchTitle to "PRETEXT ARENA"**

In `video/src/GlitchTitle.tsx`, change line:
```ts
const TITLE = "PRETEXT";
```
to:
```ts
const TITLE = "PRETEXT ARENA";
```

Also reduce font size to fit (two words): change `fontSize: 150` to `fontSize: 120` and adjust gap.

- [ ] **Step 2: Rewrite LaunchVideo with GameCanvas background**

The gameplay canvas runs the entire duration. Title and CTA overlay on top with opacity animations.

```tsx
// video/src/LaunchVideo.tsx
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GameCanvas } from "./GameCanvas";
import { GlitchTitle } from "./GlitchTitle";
import { Typewriter } from "./Typewriter";
import { CallToAction } from "./CallToAction";

export const LaunchVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in from black at start
  const fadeIn = interpolate(frame, [0, fps * 1.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade to black at end
  const fadeOut = interpolate(
    frame,
    [fps * 14.5, fps * 16],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const masterOpacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      {/* Layer 1: Real gameplay (full duration) */}
      <AbsoluteFill style={{ opacity: masterOpacity }}>
        <GameCanvas />
      </AbsoluteFill>

      {/* Layer 2: Dark overlay for title readability */}
      <Sequence from={0} durationInFrames={fps * 6}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(5, 10, 8, ${interpolate(
              frame,
              [0, fps * 4, fps * 6],
              [0.5, 0.5, 0],
              { extrapolateRight: "clamp" },
            )})`,
          }}
        />
      </Sequence>

      {/* Scene 1: Title glitch decode (0–5s) */}
      <Sequence from={0} durationInFrames={fps * 5}>
        <GlitchTitle />
      </Sequence>

      {/* Scene 1b: Tagline typewriter (2.5–6s) */}
      <Sequence
        from={Math.floor(fps * 2.5)}
        durationInFrames={Math.floor(fps * 3.5)}
        layout="none"
      >
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 200,
          }}
        >
          <Typewriter
            text="eat words. absorb players. become the text."
            fontSize={32}
            charsPerFrame={2}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: CTA (13–16s) — dark overlay + text */}
      <Sequence from={fps * 13} durationInFrames={fps * 3}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(5, 10, 8, ${interpolate(
              frame - fps * 13,
              [0, fps * 0.5],
              [0, 0.5],
              { extrapolateRight: "clamp" },
            )})`,
          }}
        />
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Update Root.tsx composition ID**

```tsx
<Composition
  id="PrextextArenaLaunch"
  component={LaunchVideo}
  durationInFrames={480}
  fps={30}
  width={1920}
  height={1080}
/>
```

- [ ] **Step 4: Delete unused files**

```bash
rm video/src/BlobScene.tsx video/src/MatrixRain.tsx
```

- [ ] **Step 5: Verify build**

Run: `cd video && npx tsc --noEmit`
Expected: PASS — no errors

- [ ] **Step 6: Commit**

```bash
git add -u video/src/
git commit -m "feat(video): integrate real game renderer with title overlays"
```

---

### Task 7: Smoke test in Remotion Studio

**Files:** None (verification only)

- [ ] **Step 1: Start Remotion Studio**

```bash
cd video && npm run dev
```

Expected: Studio opens at `http://localhost:3000`

- [ ] **Step 2: Verify rendering**

- Select "PrextextArenaLaunch" composition
- Frame 0: Should show game world with black fade-in + scrambling title
- Frame ~60 (2s): Title "PRETEXT ARENA" should be fully decoded, green glow
- Frame ~150 (5s): Title fading, gameplay visible — player blob + text sea + pellets
- Frame ~300 (10s): Player has eaten pellets and possibly a bot — blob bigger, text inside
- Frame ~420 (14s): CTA "PLAY NOW" + "pretextarena.io" over darkened gameplay

- [ ] **Step 3: Adjust waypoints if needed**

If the player path doesn't cross enough pellets or bots, edit the `WAYPOINTS` array in `GameCanvas.tsx` to route through denser areas.

---

## Performance Notes

- **Re-simulation per frame**: At 480 simulation steps max, each ~0.1ms, worst case is ~50ms per frame. Remotion Studio may feel slightly sluggish on scrub but final render (`npx remotion render`) processes frames sequentially and is unaffected.
- **Optimization if needed**: Cache simulation snapshots every N frames and replay from the nearest snapshot. Not needed until proven slow.
- **Canvas font loading**: The game renderer measures text widths on first use. Remotion's Chromium has fonts available after loading — the `@remotion/google-fonts` imports in `fonts.ts` ensure Space Grotesk and Space Mono are loaded before rendering begins.

## Render Command

```bash
cd video && npx remotion render PrextextArenaLaunch out/pretext-arena-launch.mp4
```
