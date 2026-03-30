import { describe, test, expect } from 'bun:test'
import { SpatialGrid } from '../spatial'

describe('SpatialGrid', () => {
  test('finds entities in range', () => {
    const grid = new SpatialGrid(1000, 1000)
    grid.insert(1, 100, 100, 20)
    grid.insert(2, 120, 100, 20)

    const results = grid.query(110, 100, 50)
    expect(results).toContain(1)
    expect(results).toContain(2)
  })

  test('entities out of range not returned', () => {
    const grid = new SpatialGrid(4000, 4000)
    grid.insert(1, 100, 100, 20)
    grid.insert(2, 3000, 3000, 20)

    const results = grid.query(100, 100, 50)
    expect(results).toContain(1)
    expect(results).not.toContain(2)
  })

  test('deduplicates results', () => {
    const grid = new SpatialGrid(1000, 1000)
    // Insert entity with large radius that spans multiple cells
    grid.insert(1, 200, 200, 250)

    const results = grid.query(200, 200, 250)
    // Should only contain id 1 once despite spanning multiple cells
    const count = results.filter((id) => id === 1).length
    expect(count).toBe(1)
  })

  test('handles edge cells', () => {
    const grid = new SpatialGrid(1000, 1000)
    // Insert at world edge
    grid.insert(1, 0, 0, 10)
    grid.insert(2, 999, 999, 10)

    const results1 = grid.query(5, 5, 20)
    expect(results1).toContain(1)
    expect(results1).not.toContain(2)

    const results2 = grid.query(995, 995, 20)
    expect(results2).toContain(2)
    expect(results2).not.toContain(1)
  })

  test('clear removes all entities', () => {
    const grid = new SpatialGrid(1000, 1000)
    grid.insert(1, 100, 100, 20)
    grid.clear()

    const results = grid.query(100, 100, 50)
    expect(results.length).toBe(0)
  })
})
