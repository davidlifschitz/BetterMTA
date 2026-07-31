import type { PlaceRef, RouteSearchRequest, Timing } from "../types.js";

/**
 * Route-search cache key components (documented):
 * - normalized origin / destination refs (placeId | stationId | coord bucket)
 * - timing bucket (depart_now minute floor, or type+minute for timed searches)
 * - sorted unique selectedLineIds
 * - staticDatasetVersion
 * - realtimeSnapshotId (or "none")
 * - explanationVariant
 */
export function buildRouteCacheKey(input: {
  request: RouteSearchRequest;
  selectedLineIds: string[];
  staticDatasetVersion: string;
  realtimeSnapshotId: string | null | undefined;
  explanationVariant: "concise" | "detailed";
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const parts = [
    "route",
    normalizePlaceRef(input.request.origin),
    normalizePlaceRef(input.request.destination),
    timingBucket(input.request.timing, nowMs),
    input.selectedLineIds.slice().sort().join(","),
    input.staticDatasetVersion,
    input.realtimeSnapshotId ?? "none",
    input.explanationVariant,
  ];
  return parts.join("|");
}

function normalizePlaceRef(ref: PlaceRef): string {
  if ("placeId" in ref) return `place:${ref.placeId}`;
  if ("stationId" in ref) return `station:${ref.stationId}`;
  // Bucket coordinates to ~110m to avoid caching precise pins across users.
  const lat = Math.round(ref.coordinate.lat * 1000) / 1000;
  const lon = Math.round(ref.coordinate.lon * 1000) / 1000;
  return `coord:${lat},${lon}`;
}

function timingBucket(timing: Timing, nowMs: number): string {
  if (timing.type === "depart_now") {
    const minute = Math.floor(nowMs / 60_000);
    return `depart_now:${minute}`;
  }
  const t = Date.parse(timing.time);
  const minute = Number.isFinite(t) ? Math.floor(t / 60_000) : "invalid";
  return `${timing.type}:${minute}`;
}
