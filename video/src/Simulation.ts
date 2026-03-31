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

    const start = waypoints[0] || { x: WORLD_W / 2, y: WORLD_H / 2 };
    this.player = {
      id: "player",
      handle: "@you",
      color: handleToColor("@you"),
      cells: [{ cellId: 0, x: start.x, y: start.y, mass: 150, vx: 0, vy: 0 }],
    };
    this.playerTexts.set("player", "@you");

    this.bots = BOT_HANDLES.map((h) => this.createBot(h));

    this.pellets = [];
    this.nextPelletId = 0;
    for (let i = 0; i < PELLET_COUNT; i++) {
      this.pellets.push(this.spawnPellet());
    }
  }

  static fromSeed(seed: number, waypoints: Waypoint[]): Simulation {
    return new Simulation(seed, waypoints);
  }

  step(dt: number): void {
    this.movePlayerAlongPath(dt);
    this.updateBots(dt);
    this.decayMass(dt);
    this.eatPellets();
    this.checkCollisions();
    this.replenishPellets();
  }

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

    const t = this.waypointProgress;
    const tx = from.x + (to.x - from.x) * t;
    const ty = from.y + (to.y - from.y) * t;

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

      const pc = this.player.cells[0];
      if (pc) {
        const dx = pc.x - cell.x;
        const dy = pc.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400) {
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

    for (let i = 0; i < this.bots.length; i++) {
      for (let j = i + 1; j < this.bots.length; j++) {
        const ac = this.bots[i].cells[0];
        const bc = this.bots[j].cells[0];
        if (!ac || !bc) continue;
        const dx = ac.x - bc.x;
        const dy = bc.y - ac.y;
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
