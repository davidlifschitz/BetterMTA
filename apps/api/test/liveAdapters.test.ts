import {
  createServer,
  type Server,
} from "node:http";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LiveDataAdapter } from "../src/adapters/live/LiveDataAdapter.js";
import {
  graphVersionMatchesStatic,
  LiveRoutingAdapter,
} from "../src/adapters/live/LiveRoutingAdapter.js";
import type { CandidateProvider } from "../src/adapters/live/routingBinding.js";
import type { RouteSearchOutcome } from "../src/adapters/live/routingBinding.js";
import { ApiError } from "../src/errors/apiError.js";
import { buildRouteCacheKey } from "../src/cache/routeCacheKey.js";
import { buildApp } from "../src/app.js";
import { assertProductionAdapterLockout } from "../src/config.js";
import { createLogger, redactSensitive } from "../src/logging/logger.js";
import { createTestApp, jsonHeaders } from "./helpers.js";
import {
  closeServer,
  createStubDataState,
  startStubDataServer,
} from "./stubDataServer.js";

describe("LiveDataAdapter", () => {
  let server: Server | undefined;
  let baseUrl = "";
  const state = createStubDataState();

  beforeEach(async () => {
    Object.assign(state, createStubDataState());
    const started = await startStubDataServer(state);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (server) await closeServer(server);
    server = undefined;
    vi.useRealTimers();
  });

  function adapter(overrides: Partial<ConstructorParameters<typeof LiveDataAdapter>[0]> = {}) {
    return new LiveDataAdapter({
      baseUrl,
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
      ...overrides,
    });
  }

  it("maps status + catalogs to DataAdapter shapes", async () => {
    const a = adapter();
    const status = await a.getStatus();
    expect(status.dataMode).toBe("live");
    expect(status.staticDatasetVersion).toBe("gtfs_live_v1");
    expect(status.realtimeSnapshotId).toBe("rt_live_1");

    const lines = await a.listLines();
    expect(lines.lines.map((l) => l.lineId).sort()).toEqual(["B", "F"]);
    expect(lines.lines.find((l) => l.lineId === "F")?.gtfsRouteIds).toContain(
      "FX",
    );

    const snap = await a.getSnapshotHandle();
    expect(snap.staticDatasetVersion).toBe("gtfs_live_v1");
    expect(snap.dataMode).toBe("live");
  });

  it("sends Authorization Bearer header", async () => {
    const a = adapter({ token: "test-token" });
    await a.getStatus();
    expect(state.authHeaders.some((h) => h === "Bearer test-token")).toBe(true);
  });

  it("TTL-caches status within window and SWR-refreshes after expiry", async () => {
    let now = 1_700_000_000_000;
    const a = adapter({
      statusTtlMs: 5_000,
      now: () => now,
    });
    await a.getStatus();
    expect(state.hitCounts["/internal/status"]).toBe(1);
    await a.getStatus();
    expect(state.hitCounts["/internal/status"]).toBe(1);

    now += 5_001;
    state.status.realtime = {
      snapshotId: "rt_live_2",
      dataMode: "live",
      ageSeconds: 1,
    };
    // SWR: returns stale immediately, kicks background refresh.
    const stale = await a.getStatus();
    expect(stale.realtimeSnapshotId).toBe("rt_live_1");

    // Await background refresh without fake timers (fetch needs real time).
    await new Promise((r) => setTimeout(r, 40));
    const fresh = await a.getStatus();
    expect(fresh.realtimeSnapshotId).toBe("rt_live_2");
    expect(state.hitCounts["/internal/status"]).toBe(2);
  });

  it("unreachable data service => degraded readiness + data_unavailable on catalogs", async () => {
    await closeServer(server!);
    server = undefined;
    const a = adapter({ baseUrl: "http://127.0.0.1:9" });
    const readiness = await a.getReadiness();
    expect(readiness.staticOk).toBe(false);
    expect(readiness.dataMode).toBe("unavailable");
    expect(readiness.reasons).toContain("data_service_unreachable");

    await expect(a.listLines()).rejects.toMatchObject({
      code: "data_unavailable",
    });
  });

  it("ranks station search prefix > word-boundary > substring, respects max", async () => {
    const a = adapter();
    const prefix = await a.searchPlaces({ query: "union", limit: 10 });
    expect(prefix.places[0]?.label.toLowerCase().startsWith("union")).toBe(true);

    // Diacritic folding: José → jose when present
    state.stations.push({
      stationId: "X99",
      name: "José Station",
      lat: 40.7,
      lon: -74.0,
      lineIds: ["1"],
    });
    a.getStationsCache().invalidate();
    const folded = await a.searchPlaces({ query: "jose", limit: 5 });
    expect(folded.places.some((p) => p.stationId === "X99")).toBe(true);

    const limited = await a.searchPlaces({ query: "st", limit: 2 });
    expect(limited.places.length).toBeLessThanOrEqual(2);
  });

  it("coordinate proximity is accepted (passthrough bias)", async () => {
    const a = adapter();
    // Near Union Square
    const res = await a.searchPlaces({
      query: "union",
      limit: 5,
      proximityLat: 40.7359,
      proximityLon: -73.9911,
    });
    expect(res.places.length).toBeGreaterThan(0);
    expect(res.places[0]?.label).toMatch(/Union Square/i);
  });

  it("resolves station place refs", async () => {
    const a = adapter();
    const byStation = await a.resolvePlace({ stationId: "A42" });
    expect(byStation?.label).toBe("Carroll St");
    expect(byStation?.lat).toBeCloseTo(40.6803);
    const byPlace = await a.resolvePlace({ placeId: "st:A42" });
    expect(byPlace?.stationId).toBe("A42");
  });
});

