import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createOtpCandidateProvider,
  OtpProviderError,
  runRouteSearch,
  type CandidateSearchRequest,
  type OtpCandidateProviderOptions,
  type RoutingSnapshotHandle,
} from "../src/index.ts";
import {
  epochToNyDateTimeParts,
  isoToEpochMs,
  mapOtpItineraries,
} from "../src/otp-provider/index.ts";
import type { OtpItinerary, OtpPlanResponse } from "../src/otp-provider/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures/otp");

function loadFixture(name: string): OtpPlanResponse {
  const raw = readFileSync(path.join(fixturesDir, name), "utf8");
  return JSON.parse(raw) as OtpPlanResponse;
}

function nycRouteIdToLineId(gtfsRouteId: string): string | null {
  const short = gtfsRouteId.includes(":")
    ? gtfsRouteId.slice(gtfsRouteId.lastIndexOf(":") + 1)
    : gtfsRouteId;
  const allowed = new Set([
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "J",
    "L",
    "M",
    "N",
    "Q",
    "R",
    "W",
    "Z",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "GS",
    "FS",
    "H",
    "SI",
  ]);
  return allowed.has(short) ? short : null;
}

const LIVE_SNAPSHOT: RoutingSnapshotHandle = {
  staticDatasetVersion: "mta-subway-c9c3366cdd16",
  realtimeSnapshotId: null,
  dataMode: "schedule_only",
  realtimeAgeSeconds: null,
  staticActivatedAt: "2026-07-29T06:00:00.000Z",
};

function baseOtpRequest(
  selectedLineIds: string[],
  overrides: Partial<CandidateSearchRequest> = {},
): CandidateSearchRequest {
  return {
    origin: {
      label: "Carroll St",
      lat: 40.679371,
      lon: -73.995148,
    },
    destination: {
      label: "Bryant Park",
      lat: 40.754222,
      lon: -73.984569,
    },
    timing: { type: "depart_at", time: "2026-07-30T16:27:00.000Z" },
    selectedLineIds,
    snapshot: LIVE_SNAPSHOT,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "application/json" },
  });
}

function providerWithFetch(
  fetchImpl: typeof fetch,
  overrides: Partial<OtpCandidateProviderOptions> = {},
) {
  return createOtpCandidateProvider({
    otpBaseUrl: "http://otp.test:8090",
    timeoutMs: 4000,
    numItineraries: 8,
    graphVersion: "mta-subway-c9c3366cdd16+otp2.9.0",
    routeIdToLineId: nycRouteIdToLineId,
    fetch: fetchImpl,
    ...overrides,
  });
}

