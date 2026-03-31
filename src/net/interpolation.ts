import type { PlayerState, CellState } from '@shared/protocol'

type InterpolatedCell = {
  cellId: number
  targetX: number
  targetY: number
  targetMass: number
  displayX: number
  displayY: number
  displayMass: number
}

type InterpolatedPlayer = {
  id: string
  handle: string
  color: string
  avatar: string
  cells: Map<number, InterpolatedCell>
}

export class StateInterpolator {
  private players = new Map<string, InterpolatedPlayer>()
  private readonly lerpSpeed = 18

  update(serverPlayers: PlayerState[]) {
    const seen = new Set<string>()

    for (const sp of serverPlayers) {
      seen.add(sp.id)
      let existing = this.players.get(sp.id)

      if (!existing) {
        existing = {
          id: sp.id,
          handle: sp.handle,
          color: sp.color,
          avatar: sp.avatar ?? '',
          cells: new Map(),
        }
        this.players.set(sp.id, existing)
      }

      existing.handle = sp.handle
      existing.color = sp.color
      existing.avatar = sp.avatar ?? ''

      // Update cell targets
      const seenCells = new Set<number>()
      for (const sc of sp.cells) {
        seenCells.add(sc.cellId)
        const ec = existing.cells.get(sc.cellId)
        if (ec) {
          ec.targetX = sc.x
          ec.targetY = sc.y
          ec.targetMass = sc.mass
        } else {
          // New cell — snap display to target (no lerp on first frame)
          existing.cells.set(sc.cellId, {
            cellId: sc.cellId,
            targetX: sc.x,
            targetY: sc.y,
            targetMass: sc.mass,
            displayX: sc.x,
            displayY: sc.y,
            displayMass: sc.mass,
          })
        }
      }

      // Remove cells that disappeared (merged or eaten)
      for (const [cellId] of existing.cells) {
        if (!seenCells.has(cellId)) existing.cells.delete(cellId)
      }
    }

    // Remove players that left
    for (const [id] of this.players) {
      if (!seen.has(id)) this.players.delete(id)
    }
  }

  getInterpolated(dt: number): PlayerState[] {
    const result: PlayerState[] = []
    const t = Math.min(1, dt * this.lerpSpeed)

    for (const [, p] of this.players) {
      const cells: CellState[] = []
      let totalMass = 0
      let wx = 0, wy = 0

      for (const [, c] of p.cells) {
        // Accumulate: smoothly move display toward target each frame
        c.displayX += (c.targetX - c.displayX) * t
        c.displayY += (c.targetY - c.displayY) * t
        c.displayMass += (c.targetMass - c.displayMass) * t

        cells.push({ cellId: c.cellId, x: c.displayX, y: c.displayY, mass: c.displayMass })
        wx += c.displayX * c.displayMass
        wy += c.displayY * c.displayMass
        totalMass += c.displayMass
      }

      const cx = totalMass > 0 ? wx / totalMass : 0
      const cy = totalMass > 0 ? wy / totalMass : 0

      result.push({
        id: p.id,
        handle: p.handle,
        x: cx,
        y: cy,
        mass: totalMass,
        color: p.color,
        avatar: p.avatar,
        cells,
      })
    }
    return result
  }
}
