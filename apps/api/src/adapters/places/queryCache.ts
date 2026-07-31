import type { GeocodeSearchResult } from "./types.js";

/** Privacy-safe geocode result cache keyed by hashed query material. */
export class GeocodeQueryCache {
  private readonly store = new Map<
    string,
    { expiresAt: number; value: GeocodeSearchResult }
  >();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): GeocodeSearchResult | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: GeocodeSearchResult): void {
    if (this.store.size >= this.maxEntries) {
      // Drop oldest insertion order entry.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}