describe("OTP mapping from recorded fixtures", () => {
  it("maps (a) Carroll→Bryant drafts: F legs, chronology, sourceEngineIds", () => {
    const fixture = loadFixture("a-baseline-carroll-bryant.json");
    const itineraries = fixture.data?.plan?.itineraries ?? [];
    const { drafts, rejectionCounts } = mapOtpItineraries(itineraries, {
      queryId: "q-a",
      graphVersion: "mta-subway-c9c3366cdd16+otp2.9.0",
      routeIdToLineId: nycRouteIdToLineId,
    });

    expect(Object.values(rejectionCounts).every((n) => n === 0)).toBe(true);
    expect(drafts.length).toBe(3);

    for (const draft of drafts) {
      expect(draft.legs.length).toBeGreaterThan(0);
      const transit = draft.legs.filter((l) => l.kind === "transit");
      expect(transit.length).toBeGreaterThanOrEqual(1);
      for (const leg of transit) {
        if (leg.kind !== "transit") continue;
        expect(leg.lineId).toBe("F");
        expect(leg.departTime.endsWith("Z")).toBe(true);
        expect(leg.arriveTime.endsWith("Z")).toBe(true);
        expect(Date.parse(leg.departTime)).toBeLessThanOrEqual(
          Date.parse(leg.arriveTime),
        );
        expect(leg.sourceEngineIds?.engine).toBe("otp");
        expect(leg.sourceEngineIds?.graphVersion).toBe(
          "mta-subway-c9c3366cdd16+otp2.9.0",
        );
        expect(leg.sourceEngineIds?.queryId).toBe("q-a");
        expect(leg.sourceEngineIds?.itineraryIndex).toMatch(/^\d+$/);
        expect(() =>
          JSON.parse(leg.sourceEngineIds?.otpTripIds ?? "null"),
        ).not.toThrow();
      }
    }
  });

  it("maps (b) numItineraries=8 recording to F-only drafts", () => {
    const fixture = loadFixture("b-carroll-bryant-num8.json");
    const itineraries = fixture.data?.plan?.itineraries ?? [];
    const { drafts } = mapOtpItineraries(itineraries, {
      queryId: "q-b",
      graphVersion: "gv",
      routeIdToLineId: nycRouteIdToLineId,
    });
    expect(drafts.length).toBe(8);
    for (const d of drafts) {
      const lines = d.legs
        .filter((l) => l.kind === "transit")
        .map((l) => (l.kind === "transit" ? l.lineId : ""));
      expect(lines.every((id) => id === "F")).toBe(true);
    }
  });

  it("maps (c) Brooklyn→Queens with B then F via injected map", () => {
    const fixture = loadFixture("c-brooklyn-queens.json");
    const itineraries = fixture.data?.plan?.itineraries ?? [];
    const { drafts } = mapOtpItineraries(itineraries, {
      queryId: "q-c",
      graphVersion: "gv",
      routeIdToLineId: nycRouteIdToLineId,
    });
    expect(drafts.length).toBe(3);
    const first = drafts[0]!;
    const transit = first.legs.filter((l) => l.kind === "transit");
    expect(transit.map((l) => (l.kind === "transit" ? l.lineId : ""))).toEqual([
      "B",
      "F",
    ]);
    expect(first.transferCount).toBe(1);
  });
});

