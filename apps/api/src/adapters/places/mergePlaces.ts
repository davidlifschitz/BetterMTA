import type { Place, PlaceSearchResponse } from "../../types.js";
import { CONTRACT_VERSION } from "../../constants.js";
import type { GeocodeSearchResult } from "./types.js";
import { STATION_INDEX_PROVIDER_ID } from "./types.js";

/** Ensure station results carry the station_index provider id. */
export function withStationProvider(place: Place): Place {
  if (place.kind !== "station") return place;
  return {
    ...place,
    provider: place.provider ?? STATION_INDEX_PROVIDER_ID,
  };
}

/**
 * Station index first (authoritative). Fill remaining slots with geocode results.
 * Never substitutes a station for a geocode miss.
 */
export function mergeStationAndGeocodePlaces(input: {
  query: string;
  limit: number;
  stations: Place[];
  geocode: GeocodeSearchResult | null;
}): PlaceSearchResponse {
  const stations = input.stations
    .map(withStationProvider)
    .slice(0, input.limit);
  const remaining = Math.max(0, input.limit - stations.length);

  const geocodePlaces =
    remaining > 0 && input.geocode && input.geocode.availability === "ok"
      ? input.geocode.places.slice(0, remaining)
      : [];

  const places = [...stations, ...geocodePlaces];
  const attribution =
    geocodePlaces.length > 0
      ? (input.geocode?.attribution ??
        geocodePlaces.find((p) => p.attribution)?.attribution)
      : undefined;

  const response: PlaceSearchResponse = {
    contractVersion: CONTRACT_VERSION,
    query: input.query,
    places,
  };
  if (attribution) response.attribution = attribution;
  return response;
}
