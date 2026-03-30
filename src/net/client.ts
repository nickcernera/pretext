import type { ClientMessage, ServerMessage, PlayerState, PelletState, DeathStats, LeaderboardEntry } from '@shared/protocol'

export type GameEvents = {
  onJoined: (room: string, playerId: string, world: { w: number; h: number }) => void
  onState: (players: PlayerState[], pellets: PelletState[]) => void
  onKill: (killerId: string, victimId: string, killerHandle: string, victimHandle: string) => void
  onDied: (stats: DeathStats) => void
  onLeaderboard: (entries: LeaderboardEntry[], isSnapshot: boolean) => void
  onError: (msg: string) => void
  onDisconnect: () => void
}

export class GameClient {
  private ws: WebSocket | null = null
  private events: GameEvents

  constructor(events: GameEvents) {
    this.events = events
  }

  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl)
      this.ws.onopen = () => resolve()
      this.ws.onerror = (e) => reject(e)
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as ServerMessage
          switch (msg.t) {
            case 'joined': this.events.onJoined(msg.room, msg.playerId, msg.world); break
            case 'state': this.events.onState(msg.players, msg.pellets); break
            case 'kill': this.events.onKill(msg.killerId, msg.victimId, msg.killerHandle, msg.victimHandle); break
            case 'died': this.events.onDied(msg.stats); break
            case 'leaderboard': this.events.onLeaderboard(msg.entries, msg.isSnapshot); break
            case 'error': this.events.onError(msg.msg); break
          }
        } catch { /* ignore malformed */ }
      }
      this.ws.onclose = () => this.events.onDisconnect()
    })
  }

  join(room: string | null, token?: string, guest?: string) {
    this.send({ t: 'join', room: room || '', token, guest })
  }

  spectate(room?: string) {
    this.send({ t: 'spectate', room: room || undefined })
  }

  sendInput(x: number, y: number) {
    this.send({ t: 'input', x: Math.round(x), y: Math.round(y) })
  }

  sendSplit() { this.send({ t: 'split' }) }
  sendEject() { this.send({ t: 'eject' }) }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
