import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  FakeGeocoderAdapter,
  GeocodeQueryCache,
  GeocodeResolveCache,
  NominatimGeocoderAdapter,
  composePlaceSearch,
  loadFeatureFlags,
  mergeStationAndGeocodePlaces,
  placeIdForGeocode,
  privacySafeQueryCacheKey,
  withStationProvider,
} from "../src/adapters/places/index.js";
import { LiveDataAdapter } from "../src/adapters/live/LiveDataAdapter.js";
import { createTestApp, jsonHeaders } from "./helpers.js";
import { loadValidators } from "../src/validation/ajv.js";
import { redactSensitive } from "../src/logging/logger.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const contractsRoot = path.join(repoRoot, "contracts");

describe("place geocoder unit", () => {
  it("FakeGeocoder resolves 277 Park deterministically", async () => {
    const geo = new FakeGeocoderAdapter();
    const res = await geo.search({ query: "277 Park", limit: 5 });
    expect(res.availability).toBe("ok");
    expect(res.places[0]?.placeId).toBe("pl_geo_277_park_ave");
    expect(res.places[0]?.kind).toBe("address");
    expect(res.places[0]?.provider).toBe("geocoder");
    expect(res.places[0]?.attribution).toBeTruthy();
    expect(res.attribution).toBeTruthy();
  });

  it("FakeGeocoder empty and unavailable states", async () => {
    const geo = new FakeGeocoderAdapter();
    const empty = await geo.search({ query: "zzzz-no-match", limit: 5 });
    expect(empty.availability).toBe("empty");
    expect(empty.places).toEqual([]);

    geo.unavailable = true;
    const down = await geo.search({ query: "277 Park", limit: 5 });
    expect(down.availability).toBe("unavailable");
    expect(down.places).toEqual([]);
  });

  it("merge keeps stations first and never invents geocode fills on miss", () => {
    const stations = [
      withStationProvider({
        placeId: "st:F21",
        label: "Carroll St",
        kind: "station",
        stationId: "F21",
      }),
    ];
    const merged = mergeStationAndGeocodePlaces({
      query: "nope",
      limit: 8,
      stations,
      geocode: { availability: "empty", places: [] },
    });
    expect(merged.places).toHaveLength(1);
    expect(merged.places[0]?.provider).toBe("station_index");
    expect(merged.attribution).toBeUndefined();
  });

  it("privacy-safe cache key is stable and ignores precise pin differences inside bucket", () => {
    const a = privacySafeQueryCacheKey({
      query: "277 Park",
      limit: 3,
      proximityLat: 40.7553,
      proximityLon: -73.9751,
    });
    const b = privacySafeQueryCacheKey({
      query: "277 Park",
      limit: 3,
      proximityLat: 40.7559,
      proximityLon: -73.9759,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("placeIdForGeocode is stable", () => {
    expect(placeIdForGeocode("way:123")).toBe(placeIdForGeocode("way:123"));
    expect(placeIdForGeocode("way:123")).toMatch(/^pl_geo_[a-f0-9]{16}$/);
  });

  it("Nominatim adapter maps hits with attribution and BetterMTA provider id", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            place_id: 1,
            osm_type: "way",
            osm_id: 99,
            display_name: "277 Park Avenue, New York, NY 10017, United States",
            lat: "40.7553",
            lon: "-73.975",
            class: "building",
            type: "yes",
            name: "277 Park Avenue",
            address: {
              house_number: "277",
              road: "Park Avenue",
              city: "New York",
              state: "New York",
              postcode: "10017",
              country: "United States",
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const geo = new NominatimGeocoderAdapter({
      baseUrl: "https://nominatim.test",
      userAgent: "BetterMTA-Test/0.1",
      timeoutMs: 500,
      maxAttempts: 1,
      minIntervalMs: 0,
      fetchImpl,
    });

    const res = await geo.search({ query: "277 Park", limit: 5 });
    expect(res.availability).toBe("ok");
    expect(res.places[0]?.provider).toBe("geocoder");
    expect(res.places[0]?.providerPlaceId).toBe("way:99");
    expect(res.places[0]?.formattedAddress).toContain("277 Park");
    expect(res.attribution).toContain("OpenStreetMap");
    expect(res.places[0]?.placeId).toMatch(/^pl_geo_/);
  });

  it("Nominatim returns unavailable on persistent upstream failure", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("nope", { status: 503 });
    const geo = new NominatimGeocoderAdapter({
      baseUrl: "https://nominatim.test",
      userAgent: "BetterMTA-Test/0.1",
      timeoutMs: 200,
      maxAttempts: 2,
      minIntervalMs: 0,
      fetchImpl,
      sleep: async () => undefined,
    });
    const res = await geo.search({ query: "277 Park", limit: 3 });
    expect(res.availability).toBe("unavailable");
    expect(res.places).toEqual([]);
  });

  it("loadFeatureFlags defaults address_poi_enabled false and honors FEATURE_FLAGS_JSON", () => {
    const defaults = loadFeatureFlags({});
    expect(defaults.address_poi_enabled).toBe(false);

    const on = loadFeatureFlags({
      featureFlagsJson: JSON.stringify({ address_poi_enabled: true }),
    });
    expect(on.address_poi_enabled).toBe(true);
  });

  it("logger redacts query and coordinates", () => {
    const safe = redactSensitive({
      query: "277 Park Avenue",
      lat: 40.7,
      lon: -74.0,
      queryLength: 15,
    });
    expect(safe.query).toBe("[redacted]");
    expect(safe.lat).toBe("[redacted]");
    expect(safe.lon).toBe("[redacted]");
    expect(safe.queryLength).toBe(15);
  });
});

describe("place search HTTP (fixture + fake geocoder)", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it("flag-off keeps station-index-only results for address-like queries", async () => {
    const { app } = await createTestApp({
      addressPoiEnabled: false,
      geocoderProvider: "fake",
    });
    apps.push(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=277%20Park&limit=8",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.places.every((p: { kind: string }) => p.kind === "station")).toBe(
      true,
    );
    expect(body.attribution).toBeUndefined();
  });

  it("flag-on fake geocoder returns attributed address PlaceRef", async () => {
    const { app } = await createTestApp({
      addressPoiEnabled: true,
      geocoderProvider: "fake",
    });
    apps.push(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=277%20Park&limit=8",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-contract-version"]).toBe("2026-07-31");
    const body = res.json();
    expect(body.contractVersion).toBe("2026-07-31");
    expect(body.attribution).toBeTruthy();
    const addr = body.places.find(
      (p: { placeId: string }) => p.placeId === "pl_geo_277_park_ave",
    );
    expect(addr).toBeTruthy();
    expect(addr.kind).toBe("address");
    expect(addr.provider).toBe("geocoder");
    expect(addr.formattedAddress).toContain("277 Park");
    expect(addr.attribution).toBeTruthy();

    const validators = loadValidators(contractsRoot);
    expect(validators.validatePlaceSearchResponse(body)).toBe(true);
  });

  it("resolvePlace remembers geocode hits and does not substitute stations on miss", async () => {
    const resolveCache = new GeocodeResolveCache(60_000);
    const queryCache = new GeocodeQueryCache(60_000, 32);
    const geocoder = new FakeGeocoderAdapter();

    const composed = await composePlaceSearch(
      {
        addressPoiEnabled: true,
        geocoder,
        queryCache,
        resolveCache,
      },
      {
        query: "277 Park",
        limit: 5,
        stations: [],
      },
    );
    expect(composed.places[0]?.placeId).toBe("pl_geo_277_park_ave");
    expect(resolveCache.get("pl_geo_277_park_ave")?.label).toBe(
      "277 Park Avenue",
    );
    expect(resolveCache.get("pl_geo_does_not_exist")).toBeNull();
  });

  it("LiveDataAdapter resolvePlace never substitutes station for unknown pl_geo_*", async () => {
    const resolveCache = new GeocodeResolveCache(60_000);
    const adapter = new LiveDataAdapter({
      baseUrl: "http://127.0.0.1:9",
      statusTtlMs: 1000,
      catalogTtlMs: 1000,
      permitDegradedReady: true,
      addressPoiEnabled: true,
      geocoder: new FakeGeocoderAdapter(),
      geocodeResolveCache: resolveCache,
      fetchImpl: async () => {
        throw new Error("network disabled");
      },
    });
    const miss = await adapter.resolvePlace({ placeId: "pl_geo_missing" });
    expect(miss).toBeNull();
  });
});

describe("places route still validates contract headers", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it("union station search remains valid under 2026-07-31", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=union",
      headers: jsonHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const validators = loadValidators(contractsRoot);
    expect(validators.validatePlaceSearchResponse(res.json())).toBe(true);
  });
});
