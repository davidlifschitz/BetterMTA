import type { Place, PlaceKind, PlaceProviderId } from "@/lib/contracts";
import { isAddressPoiSearchEnabled } from "@/lib/mode";

/** Rider-facing place kind label (never vendor ids). */
export function placeKindLabel(kind: PlaceKind): string {
  switch (kind) {
    case "station":
      return "Station";
    case "address":
      return "Address";
    case "poi":
      return "Place";
    case "current_location":
      return "Current location";
    case "coordinate":
      return "Coordinates";
    default:
      return "Place";
  }
}

/**
 * Source label from BetterMTA provider id only.
 * Never surface vendor hostnames or providerPlaceId.
 */
export function placeSourceLabel(
  provider?: PlaceProviderId | string | null,
): string | null {
  if (!provider) return null;
  switch (provider) {
    case "station_index":
      return "Subway station";
    case "geocoder":
      return "Address / place";
    default:
      // Opaque product key — show generic, not the raw vendor-looking string
      // if it looks like a hostname.
      if (/[./]/.test(provider)) return "Place search";
      return "Place search";
  }
}

export function placeOptionSecondary(place: Place): string | null {
  if (place.formattedAddress && place.formattedAddress !== place.label) {
    return place.formattedAddress;
  }
  if (place.borough) return place.borough;
  return null;
}

export function placeOptionAriaLabel(place: Place): string {
  const kind = placeKindLabel(place.kind);
  const source = placeSourceLabel(place.provider);
  const secondary = placeOptionSecondary(place);
  const parts = [place.label, kind];
  if (source && source !== kind) parts.push(source);
  if (secondary) parts.push(secondary);
  return parts.join(", ");
}

/** Station-first when address/POI flag is off (ADR-0022). */
export function filterPlacesForFlag(
  places: Place[],
  env?: NodeJS.ProcessEnv,
): Place[] {
  if (isAddressPoiSearchEnabled(env)) return places;
  return places.filter((p) => p.kind === "station");
}

export function collectPlaceAttribution(
  places: Place[],
  responseAttribution?: string | null,
): string | null {
  const fromPlaces = places
    .map((p) => p.attribution?.trim())
    .filter((a): a is string => Boolean(a));
  if (responseAttribution?.trim()) return responseAttribution.trim();
  if (fromPlaces.length === 0) return null;
  // Dedupe while preserving order
  return [...new Set(fromPlaces)].join(" · ");
}

export function isGeocodeBacked(place: Place): boolean {
  return (
    place.provider === "geocoder" ||
    place.kind === "address" ||
    (place.kind === "poi" && place.provider === "geocoder")
  );
}
