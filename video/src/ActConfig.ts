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
};

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

export const ACT_2: ActConfig = {
  seed: 200,
  playerHandle: "@cerneradesign",
  playerMass: 300,
  playerStart: { x: 1500, y: 2000 },
  playerTexts: "@cerneradesign async void malloc grep",
  waypoints: [
    { x: 1500, y: 2000 },
    { x: 1200, y: 1800 },
    { x: 1000, y: 1600 },
    { x: 1100, y: 1400 },
    { x: 1400, y: 1300 },
    { x: 1700, y: 1500 },
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
    { x: 2400, y: 2000 },
    { x: 2500, y: 2000 },
  ],
  bots: [
    { handle: "@overfit", mass: 120, x: 2500, y: 1950 },
    { handle: "@bitshift", mass: 100, x: 2550, y: 2050 },
    { handle: "@zeroday", mass: 130, x: 2600, y: 2000 },
    { handle: "@darkmode", mass: 80, x: 3500, y: 3500 },
  ],
  events: [
    { frame: 60, type: "split" },
  ],
  slowMoRange: [55, 75],
};
