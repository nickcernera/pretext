import type { PlayerState } from '@shared/protocol'

type InterpolatedPlayer = PlayerState & {
  prevX: number
  prevY: number
  prevMass: number
  lastUpdate: number
}

export class StateInterpolator {
  private players = new Map<string, InterpolatedPlayer>()
  private readonly lerpSpeed = 10

  update(serverPlayers: PlayerState[]) {
    const now = performance.now()
    const seen = new Set<string>()

    for (const sp of serverPlayers) {
      seen.add(sp.id)
      const existing = this.players.get(sp.id)
      if (existing) {
        existing.prevX = existing.x
        existing.prevY = existing.y
        existing.prevMass = existing.mass
        existing.x = sp.x
        existing.y = sp.y
        existing.mass = sp.mass
        existing.handle = sp.handle
        existing.color = sp.color
        existing.lastUpdate = now
      } else {
        this.players.set(sp.id, {
          ...sp,
          prevX: sp.x,
          prevY: sp.y,
          prevMass: sp.mass,
          lastUpdate: now,
        })
      }
    }

    for (const [id] of this.players) {
      if (!seen.has(id)) this.players.delete(id)
    }
  }

  getInterpolated(dt: number): PlayerState[] {
    const result: PlayerState[] = []
    const t = Math.min(1, dt * this.lerpSpeed)

    for (const [, p] of this.players) {
      result.push({
        id: p.id,
        handle: p.handle,
        x: p.prevX + (p.x - p.prevX) * t,
        y: p.prevY + (p.y - p.prevY) * t,
        mass: p.prevMass + (p.mass - p.prevMass) * t,
        color: p.color,
      })
    }
    return result
  }
}
