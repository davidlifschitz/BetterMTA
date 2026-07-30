/**
 * Dependency-free latency histogram with fixed duration buckets.
 * Supports approximate p50/p95/p99 from cumulative bucket counts.
 */

const DEFAULT_BOUNDS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10_000,
] as const;

export interface LatencySnapshot {
  count: number;
  sumMs: number;
  maxMs: number;
  /** Inclusive upper bounds in ms; last bucket is +Inf. */
  bucketBoundsMs: number[];
  bucketCounts: number[];
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

export class LatencyHistogram {
  private count = 0;
  private sumMs = 0;
  private maxMs = 0;
  private readonly bounds: number[];
  private readonly buckets: number[];

  constructor(boundsMs: readonly number[] = DEFAULT_BOUNDS_MS) {
    this.bounds = [...boundsMs];
    // One bucket per bound + one overflow (+Inf)
    this.buckets = new Array(this.bounds.length + 1).fill(0);
  }

  observe(durationMs: number): void {
    const ms = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.count += 1;
    this.sumMs += ms;
    if (ms > this.maxMs) this.maxMs = ms;

    let placed = false;
    for (let i = 0; i < this.bounds.length; i++) {
      if (ms <= this.bounds[i]!) {
        this.buckets[i]! += 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      this.buckets[this.buckets.length - 1]! += 1;
    }
  }

  snapshot(): LatencySnapshot {
    return {
      count: this.count,
      sumMs: this.sumMs,
      maxMs: this.maxMs,
      bucketBoundsMs: [...this.bounds],
      bucketCounts: [...this.buckets],
      p50Ms: this.percentile(0.5),
      p95Ms: this.percentile(0.95),
      p99Ms: this.percentile(0.99),
    };
  }

  reset(): void {
    this.count = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.buckets.fill(0);
  }

  private percentile(p: number): number | null {
    if (this.count === 0) return null;
    const target = Math.ceil(this.count * p);
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.buckets[i]!;
      if (cumulative >= target) {
        return i < this.bounds.length ? this.bounds[i]! : this.maxMs;
      }
    }
    return this.maxMs;
  }
}
