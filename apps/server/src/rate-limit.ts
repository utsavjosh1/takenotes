/**
 * Fixed-window rate limiter (in-memory, single process).
 *
 * Enough for a loopback/LAN notes server: bounds both agent runaway loops and
 * token guessing. The clock is injectable so tests pin time, and the key map is
 * capped so a flood of distinct keys can't grow memory without bound.
 */
export type RateDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

const MAX_KEYS = 4096;

export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private bucket(key: string): { count: number; resetAt: number } {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || t >= w.resetAt) {
      if (this.windows.size >= MAX_KEYS) this.prune(t);
      w = { count: 0, resetAt: t + this.windowMs };
      this.windows.set(key, w);
    }
    return w;
  }

  private prune(t: number): void {
    for (const [k, w] of this.windows) if (t >= w.resetAt) this.windows.delete(k);
    // Still full of live windows: drop the oldest rather than refuse new keys.
    while (this.windows.size >= MAX_KEYS) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }

  private decision(w: { count: number; resetAt: number }): RateDecision {
    return w.count > this.limit
      ? { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - this.now()) / 1000)) }
      : { allowed: true };
  }

  /** Count one event for `key` and report whether it is within the limit. */
  hit(key: string): RateDecision {
    const w = this.bucket(key);
    w.count += 1;
    return this.decision(w);
  }

  /** Is `key` already over its limit? Does not count. */
  blocked(key: string): RateDecision {
    return this.decision(this.bucket(key));
  }
}
