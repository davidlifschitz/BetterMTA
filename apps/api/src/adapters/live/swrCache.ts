/**
 * Fresh-within-TTL cache with stale-while-revalidate.
 * Within TTL → return cached. Past TTL with a prior value → return stale and
 * refresh in the background. No prior value → await fetch.
 */
export class SwrTtlCache<T> {
  private value: T | undefined;
  private fetchedAt = 0;
  private inflight: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Test/helper: peek without fetching. */
  peek(): T | undefined {
    return this.value;
  }

  /** Test/helper: force-seed cache. */
  seed(value: T, fetchedAt = this.now()): void {
    this.value = value;
    this.fetchedAt = fetchedAt;
  }

  invalidate(): void {
    this.value = undefined;
    this.fetchedAt = 0;
    this.inflight = null;
  }

  async get(fetcher: () => Promise<T>): Promise<T> {
    const age = this.now() - this.fetchedAt;
    if (this.value !== undefined && age < this.ttlMs) {
      return this.value;
    }

    if (this.value !== undefined) {
      // Stale-while-revalidate: serve stale, refresh in background.
      void this.refresh(fetcher).catch(() => undefined);
      return this.value;
    }

    return this.refresh(fetcher);
  }

  private refresh(fetcher: () => Promise<T>): Promise<T> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const next = await fetcher();
        this.value = next;
        this.fetchedAt = this.now();
        return next;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
