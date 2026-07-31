import type { Place } from "../../types.js";

/**
 * Short-lived in-memory placeId → Place store for geocode-backed refs.
 * Not durable; no cross-request analytics. Coords stay in process memory only.
 */
export class GeocodeResolveCache {
  private readonly store = new Map<string, { expiresAt: number; place: Place }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  remember(place: Place): void {
    if (!place.placeId) return;
    this.store.set(place.placeId, {
      place,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  rememberMany(places: Place[]): void {
    for (const p of places) this.remember(p);
  }

  get(placeId: string): Place | null {
    const hit = this.store.get(placeId);
    if (!hit) return null;
    if (this.now() > hit.expiresAt) {
      this.store.delete(placeId);
      return null;
    }
    return hit.place;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
