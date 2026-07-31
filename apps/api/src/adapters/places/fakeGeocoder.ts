import type { Place } from "../../types.js";
import {
  DEFAULT_GEOCODER_ATTRIBUTION,
  GEOCODER_PROVIDER_ID,
  type GeocodeSearchInput,
  type GeocodeSearchResult,
  type GeocoderProvider,
} from "./types.js";

type FakeEntry = {
  needles: string[];
  place: Place;
};

/**
 * Deterministic geocoder for CI / fixture mode.
 * Catalog mirrors contracts/fixtures/places/place-search-address.json plus a few extras.
 */
const FAKE_CATALOG: FakeEntry[] = [
  {
    needles: ["277 park", "277 park avenue", "277 park ave"],
    place: {
      placeId: "pl_geo_277_park_ave",
      label: "277 Park Avenue",
      kind: "address",
      lat: 40.7553,
      lon: -73.975,
      provider: GEOCODER_PROVIDER_ID,
      providerPlaceId: "prov_opaque_277_park",
      formattedAddress: "277 Park Avenue, New York, NY 10017",
      attribution: DEFAULT_GEOCODER_ATTRIBUTION,
    },
  },
  {
    needles: ["park avenue tower", "park ave tower"],
    place: {
      placeId: "pl_geo_park_ave_tower",
      label: "Park Avenue Tower",
      kind: "poi",
      lat: 40.7557,
      lon: -73.9744,
      provider: GEOCODER_PROVIDER_ID,
      providerPlaceId: "prov_opaque_park_ave_tower",
      formattedAddress: "65 E 55th St, New York, NY 10022",
      attribution: DEFAULT_GEOCODER_ATTRIBUTION,
    },
  },
  {
    needles: ["one world trade", "1 world trade", "freedom tower"],
    place: {
      placeId: "pl_geo_one_wtc",
      label: "One World Trade Center",
      kind: "poi",
      lat: 40.7127,
      lon: -74.0134,
      provider: GEOCODER_PROVIDER_ID,
      providerPlaceId: "prov_opaque_one_wtc",
      formattedAddress: "285 Fulton St, New York, NY 10007",
      attribution: DEFAULT_GEOCODER_ATTRIBUTION,
    },
  },
];

export class FakeGeocoderAdapter implements GeocoderProvider {
  readonly id = GEOCODER_PROVIDER_ID;

  /** When true, search reports unavailable (provider-down path). */
  unavailable = false;

  constructor(private readonly catalog: FakeEntry[] = FAKE_CATALOG) {}

  async search(input: GeocodeSearchInput): Promise<GeocodeSearchResult> {
    void input.proximityLat;
    void input.proximityLon;
    void input.signal;

    if (this.unavailable) {
      return { availability: "unavailable", places: [] };
    }

    const q = input.query.trim().toLowerCase();
    if (!q) {
      return { availability: "empty", places: [] };
    }

    const matched = this.catalog
      .filter((entry) =>
        entry.needles.some((n) => q.includes(n) || n.includes(q)),
      )
      .map((entry) => ({ ...entry.place }))
      .slice(0, input.limit);

    if (matched.length === 0) {
      return { availability: "empty", places: [] };
    }

    return {
      availability: "ok",
      attribution: DEFAULT_GEOCODER_ATTRIBUTION,
      places: matched,
    };
  }
}