describe("OTP provider → runRouteSearch", () => {
  it("complete satisfaction for selectedLineIds [F] from recording (a)", async () => {
    const fixture = loadFixture("a-baseline-carroll-bryant.json");
    const provider = providerWithFetch(async () => jsonResponse(fixture));
    const result = await runRouteSearch(provider, baseOtpRequest(["F"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.satisfactionSummary.completeMatchFound).toBe(true);
    expect(result.constrained[0]?.satisfaction.satisfiedLineIds).toContain("F");
    expect(result.constrained[0]?.satisfaction.isComplete).toBe(true);
  });

  it("accounts B+F from Brooklyn→Queens recording for selectedLineIds [F,B]", async () => {
    const fixture = loadFixture("c-brooklyn-queens.json");
    const provider = providerWithFetch(async () => jsonResponse(fixture));
    const result = await runRouteSearch(
      provider,
      baseOtpRequest(["F", "B"], {
        origin: {
          label: "Atlantic Av-Barclays",
          lat: 40.68446,
          lon: -73.97689,
        },
        destination: {
          label: "Jackson Hts-Roosevelt Av",
          lat: 40.746644,
          lon: -73.891338,
        },
      }),
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.satisfactionSummary.completeMatchFound).toBe(true);
    expect(result.satisfactionSummary.bestSatisfactionCount).toBe(2);
    const top = result.constrained[0]!;
    expect(top.satisfaction.satisfiedLineIds.sort()).toEqual(["B", "F"]);
    const lineSeq = top.legs
      .filter((l) => l.kind === "transit")
      .map((l) => (l.kind === "transit" ? l.lineId : ""));
    expect(lineSeq).toEqual(["B", "F"]);
  });

  it("zero itineraries → no_transit_path via empty candidate set", async () => {
    const provider = providerWithFetch(async () =>
      jsonResponse({ data: { plan: { itineraries: [] } } }),
    );
    const result = await runRouteSearch(provider, baseOtpRequest(["F"]));
    expect(result.kind).toBe("no_transit_path");
  });
});

describe("OTP malformed rejections", () => {
  it("rejects unmappable route, non-chronological, empty legs with counters", () => {
    const base = loadFixture("a-baseline-carroll-bryant.json").data!.plan!
      .itineraries![0]! as OtpItinerary;

    const unmappable: OtpItinerary = structuredClone(base);
    unmappable.legs![0]!.route = {
      gtfsId: "nyct-gtfs:ZZZ",
      shortName: "ZZZ",
      mode: "SUBWAY",
    };

    const nonChrono: OtpItinerary = structuredClone(
      loadFixture("c-brooklyn-queens.json").data!.plan!.itineraries![0]!,
    );
    // Swap transit times so second departs before first arrives.
    const t0 = nonChrono.legs![0]!;
    const t1 = nonChrono.legs![1]!;
    t1.startTime = {
      scheduledTime: "2026-07-30T12:00:00-04:00",
      estimated: null,
    };
    t1.endTime = {
      scheduledTime: "2026-07-30T12:10:00-04:00",
      estimated: null,
    };
    void t0;

    const emptyLegs: OtpItinerary = structuredClone(base);
    emptyLegs.legs = [];

    const { drafts, rejectionCounts } = mapOtpItineraries(
      [unmappable, nonChrono, emptyLegs],
      {
        queryId: "q-bad",
        graphVersion: "gv",
        routeIdToLineId: nycRouteIdToLineId,
      },
    );

    expect(drafts).toEqual([]);
    expect(rejectionCounts.unmappable_route).toBe(1);
    expect(rejectionCounts.non_chronological).toBe(1);
    expect(rejectionCounts.empty_legs).toBe(1);
  });
});

describe("OTP provider failure taxonomy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("timeout via AbortController maps to search timeout outcome", async () => {
    vi.useFakeTimers();
    const provider = providerWithFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
      { timeoutMs: 50 },
    );

    const pending = runRouteSearch(provider, baseOtpRequest(["F"]));
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;
    expect(result.kind).toBe("timeout");
    if (result.kind !== "timeout") return;
    expect(result.reason).toMatch(/timed out/i);
  });

  it("ECONNREFUSED → data_unavailable", async () => {
    const provider = providerWithFetch(async () => {
      const err = new Error("fetch failed");
      (err as Error & { cause?: Error }).cause = new Error("ECONNREFUSED");
      throw err;
    });
    const result = await runRouteSearch(provider, baseOtpRequest(["F"]));
    expect(result.kind).toBe("data_unavailable");
  });

  it("HTML body → bad_response → data_unavailable", async () => {
    const provider = providerWithFetch(
      async () =>
        new Response("<html>nope</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const result = await runRouteSearch(provider, baseOtpRequest(["F"]));
    expect(result.kind).toBe("data_unavailable");
    await expect(
      providerWithFetch(
        async () =>
          new Response("<html>nope</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ).generateCandidates(baseOtpRequest(["F"])),
    ).rejects.toBeInstanceOf(OtpProviderError);
  });

  it("5xx → unavailable → data_unavailable", async () => {
    const provider = providerWithFetch(async () =>
      jsonResponse({ error: "boom" }, { status: 503 }),
    );
    const result = await runRouteSearch(provider, baseOtpRequest(["F"]));
    expect(result.kind).toBe("data_unavailable");
  });
});

describe("OTP timezone honesty", () => {
  it("maps a known UTC instant to America/New_York wall-clock under EDT", () => {
    // 2026-07-30 16:27 UTC = 12:27 EDT (UTC-4)
    const epoch = isoToEpochMs("2026-07-30T16:27:00.000Z");
    expect(epochToNyDateTimeParts(epoch)).toEqual({
      date: "2026-07-30",
      time: "12:27:00",
    });
  });

  it("maps a known UTC instant to America/New_York wall-clock under EST", () => {
    // 2026-01-15 16:27 UTC = 11:27 EST (UTC-5)
    const epoch = isoToEpochMs("2026-01-15T16:27:00.000Z");
    expect(epochToNyDateTimeParts(epoch)).toEqual({
      date: "2026-01-15",
      time: "11:27:00",
    });
  });

  it("fixed ISO instant maps to NY date/time (+ epoch) in outgoing query variables", async () => {
    const iso = "2026-07-30T16:27:00.000Z";
    const expectedEpoch = isoToEpochMs(iso);
    const parts = epochToNyDateTimeParts(expectedEpoch);
    expect(parts).toEqual({ date: "2026-07-30", time: "12:27:00" });

    let captured: {
      query?: string;
      variables?: { dateTime?: number; date?: string; time?: string };
    } | null = null;
    const provider = providerWithFetch(async (_url, init) => {
      captured = JSON.parse(String(init?.body)) as {
        query?: string;
        variables?: { dateTime?: number; date?: string; time?: string };
      };
      return jsonResponse({ data: { plan: { itineraries: [] } } });
    });

    await provider.generateCandidates(
      baseOtpRequest(["F"], { timing: { type: "depart_at", time: iso } }),
    );

    expect(captured).not.toBeNull();
    expect(captured!.variables?.dateTime).toBe(expectedEpoch);
    expect(captured!.variables?.date).toBe("2026-07-30");
    expect(captured!.variables?.time).toBe("12:27:00");
  });

  it("depart_now uses NY wall-clock from provider now()", async () => {
    // Fixed "now" in EDT: 2026-07-30 16:27 UTC → 12:27 NY
    const nowMs = isoToEpochMs("2026-07-30T16:27:00.000Z");
    let captured: {
      variables?: { dateTime?: number; date?: string; time?: string };
    } | null = null;
    const provider = createOtpCandidateProvider({
      otpBaseUrl: "http://otp.test",
      routeIdToLineId: nycRouteIdToLineId,
      now: () => nowMs,
      fetch: async (_url, init) => {
        captured = JSON.parse(String(init?.body)) as {
          variables?: { dateTime?: number; date?: string; time?: string };
        };
        return jsonResponse({ data: { plan: { itineraries: [] } } });
      },
    });

    await provider.generateCandidates(
      baseOtpRequest(["F"], { timing: { type: "depart_now" } }),
    );

    expect(captured).not.toBeNull();
    expect(captured!.variables?.dateTime).toBe(nowMs);
    expect(captured!.variables?.date).toBe("2026-07-30");
    expect(captured!.variables?.time).toBe("12:27:00");
  });
});

describe("OTP live plan (env-gated)", () => {
  const live = Boolean(process.env.BETTERMTA_LIVE_OTP);

  it.skipIf(!live)(
    "Carroll St → Bryant Park against localhost:8090 maps cleanly through runRouteSearch",
    async () => {
      const provider = createOtpCandidateProvider({
        otpBaseUrl: "http://localhost:8090",
        timeoutMs: 8000,
        numItineraries: 3,
        graphVersion: "mta-subway-c9c3366cdd16+otp2.9.0",
        routeIdToLineId: nycRouteIdToLineId,
      });

      const result = await runRouteSearch(
        provider,
        baseOtpRequest(["F"], {
          timing: { type: "depart_at", time: "2026-07-30T16:27:00.000Z" },
        }),
      );

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(
        result.baseline.length + result.constrained.length,
      ).toBeGreaterThanOrEqual(1);
      expect(result.satisfactionSummary.completeMatchFound).toBe(true);
      const anyTransit = [...result.baseline, ...result.constrained].some((i) =>
        i.legs.some((l) => l.kind === "transit" && l.lineId === "F"),
      );
      expect(anyTransit).toBe(true);
      expect(provider.lastQueryStats?.ok).toBe(true);
      expect(provider.lastQueryStats!.itineraryCount).toBeGreaterThanOrEqual(1);
    },
    20_000,
  );
});
