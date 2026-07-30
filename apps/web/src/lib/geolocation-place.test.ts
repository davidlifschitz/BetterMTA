import { describe, expect, it } from "vitest";
import {
  placeFromGeolocation,
  toPlaceRef,
} from "@/lib/geolocation-place";
import type { Place } from "@/lib/contracts";

const DEMO: Place = {
  placeId: "pl_carroll_st",
  label: "Carroll St",
  kind: "station",
  stationId: "st_carroll",
  borough: "Brooklyn",
};

describe("placeFromGeolocation", () => {
  it("maps to demo station in fixture mode", () => {
    const place = placeFromGeolocation(40.679, -73.995, {
      fixtureMode: true,
      demoOrigin: DEMO,
    });
    expect(place.placeId).toBe("pl_carroll_st");
    expect(place.label).toMatch(/demo/i);
    expect(place.lat).toBe(40.679);
  });

  it("uses real coordinates with Current location label in live mode", () => {
    const place = placeFromGeolocation(40.67912, -73.99534, {
      fixtureMode: false,
    });
    expect(place.label).toBe("Current location");
    expect(place.kind).toBe("current_location");
    expect(place.placeId).toBe("coord_40.67912_-73.99534");
    expect(place.lat).toBe(40.67912);
    expect(place.lon).toBe(-73.99534);
    expect(place.placeId).not.toBe("pl_carroll_st");
  });
});

describe("toPlaceRef", () => {
  it("sends coordinate PlaceRef in live mode for current_location", () => {
    const place = placeFromGeolocation(40.1, -73.9, { fixtureMode: false });
    expect(toPlaceRef(place, { fixtureMode: false })).toEqual({
      coordinate: { lat: 40.1, lon: -73.9 },
      label: "Current location",
    });
  });

  it("keeps placeId PlaceRef in fixture mode even for mapped location", () => {
    const place = placeFromGeolocation(40.1, -73.9, {
      fixtureMode: true,
      demoOrigin: DEMO,
    });
    expect(toPlaceRef(place, { fixtureMode: true })).toEqual({
      placeId: "pl_carroll_st",
    });
  });
});