describe("LiveRoutingAdapter", () => {
  let dataServer: Server | undefined;
  let baseUrl = "";
  const state = createStubDataState();

  beforeEach(async () => {
    Object.assign(state, createStubDataState());
    const started = await startStubDataServer(state);
    dataServer = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (dataServer) await closeServer(dataServer);
    dataServer = undefined;
  });

  function makeData() {
    return new LiveDataAdapter({
      baseUrl,
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
    });
  }

  function stubProvider(
    drafts: unknown[] | (() => Promise<unknown[]>),
  ): CandidateProvider {
    return {
      id: "stub",
      async generateCandidates() {
        return typeof drafts === "function" ? drafts() : drafts;
      },
    };
  }

  const sampleDraft = {
    itineraryId: "itin_1",
    durationSeconds: 1200,
    arrivalTime: "2026-07-30T15:00:00.000Z",
    walkingSeconds: 120,
    waitingSeconds: 60,
    transferCount: 0,
    legs: [
      {
        legId: "w1",
        kind: "walk",
        durationSeconds: 60,
        outOfSystem: true,
      },
      {
        legId: "t1",
        kind: "transit",
        lineId: "F",
        tripId: "trip_f",
        headsign: "Jamaica",
        from: { name: "Carroll St", stationId: "A42" },
        to: { name: "Bryant", stationId: "D14" },
        departTime: "2026-07-30T14:40:00.000Z",
        arriveTime: "2026-07-30T15:00:00.000Z",
        durationSeconds: 1140,
      },
    ],
    realtimeConfidence: "medium",
    alerts: [],
    candidateFamily: "baseline",
  };

  it("maps ok outcome and stamps live snapshot fields", async () => {
    const data = makeData();
    const snapshot = await data.getSnapshotHandle();
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([
        sampleDraft,
        { ...sampleDraft, itineraryId: "itin_c", candidateFamily: "constrained" },
      ]),
      runRouteSearch: async () =>
        ({
          kind: "ok",
          baseline: [{ ...sampleDraft, fingerprint: "fp1", lineSequence: ["F"], satisfaction: { requestedLineIds: [], satisfiedLineIds: [], omittedLineIds: [], satisfactionCount: 0, requestedCount: 0, isComplete: true, feasibility: "not_applicable" }, explanation: { summary: "x", facts: [], baselineDeltaSeconds: null }, reliability: null, perLineRideSeconds: { F: 100 } }],
          constrained: [{ ...sampleDraft, itineraryId: "itin_c", fingerprint: "fp2", lineSequence: ["F"], satisfaction: { requestedLineIds: ["F"], satisfiedLineIds: ["F"], omittedLineIds: [], satisfactionCount: 1, requestedCount: 1, isComplete: true, feasibility: "feasible" }, explanation: { summary: "y", facts: [], baselineDeltaSeconds: 0 }, reliability: null, candidateFamily: "constrained", perLineRideSeconds: { F: 100 } }],
          satisfactionSummary: {
            bestSatisfactionCount: 1,
            requestedCount: 1,
            completeMatchFound: true,
          },
          constraintInfeasible: false,
          dataDegradation: null,
          invalidDraftRejectionCounts: {},
        }) satisfies RouteSearchOutcome,
    });

    const res = await routing.searchRoutes({
      request: {
        origin: { stationId: "A42" },
        destination: { stationId: "D14" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F"],
      },
      selectedLineIds: ["F"],
      snapshot,
      requestId: "req_live_ok",
      explanationVariant: "concise",
    });

    expect(res.staticDatasetVersion).toBe("gtfs_live_v1");
    expect(res.realtimeSnapshotId).toBe("rt_live_1");
    expect(res.dataMode).toBe("live");
    expect(res.constrained.satisfactionSummary.completeMatchFound).toBe(true);
    expect(
      (res.baseline.itineraries[0] as Record<string, unknown>).perLineRideSeconds,
    ).toBeUndefined();
  });

  it("maps no_transit_path / data_unavailable / timeout via stub", async () => {
    const data = makeData();
    const snapshot = await data.getSnapshotHandle();

    const noPath = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([]),
      runRouteSearch: async () => ({ kind: "no_transit_path", requestedCount: 0 }),
    });
    await expect(
      noPath.searchRoutes({
        request: {
          origin: { stationId: "A42" },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
        },
        selectedLineIds: [],
        snapshot,
        requestId: "req_np",
        explanationVariant: "concise",
      }),
    ).rejects.toMatchObject({ code: "no_transit_path" });

    const unavailable = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([]),
      runRouteSearch: async () => ({
        kind: "data_unavailable",
        requestedCount: 1,
        reason: "snapshot unavailable",
      }),
    });
    await expect(
      unavailable.searchRoutes({
        request: {
          origin: { stationId: "A42" },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
          selectedLineIds: ["F"],
        },
        selectedLineIds: ["F"],
        snapshot,
        requestId: "req_du",
        explanationVariant: "concise",
      }),
    ).rejects.toMatchObject({ code: "data_unavailable" });

    const timed = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([]),
      runRouteSearch: async () => {
        const err = new Error("OTP timeout");
        err.name = "TimeoutError";
        throw err;
      },
    });
    await expect(
      timed.searchRoutes({
        request: {
          origin: { stationId: "A42" },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
        },
        selectedLineIds: [],
        snapshot,
        requestId: "req_to",
        explanationVariant: "concise",
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("resolves coordinate place refs as passthrough", async () => {
    const data = makeData();
    const snapshot = await data.getSnapshotHandle();
    let seenOrigin: { lat: number; lon: number } | undefined;
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([]),
      runRouteSearch: async (_p, req) => {
        const r = req as {
          origin: { lat: number; lon: number };
        };
        seenOrigin = { lat: r.origin.lat, lon: r.origin.lon };
        return { kind: "no_transit_path", requestedCount: 0 };
      },
    });
    await expect(
      routing.searchRoutes({
        request: {
          origin: { coordinate: { lat: 40.68, lon: -74.0 }, label: "Pin" },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
        },
        selectedLineIds: [],
        snapshot,
        requestId: "req_coord",
        explanationVariant: "concise",
      }),
    ).rejects.toMatchObject({ code: "no_transit_path" });
    expect(seenOrigin).toEqual({ lat: 40.68, lon: -74.0 });
  });

  it("graph-version mismatch => data_unavailable", async () => {
    expect(graphVersionMatchesStatic("gtfs_live_v1_build2", "gtfs_live_v1")).toBe(
      true,
    );
    expect(graphVersionMatchesStatic("other_graph", "gtfs_live_v1")).toBe(false);
    expect(
      graphVersionMatchesStatic("mta-subway-c9c3366cdd16+otp2.9.0", "mta-subway-c9c3366cdd16"),
    ).toBe(true);

    const data = makeData();
    const snapshot = await data.getSnapshotHandle();
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      otpGraphVersion: "other_graph_v9",
      candidateProvider: stubProvider([]),
      runRouteSearch: async () => ({ kind: "ok", baseline: [], constrained: [], satisfactionSummary: { bestSatisfactionCount: 0, requestedCount: 0, completeMatchFound: true }, constraintInfeasible: false, dataDegradation: null, invalidDraftRejectionCounts: {} }),
    });
    await expect(
      routing.searchRoutes({
        request: {
          origin: { stationId: "A42" },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
        },
        selectedLineIds: [],
        snapshot,
        requestId: "req_mismatch",
        explanationVariant: "concise",
      }),
    ).rejects.toMatchObject({ code: "data_unavailable" });
  });

  it("partial match maps ok with incomplete warning", async () => {
    const data = makeData();
    const snapshot = await data.getSnapshotHandle();
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: stubProvider([]),
      runRouteSearch: async () =>
        ({
          kind: "ok",
          baseline: [],
          constrained: [
            {
              itineraryId: "itin_p",
              fingerprint: "fp_p",
              durationSeconds: 1000,
              arrivalTime: "2026-07-30T15:00:00.000Z",
              walkingSeconds: 60,
              waitingSeconds: 30,
              transferCount: 0,
              lineSequence: ["F"],
              legs: sampleDraft.legs,
              satisfaction: {
                requestedLineIds: ["F", "B"],
                satisfiedLineIds: ["F"],
                omittedLineIds: ["B"],
                satisfactionCount: 1,
                requestedCount: 2,
                isComplete: false,
                feasibility: "feasible",
              },
              realtimeConfidence: "low",
              alerts: [],
              explanation: { summary: "partial", facts: [], baselineDeltaSeconds: null },
              reliability: null,
              candidateFamily: "constrained",
            },
          ],
          satisfactionSummary: {
            bestSatisfactionCount: 1,
            requestedCount: 2,
            completeMatchFound: false,
          },
          constraintInfeasible: true,
          dataDegradation: null,
          invalidDraftRejectionCounts: {},
        }) satisfies RouteSearchOutcome,
    });
    const res = await routing.searchRoutes({
      request: {
        origin: { stationId: "A42" },
        destination: { stationId: "D14" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F", "B"],
      },
      selectedLineIds: ["F", "B"],
      snapshot,
      requestId: "req_partial",
      explanationVariant: "detailed",
    });
    expect(res.constrained.satisfactionSummary.completeMatchFound).toBe(false);
    expect(
      res.freshness.warnings.some(
        (w) => w.code === "incomplete_selected_line_satisfaction",
      ),
    ).toBe(true);
  });
});

