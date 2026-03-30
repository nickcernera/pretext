// World
export const WORLD_W = 4000
export const WORLD_H = 4000

// Physics
export const TICK_RATE = 30
export const TICK_MS = 1000 / TICK_RATE
export const BASE_SPEED = 300
export const SPEED_EXPONENT = 0.43
export const MASS_DECAY_RATE = 0.002
export const MIN_MASS = 50
export const SPLIT_MIN_MASS = 200
export const SPLIT_VELOCITY = 600
export const EJECT_MASS = 30
export const EJECT_VELOCITY = 500
export const MERGE_TIME = 15_000

// Eating
export const EAT_RATIO = 1.15
export const EAT_OVERLAP = 0.6

// Pellets
export const PELLET_COUNT = 800
export const PELLET_MASS = 10
export const PELLET_RADIUS = 4

// Room
export const ROOM_CAPACITY = 30
export const BOT_FILL_THRESHOLD = 8
export const ROOM_IDLE_TIMEOUT = 5 * 60_000
export const LEADERBOARD_INTERVAL = 10 * 60_000

// Visual
export const BLOB_FONT_FAMILY = '"Space Grotesk", system-ui, sans-serif'
export const UI_FONT_FAMILY = '"Space Mono", monospace'
export const BG_COLOR = '#050a08'
export const RAIN_COLOR = '#00ff41'
