import { describe, expect, it } from "vitest";
import { createLogger, redactSensitive } from "../src/logging/logger.js";
import {
  buildPrivacySafeRouteSearchLog,
  coarseGridId,
  isSensitiveLogKey,
  redactAddressOrPoiText,
  toPrivacySafePlaceLogRef,
} from "../src/logging/privacy.js";
import {
  PrivacySafeMetrics,
  normalizePlaceProviderMetricId,
  preferenceCoverageBucket,
  requestedCountBucket,
} from "../src/metrics/privacyMetrics.js";
import {
  recordInsufficientCoveragePrivacySignals,
  recordRouteSearchPrivacySignals,
} from "../src/services/privacySignals.js";
import { createTestApp, jsonHeaders } from "./helpers.js";

describe("privacy redaction (ADR-0022 / API_CONTRACT §11)", () => {
  it("redacts address, POI, coords, vendor ids, and secrets", () => {
    const redacted = redactSensitive({
      q: "277 Park Avenue",
      query: "Brooklyn Museum",
      address: "1 Main St",
      formattedAddress: "1 Main St, Brooklyn",
      poiQuery: "museum",
      label: "User typed label",
      providerPlaceId: "prov_opaque_277_park",
      placeId: "pl_geo_v1.high_cardinality_encrypted_location_token",
      debugMessage:
        "resolve failed for pl_geo_v1.high_cardinality_encrypted_location_token",
      debugValues: [
        "pl_geo_v1.high_cardinality_encrypted_location_token",
        "failure near 40.67912,-73.99534",
        "safe aggregate",
      ],
      vendorPlaceId: "mapbox.place.abc",
      proximityLat: 40.7512,
      proximityLon: -73.9758,
      origin: { coordinate: { lat: 40.67912, lon: -73.99534 } },
      authorization: "Bearer secret",
      apiKey: "sk_live_x",
      queryLength: 15,
      placeQueryHash: "abc123",
      requestId: "req_1",
    });

    expect(redacted.q).toBe("[redacted]");
    expect(redacted.query).toBe("[redacted]");
    expect(redacted.address).toBe("[redacted]");
    expect(redacted.formattedAddress).toBe("[redacted]");
    expect(redacted.poiQuery).toBe("[redacted]");
    expect(redacted.label).toBe("[redacted]");
    expect(redacted.providerPlaceId).toBe("[redacted]");
    expect(redacted.placeId).toBe("[redacted]");
    expect(redacted.debugMessage).toBe("[redacted]");
    expect(redacted.debugValues).toEqual([
      "[redacted]",
      "[redacted]",
      "safe aggregate",
    ]);
    expect(redacted.vendorPlaceId).toBe("[redacted]");
    expect(redacted.proximityLat).toBe("[redacted]");
    expect(redacted.proximityLon).toBe("[redacted]");
    expect((redacted.origin as { coordinate: string }).coordinate).toBe(
      "[redacted]",
    );
    expect(redacted.authorization).toBe("[redacted]");
    expect(redacted.apiKey).toBe("[redacted]");
    expect(redacted.queryLength).toBe(15);
    expect(redacted.placeQueryHash).toBe("[redacted]");
    expect(redacted.requestId).toBe("req_1");
  });

  it("redacts precise coordinate-pair strings", () => {
    const redacted = redactSensitive({
      debugPin: "40.67912,-73.99534",
      coarse: "40.67,-73.99",
    });
    expect(redacted.debugPin).toBe("[redacted]");
    expect(redacted.coarse).toBe("40.67,-73.99");
  });

  it("flags sensitive keys", () => {
    expect(isSensitiveLogKey("providerPlaceId")).toBe(true);
    expect(isSensitiveLogKey("formattedAddress")).toBe(true);
    expect(isSensitiveLogKey("placeQueryHash")).toBe(true);
    expect(isSensitiveLogKey("queryLength")).toBe(false);
  });
});

