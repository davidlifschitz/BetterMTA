import { createHash } from "node:crypto";

/** Stable BetterMTA placeId for a geocode-backed result (not providerPlaceId). */
export function placeIdForGeocode(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `pl_geo_${digest}`;
}

/** Privacy-safe cache key: hash of normalized query (+ coarse proximity bucket). */
export function privacySafeQueryCacheKey(input: {
  query: string;
  limit: number;
  proximityLat?: number;
  proximityLon?: number;
}): string {
  const q = input.query.trim().toLowerCase();
  let proximityBucket = "none";
  if (
    input.proximityLat !== undefined &&
    input.proximityLon !== undefined &&
    Number.isFinite(input.proximityLat) &&
    Number.isFinite(input.proximityLon)
  ) {
    // ~1.1 km buckets — bias only; not precise pins.
    const latB = Math.round(input.proximityLat * 10) / 10;
    const lonB = Math.round(input.proximityLon * 10) / 10;
    proximityBucket = `${latB},${lonB}`;
  }
  const material = `v1|${q}|${input.limit}|${proximityBucket}`;
  return createHash("sha256").update(material).digest("hex");
}
