import type { Place } from "../../types.js";

/** BetterMTA geocoder provider id — never a vendor hostname (ADR-0022 / API_CONTRACT). */
export const GEOCODER_PROVIDER_ID = "geocoder" as const;
export const STATION_INDEX_PROVIDER_ID = "station_index" as const;

export const DEFAULT_GEOCODER_ATTRIBUTION =
  "Address results via BetterMTA geocoder adapter" as const;

export type GeocoderAvailability = "ok" | "empty" | "unavailable";

export interface GeocodeSearchInput {
  query: string;
  limit: number;
  proximityLat?: number;
  proximityLon?: number;
  signal?: AbortSignal;
}

export interface GeocodeSearchResult {
  availability: GeocoderAvailability;
  /** Response-level attribution when any geocode-backed places are present. */
  attribution?: string;
  places: Place[];
}

/**
 * Provider-agnostic address/POI geocoder boundary (ADR-0022).
 * Implementations must not log precise coordinates or raw query text.
 */
export interface GeocoderProvider {
  readonly id: typeof GEOCODER_PROVIDER_ID;
  search(input: GeocodeSearchInput): Promise<GeocodeSearchResult>;
}
