# Launch Video V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Remotion launch video with a homepage intro, three scripted gameplay acts (spawn → hunt → domination with split), flash cuts, scanlines, speed ramp, and CTA.

**Architecture:** The video is a 480-frame (16s) Remotion composition. The homepage intro is built with React components recreating the landing page aesthetic. Each gameplay act is a separate `GameCanvas` with its own `Simulation` configured via `ActConfig`. The simulation is enhanced with split mechanics, scripted events, and per-act bot/pellet configuration. Visual effects (flash cuts, scanlines, speed ramp) are layered Remotion sequences.

**Tech Stack:** Remotion 4.x, `@chenglou/pretext` (text layout for homepage sea), game Canvas2D renderer, seeded PRNG

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `video/src/ActConfig.ts` | ActConfig type + 3 act configurations |
| Create | `video/src/HomepageScene.tsx` | Full homepage intro scene (sea + panel + cursor) |
| Create | `video/src/GreenFlash.tsx` | 2-3 frame green flash for transitions |
| Create | `video/src/ScanlineOverlay.tsx` | CRT scanline overlay |
| Modify | `video/src/Simulation.ts` | Add ActConfig constructor, split mechanic, scripted events, speed multiplier |
| Modify | `video/src/GameCanvas.tsx` | Accept ActConfig prop, wire up per-act simulation |
| Modify | `video/src/LaunchVideo.tsx` | New timeline: homepage → 3 acts → CTA |
| Delete | `video/src/GlitchTitle.tsx` | Replaced by HomepageScene |

---

### Task 1: Create ActConfig types and act definitions

**Files:**
- Create: `video/src/ActConfig.ts`

Defines the configuration type for each gameplay act and the three specific act configs.

- [ ] **Step 1: Create ActConfig.ts**

```ts
// video/src/ActConfig.ts
import { WORLD_W, WORLD_H } from "@shared/constants";

export type Waypoint = { x: number; y: number };

export type BotConfig = {
  handle: string;
  mass: number;
  x: number;
  y: number;
  /** If true, bot aggressively chases player regardless of mass */
  forceChase?: boolean;
};

export type ScriptedEvent =
  | { frame: number; type: "split" }
  | { frame: number; type: "shake" };

export type PelletCluster = {
  cx: number;
  cy: number;
  radius: number;
  count: number;
};

export type ActConfig = {
  seed: number;
  playerHandle: string;
  playerMass: number;
  playerStart: Waypoint;
  /** Pre-existing text inside blob (e.g., previously eaten words) */
  playerTexts?: string;
  waypoints: Waypoint[];
  bots: BotConfig[];
  /** Dense pellet cluster near the action. Regular pellets still spawn too. */
  pelletCluster?: PelletCluster;
  events: ScriptedEvent[];
  /** Frames where speed drops to 0.5x (inclusive range) */
  slowMoRange?: [number, number];
};

// --- Act 1: The Spawn ---
// Small blob, tight camera, eating word pellets in a dense cluster.
export const ACT_1: ActConfig = {
  seed: 100,
  playerHandle: "@cerneradesign",
  playerMass: 100,
  playerStart: { x: 2000, y: 2000 },
  waypoints: [
    { x: 2000, y: 2000 },
    { x: 2150, y: 1900 },
    { x: 2300, y: 1950 },
    { x: 2400, y: 2100 },
    { x: 2300, y: 2250 },
    { x: 2100, y: 2200 },
    { x: 2000, y: 2000 },
  ],
  bots: [
    { handle: "@synthwave", mass: 120, x: 3200, y: 3200 },
    { handle: "@tensorcat", mass: 100, x: 800, y: 800 },
    { handle: "@pixeldrift", mass: 90, x: 3500, y: 1000 },
  ],
  pelletCluster: { cx: 2200, cy: 2000, radius: 400, count: 40 },
  events: [],
};

// --- Act 2: The Hunt ---
// Medium blob, large @kernelpanic chasing. Flee, eat, turn tables.
export const ACT_2: ActConfig = {
  seed: 200,
  playerHandle: "@cerneradesign",
  playerMass: 300,
  playerStart: { x: 1500, y: 2000 },
  playerTexts: "@cerneradesign async void malloc grep",
  waypoints: [
    { x: 1500, y: 2000 },
    { x: 1200, y: 1800 }, // flee direction
    { x: 1000, y: 1600 }, // through pellet cluster
    { x: 1100, y: 1400 },
    { x: 1400, y: 1300 }, // gained mass, loop back
    { x: 1700, y: 1500 }, // turn toward kernelpanic
    { x: 1800, y: 1800 },
  ],
  bots: [
    { handle: "@kernelpanic", mass: 500, x: 1800, y: 2200, forceChase: true },
    { handle: "@darkmode", mass: 80, x: 3000, y: 3000 },
    { handle: "@nullpointer", mass: 100, x: 500, y: 500 },
  ],
  pelletCluster: { cx: 1100, cy: 1500, radius: 350, count: 50 },
  events: [],
};

// --- Act 3: The Domination ---
// Huge blob, split toward 3 clustered small bots.
export const ACT_3: ActConfig = {
  seed: 300,
  playerHandle: "@cerneradesign",
  playerMass: 800,
  playerStart: { x: 1800, y: 2000 },
  playerTexts: "@cerneradesign @kernelpanic async void malloc grep fork exec sudo tensor",
  waypoints: [
    { x: 1800, y: 2000 },
    { x: 2000, y: 2000 },
    { x: 2200, y: 2000 },
    { x: 2400, y: 2000 }, // approaching bot cluster
    { x: 2500, y: 2000 },
  ],
  bots: [
    { handle: "@overfit", mass: 120, x: 2500, y: 1950 },
    { handle: "@bitshift", mass: 100, x: 2550, y: 2050 },
    { handle: "@zeroday", mass: 130, x: 2600, y: 2000 },
    { handle: "@darkmode", mass: 80, x: 3500, y: 3500 },
  ],
  events: [
    { frame: 60, type: "split" }, // ~2s in, when close to cluster
  ],
  slowMoRange: [55, 75], // slow-mo around the split
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/nickcernera/projects/experiments/pretext/video && npx tsc --noEmit 2>&1 | grep -v node_modules`
Expected: No errors from `video/src/`