describe("privacy coarsening helpers", () => {
  it("coarsens coordinates to ~1km grid", () => {
    expect(coarseGridId(40.67912, -73.99534)).toBe("40.67,-73.99");
    expect(coarseGridId(91, 0)).toBeUndefined();
  });

  it("maps PlaceRefs to PrivacySafePlaceLogRef without precise coords", () => {
    expect(toPrivacySafePlaceLogRef({ placeId: "st:F21" })).toEqual({
      refType: "placeId",
      placeId: "st:F21",
    });
    expect(toPrivacySafePlaceLogRef({ stationId: "F21" })).toEqual({
      refType: "stationId",
      stationId: "F21",
      provider: "station_index",
      kind: "station",
    });
    const coord = toPrivacySafePlaceLogRef({
      coordinate: { lat: 40.67912, lon: -73.99534 },
      label: "here",
    });
    expect(coord.refType).toBe("coordinate");
    expect(coord.coarseGrid).toBe("40.67,-73.99");
    expect(JSON.stringify(coord)).not.toMatch(/40\.67912/);
    expect(coord).not.toHaveProperty("label");
  });

  it("never logs opaque geocode PlaceRef tokens", () => {
    const token = "pl_geo_v1.high_cardinality_encrypted_location_token";
    const ref = toPrivacySafePlaceLogRef({ placeId: token });
    expect(ref).toEqual({
      refType: "placeId",
      provider: "geocoder",
      kind: "address_or_poi",
    });
    expect(JSON.stringify(ref)).not.toContain(token);
  });

  it("builds PrivacySafeRouteSearchLog with counts not line lists", () => {
    const log = buildPrivacySafeRouteSearchLog({
      requestId: "req_x",
      origin: { placeId: "pl_a" },
      destination: { coordinate: { lat: 40.75, lon: -73.98 } },
      timingType: "depart_now",
      selectedLineIds: ["F", "B", "G"],
    });
    expect(log.selectedLineCount).toBe(3);
    expect(log).not.toHaveProperty("selectedLineIds");
    expect(log).not.toHaveProperty("placeQueryHash");
    expect(JSON.stringify(log)).not.toMatch(/277 Park|Park Avenue/);
    expect(JSON.stringify(log)).not.toMatch(/40\.75001|-73\.98001/);
  });

  it("redactAddressOrPoiText always returns sentinel", () => {
    expect(redactAddressOrPoiText("anything")).toBe("[redacted]");
  });
});

