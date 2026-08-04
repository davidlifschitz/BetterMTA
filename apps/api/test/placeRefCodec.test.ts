import { describe, expect, it } from "vitest";
import {
  GeocodePlaceRefCodec,
  GeocodeQueryCache,
  GeocodeResolveCache,
  FakeGeocoderAdapter,
  assertProductionPlaceRefKey,
  composePlaceSearch,
  decodeGeocodePlaceRefKey,
} from "../src/adapters/places/index.js";
import { LiveDataAdapter } from "../src/adapters/live/LiveDataAdapter.js";
import { buildApp } from "../src/app.js";
import { createLogger } from "../src/logging/logger.js";
import type { Place } from "../src/types.js";
import { createTestApp } from "./helpers.js";

const KEY_A = Buffer.alloc(32, 0x11);
const KEY_B = Buffer.alloc(32, 0x22);

const geocodePlace: Place = {
  placeId: "pl_geo_provider_local",
  label: "277 Park Avenue",
  kind: "address",
  lat: 40.7553,
  lon: -73.975,
  provider: "geocoder",
  providerPlaceId: "way:99",
  formattedAddress: "277 Park Avenue, New York, NY 10017",
  attribution: "Address results via BetterMTA geocoder adapter",
};

describe("stateless geocode PlaceRefs", () => {
  it("encrypts precise place data and omits provider ids from public results", () => {
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });

    const sealed = codec.seal(geocodePlace);

    expect(sealed.placeId).toMatch(/^pl_geo_v1\.[A-Za-z0-9_-]+$/);
    expect(sealed.placeId).not.toContain("Park");
    expect(sealed.placeId).not.toContain("40.7553");
    expect(sealed.placeId).not.toContain("way:99");
    expect(sealed).not.toHaveProperty("providerPlaceId");
    expect(codec.open(sealed.placeId)).toEqual(sealed);
  });

  it("does not pass unexpected provider fields through the public response", () => {
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const providerPlace = {
      ...geocodePlace,
      rawVendorPayload: { display_name: "sensitive upstream value" },
    } as Place;

    const sealed = codec.seal(providerPlace);

    expect(sealed).not.toHaveProperty("rawVendorPayload");
  });

  it("rejects provider text that exceeds the token payload bounds", () => {
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });

    expect(() =>
      codec.seal({
        ...geocodePlace,
        formattedAddress: "x".repeat(1_001),
      }),
    ).toThrow(/bounded geocoder metadata/);
  });

  it("resolves across cache instances sharing a key", () => {
    const codecA = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const codecB = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const cacheA = new GeocodeResolveCache(60_000, () => 1_000, codecA);
    const cacheB = new GeocodeResolveCache(60_000, () => 1_000, codecB);

    const sealed = cacheA.remember(geocodePlace);

    expect(cacheB.size()).toBe(0);
    expect(cacheB.get(sealed.placeId)).toEqual(sealed);
  });

  it("fails closed for tampered, expired, and wrong-key refs", () => {
    let now = 1_000;
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => now,
    });
    const wrongKeyCodec = new GeocodePlaceRefCodec({
      key: KEY_B,
      ttlMs: 60_000,
      now: () => now,
    });
    const token = codec.seal(geocodePlace).placeId;
    const last = token.at(-1);
    const tampered = `${token.slice(0, -1)}${last === "A" ? "B" : "A"}`;

    expect(codec.open(tampered)).toBeNull();
    expect(wrongKeyCodec.open(token)).toBeNull();
    now = 61_001;
    expect(codec.open(token)).toBeNull();
  });

  it("expires hot-cache and stateless reads at the exact deadline", () => {
    let now = 1_000;
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => now,
    });
    const cache = new GeocodeResolveCache(60_000, () => now, codec);
    const sealed = cache.remember(geocodePlace);

    now = 61_000;
    expect(codec.open(sealed.placeId)).toBeNull();
    expect(cache.get(sealed.placeId)).toBeNull();
  });

  it("rejects non-canonical base64url aliases", () => {
    const codec = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const token = codec.seal(geocodePlace).placeId;
    const [prefix, encoded] = token.split(".");
    const bytes = Buffer.from(encoded!, "base64url");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alias = [...alphabet]
      .map((character) => `${encoded!.slice(0, -1)}${character}`)
      .find(
        (candidate) =>
          candidate !== encoded &&
          Buffer.from(candidate, "base64url").equals(bytes),
      );

    expect(alias).toBeDefined();
    expect(codec.open(`${prefix}.${alias}`)).toBeNull();
  });

  it("returns a PlaceRef that a separate live adapter instance can resolve", async () => {
    const codecA = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const codecB = new GeocodePlaceRefCodec({
      key: KEY_A,
      ttlMs: 60_000,
      now: () => 1_000,
    });
    const searchCache = new GeocodeResolveCache(60_000, () => 1_000, codecA);
    const resolveCache = new GeocodeResolveCache(60_000, () => 1_000, codecB);
    const response = await composePlaceSearch(
      {
        addressPoiEnabled: true,
        geocoder: new FakeGeocoderAdapter(),
        queryCache: new GeocodeQueryCache(60_000, 32),
        resolveCache: searchCache,
      },
      { query: "277 Park", limit: 5, stations: [] },
    );
    const ref = response.places[0];
    const adapter = new LiveDataAdapter({
      baseUrl: "http://127.0.0.1:9",
      statusTtlMs: 1_000,
      catalogTtlMs: 1_000,
      permitDegradedReady: true,
      addressPoiEnabled: true,
      geocodeResolveCache: resolveCache,
      fetchImpl: async () => {
        throw new Error("network disabled");
      },
    });

    expect(ref?.placeId).toMatch(/^pl_geo_v1\./);
    expect(await adapter.resolvePlace({ placeId: ref?.placeId })).toEqual(ref);
  });
});

describe("geocode PlaceRef key safety", () => {
  it("accepts only exactly 32-byte base64 or base64url keys", () => {
    expect(decodeGeocodePlaceRefKey(KEY_A.toString("base64"))).toEqual(KEY_A);
    expect(decodeGeocodePlaceRefKey(KEY_A.toString("base64url"))).toEqual(KEY_A);
    expect(() => decodeGeocodePlaceRefKey("too-short")).toThrow(/32-byte/);
  });

  it("requires a key when address/POI is enabled in production", () => {
    expect(() =>
      assertProductionPlaceRefKey(true, null, "production"),
    ).toThrow(/BETTERMTA_PLACE_REF_KEY/);
    expect(() =>
      assertProductionPlaceRefKey(false, null, "production"),
    ).not.toThrow();
    expect(() => assertProductionPlaceRefKey(true, null, "test")).not.toThrow();
  });

  it("refuses to build a production app with address/POI enabled and no key", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(
        buildApp({
          config: {
            adapterMode: "live",
            addressPoiEnabled: true,
            placeRefKey: null,
            logLevel: "silent",
          },
          deps: { logger: createLogger("silent") },
        }),
      ).rejects.toThrow(/BETTERMTA_PLACE_REF_KEY/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("wires encrypted refs into the real place-search app", async () => {
    const { app } = await createTestApp({
      addressPoiEnabled: true,
      geocoderProvider: "fake",
      placeRefKey: KEY_A.toString("base64url"),
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/places/search?q=277%20Park&limit=8",
      });
      const address = response
        .json()
        .places.find((place: Place) => place.kind === "address") as Place;
      expect(response.statusCode).toBe(200);
      expect(address.placeId).toMatch(/^pl_geo_v1\./);
      expect(address).not.toHaveProperty("providerPlaceId");
    } finally {
      await app.close();
    }
  });
});
