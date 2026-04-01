import { WORLD_W, WORLD_H } from '../shared/constants'

const CELL_SIZE = 200

export class SpatialGrid {
  private cells: Map<number, Set<number>> = new Map()
  private cols: number
  private rows: number

  constructor(width = WORLD_W, height = WORLD_H, cellSize = CELL_SIZE) {
    this.cols = Math.ceil(width / cellSize)
    this.rows = Math.ceil(height / cellSize)
  }

  clear() {
    for (const set of this.cells.values()) {
      set.clear()
    }
  }

  insert(id: number, x: number, y: number, radius: number) {
    const minCol = Math.max(0, Math.floor((x - radius) / CELL_SIZE))
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / CELL_SIZE))
    const minRow = Math.max(0, Math.floor((y - radius) / CELL_SIZE))
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / CELL_SIZE))

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const key = row * this.cols + col
        let cell = this.cells.get(key)
        if (!cell) {
          cell = new Set()
          this.cells.set(key, cell)
        }
        cell.add(id)
      }
    }
  }

  query(x: number, y: number, radius: number): number[] {
    const seen = new Set<number>()
    const minCol = Math.max(0, Math.floor((x - radius) / CELL_SIZE))
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / CELL_SIZE))
    const minRow = Math.max(0, Math.floor((y - radius) / CELL_SIZE))
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / CELL_SIZE))

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const key = row * this.cols + col
        const cell = this.cells.get(key)
        if (cell) {
          for (const id of cell) {
            seen.add(id)
          }
        }
      }
    }

    return Array.from(seen)
  }
}
