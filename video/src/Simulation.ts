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
  splitTime: number;
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

    this.bots = config.bots.map((bc) => this.createBotFromConfig(bc));

    this.pellets = [];
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet());
    }

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
      // Capture player position before the last step (for camera smoothing)
      if (i === frame - 2) {
        const ps = this.toPS(this.player);
        this.prevPlayerPos = { x: ps.x, y: ps.y };
      }

      let speedMul = 1;
      if (this.config.slowMoRange) {
        const [start, end] = this.config.slowMoRange;
        if (i >= start && i <= end) {
          // Smooth cosine ease: 1x → 0.4x → 1x over the range
          const t = (i - start) / (end - start);
          speedMul = 0.4 + 0.6 * Math.abs(Math.cos(t * Math.PI));
        }
      }
      this.step(speedMul / fps);
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

  /** Get previous frame's player COM (captured during runToFrame). */
  getPrevPlayerPos(): { x: number; y: number } | null {
    return this.prevPlayerPos;
  }

  private prevPlayerPos: { x: number; y: number } | null = null;

  private splitPlayer(): void {
    const p = this.player;
    const toAdd: LocalCell[] = [];

    for (const cell of p.cells) {
      if (cell.mass < 100) continue;
      if (p.cells.length + toAdd.length >= 8) break;

      const halfMass = cell.mass / 2;
      cell.mass = halfMass;

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

    const speed = BASE_SPEED * Math.pow(100 / cell.mass, SPEED_EXPONENT);
    const segDx = to.x - from.x;
    const segDy = to.y - from.y;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy) || 1;
    this.waypointProgress += (speed * dt) / segLen;

    if (this.waypointProgress >= 1) {
      this.waypointProgress -= 1;
      this.waypointIndex++;
    }

    // Recompute from/to after potential index increment so the target
    // position is on the correct (new) segment after a waypoint transition.
    const curFrom = this.waypoints[this.waypointIndex % this.waypoints.length];
    const curTo = this.waypoints[(this.waypointIndex + 1) % this.waypoints.length];

    const t = this.waypointProgress;
    const tx = curFrom.x + (curTo.x - curFrom.x) * t;
    const ty = curFrom.y + (curTo.y - curFrom.y) * t;

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
