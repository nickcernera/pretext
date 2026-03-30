export class StatsTracker {
  totalSessions = 0
  totalKills = 0
  peakConcurrent = 0

  private totalSessionMs = 0
  longestSurvivalMs = 0
  longestSurvivalHandle = ''

  readonly startedAt = Date.now()

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

  getStats(livePlayers: number) {
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
}
