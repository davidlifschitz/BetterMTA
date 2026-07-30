export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the key is allowed; false if limited. */
  allow(key: string, now = Date.now()): boolean {
    if (this.max <= 0) return false;
    const cur = this.hits.get(key);
    if (!cur || now >= cur.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (cur.count >= this.max) return false;
    cur.count += 1;
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}