- [ ] **Step 3: Commit**

```bash
git add video/src/ActConfig.ts
git commit -m "feat(video): add ActConfig types and 3 act configurations"
```

---

### Task 2: Enhance Simulation with ActConfig, split, and scripted events

**Files:**
- Modify: `video/src/Simulation.ts`

Major changes:
1. Constructor accepts `ActConfig` instead of seed + waypoints
2. Add split mechanic (player cell divides, halves shoot apart, decelerate, merge back)
3. Add scripted event processing (split at specific frames)
4. Support `forceChase` bots
5. Support `pelletCluster` (spawn dense pellets in a specific area)
6. Track current frame for event timing
7. Support speed multiplier via `slowMoRange`

- [ ] **Step 1: Rewrite Simulation.ts**

Replace the entire file with the enhanced version. Key changes from current:

```ts
// video/src/Simulation.ts
import {
  WORLD_W, WORLD_H, BASE_SPEED, SPEED_EXPONENT,
  MASS_DECAY_RATE, MIN_MASS, EAT_RATIO, EAT_OVERLAP,
  PELLET_COUNT, PELLET_MASS_PER_CHAR,
  SPLIT_VELOCITY, SPLIT_DECEL, MERGE_TIME, TICK_RATE,
} from "@shared/constants";
import {
  handleToColor, massToRadius, pelletRadius,
  type PlayerState, type PelletState,
} from "@shared/protocol";
import { createRng } from "./seededRandom";
import type { ActConfig, BotConfig, Waypoint } from "./ActConfig";

type LocalCell = {
  cellId: number;
  x: number;
  y: number;
  mass: number;
  vx: number;
  vy: number;
  splitTime: number; // frame when this cell was created from split
};

type Entity = {
  id: string;
  handle: string;
  color: string;
  cells: LocalCell[];
  nextCellId: number;
};

type Bot = Entity & {
  targetX: number;
  targetY: number;
  wanderTimer: number;
  forceChase: boolean;
};

type Pellet = { id: number; x: number; y: number; word: string };

const PELLET_WORDS = [
  "async", "await", "void", "null", "fork", "malloc", "mutex",
  "pipe", "exec", "sudo", "chmod", "grep", "awk", "curl",
  "ssh", "git", "npm", "lint", "parse", "eval", "yield",
  "defer", "panic", "spawn", "kill", "trace", "dump", "push",
  "pop", "peek", "shift", "splice", "slice", "map", "reduce",
  "filter", "bind", "call", "apply", "proxy", "reflect",
  "tensor", "epoch", "batch", "dropout", "relu", "softmax",
];

// Merge time in frames (MERGE_TIME is in ms, convert at 30fps)
const MERGE_FRAMES = Math.round((MERGE_TIME / 1000) * 30);

export class Simulation {
  private rng: () => number;
  private player: Entity;
  private bots: Bot[];
  private pellets: Pellet[];
  private nextPelletId = 0;
  private playerTexts: Map<string, string>;
  private waypoints: Waypoint[];
  private waypointIndex = 0;
  private waypointProgress = 0;
  private config: ActConfig;
  private currentFrame = 0;

  constructor(config: ActConfig) {
    this.config = config;
    this.rng = createRng(config.seed);
    this.waypoints = config.waypoints;
    this.playerTexts = new Map();

    const start = config.playerStart;
    this.player = {
      id: "player",
      handle: config.playerHandle,
      color: handleToColor(config.playerHandle),
      cells: [{
        cellId: 0, x: start.x, y: start.y,
        mass: config.playerMass, vx: 0, vy: 0, splitTime: -9999,
      }],
      nextCellId: 1,
    };
    this.playerTexts.set("player", config.playerTexts || config.playerHandle);

    // Spawn configured bots
    this.bots = config.bots.map((bc) => this.createBotFromConfig(bc));

    // Spawn regular pellets
    this.pellets = [];
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet());
    }

    // Spawn pellet cluster if configured
    if (config.pelletCluster) {
      const { cx, cy, radius, count } = config.pelletCluster;
      for (let i = 0; i < count; i++) {
        const angle = this.rng() * Math.PI * 2;
        const dist = this.rng() * radius;
        this.pellets.push({
          id: this.nextPelletId++,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          word: PELLET_WORDS[Math.floor(this.rng() * PELLET_WORDS.length)],
        });
      }
    }
  }

  static fromConfig(config: ActConfig): Simulation {
    return new Simulation(config);
  }

  step(dt: number): void {
    // Process scripted events for this frame
    for (const event of this.config.events) {
      if (event.frame === this.currentFrame) {
        if (event.type === "split") this.splitPlayer();
      }
    }

    this.movePlayerAlongPath(dt);
    this.moveSplitCells(dt);
    this.resolvePlayerCells();
    this.updateBots(dt);
    this.decayMass(dt);
    this.eatPellets();
    this.checkCollisions();
    this.replenishPellets();
    this.currentFrame++;
  }

  runToFrame(frame: number, fps: number): void {
    for (let i = 0; i < frame; i++) {
      // Apply slow-mo: half dt during the slow-mo range
      const inSlowMo = this.config.slowMoRange &&
        i >= this.config.slowMoRange[0] && i <= this.config.slowMoRange[1];
      const dt = inSlowMo ? 0.5 / fps : 1 / fps;
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

  // --- Split mechanic ---

  private splitPlayer(): void {
    const p = this.player;
    const toAdd: LocalCell[] = [];

    for (const cell of p.cells) {
      if (cell.mass < 100) continue; // need some mass to split
      if (p.cells.length + toAdd.length >= 8) break;

      const halfMass = cell.mass / 2;
      cell.mass = halfMass;

      // Find nearest bot to target the split toward
      let targetX = cell.x + 200;
      let targetY = cell.y;
      let minDist = Infinity;
      for (const bot of this.bots) {
        const bc = bot.cells[0];
        if (!bc) continue;
        const dx = bc.x - cell.x;
        const dy = bc.y - cell.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) {
          minDist = d;
          targetX = bc.x;
          targetY = bc.y;
        }
      }

      const dx = targetX - cell.x;
      const dy = targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      toAdd.push({
        cellId: p.nextCellId++,
        x: cell.x + nx * massToRadius(halfMass),
        y: cell.y + ny * massToRadius(halfMass),
        mass: halfMass,
        vx: nx * SPLIT_VELOCITY,
        vy: ny * SPLIT_VELOCITY,
        splitTime: this.currentFrame,
      });
      cell.splitTime = this.currentFrame;
    }
    p.cells.push(...toAdd);
  }

  private moveSplitCells(dt: number): void {
    for (const cell of this.player.cells) {
      if (cell.vx === 0 && cell.vy === 0) continue;
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      const decel = Math.pow(SPLIT_DECEL, dt * TICK_RATE);
      cell.vx *= decel;
      cell.vy *= decel;
      if (Math.abs(cell.vx) < 1 && Math.abs(cell.vy) < 1) {
        cell.vx = 0;
        cell.vy = 0;
      }
      const r = massToRadius(cell.mass);
      cell.x = Math.max(r, Math.min(WORLD_W - r, cell.x));
      cell.y = Math.max(r, Math.min(WORLD_H - r, cell.y));
    }
  }

  private resolvePlayerCells(): void {
    const p = this.player;
    if (p.cells.length < 2) return;
    for (let i = 0; i < p.cells.length; i++) {
      for (let j = i + 1; j < p.cells.length; j++) {
        const a = p.cells[i];
        const b = p.cells[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const ra = massToRadius(a.mass);
        const rb = massToRadius(b.mass);
        const overlap = ra + rb - dist;
        if (overlap <= 0) continue;

        const canMerge =
          (this.currentFrame - a.splitTime >= MERGE_FRAMES) &&
          (this.currentFrame - b.splitTime >= MERGE_FRAMES);

        if (canMerge) {
          const [keep, absorb] = a.mass >= b.mass ? [a, b] : [b, a];
          const tm = keep.mass + absorb.mass;
          keep.x = (keep.x * keep.mass + absorb.x * absorb.mass) / tm;
          keep.y = (keep.y * keep.mass + absorb.y * absorb.mass) / tm;
          keep.mass = tm;
          p.cells.splice(p.cells.indexOf(absorb), 1);
          j--;
        } else {
          const pushDist = overlap / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * pushDist;
          a.y -= ny * pushDist;
          b.x += nx * pushDist;
          b.y += ny * pushDist;
        }
      }
    }
  }

  // --- Core sim (updated) ---

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
    // Only move the "main" cell (cellId 0 or first cell)
    const cell = this.player.cells[0];
    if (!cell || this.waypoints.length < 2) return;

    const from = this.waypoints[this.waypointIndex % this.waypoints.length];
    const to = this.waypoints[(this.waypointIndex + 1) % this.waypoints.length];

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

    // Only move toward waypoint if cell has no split velocity
    if (cell.vx === 0 && cell.vy === 0) {
      const dx = tx - cell.x;
      const dy = ty - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const move = Math.min(dist, speed * dt);
        cell.x += (dx / dist) * move;
        cell.y += (dy / dist) * move;
      }
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

      const pc = this.player.cells[0];
      if (pc) {
        const dx = pc.x - cell.x;
        const dy = pc.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (bot.forceChase) {
          // Always chase player regardless of mass
          bot.targetX = pc.x;
          bot.targetY = pc.y;
        } else if (dist < 400) {
          if (pc.mass > cell.mass * EAT_RATIO) {
            const nx = -dx / (dist || 1);
            const ny = -dy / (dist || 1);
            bot.targetX = cell.x + nx * 500;
            bot.targetY = cell.y + ny * 500;
          } else if (cell.mass > pc.mass * EAT_RATIO) {
            bot.targetX = pc.x;
            bot.targetY = pc.y;
          }
        }
      }

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
    // Player cells eat bot cells
    for (let bi = this.bots.length - 1; bi >= 0; bi--) {
      const bot = this.bots[bi];
      for (let ci = bot.cells.length - 1; ci >= 0; ci--) {
        const bc = bot.cells[ci];
        for (const pc of this.player.cells) {
          const pcR = massToRadius(pc.mass);
          const bcR = massToRadius(bc.mass);
          const dx = pc.x - bc.x;
          const dy = pc.y - bc.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (pc.mass >= bc.mass * EAT_RATIO && dist < pcR * EAT_OVERLAP + bcR * (1 - EAT_OVERLAP)) {
            pc.mass += bc.mass;
            bot.cells.splice(ci, 1);
            if (bot.cells.length === 0) {
              const existing = this.playerTexts.get("player") || this.config.playerHandle;
              this.playerTexts.set("player", existing + " " + bot.handle);
              this.bots[bi] = this.respawnBot(bot.handle);
            }
            break;
          }
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
          this.bots[j] = this.respawnBot(this.bots[j].handle);
        } else if (bc.mass >= ac.mass * EAT_RATIO && dist < bcR * EAT_OVERLAP + acR * (1 - EAT_OVERLAP)) {
          bc.mass += ac.mass;
          this.bots[i] = this.respawnBot(this.bots[i].handle);
        }
      }
    }
  }

  private replenishPellets() {
    while (this.pellets.length < PELLET_COUNT) {
      this.pellets.push(this.spawnPellet());
    }
  }

  private createBotFromConfig(bc: BotConfig): Bot {
    return {
      id: `bot-${bc.handle}`,
      handle: bc.handle,
      color: handleToColor(bc.handle),
      cells: [{
        cellId: 0, x: bc.x, y: bc.y,
        mass: bc.mass, vx: 0, vy: 0, splitTime: -9999,
      }],
      nextCellId: 1,
      targetX: bc.x + (this.rng() - 0.5) * 200,
      targetY: bc.y + (this.rng() - 0.5) * 200,
      wanderTimer: 3 + this.rng() * 5,
      forceChase: bc.forceChase || false,
    };
  }

  private respawnBot(handle: string): Bot {
    const mass = 100 + this.rng() * 200;
    return {
      id: `bot-${handle}`,
      handle,
      color: handleToColor(handle),
      cells: [{
        cellId: 0,
        x: this.rng() * WORLD_W,
        y: this.rng() * WORLD_H,
        mass, vx: 0, vy: 0, splitTime: -9999,
      }],
      nextCellId: 1,
      targetX: this.rng() * WORLD_W,
      targetY: this.rng() * WORLD_H,
      wanderTimer: 3 + this.rng() * 5,
      forceChase: false,
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

Run: `cd /Users/nickcernera/projects/experiments/pretext/video && npx tsc --noEmit 2>&1 | grep -v node_modules`
Expected: No errors from `video/src/`

- [ ] **Step 3: Commit**

```bash
git add video/src/Simulation.ts
git commit -m "feat(video): enhance simulation with split, scripted events, ActConfig"
```

---

### Task 3: Update GameCanvas to accept ActConfig

**Files:**
- Modify: `video/src/GameCanvas.tsx`

Remove the hardcoded seed/waypoints/handles. Accept an `ActConfig` prop and use `Simulation.fromConfig()`.

- [ ] **Step 1: Rewrite GameCanvas.tsx**

```tsx
// video/src/GameCanvas.tsx
import { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Renderer } from "~game/renderer";
import { NoopHUD } from "./NoopHUD";
import { Simulation } from "./Simulation";
import type { ActConfig } from "./ActConfig";

