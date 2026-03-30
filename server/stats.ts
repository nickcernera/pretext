export class StatsTracker {
  totalSessions = 0
  totalKills = 0
  peakConcurrent = 0

  private totalSessionMs = 0
  longestSurvivalMs = 0
  longestSurvivalHandle = ''

  readonly startedAt = Date.now()

  // System health
  wsConnections = 0
  roomCount = 0
  private tickTimes: number[] = []  // last 30 tick durations (ms)
  private lastTickEnd = 0

  onPlayerJoin(currentPlayerCount: number) {
    this.totalSessions++
    if (currentPlayerCount > this.peakConcurrent) {
      this.peakConcurrent = currentPlayerCount
    }
  }

  onKill() {
    this.totalKills++
  }

  onPlayerDeath(sessionMs: number, handle: string) {
    this.totalSessionMs += sessionMs
    if (sessionMs > this.longestSurvivalMs) {
      this.longestSurvivalMs = sessionMs
      this.longestSurvivalHandle = handle
    }
  }

  onPlayerDisconnect(sessionMs: number, handle: string) {
    this.totalSessionMs += sessionMs
    if (sessionMs > this.longestSurvivalMs) {
      this.longestSurvivalMs = sessionMs
      this.longestSurvivalHandle = handle
    }
  }

  onTick(durationMs: number) {
    this.tickTimes.push(durationMs)
    if (this.tickTimes.length > 30) this.tickTimes.shift()
    this.lastTickEnd = Date.now()
  }

  onWsOpen() { this.wsConnections++ }
  onWsClose() { this.wsConnections-- }

  getPublicStats(livePlayers: number) {
    const avgSessionMs = this.totalSessions > 0
      ? Math.round(this.totalSessionMs / this.totalSessions)
      : 0

    return {
      live_players: livePlayers,
      total_sessions: this.totalSessions,
      total_kills: this.totalKills,
      avg_session_seconds: Math.round(avgSessionMs / 1000),
      longest_survival_seconds: Math.round(this.longestSurvivalMs / 1000),
      longest_survival_handle: this.longestSurvivalHandle,
      peak_concurrent: this.peakConcurrent,
      uptime_seconds: Math.round((Date.now() - this.startedAt) / 1000),
    }
  }

  getHealthStats() {
    const avgTickMs = this.tickTimes.length > 0
      ? this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length
      : 0
    const maxTickMs = this.tickTimes.length > 0
      ? Math.max(...this.tickTimes)
      : 0
    const memUsage = process.memoryUsage()

    return {
      ws_connections: this.wsConnections,
      rooms: this.roomCount,
      tick_avg_ms: Math.round(avgTickMs * 100) / 100,
      tick_max_ms: Math.round(maxTickMs * 100) / 100,
      tick_budget_ms: 33.33,
      tick_headroom_pct: Math.round((1 - avgTickMs / 33.33) * 100),
      heap_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
    }
  }
}
