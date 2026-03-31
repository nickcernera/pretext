import { describe, test, expect } from 'bun:test'
import { Room, RoomManager, playerTotalMass } from '../room'

describe('Room', () => {
  test('addPlayer and removePlayer', () => {
    const room = new Room('test-room', true)
    const player = room.addPlayer('p1', '@alice', null)
    expect(player.id).toBe('p1')
    expect(player.handle).toBe('@alice')
    expect(room.playerCount()).toBe(1)
    expect(room.realPlayerCount()).toBe(0) // ws is null, counts as bot

    room.removePlayer('p1')
    expect(room.playerCount()).toBe(0)
  })

  test('getLeaderboard sorts by mass', () => {
    const room = new Room('lb-room', true)
    const p1 = room.addPlayer('p1', '@alice', null)
    const p2 = room.addPlayer('p2', '@bob', null)
    p1.cells[0].mass = 200
    p2.cells[0].mass = 500

    const lb = room.getLeaderboard()
    expect(lb[0].handle).toBe('@bob')
    expect(lb[1].handle).toBe('@alice')
  })

  test('respawnPellets fills deficit', () => {
    const room = new Room('pellet-room', true)
    const initialCount = room.pellets.length
    expect(initialCount).toBe(150)

    // Remove some pellets
    room.pellets = room.pellets.slice(0, 100)
    room.respawnPellets()
    expect(room.pellets.length).toBe(150)
  })
})

describe('RoomManager', () => {
  test('getOrCreateRoom creates new room', () => {
    const manager = new RoomManager()
    const room = manager.getOrCreateRoom('my-room')
    expect(room).not.toBeNull()
    expect(room!.code).toBe('my-room')
  })

  test('getOrCreateRoom returns existing room', () => {
    const manager = new RoomManager()
    const room1 = manager.getOrCreateRoom('same-room')
    const room2 = manager.getOrCreateRoom('same-room')
    expect(room1).toBe(room2)
  })

  test('getOrCreateRoom returns null at capacity', () => {
    const manager = new RoomManager()
    for (let i = 0; i < 200; i++) {
      expect(manager.getOrCreateRoom(`room-${i}`)).not.toBeNull()
    }
    expect(manager.getOrCreateRoom('one-too-many')).toBeNull()
  })

  test('getPublicRoom creates room with space', () => {
    const manager = new RoomManager()
    const room = manager.getPublicRoom()
    expect(room).not.toBeNull()
    expect(room!.code).toBeTruthy()
  })

  test('getPublicRoom reuses room with space', () => {
    const manager = new RoomManager()
    const room1 = manager.getPublicRoom()!
    const room2 = manager.getPublicRoom()!
    expect(room1.code).toBe(room2.code)
  })
})
