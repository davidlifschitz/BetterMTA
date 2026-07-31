/**
 * Privacy-safe logging helpers for place/geocode and route-search paths.
 * Aligns with ADR-0022 + API_CONTRACT §11 (`PrivacySafePlaceLogRef` /
 * `PrivacySafeRouteSearchLog`). Other waves should call these helpers rather
 * than logging raw address text, POI queries, precise coords, or vendor IDs.
 */

import { createHash } from "node:crypto";
import type { PlaceRef, Timing } from "../types.js";

/** Truncated SHA-256 hex for free-text queries — never store the raw string. */
export const PLACE_QUERY_HASH_LENGTH = 16;

/** ~1 km coarsening (~0.01°). */
export const COARSE_GRID_DECIMALS = 2;

export type PrivacySafePlaceLogRef = {
  refType: "placeId" | "stationId" | "coordinate";
  placeId?: string;
  stationId?: string;
  /** Coarsened only (e.g. ~1 km grid); omit when unused. */
  coarseGrid?: string;
  provider?: string;
  kind?: string;
};

export type PrivacySafeRouteSearchLog = {
  requestId: string;
  origin: PrivacySafePlaceLogRef;
  destination: PrivacySafePlaceLogRef;
  /** Preference *count* only — never emit raw selected-line lists here. */
  selectedLineCount?: number;
  timingType: Timing["type"];
  placeQueryHash?: string;
};

/** Keys that must never appear in default logs/analytics (case-insensitive match). */
export const SENSITIVE_LOG_KEY_PATTERNS: readonly RegExp[] = [
  /^lat$/i,
  /^lon$/i,
  /^lng$/i,
  /latitude/i,
  /longitude/i,
  /proximitylat/i,
  /proximitylon/i,
  /proximitylng/i,
  /originlat/i,
  /originlon/i,
  /destlat/i,
  /destlon/i,
  /coordinate/i,
  /^q$/i,
  /^query$/i,
  /^rawquery$/i,
  /^searchquery$/i,
  /^querytext$/i,
  /^address$/i,
  /^formattedaddress$/i,
  /^street$/i,
  /^poi$/i,
  /^poiquery$/i,
  /^label$/i,
  /^providerplaceid$/i,
  /^vendor/i,
  /^authorization$/i,
  /^cookie$/i,
  /apikey/i,
  /api[_-]?key/i,
  /^token$/i,
  /password/i,
  /secret/i,
];

export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_LOG_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Stable truncated hash of address / POI query text.
 * Empty / whitespace-only input yields undefined (nothing to hash).
 */
export function hashPlaceQuery(text: string | undefined | null): string | undefined {
  if (typeof text !== "string") return undefined;
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  return createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, PLACE_QUERY_HASH_LENGTH);
}

/**
 * Coarsen precise coordinates to a ~1 km grid cell id.
 * Returns undefined for non-finite inputs.
 */
export function coarseGridId(
  lat: number,
  lon: number,
  decimals = COARSE_GRID_DECIMALS,
): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  const factor = 10 ** decimals;
  // trunc (not floor) so western longitudes stay on the correct cell.
  const gLat = Math.trunc(lat * factor) / factor;
  const gLon = Math.trunc(lon * factor) / factor;
  return `${gLat.toFixed(decimals)},${gLon.toFixed(decimals)}`;
}

/** Map a PlaceRef to a privacy-safe log shape (no precise coords). */
export function toPrivacySafePlaceLogRef(
  ref: PlaceRef,
  extras?: { provider?: string; kind?: string },
): PrivacySafePlaceLogRef {
  if ("placeId" in ref) {
    return {
      refType: "placeId",
      placeId: ref.placeId,
      provider: extras?.provider,
      kind: extras?.kind,
    };
  }
  if ("stationId" in ref) {
    return {
      refType: "stationId",
      stationId: ref.stationId,
      provider: extras?.provider ?? "station_index",
      kind: extras?.kind ?? "station",
    };
  }
  const coarse = coarseGridId(ref.coordinate.lat, ref.coordinate.lon);
  return {
    refType: "coordinate",
    ...(coarse ? { coarseGrid: coarse } : {}),
    provider: extras?.provider,
    kind: extras?.kind ?? "coordinate",
  };
}

/**
 * Build a PrivacySafeRouteSearchLog.
 * Prefer selectedLineCount over selectedLineIds in operational logs.
 */
export function buildPrivacySafeRouteSearchLog(input: {
  requestId: string;
  origin: PlaceRef;
  destination: PlaceRef;
  timingType: Timing["type"];
  selectedLineIds?: string[];
  placeQueryText?: string;
  originExtras?: { provider?: string; kind?: string };
  destinationExtras?: { provider?: string; kind?: string };
}): PrivacySafeRouteSearchLog {
  const selectedLineCount = input.selectedLineIds?.length;
  return {
    requestId: input.requestId,
    origin: toPrivacySafePlaceLogRef(input.origin, input.originExtras),
    destination: toPrivacySafePlaceLogRef(
      input.destination,
      input.destinationExtras,
    ),
    ...(selectedLineCount !== undefined ? { selectedLineCount } : {}),
    timingType: input.timingType,
    ...(hashPlaceQuery(input.placeQueryText)
      ? { placeQueryHash: hashPlaceQuery(input.placeQueryText) }
      : {}),
  };
}

/**
 * Bound a free-text field for accidental inclusion: always redact.
 * Kept as a named helper so geocode adapters can call it explicitly.
 */
export function redactAddressOrPoiText(_value: unknown): "[redacted]" {
  return "[redacted]";
}

/** Hash opaque vendor / provider place ids before logging. */
export function hashVendorId(id: string | undefined | null): string | undefined {
  if (typeof id !== "string" || id.length === 0) return undefined;
  return createHash("sha256")
    .update(id, "utf8")
    .digest("hex")
    .slice(0, PLACE_QUERY_HASH_LENGTH);
}
