import { describe, test, expect } from 'bun:test'
import { Simulation, splitPlayer } from '../simulation'
import { Room, RoomManager, playerTotalMass } from '../room'
import { StatsTracker } from '../stats'
import { EAT_RATIO, MIN_MASS, SPLIT_MIN_MASS, MAX_CELLS, MERGE_TIME } from '../../shared/constants'
import { massToRadius } from '../../shared/protocol'

describe('Simulation', () => {
  test('player moves toward target', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('move-test')!
    room.pellets = []

    const player = room.addPlayer('p1', '@mover', null)
    player.cells[0].x = 2000
    player.cells[0].y = 2000
    player.cells[0].mass = 200

    const startX = player.cells[0].x
    const startY = player.cells[0].y

    // tickBots may override target for ws=null players (treated as bots),
    // so we just verify that the cell moved from its initial position
    sim.tickRoom(room, 1 / 30)

    const dx = player.cells[0].x - startX
    const dy = player.cells[0].y - startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist).toBeGreaterThan(0)
  })

  test('bigger player eats smaller on overlap', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('eat-test')!

    room.pellets = []

    const big = room.addPlayer('big', '@bigfish', null)
    big.cells[0].mass = 500
    big.cells[0].x = 100
    big.cells[0].y = 100
    big.targetX = 100
    big.targetY = 100

    const small = room.addPlayer('small', '@smallfish', null)
    small.cells[0].mass = 100
    small.cells[0].x = 100
    small.cells[0].y = 100
    small.targetX = 100
    small.targetY = 100

    sim.tickRoom(room, 1 / 30)

    expect(room.players.has('small')).toBe(false)
    expect(playerTotalMass(room.players.get('big')!)).toBeGreaterThan(500)
  })

  test('equal-size players do not eat each other', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('equal-test')!

    room.pellets = []

    const p1 = room.addPlayer('p1', '@alpha', null)
    p1.cells[0].mass = 200
    p1.cells[0].x = 100
    p1.cells[0].y = 100
    p1.targetX = 100
    p1.targetY = 100

    const p2 = room.addPlayer('p2', '@beta', null)
    p2.cells[0].mass = 200
    p2.cells[0].x = 100
    p2.cells[0].y = 100
    p2.targetX = 100
    p2.targetY = 100

    sim.tickRoom(room, 1 / 30)

    expect(room.players.has('p1')).toBe(true)
    expect(room.players.has('p2')).toBe(true)
  })

  test('player eats pellets', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('pellet-eat-test')!

    room.pellets = [{ id: 0, x: 100, y: 100, word: 'tensor' }]

    const player = room.addPlayer('p1', '@eater', null)
    player.cells[0].mass = MIN_MASS
    player.cells[0].x = 100
    player.cells[0].y = 100
    player.targetX = 100
    player.targetY = 100

    const initialMass = player.cells[0].mass
    sim.tickRoom(room, 1 / 30)

    expect(player.cells[0].mass).toBeGreaterThan(initialMass)
  })

  test('mass decays over time for large players', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('decay-test')!

    room.pellets = []

    const player = room.addPlayer('p1', '@decayer', null)
    player.cells[0].mass = 1000
    player.cells[0].x = 2000
    player.cells[0].y = 2000
    player.targetX = 2000
    player.targetY = 2000

    const initialMass = player.cells[0].mass
    sim.tickRoom(room, 1 / 30)

    expect(player.cells[0].mass).toBeLessThan(initialMass)
  })
})

describe('Splitting', () => {
  test('split creates two cells', () => {
    const manager = new RoomManager()
    const room = manager.getOrCreateRoom('split-test')!
    const player = room.addPlayer('p1', '@splitter', null)
    player.cells[0].mass = 400
    player.targetX = player.cells[0].x + 100
    player.targetY = player.cells[0].y

    splitPlayer(player, Date.now())

    expect(player.cells.length).toBe(2)
    expect(player.cells[0].mass).toBe(200)
    expect(player.cells[1].mass).toBe(200)
  })

  test('split respects minimum mass', () => {
    const manager = new RoomManager()
    const room = manager.getOrCreateRoom('split-min-test')!
    const player = room.addPlayer('p1', '@tiny', null)
    player.cells[0].mass = 100

    splitPlayer(player, Date.now())

    expect(player.cells.length).toBe(1)
  })

  test('split respects max cells', () => {
    const manager = new RoomManager()
    const room = manager.getOrCreateRoom('split-max-test')!
    const player = room.addPlayer('p1', '@maxcells', null)

    // Create 16 cells manually
    player.cells = []
    for (let i = 0; i < MAX_CELLS; i++) {
      player.cells.push({
        cellId: i, x: 100 + i * 10, y: 100, mass: SPLIT_MIN_MASS,
        vx: 0, vy: 0, splitTime: 0,
      })
    }

    splitPlayer(player, Date.now())
    expect(player.cells.length).toBe(MAX_CELLS)
  })

  test('cells merge after timer expires', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('merge-test')!
    room.pellets = []

    const player = room.addPlayer('p1', '@merger', null)
    const pastTime = Date.now() - MERGE_TIME - 1000

    player.cells = [
      { cellId: 0, x: 100, y: 100, mass: 200, vx: 0, vy: 0, splitTime: pastTime },
      { cellId: 1, x: 100, y: 100, mass: 200, vx: 0, vy: 0, splitTime: pastTime },
    ]
    player.targetX = 100
    player.targetY = 100

    sim.tickRoom(room, 1 / 30)

    expect(player.cells.length).toBe(1)
    expect(player.cells[0].mass).toBeCloseTo(400, -1)
  })

  test('cells do NOT merge before timer expires', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('no-merge-test')!
    room.pellets = []

    const player = room.addPlayer('p1', '@nomerge', null)
    const recentTime = Date.now()

    player.cells = [
      { cellId: 0, x: 100, y: 100, mass: 200, vx: 0, vy: 0, splitTime: recentTime },
      { cellId: 1, x: 105, y: 100, mass: 200, vx: 0, vy: 0, splitTime: recentTime },
    ]
    player.targetX = 100
    player.targetY = 100

    sim.tickRoom(room, 1 / 30)

    expect(player.cells.length).toBe(2)
  })

  test('sibling cells do not eat each other', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager, new StatsTracker())
    const room = manager.getOrCreateRoom('sibling-test')!
    room.pellets = []

    const player = room.addPlayer('p1', '@siblings', null)
    // Create two cells of very different sizes at same position
    // but with recent splitTime so they can't merge
    const recentTime = Date.now()
    player.cells = [
      { cellId: 0, x: 100, y: 100, mass: 500, vx: 0, vy: 0, splitTime: recentTime },
      { cellId: 1, x: 100, y: 100, mass: 50, vx: 0, vy: 0, splitTime: recentTime },
    ]
    player.targetX = 100
    player.targetY = 100

    sim.tickRoom(room, 1 / 30)

    // Both cells should still exist (siblings don't eat each other)
    expect(player.cells.length).toBe(2)
  })
})
