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
export const MAX_CELLS = 16
export const SPLIT_DECEL = 0.88

// Eating
export const EAT_RATIO = 1.15
export const EAT_OVERLAP = 0.5

// Word Pellets
export const PELLET_COUNT = 150
export const PELLET_MASS_PER_CHAR = 3 // mass = word.length * this
export const PELLET_FONT_SIZE = 24 // rendered size in the arena
export const PELLET_HITBOX_PER_CHAR = 2 // hitbox radius = word.length * this

// Pellet visual feedback
export const PELLET_MAGNET_RANGE = 1.8 // magnetism activates at this * eat range
export const PELLET_MAGNET_STRENGTH = 0.4 // pull fraction of eat range at max
export const PELLET_GLOW_RANGE = 2.0 // glow activates at this * eat range

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

// Grid
export const GRID_LINE_SPACING = 50

// Minimap
export const MINIMAP_SIZE = 180