describe("ADR-0014 arrive_by rejection", () => {
  it("rejects arrive_by with 400 invalid_input", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "arrive_by", time: "2026-07-30T09:00:00-04:00" },
        selectedLineIds: ["F"],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
    expect(res.json().error.message).toMatch(/arrive-by/i);
    await app.close();
  });
});

describe("ADR-0018 production fixture lockout", () => {
  it("assertProductionAdapterLockout throws for fixture in production", () => {
    expect(() =>
      assertProductionAdapterLockout("fixture", "production"),
    ).toThrow(/ADR-0018/);
    expect(() =>
      assertProductionAdapterLockout("live", "production"),
    ).not.toThrow();
    expect(() =>
      assertProductionAdapterLockout("fixture", "test"),
    ).not.toThrow();
  });

  it("buildApp throws when NODE_ENV=production and adapterMode=fixture", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(
        buildApp({
          config: { adapterMode: "fixture", logLevel: "silent" },
          deps: { logger: createLogger("silent") },
        }),
      ).rejects.toThrow(/fixture.*production|ADR-0018/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("live-mode readiness matrix", () => {
  let dataServer: Server | undefined;
  let otpServer: Server | undefined;
  let dataUrl = "";
  let otpUrl = "";

  afterEach(async () => {
    if (dataServer) await closeServer(dataServer);
    if (otpServer) await closeServer(otpServer);
    dataServer = undefined;
    otpServer = undefined;
  });

  async function startOtp(ok: boolean): Promise<string> {
    otpServer = createServer((_req, res) => {
      if (!ok) {
        res.destroy();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    await new Promise<void>((resolve, reject) => {
      otpServer!.once("error", reject);
      otpServer!.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = otpServer.address();
    if (!addr || typeof addr === "string") throw new Error("otp bind failed");
    otpUrl = `http://127.0.0.1:${addr.port}`;
    return otpUrl;
  }

  it("ready when data up + otp up + live realtime", async () => {
    const state = createStubDataState();
    const started = await startStubDataServer(state);
    dataServer = started.server;
    dataUrl = started.baseUrl;
    await startOtp(true);

    const data = new LiveDataAdapter({
      baseUrl: dataUrl,
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
    });
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: otpUrl,
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: { id: "stub", generateCandidates: async () => [] },
      runRouteSearch: async () => ({ kind: "no_transit_path", requestedCount: 0 }),
    });
    const { app } = await buildApp({
      config: { adapterMode: "live", logLevel: "silent", permitDegradedReady: true },
      deps: { data, routing, logger: createLogger("silent") },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
    await app.close();
  });

  it("not_ready when data down", async () => {
    await startOtp(true);
    const data = new LiveDataAdapter({
      baseUrl: "http://127.0.0.1:9",
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
    });
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: otpUrl,
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: { id: "stub", generateCandidates: async () => [] },
      runRouteSearch: async () => ({ kind: "no_transit_path", requestedCount: 0 }),
    });
    const { app } = await buildApp({
      config: { adapterMode: "live", logLevel: "silent" },
      deps: { data, routing, logger: createLogger("silent") },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().reasons).toContain("data_service_unreachable");
    await app.close();
  });

  it("not_ready when OTP down", async () => {
    const state = createStubDataState();
    const started = await startStubDataServer(state);
    dataServer = started.server;
    dataUrl = started.baseUrl;

    const data = new LiveDataAdapter({
      baseUrl: dataUrl,
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
    });
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: "http://127.0.0.1:9",
      otpTimeoutMs: 200,
      otpProbeTtlMs: 10_000,
      candidateProvider: { id: "stub", generateCandidates: async () => [] },
      runRouteSearch: async () => ({ kind: "no_transit_path", requestedCount: 0 }),
    });
    const { app } = await buildApp({
      config: { adapterMode: "live", logLevel: "silent" },
      deps: { data, routing, logger: createLogger("silent") },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().reasons).toContain("otp_unreachable");
    await app.close();
  });

  it("ready when realtime degraded and permitDegradedReady", async () => {
    const state = createStubDataState();
    state.status.realtime = {
      snapshotId: "rt_stale",
      dataMode: "stale",
      ageSeconds: 600,
    };
    const started = await startStubDataServer(state);
    dataServer = started.server;
    dataUrl = started.baseUrl;
    await startOtp(true);

    const data = new LiveDataAdapter({
      baseUrl: dataUrl,
      token: "test-token",
      statusTtlMs: 5_000,
      catalogTtlMs: 60_000,
      permitDegradedReady: true,
    });
    const routing = new LiveRoutingAdapter({
      data,
      otpBaseUrl: otpUrl,
      otpTimeoutMs: 1000,
      otpProbeTtlMs: 10_000,
      candidateProvider: { id: "stub", generateCandidates: async () => [] },
      runRouteSearch: async () => ({ kind: "no_transit_path", requestedCount: 0 }),
    });
    const { app } = await buildApp({
      config: {
        adapterMode: "live",
        logLevel: "silent",
        permitDegradedReady: true,
      },
      deps: { data, routing, logger: createLogger("silent") },
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().dataMode).toBe("stale");
    await app.close();
  });
});

describe("live cache key snapshot awareness", () => {
  it("different live snapshot ids produce different route cache keys", () => {
    const base = {
      request: {
        origin: { stationId: "A42" },
        destination: { stationId: "D14" },
        timing: { type: "depart_now" as const },
        selectedLineIds: ["F", "B"],
      },
      selectedLineIds: ["F", "B"],
      staticDatasetVersion: "gtfs_live_v1",
      explanationVariant: "concise" as const,
      nowMs: 1_700_000_000_000,
    };
    const a = buildRouteCacheKey({ ...base, realtimeSnapshotId: "rt_live_1" });
    const b = buildRouteCacheKey({ ...base, realtimeSnapshotId: "rt_live_2" });
    expect(a).not.toBe(b);
    expect(a).toContain("rt_live_1");
    expect(b).toContain("rt_live_2");
  });
});

describe("privacy logging in live mode", () => {
  it("redacts coordinates and raw query fields", () => {
    const redacted = redactSensitive({
      query: "Union Square secret",
      q: "carroll",
      proximityLat: 40.7,
      originLat: 40.68,
      coordinate: { lat: 1, lon: 2 },
      queryLength: 12,
    });
    expect(redacted.query).toBe("[redacted]");
    expect(redacted.q).toBe("[redacted]");
    expect(redacted.proximityLat).toBe("[redacted]");
    expect(redacted.originLat).toBe("[redacted]");
    expect(redacted.queryLength).toBe(12);
  });

  it("live place + route search log lines contain neither coords nor raw query", async () => {
    const state = createStubDataState();
    const started = await startStubDataServer(state);
    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };

    try {
      const data = new LiveDataAdapter({
        baseUrl: started.baseUrl,
        token: "test-token",
        statusTtlMs: 5_000,
        catalogTtlMs: 60_000,
        permitDegradedReady: true,
      });
      const routing = new LiveRoutingAdapter({
        data,
        otpBaseUrl: "http://127.0.0.1:9",
        otpTimeoutMs: 200,
        otpProbeTtlMs: 10_000,
        candidateProvider: { id: "stub", generateCandidates: async () => [] },
        runRouteSearch: async () => ({
          kind: "ok",
          baseline: [],
          constrained: [],
          satisfactionSummary: {
            bestSatisfactionCount: 0,
            requestedCount: 0,
            completeMatchFound: true,
          },
          constraintInfeasible: false,
          dataDegradation: null,
          invalidDraftRejectionCounts: {},
        }),
      });
      const { app } = await buildApp({
        config: {
          adapterMode: "live",
          logLevel: "info",
          permitDegradedReady: true,
        },
        deps: { data, routing, logger: createLogger("info") },
      });

      await app.inject({
        method: "GET",
        url: "/v1/places/search?q=Union%20Square&proximityLat=40.7&proximityLon=-74.0",
      });
      await app.inject({
        method: "POST",
        url: "/v1/routes/search",
        headers: jsonHeaders(),
        payload: {
          origin: { coordinate: { lat: 40.6803, lon: -74.0051 } },
          destination: { stationId: "D14" },
          timing: { type: "depart_now" },
        },
      });

      const joined = lines.join("\n");
      expect(joined).not.toMatch(/Union Square/);
      expect(joined).not.toMatch(/40\.6803/);
      expect(joined).not.toMatch(/-74\.0051/);
      expect(joined).not.toMatch(/"q":"Union/);
      await app.close();
    } finally {
      console.log = origLog;
      await closeServer(started.server);
    }
  });
});
