import type { IncomingMessage } from "node:http"

interface Hit {
  startedAt: number
  count: number
}

export class FixedWindowRateLimiter {
  private hits = new Map<string, Hit>()

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly maxEntries = 10_000
  ) {}

  get size(): number {
    return this.hits.size
  }

  allow(key: string, now = Date.now()): boolean {
    const hit = this.hits.get(key)
    if (hit && now - hit.startedAt < this.windowMs) {
      hit.count++
      return hit.count <= this.limit
    }

    if (!hit && this.hits.size >= this.maxEntries) this.prune(now)
    if (!hit && this.hits.size >= this.maxEntries) {
      const oldest = this.hits.keys().next().value
      if (oldest !== undefined) this.hits.delete(oldest)
    }
    this.hits.delete(key)
    this.hits.set(key, { startedAt: now, count: 1 })
    return true
  }

  private prune(now: number): void {
    for (const [key, hit] of this.hits) {
      if (now - hit.startedAt >= this.windowMs) this.hits.delete(key)
    }
  }
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const raw = req.headers["x-forwarded-for"]
    const value = Array.isArray(raw) ? raw[0] : raw
    const first = value?.split(",")[0]?.trim()
    if (first) return first.slice(0, 128)
  }
  return req.socket.remoteAddress || "unknown"
}
