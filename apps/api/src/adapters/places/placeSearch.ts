import type { Logger } from "../../logging/logger.js";
import type { Place, PlaceSearchResponse } from "../../types.js";
import { CONTRACT_VERSION } from "../../constants.js";
import { mergeStationAndGeocodePlaces, withStationProvider } from "./mergePlaces.js";
import { privacySafeQueryCacheKey } from "./placeId.js";
import type { GeocodeQueryCache } from "./queryCache.js";
import type { GeocodeResolveCache } from "./resolveCache.js";
import type { GeocoderProvider } from "./types.js";

export interface PlaceSearchDeps {
  addressPoiEnabled: boolean;
  geocoder: GeocoderProvider | null;
  queryCache: GeocodeQueryCache | null;
  resolveCache: GeocodeResolveCache | null;
  logger?: Logger;
}

/**
 * Compose station-index results with optional feature-flagged geocode results.
 */
export async function composePlaceSearch(
  deps: PlaceSearchDeps,
  input: {
    query: string;
    limit: number;
    proximityLat?: number;
    proximityLon?: number;
    stations: Place[];
    signal?: AbortSignal;
  },
): Promise<PlaceSearchResponse> {
  if (!deps.addressPoiEnabled || !deps.geocoder) {
    return {
      contractVersion: CONTRACT_VERSION,
      query: input.query,
      places: input.stations.map(withStationProvider).slice(0, input.limit),
    };
  }

  const remaining = Math.max(0, input.limit - input.stations.length);
  if (remaining === 0) {
    return mergeStationAndGeocodePlaces({
      query: input.query,
      limit: input.limit,
      stations: input.stations,
      geocode: null,
    });
  }

  const cacheKey = privacySafeQueryCacheKey({
    query: input.query,
    limit: remaining,
    proximityLat: input.proximityLat,
    proximityLon: input.proximityLon,
  });

  let geocode = deps.queryCache?.get(cacheKey);
  if (!geocode) {
    geocode = await deps.geocoder.search({
      query: input.query,
      limit: remaining,
      proximityLat: input.proximityLat,
      proximityLon: input.proximityLon,
      signal: input.signal,
    });
    // Cache empty + ok; do not cache unavailable (allow retry after transient failure).
    if (geocode.availability !== "unavailable") {
      deps.queryCache?.set(cacheKey, geocode);
    } else {
      deps.logger?.info("geocode_skipped_unavailable", {
        resultCount: 0,
        queryLength: input.query.length,
      });
    }
  }

  if (geocode.availability === "ok") {
    const publicPlaces = deps.resolveCache?.rememberMany(geocode.places);
    if (publicPlaces) geocode = { ...geocode, places: publicPlaces };
  }

  return mergeStationAndGeocodePlaces({
    query: input.query,
    limit: input.limit,
    stations: input.stations,
    geocode,
  });
}
