import { UI_FONT_FAMILY, BLOB_FONT_FAMILY, RAIN_COLOR } from '@shared/constants'
import type { LeaderboardEntry } from '@shared/protocol'

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

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
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

    // Player stats — bottom right
    ctx.globalAlpha = 0.5
    ctx.font = `12px ${UI_FONT_FAMILY}`
    ctx.fillStyle = RAIN_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(`mass: ${Math.round(this.mass)}  kills: ${this.kills}`, w - 16, h - 20)
    ctx.textAlign = 'left'

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

        // Toast background
        ctx.fillStyle = '#1a2a1a'
        ctx.beginPath()
        ctx.roundRect(tx - tw / 2 - 16, ty - 8, tw + 32, 32, 6)
        ctx.fill()
        ctx.strokeStyle = '#3a5a4a'
        ctx.lineWidth = 1
        ctx.stroke()

        // Toast text
        ctx.fillStyle = '#d0ffe0'
        ctx.fillText(toastText, tx, ty + 12)
        ctx.textAlign = 'left'
      } else {
        this.snapshotToast = null
      }
    }

    ctx.globalAlpha = 1
  }
}