export const GameCanvas: React.FC<{ config: ActConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  useEffect(() => {
    const renderer = new Renderer();
    (renderer as any).hud = new NoopHUD();
    renderer.init(width, height);
    const handles = [
      config.playerHandle,
      ...config.bots.map((b) => b.handle),
    ];
    renderer.rain.setHandles(handles);
    rendererRef.current = renderer;
  }, [width, height, config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sim = Simulation.fromConfig(config);
    sim.runToFrame(frame, fps);

    const players = sim.getPlayers();
    const pellets = sim.getPellets();
    const playerTexts = sim.getPlayerTexts();

    renderer.pellets.setPellets(pellets);
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

    const now = (frame / fps) * 1000;
    renderer.draw(ctx, width, height, players, "player", playerTexts, now);
  }, [frame, fps, width, height, config]);

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

- [ ] **Step 2: Verify TypeScript compiles**

- [ ] **Step 3: Commit**

```bash
git add video/src/GameCanvas.tsx
git commit -m "feat(video): GameCanvas accepts ActConfig prop"
```

---

### Task 4: Create visual effect components

**Files:**
- Create: `video/src/GreenFlash.tsx`
- Create: `video/src/ScanlineOverlay.tsx`

- [ ] **Step 1: Create GreenFlash.tsx**

```tsx
// video/src/GreenFlash.tsx
import { AbsoluteFill } from "remotion";

export const GreenFlash: React.FC = () => {
  return <AbsoluteFill style={{ backgroundColor: "#00ff41" }} />;
};
```

- [ ] **Step 2: Create ScanlineOverlay.tsx**

```tsx
// video/src/ScanlineOverlay.tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const ScanlineOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle opacity pulse (2-4%)
  const opacity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.02, 0.04],
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        background:
          "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,1) 3px, rgba(0,0,0,1) 4px)",
        pointerEvents: "none",
      }}
    />
  );
};
```

- [ ] **Step 3: Verify and commit**

```bash
git add video/src/GreenFlash.tsx video/src/ScanlineOverlay.tsx
git commit -m "feat(video): add GreenFlash and ScanlineOverlay components"
```

---

### Task 5: Create HomepageScene

**Files:**
- Create: `video/src/HomepageScene.tsx`

This is the homepage intro: text sea background + centered panel with title, tagline, Pretext attribution, and Quick Play button, plus an animated cursor that moves to the button and clicks.

The text sea uses `@chenglou/pretext` layout directly (same as the game's landing page) but rendered as a React canvas component. The panel and cursor are DOM elements overlaid on top.

- [ ] **Step 1: Create HomepageScene.tsx**

```tsx
// video/src/HomepageScene.tsx
import { useEffect, useRef } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import { SEA_WORDS } from "@shared/words";
import { spaceGrotesk, spaceMono } from "./fonts";
import { createRng } from "./seededRandom";

const BG = "#050a08";
const GREEN = "#00ff41";
const BRIGHT = "#d0ffe0";
const MUTED = "#4a7a5a";
const SEA_FONT_SIZE = 12;
const LINE_HEIGHT = 18;

// Build deterministic sea corpus
const rng = createRng(777);
const seaWords: string[] = [];
for (let i = 0; i < 5000; i++) {
  seaWords.push(SEA_WORDS[Math.floor(rng() * SEA_WORDS.length)]);
}
const SEA_CORPUS = seaWords.join("  ");

export const HomepageScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw text sea to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    // Draw radial gradients (matching game background)
    const g1 = ctx.createRadialGradient(width * 0.3, height * 0.4, 0, width * 0.3, height * 0.4, width * 0.5);
    g1.addColorStop(0, "rgba(0, 80, 60, 0.35)");
    g1.addColorStop(1, "transparent");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, width, height);

    const g2 = ctx.createRadialGradient(width * 0.7, height * 0.6, 0, width * 0.7, height * 0.6, width * 0.45);
    g2.addColorStop(0, "rgba(20, 50, 120, 0.3)");
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, width, height);

    // Text sea
    const font = `${SEA_FONT_SIZE}px "Space Mono", monospace`;
    ctx.font = font;
    ctx.textBaseline = "top";

    const prepared = prepareWithSegments(SEA_CORPUS, font);
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };

    // Panel exclusion zone (centered, ~560x280)
    const panelW = 560;
    const panelH = 300;
    const panelX = (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    // Cursor position for spotlight
    const cursorX = interpolate(frame, [0, fps * 1, fps * 2.5, fps * 3], [width * 0.7, width * 0.55, width / 2 + 80, width / 2 + 80], {
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    });
    const cursorY = interpolate(frame, [0, fps * 1, fps * 2.5, fps * 3], [height * 0.3, height * 0.4, height / 2 + 110, height / 2 + 110], {
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    });

    let y = 8;
    while (y < height) {
      const lineTop = y;
      const lineBottom = y + LINE_HEIGHT;
      const midY = (lineTop + lineBottom) / 2;

      let spans = [{ left: 8, right: width - 8 }];

      // Exclude panel area (with rounded corners)
      if (midY > panelY && midY < panelY + panelH) {
        const cr = 24;
        let inset = 0;
        if (midY < panelY + cr) {
          const dy = panelY + cr - midY;
          inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy));
        } else if (midY > panelY + panelH - cr) {
          const dy = midY - (panelY + panelH - cr);
          inset = cr - Math.sqrt(Math.max(0, cr * cr - dy * dy));
        }
        const exL = panelX + inset;
        const exR = panelX + panelW - inset;
        const next: typeof spans = [];
        for (const span of spans) {
          if (exR <= span.left || exL >= span.right) {
            next.push(span);
          } else {
            if (exL > span.left + 20) next.push({ left: span.left, right: exL });
            if (exR < span.right - 20) next.push({ left: exR, right: span.right });
          }
        }
        spans = next;
      }

      for (const span of spans) {
        const maxWidth = span.right - span.left;
        if (maxWidth < 30) continue;

        const line = layoutNextLine(prepared, cursor, maxWidth);
        if (!line) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          break;
        }

        // Opacity: base + halo near panel + spotlight near cursor
        let alpha = 0.08;

        // Panel halo
        const closestPanelX = Math.max(panelX, Math.min(panelX + panelW, (span.left + span.right) / 2));
        const closestPanelY = Math.max(panelY, Math.min(panelY + panelH, midY));
        const panelDist = Math.sqrt(
          ((span.left + span.right) / 2 - closestPanelX) ** 2 +
          (midY - closestPanelY) ** 2
        );
        if (panelDist < 200) {
          alpha = Math.max(alpha, 0.08 + (1 - panelDist / 200) * 0.22);
        }

        // Cursor spotlight
        const nearX = Math.max(span.left, Math.min(span.right, cursorX));
        const nearY = Math.max(lineTop, Math.min(lineBottom, cursorY));
        const cursorDist = Math.sqrt((nearX - cursorX) ** 2 + (nearY - cursorY) ** 2);
        if (cursorDist < 150) {
          alpha = Math.max(alpha, 0.1 + (1 - cursorDist / 150) * 0.6);
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = GREEN;
        ctx.fillText(line.text, span.left, y);
        cursor = line.end;
      }

      y += LINE_HEIGHT;
    }
    ctx.globalAlpha = 1;
  }, [frame, fps, width, height]);

  // Cursor animation
  const cursorVisible = frame > fps * 0.5;
  const cursorOpacity = interpolate(frame, [fps * 0.5, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorX = interpolate(
    frame,
    [fps * 0.8, fps * 2.5, fps * 3],
    [width * 0.65, width / 2 + 80, width / 2 + 80],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );
  const cursorY = interpolate(
    frame,
    [fps * 0.8, fps * 2.5, fps * 3],
    [height * 0.35, height / 2 + 110, height / 2 + 110],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );

  // Click flash at ~frame 90
  const clickFrame = Math.floor(fps * 3);
  const clicked = frame >= clickFrame;
  const clickFlash = clicked
    ? interpolate(frame - clickFrame, [0, 4], [1, 0], { extrapolateRight: "clamp" })
    : 0;

  // Panel fade in
  const panelOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Button glow when clicked
  const buttonBg = clicked ? `rgba(0, 255, 65, ${0.2 + clickFlash * 0.3})` : "#1a2a1a";
  const buttonBorder = GREEN;

  return (
    <AbsoluteFill>
      {/* Text sea canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%", position: "absolute" }}
      />

      {/* Center panel */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: panelOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontFamily: spaceGrotesk,
              fontWeight: 700,
              color: BRIGHT,
              letterSpacing: -1,
            }}
          >
            pretext arena
          </div>
          <div
            style={{
              fontSize: 14,
              fontFamily: spaceMono,
              color: MUTED,
            }}
          >
            you are your text. eat or be eaten.
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: spaceMono,
              color: MUTED,
              opacity: 0.7,
              marginTop: -8,
            }}
          >
            powered by @chenglou/pretext
          </div>
          {/* Quick Play button */}
          <div
            style={{
              marginTop: 20,
              padding: "14px 40px",
              border: `1px solid ${buttonBorder}`,
              borderRadius: 4,
              backgroundColor: buttonBg,
              fontSize: 14,
              fontFamily: spaceMono,
              color: GREEN,
              transition: "none",
            }}
          >
            Quick Play
          </div>
        </div>
      </AbsoluteFill>

      {/* Animated cursor */}
      {cursorVisible && (
        <div
          style={{
            position: "absolute",
            left: cursorX - 6,
            top: cursorY - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: GREEN,
            opacity: cursorOpacity,
            boxShadow: `0 0 ${8 + clickFlash * 20}px rgba(0, 255, 65, ${0.6 + clickFlash * 0.4})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

- [ ] **Step 3: Commit**

```bash
git add video/src/HomepageScene.tsx
git commit -m "feat(video): add HomepageScene with text sea, panel, and animated cursor"
```

---

### Task 6: Rewrite LaunchVideo and update Root

**Files:**
- Modify: `video/src/LaunchVideo.tsx`
- Modify: `video/src/Root.tsx`
- Delete: `video/src/GlitchTitle.tsx`

- [ ] **Step 1: Rewrite LaunchVideo.tsx**

```tsx
// video/src/LaunchVideo.tsx
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { HomepageScene } from "./HomepageScene";
import { GameCanvas } from "./GameCanvas";
import { GreenFlash } from "./GreenFlash";
import { ScanlineOverlay } from "./ScanlineOverlay";
import { CallToAction } from "./CallToAction";
import { ACT_1, ACT_2, ACT_3 } from "./ActConfig";

export const LaunchVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  // Timeline constants (frames)
  const HOMEPAGE_END = Math.floor(fps * 3.5);       // 105
  const FLASH_DUR = 3;
  const ACT_DUR = Math.floor(fps * 3.4);            // 102
  const ACT1_START = HOMEPAGE_END + FLASH_DUR;       // 108
  const ACT1_END = ACT1_START + ACT_DUR;             // 210
  const ACT2_START = ACT1_END + FLASH_DUR;           // 213
  const ACT2_END = ACT2_START + ACT_DUR;             // 315
  const ACT3_START = ACT2_END + FLASH_DUR;           // 318
  const ACT3_END = ACT3_START + ACT_DUR;             // 420
  const CTA_START = ACT3_END;                        // 420

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      {/* Homepage Intro */}
      <Sequence from={0} durationInFrames={HOMEPAGE_END}>
        <HomepageScene />
      </Sequence>

      {/* Flash 1 */}
      <Sequence from={HOMEPAGE_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 1: The Spawn */}
      <Sequence from={ACT1_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_1} />
      </Sequence>

      {/* Flash 2 */}
      <Sequence from={ACT1_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 2: The Hunt */}
      <Sequence from={ACT2_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_2} />
      </Sequence>

      {/* Flash 3 */}
      <Sequence from={ACT2_END} durationInFrames={FLASH_DUR}>
        <GreenFlash />
      </Sequence>

      {/* Act 3: The Domination */}
      <Sequence from={ACT3_START} durationInFrames={ACT_DUR}>
        <GameCanvas config={ACT_3} />
      </Sequence>

      {/* CTA */}
      <Sequence from={CTA_START} durationInFrames={480 - CTA_START}>
        <AbsoluteFill style={{ backgroundColor: "rgba(5, 10, 8, 0.6)" }} />
        <CallToAction />
      </Sequence>

      {/* Scanline overlay (full duration) */}
      <ScanlineOverlay />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Update Root.tsx duration**

Ensure Root.tsx has `durationInFrames={480}` (should already be correct).

- [ ] **Step 3: Delete GlitchTitle.tsx**

```bash
rm video/src/GlitchTitle.tsx
```

- [ ] **Step 4: Verify TypeScript compiles**

- [ ] **Step 5: Commit**

```bash
git add -u video/src/ && git add video/src/
git commit -m "feat(video): wire v2 composition with homepage, 3 acts, flash cuts, scanlines"
```

---

### Task 7: Smoke test — render key frames

**Files:** None (verification only)

- [ ] **Step 1: Render homepage frame**

```bash
cd /Users/nickcernera/projects/experiments/pretext/video
npx remotion still PretextArenaLaunch out/v2-frame-060.png --frame=60
```

Expected: Homepage scene — text sea, "pretext arena" title, "powered by @chenglou/pretext", cursor visible moving toward button.

- [ ] **Step 2: Render Act 1 frame**

```bash
npx remotion still PretextArenaLaunch out/v2-frame-160.png --frame=160
```

Expected: Small `@cerneradesign` blob in tight zoom, eating pellets, text sea visible.

- [ ] **Step 3: Render Act 2 frame**

```bash
npx remotion still PretextArenaLaunch out/v2-frame-270.png --frame=270
```

Expected: Medium blob with `@kernelpanic` visible nearby (chasing or being chased).

- [ ] **Step 4: Render Act 3 frame**

```bash
npx remotion still PretextArenaLaunch out/v2-frame-350.png --frame=350
```

Expected: Huge blob, possibly mid-split, near small bot cluster.

- [ ] **Step 5: Render CTA frame**

```bash
npx remotion still PretextArenaLaunch out/v2-frame-450.png --frame=450
```

Expected: "PLAY NOW" + "pretextarena.io" over dark overlay.

- [ ] **Step 6: Review all frames, adjust act configs if needed**

Check that:
- Player blob is visible and appropriately sized in each act
- Bots are in sensible positions
- Pellet clusters are near the player path
- Split event timing looks good in Act 3
- Scanlines are subtle but visible

If waypoints or bot positions need tuning, adjust values in `ActConfig.ts`.

- [ ] **Step 7: Commit any tuning adjustments**

```bash
git add video/src/ActConfig.ts
git commit -m "fix(video): tune act configs after visual review"
```

---

## Render Command

```bash
cd /Users/nickcernera/projects/experiments/pretext/video
npx remotion render PretextArenaLaunch out/pretext-arena-launch-v2.mp4
```
