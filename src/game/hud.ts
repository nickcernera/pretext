import { UI_FONT_FAMILY, BLOB_FONT_FAMILY, RAIN_COLOR, WORLD_W, WORLD_H, MINIMAP_SIZE } from '@shared/constants'
import { massToRadius, type LeaderboardEntry, type PlayerState } from '@shared/protocol'

type KillEvent = { text: string; time: number }
type SnapshotToast = { handle: string; roomCode: string; time: number }

export class HUD {
  private leaderboard: LeaderboardEntry[] = []
  private killEvents: KillEvent[] = []
  private mass = 0
  private kills = 0
  private roomCode = ''
  private snapshotToast: SnapshotToast | null = null

  setLeaderboard(entries: LeaderboardEntry[]) { this.leaderboard = entries }
  setPlayerStats(mass: number, kills: number) { this.mass = mass; this.kills = kills }
  setRoomCode(code: string) { this.roomCode = code }

  showSnapshotToast(handle: string, roomCode: string) {
    this.snapshotToast = { handle, roomCode, time: performance.now() }
  }

  addKillEvent(killer: string, victim: string) {
    this.killEvents.push({ text: `${killer} devoured ${victim}`, time: performance.now() })
    if (this.killEvents.length > 6) this.killEvents.shift()
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, players?: PlayerState[], localPlayerId?: string) {
    ctx.textBaseline = 'top'

    // Room code — top left
    if (this.roomCode) {
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.globalAlpha = 0.4
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(this.roomCode, 16, 16)
    }

    // Leaderboard — top right
    ctx.font = `11px ${UI_FONT_FAMILY}`
    ctx.textBaseline = 'top'
    const lbX = w - 16
    let lbY = 16
    ctx.globalAlpha = 0.5
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    for (let i = 0; i < Math.min(10, this.leaderboard.length); i++) {
      const e = this.leaderboard[i]
      ctx.fillText(`${i + 1}. ${e.handle}  ${Math.round(e.mass)}`, lbX, lbY)
      lbY += 18
    }
    ctx.textAlign = 'left'

    // Kill feed — bottom left
    const now = performance.now()
    let kfY = h - 20
    for (let i = this.killEvents.length - 1; i >= 0; i--) {
      const ev = this.killEvents[i]
      const age = (now - ev.time) / 1000
      if (age > 8) continue
      ctx.globalAlpha = Math.max(0, 0.6 - age * 0.08)
      ctx.font = `11px ${UI_FONT_FAMILY}`
      ctx.fillStyle = RAIN_COLOR
      ctx.fillText(ev.text, 16, kfY)
      kfY -= 18
    }

    // Player stats — bottom right (above minimap)
    const minimapBottom = MINIMAP_SIZE + 32
    ctx.globalAlpha = 0.5
    ctx.font = `12px ${UI_FONT_FAMILY}`
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(`mass: ${Math.round(this.mass)}  kills: ${this.kills}`, w - 16, h - minimapBottom - 8)
    ctx.textAlign = 'left'

    // Minimap — bottom right
    if (players && localPlayerId) {
      this.drawMinimap(ctx, w, h, players, localPlayerId)
    }

    // Snapshot toast — top center
    if (this.snapshotToast) {
      const toastAge = (now - this.snapshotToast.time) / 1000
      if (toastAge < 8) {
        const fadeIn = Math.min(1, toastAge * 4)
        const fadeOut = toastAge > 6 ? Math.max(0, 1 - (toastAge - 6) / 2) : 1
        ctx.globalAlpha = 0.85 * fadeIn * fadeOut
        const toastText = '\uD83D\uDC51 You\'re #1! Share your reign?'
        ctx.font = `14px ${BLOB_FONT_FAMILY}`
        ctx.textAlign = 'center'
        const tw = ctx.measureText(toastText).width
        const tx = w / 2
        const ty = 50

        ctx.fillStyle = '#1a2a1a'
        ctx.beginPath()
        ctx.roundRect(tx - tw / 2 - 16, ty - 8, tw + 32, 32, 6)
        ctx.fill()
        ctx.strokeStyle = '#3a5a4a'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = '#d0ffe0'
        ctx.fillText(toastText, tx, ty + 12)
        ctx.textAlign = 'left'
      } else {
        this.snapshotToast = null
      }
    }

    ctx.globalAlpha = 1
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    players: PlayerState[],
    localPlayerId: string,
  ) {
    const size = MINIMAP_SIZE
    const padding = 16
    const mx = w - size - padding
    const my = h - size - padding

    // Background
    ctx.globalAlpha = 0.15
    ctx.fillStyle = '#0a1a0f'
    ctx.fillRect(mx, my, size, size)

    // Border
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = RAIN_COLOR
    ctx.lineWidth = 1
    ctx.strokeRect(mx, my, size, size)

    // Player dots — draw others first, then local on top
    const scaleX = size / WORLD_W
    const scaleY = size / WORLD_H
    const now = performance.now()

    // Other players
    for (const p of players) {
      if (p.id === localPlayerId) continue
      for (const c of p.cells) {
        const dotX = mx + c.x * scaleX
        const dotY = my + c.y * scaleY
        const dotR = Math.max(1.5, massToRadius(c.mass) * scaleX * 2)

        ctx.globalAlpha = 0.45
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(dotX, dotY, Math.min(dotR, 5), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Local player — pulsing glow + larger dot + ring
    const local = players.find(p => p.id === localPlayerId)
    if (local) {
      const pulse = 0.6 + Math.sin(now * 0.004) * 0.4 // 0.2–1.0
      for (const c of local.cells) {
        const dotX = mx + c.x * scaleX
        const dotY = my + c.y * scaleY
        const dotR = Math.max(3, massToRadius(c.mass) * scaleX * 2.5)
        const r = Math.min(dotR, 8)

        // Outer glow ring
        ctx.globalAlpha = 0.3 * pulse
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(dotX, dotY, r + 3, 0, Math.PI * 2)
        ctx.stroke()

        // Bright filled dot
        ctx.globalAlpha = 0.95
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(dotX, dotY, r, 0, Math.PI * 2)
        ctx.fill()

        // Colored inner
        ctx.globalAlpha = 0.8
        ctx.fillStyle = local.color
        ctx.beginPath()
        ctx.arc(dotX, dotY, r * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
  }
}
