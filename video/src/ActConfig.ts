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
  playerMass: 200,
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
    { handle: "@synthwave", mass: 120, x: 2500, y: 1700 }, // visible in frame
    { handle: "@tensorcat", mass: 100, x: 1600, y: 2400 }, // visible in frame
    { handle: "@pixeldrift", mass: 90, x: 3500, y: 1000 },
  ],
  pelletCluster: { cx: 2200, cy: 2000, radius: 350, count: 25 },
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
    { x: 1300, y: 1850 }, // flee
    { x: 1100, y: 1700 }, // through pellets
    { x: 1050, y: 1500 },
    { x: 1200, y: 1350 }, // turning back
    { x: 1500, y: 1500 },
    { x: 1650, y: 1800 },
  ],
  bots: [
    { handle: "@kernelpanic", mass: 650, x: 1650, y: 2100, forceChase: true }, // big, close, menacing
    { handle: "@darkmode", mass: 80, x: 3000, y: 3000 },
    { handle: "@nullpointer", mass: 100, x: 500, y: 500 },
  ],
  pelletCluster: { cx: 1100, cy: 1600, radius: 300, count: 40 },
  events: [],
};

export const ACT_3: ActConfig = {
  seed: 300,
  playerHandle: "@cerneradesign",
  playerMass: 800,
  playerStart: { x: 2000, y: 2000 },
  playerTexts: "@cerneradesign @kernelpanic async void malloc grep fork exec sudo tensor",
  waypoints: [
    { x: 2000, y: 2000 },
    { x: 2100, y: 2000 },
    { x: 2200, y: 2000 }, // approaching bots
    { x: 2300, y: 2000 },
    { x: 2400, y: 2000 },
  ],
  bots: [
    { handle: "@overfit", mass: 120, x: 2250, y: 1970 },   // tight cluster, close
    { handle: "@bitshift", mass: 100, x: 2280, y: 2040 },
    { handle: "@zeroday", mass: 130, x: 2320, y: 2000 },
    { handle: "@darkmode", mass: 80, x: 3500, y: 3500 },
  ],
  events: [
    { frame: 30, type: "split" }, // split early, bots are close
  ],
  slowMoRange: [25, 45],
};
