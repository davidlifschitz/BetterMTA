import type { Place, PlaceRef } from "@/lib/contracts";

export type DemoOrigin = Place;

/**
 * Build an origin Place from browser geolocation.
 * Fixture mode may map to a demo station (labeled honestly).
 * Live mode MUST use real coordinates — never demo-station mapping (ADR-0018).
 */
export function placeFromGeolocation(
  lat: number,
  lon: number,
  options: { fixtureMode: boolean; demoOrigin?: DemoOrigin },
): Place {
  if (options.fixtureMode) {
    const demo = options.demoOrigin;
    if (!demo) {
      throw new Error("fixtureMode geolocation requires demoOrigin");
    }
    return {
      ...demo,
      kind: "current_location",
      label: "Near you (demo — mapped to Carroll St)",
      lat,
      lon,
    };
  }

  // Opaque placeId — never embed lat/lon (analytics and logs must stay privacy-safe).
  // Real coordinates remain on lat/lon for live PlaceRef via toPlaceRef.
  return {
    placeId: "current_location",
    label: "Current location",
    kind: "current_location",
    lat,
    lon,
  };
}

/**
 * Convert a selected Place into a contract PlaceRef for route search.
 * Live coordinate / current_location places become { coordinate, label }.
 */
export function toPlaceRef(
  place: Place,
  options: { fixtureMode: boolean },
): PlaceRef {
  const isCoordKind =
    place.kind === "coordinate" || place.kind === "current_location";
  if (
    !options.fixtureMode &&
    isCoordKind &&
    typeof place.lat === "number" &&
    typeof place.lon === "number"
  ) {
    return {
      coordinate: { lat: place.lat, lon: place.lon },
      label: place.label,
    };
  }
  return { placeId: place.placeId };
}
