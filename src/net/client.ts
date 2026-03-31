import type { ClientMessage, ServerMessage, PlayerState, PelletState, DeathStats, LeaderboardEntry } from '@shared/protocol'

export type GameEvents = {
  onJoined: (room: string, playerId: string, world: { w: number; h: number }) => void
  onState: (players: PlayerState[], pellets: PelletState[], pAdd?: PelletState[], pRem?: number[]) => void
  onKill: (killerId: string, victimId: string, killerHandle: string, victimHandle: string) => void
  onDied: (stats: DeathStats) => void
  onLeaderboard: (entries: LeaderboardEntry[], isSnapshot: boolean) => void
  onError: (msg: string) => void
  onDisconnect: () => void
  onReconnecting?: (attempt: number, maxAttempts: number) => void
  onReconnected?: () => void
  onReconnectFailed?: () => void
}

const MAX_RECONNECT_ATTEMPTS = 5

export class GameClient {
  private ws: WebSocket | null = null
  private events: GameEvents
  private serverUrl = ''
  private intentionalClose = false
  private everConnected = false

  // Reconnection state
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private pendingJoin: { room: string | null; token?: string; guest?: string; avatar?: string } | null = null

  constructor(events: GameEvents) {
    this.events = events
  }

  connect(serverUrl: string): Promise<void> {
    this.serverUrl = serverUrl
    this.intentionalClose = false
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl)
      this.ws.onopen = () => { this.everConnected = true; resolve() }
      this.ws.onerror = (e) => reject(e)
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as ServerMessage
          switch (msg.t) {
            case 'joined': this.events.onJoined(msg.room, msg.playerId, msg.world); break
            case 'state': this.events.onState(msg.players, msg.pellets, msg.pAdd, msg.pRem); break
            case 'kill': this.events.onKill(msg.killerId, msg.victimId, msg.killerHandle, msg.victimHandle); break
            case 'died': this.events.onDied(msg.stats); break
            case 'leaderboard': this.events.onLeaderboard(msg.entries, msg.isSnapshot); break
            case 'error': this.events.onError(msg.msg); break
          }
        } catch { /* ignore malformed */ }
      }
      this.ws.onclose = () => {
        if (this.intentionalClose) {
          this.events.onDisconnect()
        } else if (this.everConnected) {
          this.startReconnect()
        }
        // If never connected, the onerror reject already handled it — don't reconnect
      }
    })
  }

  join(room: string | null, token?: string, guest?: string, avatar?: string) {
    this.pendingJoin = { room, token, guest, avatar }
    this.send({ t: 'join', room: room || '', token, guest, avatar })
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
    this.intentionalClose = true
    this.everConnected = false
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    this.reconnectAttempts = 0
    this.ws?.close()
    this.ws = null
  }

  private startReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.events.onReconnectFailed?.()
      return
    }
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000)
    this.events.onReconnecting?.(this.reconnectAttempts, MAX_RECONNECT_ATTEMPTS)

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(this.serverUrl)
        // Reconnect succeeded
        this.reconnectAttempts = 0
        this.events.onReconnected?.()
        // Re-join the room
        if (this.pendingJoin) {
          const { room, token, guest, avatar } = this.pendingJoin
          this.send({ t: 'join', room: room || '', token, guest, avatar })
        }
      } catch {
        // connect() failed, onclose will fire and trigger another startReconnect()
      }
    }, delay)
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
