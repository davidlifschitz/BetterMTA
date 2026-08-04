import type { Place } from "../../types.js";
import type { GeocodePlaceRefCodec } from "./placeRefCodec.js";

/**
 * Short-lived hot cache for geocode-backed refs. When a codec is configured,
 * remember() returns an encrypted ref and get() can resolve it across replicas.
 * Nothing is durable or used for analytics.
 */
export class GeocodeResolveCache {
  private readonly store = new Map<string, { expiresAt: number; place: Place }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly codec: GeocodePlaceRefCodec | null = null,
  ) {}

  remember(place: Place): Place {
    const publicPlace = this.codec ? this.codec.seal(place) : place;
    this.store.set(publicPlace.placeId, {
      place: publicPlace,
      expiresAt: this.now() + this.ttlMs,
    });
    return publicPlace;
  }

  rememberMany(places: Place[]): Place[] {
    return places.map((place) => this.remember(place));
  }

  get(placeId: string): Place | null {
    const hit = this.store.get(placeId);
    if (!hit) return this.codec?.open(placeId) ?? null;
    if (this.now() >= hit.expiresAt) {
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
