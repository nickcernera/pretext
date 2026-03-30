export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private limit: number,
    private windowMs: number,
  ) {
    setInterval(() => this.cleanup(), 60_000)
  }

  check(ip: string): boolean {
    const now = Date.now()
    const entry = this.hits.get(ip)
    if (!entry || now > entry.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    entry.count++
    return entry.count <= this.limit
  }

  private cleanup() {
    const now = Date.now()
    for (const [ip, entry] of this.hits) {
      if (now > entry.resetAt) this.hits.delete(ip)
    }
  }
}

export const httpLimiter = new RateLimiter(60, 60_000)
export const wsLimiter = new RateLimiter(10, 60_000)
