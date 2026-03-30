import { describe, test, expect } from 'bun:test'
import { Simulation } from '../simulation'
import { Room, RoomManager } from '../room'
import { EAT_RATIO, MIN_MASS } from '../../shared/constants'
import { massToRadius } from '../../shared/protocol'

describe('Simulation', () => {
  test('player moves toward target', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager)
    const room = manager.getOrCreateRoom('move-test')

    const player = room.addPlayer('p1', '@mover', null)
    player.x = 500
    player.y = 500
    player.targetX = 800
    player.targetY = 500
    player.mass = MIN_MASS

    const startX = player.x
    sim.tickRoom(room, 1 / 30)

    // Player should have moved right toward target
    expect(player.x).toBeGreaterThan(startX)
  })

  test('bigger player eats smaller on overlap', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager)
    const room = manager.getOrCreateRoom('eat-test')

    // Remove all pellets to avoid interference
    room.pellets = []

    const big = room.addPlayer('big', '@bigfish', null)
    big.mass = 500
    big.x = 100
    big.y = 100
    big.targetX = 100
    big.targetY = 100

    const small = room.addPlayer('small', '@smallfish', null)
    small.mass = 100 // 500 > 100 * 1.15 = 115, so big can eat small
    // Place them overlapping
    small.x = 100
    small.y = 100
    small.targetX = 100
    small.targetY = 100

    sim.tickRoom(room, 1 / 30)

    // Small player should be eaten (removed)
    expect(room.players.has('small')).toBe(false)
    // Big player should have absorbed mass
    expect(room.players.get('big')!.mass).toBeGreaterThan(500)
  })

  test('equal-size players do not eat each other', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager)
    const room = manager.getOrCreateRoom('equal-test')

    room.pellets = []

    const p1 = room.addPlayer('p1', '@alpha', null)
    p1.mass = 200
    p1.x = 100
    p1.y = 100
    p1.targetX = 100
    p1.targetY = 100

    const p2 = room.addPlayer('p2', '@beta', null)
    p2.mass = 200
    p2.x = 100
    p2.y = 100
    p2.targetX = 100
    p2.targetY = 100

    sim.tickRoom(room, 1 / 30)

    // Both players should still exist
    expect(room.players.has('p1')).toBe(true)
    expect(room.players.has('p2')).toBe(true)
  })

  test('player eats pellets', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager)
    const room = manager.getOrCreateRoom('pellet-eat-test')

    // Place a single pellet right at player position
    room.pellets = [{ id: 0, x: 100, y: 100 }]

    const player = room.addPlayer('p1', '@eater', null)
    player.mass = MIN_MASS
    player.x = 100
    player.y = 100
    player.targetX = 100
    player.targetY = 100

    const initialMass = player.mass
    sim.tickRoom(room, 1 / 30)

    // Player should have gained mass from pellet
    expect(player.mass).toBeGreaterThan(initialMass)
  })

  test('mass decays over time for large players', () => {
    const manager = new RoomManager()
    const sim = new Simulation(manager)
    const room = manager.getOrCreateRoom('decay-test')

    room.pellets = []

    const player = room.addPlayer('p1', '@decayer', null)
    player.mass = 1000
    player.x = 2000
    player.y = 2000
    player.targetX = 2000
    player.targetY = 2000

    const initialMass = player.mass
    sim.tickRoom(room, 1 / 30)

    expect(player.mass).toBeLessThan(initialMass)
  })
})
