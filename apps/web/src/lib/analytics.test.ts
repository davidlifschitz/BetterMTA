import { describe, expect, it } from "vitest";
import { analyticsPlaceId } from "@/lib/analytics";
import type { Place } from "@/lib/contracts";

describe("analyticsPlaceId", () => {
  it("returns opaque station placeIds", () => {
    const place: Place = {
      placeId: "pl_carroll_st",
      label: "Carroll St",
      kind: "station",
    };
    expect(analyticsPlaceId(place)).toBe("pl_carroll_st");
  });

  it("omits placeId for current_location (no coords in analytics)", () => {
    const place: Place = {
      placeId: "current_location",
      label: "Current location",
      kind: "current_location",
      lat: 40.67912,
      lon: -73.99534,
    };
    expect(analyticsPlaceId(place)).toBeUndefined();
  });

  it("omits legacy coord_* placeIds even if kind is station-like", () => {
    const place: Place = {
      placeId: "coord_40.67912_-73.99534",
      label: "Current location",
      kind: "current_location",
      lat: 40.67912,
      lon: -73.99534,
    };
    expect(analyticsPlaceId(place)).toBeUndefined();
  });

  it("omits placeId for coordinate kind", () => {
    const place: Place = {
      placeId: "coord_40.1_-73.9",
      label: "Pinned",
      kind: "coordinate",
      lat: 40.1,
      lon: -73.9,
    };
    expect(analyticsPlaceId(place)).toBeUndefined();
  });
});
