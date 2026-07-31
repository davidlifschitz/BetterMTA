import { describe, expect, it } from "vitest";
import {
  collectPlaceAttribution,
  filterPlacesForFlag,
  isGeocodeBacked,
  placeKindLabel,
  placeOptionAriaLabel,
  placeSourceLabel,
} from "@/lib/place-display";
import type { Place } from "@/lib/contracts";

const station: Place = {
  placeId: "pl_union_sq",
  label: "Union Square",
  kind: "station",
  provider: "station_index",
  borough: "Manhattan",
};

const address: Place = {
  placeId: "pl_geo_277_park_ave",
  label: "277 Park Avenue",
  kind: "address",
  provider: "geocoder",
  providerPlaceId: "prov_opaque_277_park",
  formattedAddress: "277 Park Avenue, New York, NY 10017",
  attribution: "Address results via BetterMTA geocoder adapter",
};

describe("place-display", () => {
  it("labels kinds and BetterMTA providers without vendor ids", () => {
    expect(placeKindLabel("station")).toBe("Station");
    expect(placeKindLabel("address")).toBe("Address");
    expect(placeSourceLabel("station_index")).toBe("Subway station");
    expect(placeSourceLabel("geocoder")).toBe("Address / place");
    expect(placeOptionAriaLabel(address)).not.toMatch(/prov_opaque/);
    expect(placeOptionAriaLabel(address)).toMatch(/Address/);
  });

  it("filters to stations when address/POI flag is off", () => {
    const env = { NEXT_PUBLIC_FLAG_ADDRESS_POI: undefined };
    expect(filterPlacesForFlag([station, address], env)).toEqual([station]);
  });

  it("keeps address/POI when flag is on", () => {
    const env = { NEXT_PUBLIC_FLAG_ADDRESS_POI: "true" };
    expect(filterPlacesForFlag([station, address], env)).toEqual([
      station,
      address,
    ]);
  });

  it("collects attribution and detects geocode-backed results", () => {
    expect(isGeocodeBacked(address)).toBe(true);
    expect(isGeocodeBacked(station)).toBe(false);
    expect(collectPlaceAttribution([address])).toMatch(/BetterMTA geocoder/);
    expect(
      collectPlaceAttribution([station], "Response attribution"),
    ).toBe("Response attribution");
  });
});
