import { WORLD_W, WORLD_H } from "@shared/constants";

export type Waypoint = { x: number; y: number };

export type BotConfig = {
  handle: string;
  mass: number;
  x: number;
  y: number;
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
  playerTexts?: string;
  waypoints: Waypoint[];
  bots: BotConfig[];
  pelletCluster?: PelletCluster;
  events: ScriptedEvent[];
  slowMoRange?: [number, number];
  /** Override camera zoom (bypasses the mass-based formula). Higher = more zoomed in. */
  cameraZoom?: number;
};

export const ACT_1: ActConfig = {
  seed: 100,
  playerHandle: "@cerneradesign",
  playerMass: 200,
  playerStart: { x: 2000, y: 2000 },
  cameraZoom: 1.4, // tighter than live game (live game maxes at 1.2)
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
    { handle: "@synthwave", mass: 120, x: 2400, y: 1800 },
    { handle: "@tensorcat", mass: 100, x: 1700, y: 2300 },
    { handle: "@pixeldrift", mass: 90, x: 3500, y: 1000 },
  ],
  pelletCluster: { cx: 2200, cy: 2000, radius: 350, count: 25 },
  events: [],
};

export const ACT_2: ActConfig = {
  seed: 200,
  playerHandle: "@cerneradesign",
  playerMass: 300,
  playerStart: { x: 2000, y: 2000 },
  playerTexts: "@cerneradesign async void malloc grep",
  cameraZoom: 1.1, // tight — both blobs big on screen
  waypoints: [
    { x: 2000, y: 2000 },
    { x: 1850, y: 1850 }, // flee
    { x: 1700, y: 1700 }, // through pellets
    { x: 1650, y: 1550 },
    { x: 1800, y: 1400 }, // turning back
    { x: 2050, y: 1500 },
    { x: 2150, y: 1750 },
  ],
  bots: [
    { handle: "@kernelpanic", mass: 2400, x: 2100, y: 2080, forceChase: true },
    { handle: "@darkmode", mass: 80, x: 3200, y: 3200 },
    { handle: "@nullpointer", mass: 100, x: 800, y: 800 },
  ],
  pelletCluster: { cx: 1700, cy: 1600, radius: 300, count: 40 },
  events: [],
};

export const ACT_3: ActConfig = {
  seed: 300,
  playerHandle: "@cerneradesign",
  playerMass: 4000, // massive — dominates the screen
  playerStart: { x: 2000, y: 2000 },
  playerTexts: "@cerneradesign @kernelpanic async void malloc grep fork exec sudo tensor epoch batch dropout",
  cameraZoom: 0.9, // tight — massive blob fills screen
  waypoints: [
    { x: 2000, y: 2000 },
    { x: 2080, y: 2000 },
    { x: 2160, y: 2000 },
    { x: 2240, y: 2000 },
    { x: 2320, y: 2000 },
  ],
  bots: [
    { handle: "@overfit", mass: 150, x: 2220, y: 1960 },
    { handle: "@bitshift", mass: 120, x: 2260, y: 2050 },
    { handle: "@zeroday", mass: 160, x: 2300, y: 2000 },
    { handle: "@darkmode", mass: 80, x: 3500, y: 3500 },
  ],
  events: [
    { frame: 30, type: "split" },
  ],
  slowMoRange: [25, 45],
};