describe("privacy-safe metrics hooks", () => {
  it("records place provider latency/errors without location labels", () => {
    const m = new PrivacySafeMetrics();
    m.recordPlaceProvider({
      provider: "geocoder",
      result: "ok",
      durationMs: 42,
    });
    m.recordPlaceProvider({
      provider: "geocoder",
      result: "error",
      durationMs: 90,
      errorClass: "upstream",
    });
    const snap = m.snapshot();
    expect(
      snap.placeProvider.totals[
        "bettermta_place_provider_total{provider=geocoder,result=ok}"
      ],
    ).toBe(1);
    expect(
      snap.placeProvider.totals[
        "bettermta_place_provider_errors_total{provider=geocoder,reason=upstream}"
      ],
    ).toBe(1);
    expect(snap.placeProvider.latency.count).toBe(2);
    expect(JSON.stringify(snap)).not.toMatch(/Park Avenue|proximityLat|providerPlaceId/i);
  });

  it("records candidate budget + preference coverage aggregates", () => {
    const m = new PrivacySafeMetrics();
    m.recordCandidateCoverage({
      status: "exhausted",
      familiesAttemptedCount: 3,
      candidateCount: 12,
      preferenceCoveringCandidateCount: 0,
      budgetExhausted: true,
    });
    m.recordPreferenceCoverage({
      requestedCount: 3,
      satisfactionCount: 1,
      isComplete: false,
    });
    const snap = m.snapshot();
    expect(snap.candidateBudget.totals["bettermta_candidate_budget_exhausted_total"]).toBe(
      1,
    );
    expect(snap.candidateBudget.lastCandidateCount).toBe(12);
    expect(
      snap.preferenceCoverage.totals[
        "bettermta_preference_coverage_total{bucket=partial,requested_bucket=3}"
      ],
    ).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/"F"|"B"|"selectedLine/);
  });

  it("buckets preference coverage", () => {
    expect(preferenceCoverageBucket(0, 0, true)).toBe("n_a");
    expect(preferenceCoverageBucket(2, 2, true)).toBe("complete");
    expect(preferenceCoverageBucket(2, 0, false)).toBe("none");
    expect(preferenceCoverageBucket(2, 1, false)).toBe("partial");
    expect(requestedCountBucket(7)).toBe("5");
    expect(normalizePlaceProviderMetricId("mapbox.com")).toBe("unknown");
    expect(normalizePlaceProviderMetricId("geocoder")).toBe("geocoder");
  });

  it("exports privacy-safe Prometheus metrics only with the configured bearer token", async () => {
    const { app, deps } = await createTestApp({
      metricsToken: "metrics-test-token",
    });
    deps.privacyMetrics.recordPlaceProvider({
      provider: "geocoder",
      result: "error",
      durationMs: 90,
      errorClass: "upstream",
    });

    const unauthorized = await app.inject({
      method: "GET",
      url: "/internal/metrics",
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { authorization: "Bearer metrics-test-token" },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.headers["content-type"]).toMatch(/text\/plain/);
    expect(authorized.body).toContain(
      'bettermta_place_provider_errors_total{provider="geocoder",reason="upstream"} 1',
    );
    expect(authorized.body).toContain(
      "bettermta_place_provider_duration_seconds_count 1",
    );
    expect(authorized.body).not.toMatch(/Park Avenue|providerPlaceId|selectedLineIds/i);
    await app.close();
  });
});

describe("route-search privacy signals", () => {
  it("logs PrivacySafeRouteSearchLog fields and preference aggregates", () => {
    const lines: string[] = [];
    const logger = {
      info: (_msg: string, fields?: Record<string, unknown>) => {
        lines.push(JSON.stringify(fields ?? {}));
      },
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    };
    const metrics = new PrivacySafeMetrics();
    recordRouteSearchPrivacySignals({
      body: {
        origin: { coordinate: { lat: 40.67912, lon: -73.99534 } },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F", "B"],
      },
      result: {
        contractVersion: "2026-07-30",
        requestId: "req_1",
        staticDatasetVersion: "v1",
        dataMode: "synthetic",
        freshness: { warnings: [] },
        baseline: { itineraries: [] },
        constrained: {
          itineraries: [{}],
          satisfactionSummary: {
            bestSatisfactionCount: 1,
            requestedCount: 2,
            completeMatchFound: false,
          },
        },
        candidateCoverage: {
          status: "degraded",
          familiesAttempted: ["baseline", "constrained"],
          candidateCount: 4,
          preferenceCoveringCandidateCount: 1,
          budgetExhausted: false,
        },
      } as never,
      requestId: "req_1",
      durationMs: 12,
      logger: logger as never,
      privacyMetrics: metrics,
    });

    expect(lines[0]).not.toMatch(/40\.67912|-73\.99534|"F"|"B"/);
    expect(lines[0]).toContain('"selectedLineCount":2');
    expect(lines[0]).toContain('"coarseGrid"');
    expect(metrics.getCounter("bettermta_candidate_coverage_total", {
      status: "degraded",
    })).toBe(1);
    expect(
      metrics.getCounter("bettermta_preference_coverage_total", {
        bucket: "partial",
        requested_bucket: "2",
      }),
    ).toBe(1);
  });

  it("records exhausted coverage from error hook", () => {
    const metrics = new PrivacySafeMetrics();
    recordInsufficientCoveragePrivacySignals({
      privacyMetrics: metrics,
      details: {
        status: "exhausted",
        familiesAttempted: ["baseline"],
        candidateCount: 0,
        preferenceCoveringCandidateCount: 0,
        budgetExhausted: true,
      },
    });
    expect(metrics.getCounter("bettermta_candidate_budget_exhausted_total")).toBe(
      1,
    );
  });
});

describe("places endpoint privacy regression", () => {
  it("never logs raw q, a stable query hash, or precise proximity", async () => {
    const captured: string[] = [];
    const logger = createLogger("info");
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };

    const metrics = new PrivacySafeMetrics();
    try {
      const { app } = await createTestApp(
        { logLevel: "info" },
        { logger, privacyMetrics: metrics },
      );
      const res = await app.inject({
        method: "GET",
        url: "/v1/places/search?q=Carroll%20Street&proximityLat=40.67912&proximityLon=-73.99534",
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    } finally {
      console.log = origLog;
    }

    const joined = captured.join("\n");
    expect(joined).toContain("places_ok");
    expect(joined).not.toMatch(/Carroll Street/);
    expect(joined).not.toMatch(/40\.67912|-73\.99534/);
    expect(joined).not.toMatch(/placeQueryHash/);
    expect(joined).toMatch(/proximityGrid/);
    expect(
      metrics.getCounter("bettermta_places_search_total", { result: "ok" }) +
        metrics.getCounter("bettermta_places_search_total", { result: "empty" }),
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("logger end-to-end redaction", () => {
  it("createLogger strips sensitive fields from stdout", () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      const logger = createLogger("info");
      logger.info(
        "leak_check pl_geo_v1.high_cardinality_encrypted_location_token at 40.67912,-73.99534",
        {
          q: "secret address",
          lat: 40.1,
          providerPlaceId: "vend_1",
          queryLength: 14,
        },
      );
    } finally {
      console.log = orig;
    }
    expect(captured[0]).not.toContain("secret address");
    expect(captured[0]).not.toContain("40.1");
    expect(captured[0]).not.toContain("vend_1");
    expect(captured[0]).not.toContain("pl_geo_v1.");
    expect(captured[0]).not.toContain("40.67912");
    expect(captured[0]).toContain('"queryLength":14');
  });
});

describe("route search endpoint does not log preferred line lists", () => {
  it("emits selectedLineCount only", async () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    const logger = createLogger("info");
    try {
      const { app } = await createTestApp(
        { logLevel: "info" },
        { logger },
      );
      const res = await app.inject({
        method: "POST",
        url: "/v1/routes/search",
        headers: jsonHeaders(),
        payload: {
          origin: { placeId: "pl_carroll_st" },
          destination: { placeId: "pl_bryant_park" },
          timing: { type: "depart_now" },
          selectedLineIds: ["F", "B"],
        },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    } finally {
      console.log = orig;
    }
    const ok = captured.find((l) => l.includes("route_search_ok"));
    expect(ok).toBeTruthy();
    expect(ok).toContain('"selectedLineCount":2');
    expect(ok).not.toMatch(/"selectedLineIds":\["F","B"\]/);
  });
});
