import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyDataModeConfidence,
  buildExplanation,
  compareConstrained,
  computePerLineRideSeconds,
  computeSatisfaction,
  enrichCandidate,
  fingerprintItinerary,
  FixtureCandidateProvider,
  normalizeSelectedLineIds,
  rankConstrained,
  rankOnly,
  runRouteSearch,
  SYNTHETIC_SNAPSHOT,
  TooManySelectedLinesError,
  truncateTop,
  validateCandidateDraft,
  type CandidateProvider,
  type CandidateSearchRequest,
  type Itinerary,
  type Leg,
  type RawCandidateDraft,
  type RoutingSnapshotHandle,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(__dirname, "../../../contracts");

function baseRequest(selectedLineIds: string[]) {
  return {
    origin: { label: "Origin", lat: 40.68, lon: -74.0, stationId: "st_o" },
    destination: { label: "Dest", lat: 40.75, lon: -73.98, stationId: "st_d" },
    timing: { type: "depart_now" as const },
    selectedLineIds,
    snapshot: SYNTHETIC_SNAPSHOT,
  };
}

function validTransitDraft(
  overrides: Partial<RawCandidateDraft> = {},
): RawCandidateDraft {
  return {
    itineraryId: "itin_valid",
    durationSeconds: 600,
    arrivalTime: "2026-07-30T14:10:00.000Z",
    walkingSeconds: 60,
    waitingSeconds: 30,
    transferCount: 0,
    realtimeConfidence: "none",
    candidateFamily: "baseline",
    legs: [
      {
        legId: "t1",
        kind: "transit",
        lineId: "2",
        from: { name: "A" },
        to: { name: "B" },
        departTime: "2026-07-30T14:00:00.000Z",
        arriveTime: "2026-07-30T14:10:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("normalizeSelectedLineIds", () => {
  it("dedupes duplicates and preserves first-seen order", () => {
    expect(normalizeSelectedLineIds(["A", "B", "A", "C", "B"])).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("throws TooManySelectedLinesError when deduped selection exceeds 5", () => {
    expect(() =>
      normalizeSelectedLineIds(["A", "B", "C", "D", "E", "F"]),
    ).toThrow(TooManySelectedLinesError);
    try {
      normalizeSelectedLineIds(["A", "B", "C", "D", "E", "F"]);
    } catch (err) {
      expect(err).toBeInstanceOf(TooManySelectedLinesError);
      if (err instanceof TooManySelectedLinesError) {
        expect(err.selectedCount).toBe(6);
        expect(err.maxAllowed).toBe(5);
        expect(err.code).toBe("too_many_selected_lines");
      }
    }
  });

  it("allows exactly 5 after dedupe", () => {
    expect(normalizeSelectedLineIds(["A", "B", "C", "D", "E"])).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });
});

describe("computeSatisfaction", () => {
  const legs: Leg[] = [
    {
      legId: "w",
      kind: "walk",
      durationSeconds: 60,
      outOfSystem: true,
    },
    {
      legId: "t1",
      kind: "transit",
      lineId: "F",
      from: { name: "A" },
      to: { name: "B" },
      departTime: "2026-07-30T14:00:00.000Z",
      arriveTime: "2026-07-30T14:10:00.000Z",
    },
    {
      legId: "t2",
      kind: "transit",
      lineId: "F",
      from: { name: "B" },
      to: { name: "C" },
      departTime: "2026-07-30T14:15:00.000Z",
      arriveTime: "2026-07-30T14:20:00.000Z",
    },
    {
      legId: "t3",
      kind: "transit",
      lineId: "B",
      from: { name: "C" },
      to: { name: "D" },
      departTime: "2026-07-30T14:25:00.000Z",
      arriveTime: "2026-07-30T14:35:00.000Z",
    },
  ];

  it("never double-counts duplicate rides on the same line", () => {
    const s = computeSatisfaction(["F", "B"], legs);
    expect(s.satisfactionCount).toBe(2);
    expect(s.satisfiedLineIds).toEqual(["F", "B"]);
  });

  it("never counts a line without a transit leg using it", () => {
    const s = computeSatisfaction(["F", "G"], legs);
    expect(s.satisfiedLineIds).toEqual(["F"]);
    expect(s.omittedLineIds).toEqual(["G"]);
    expect(s.feasibility).toBe("partial");
  });

  it("treats 0 selected lines as not_applicable / complete", () => {
    const s = computeSatisfaction([], legs);
    expect(s.feasibility).toBe("not_applicable");
    expect(s.isComplete).toBe(true);
    expect(s.requestedCount).toBe(0);
  });

  it("dedupes duplicate selected IDs", () => {
    const s = computeSatisfaction(["F", "F", "B"], legs);
    expect(s.requestedLineIds).toEqual(["F", "B"]);
    expect(s.requestedCount).toBe(2);
  });

  it("counts local/express of same lineId once", () => {
    const localExpress: Leg[] = [
      {
        legId: "t_local",
        kind: "transit",
        lineId: "2",
        headsign: "local",
        from: { name: "S1" },
        to: { name: "S2" },
        departTime: "2026-07-30T10:00:00.000Z",
        arriveTime: "2026-07-30T10:10:00.000Z",
      },
      {
        legId: "t_express",
        kind: "transit",
        lineId: "2",
        headsign: "express",
        from: { name: "S2" },
        to: { name: "S3" },
        departTime: "2026-07-30T10:15:00.000Z",
        arriveTime: "2026-07-30T10:20:00.000Z",
      },
    ];
    const s = computeSatisfaction(["2"], localExpress);
    expect(s.satisfactionCount).toBe(1);
    expect(s.isComplete).toBe(true);
  });
});

describe("computePerLineRideSeconds", () => {
  it("sums ride seconds per lineId from transit legs", () => {
    const legs: Leg[] = [
      {
        legId: "w",
        kind: "walk",
        durationSeconds: 60,
        outOfSystem: true,
      },
      {
        legId: "t1",
        kind: "transit",
        lineId: "F",
        from: { name: "A" },
        to: { name: "B" },
        departTime: "2026-07-30T14:00:00.000Z",
        arriveTime: "2026-07-30T14:10:00.000Z",
        durationSeconds: 600,
      },
      {
        legId: "t2",
        kind: "transit",
        lineId: "F",
        from: { name: "B" },
        to: { name: "C" },
        departTime: "2026-07-30T14:15:00.000Z",
        arriveTime: "2026-07-30T14:20:00.000Z",
        durationSeconds: 300,
      },
      {
        legId: "t3",
        kind: "transit",
        lineId: "B",
        from: { name: "C" },
        to: { name: "D" },
        departTime: "2026-07-30T14:25:00.000Z",
        arriveTime: "2026-07-30T14:35:00.000Z",
        durationSeconds: 600,
      },
    ];
    expect(computePerLineRideSeconds(legs)).toEqual({ F: 900, B: 600 });
  });
});

describe("ranking ADR-0007", () => {
  function itin(partial: Partial<Itinerary> & Pick<Itinerary, "itineraryId" | "fingerprint" | "arrivalTime" | "satisfaction">): Itinerary {
    return {
      durationSeconds: 1000,
      walkingSeconds: 100,
      waitingSeconds: 50,
      transferCount: 1,
      lineSequence: [],
      legs: [
        {
          legId: "w",
          kind: "walk",
          durationSeconds: 100,
          outOfSystem: true,
        },
      ],
      realtimeConfidence: "none",
      alerts: [],
      explanation: { summary: "x", facts: [] },
      ...partial,
    };
  }

  const completeSat = {
    requestedLineIds: ["A"],
    satisfiedLineIds: ["A"],
    omittedLineIds: [],
    satisfactionCount: 1,
    requestedCount: 1,
    isComplete: true,
    feasibility: "complete" as const,
  };

  it("complete satisfaction always outranks partial regardless of time", () => {
    const complete = itin({
      itineraryId: "c",
      fingerprint: "fp_c",
      arrivalTime: "2026-07-30T15:00:00.000Z",
      transferCount: 5,
      walkingSeconds: 900,
      realtimeConfidence: "none",
      satisfaction: {
        requestedLineIds: ["A", "B"],
        satisfiedLineIds: ["A", "B"],
        omittedLineIds: [],
        satisfactionCount: 2,
        requestedCount: 2,
        isComplete: true,
        feasibility: "complete",
      },
    });
    const partialFaster = itin({
      itineraryId: "p",
      fingerprint: "fp_p",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 0,
      walkingSeconds: 10,
      realtimeConfidence: "high",
      satisfaction: {
        requestedLineIds: ["A", "B"],
        satisfiedLineIds: ["A"],
        omittedLineIds: ["B"],
        satisfactionCount: 1,
        requestedCount: 2,
        isComplete: false,
        feasibility: "partial",
      },
    });
    expect(compareConstrained(complete, partialFaster)).toBeLessThan(0);
    expect(rankConstrained([partialFaster, complete])[0]?.itineraryId).toBe("c");
  });

  it("breaks remaining ties by fingerprint ascending", () => {
    const a = itin({
      itineraryId: "a",
      fingerprint: "fp_aaa",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      satisfaction: completeSat,
    });
    const b = itin({
      itineraryId: "b",
      fingerprint: "fp_bbb",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      satisfaction: completeSat,
    });
    expect(rankConstrained([b, a]).map((i) => i.fingerprint)).toEqual([
      "fp_aaa",
      "fp_bbb",
    ]);
  });

  it("is deterministic across input permutations", () => {
    const items = [
      itin({
        itineraryId: "1",
        fingerprint: "fp_1",
        arrivalTime: "2026-07-30T14:10:00.000Z",
        satisfaction: completeSat,
      }),
      itin({
        itineraryId: "2",
        fingerprint: "fp_2",
        arrivalTime: "2026-07-30T14:05:00.000Z",
        satisfaction: {
          requestedLineIds: ["A"],
          satisfiedLineIds: [],
          omittedLineIds: ["A"],
          satisfactionCount: 0,
          requestedCount: 1,
          isComplete: false,
          feasibility: "none",
        },
      }),
      itin({
        itineraryId: "3",
        fingerprint: "fp_3",
        arrivalTime: "2026-07-30T14:08:00.000Z",
        satisfaction: completeSat,
      }),
    ];
    const orders = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
    ].map((perm) =>
      rankConstrained(perm.map((i) => items[i]!)).map((x) => x.itineraryId),
    );
    for (const order of orders) {
      expect(order).toEqual(orders[0]);
    }
  });

  it("truncates to top 3", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      itin({
        itineraryId: `i${i}`,
        fingerprint: `fp_${i}`,
        arrivalTime: `2026-07-30T14:0${i}:00.000Z`,
        satisfaction: completeSat,
      }),
    );
    expect(truncateTop(rankConstrained(many), 3)).toHaveLength(3);
  });

  it("ADR-0007 isolated pair: fewer transfers ranks first", () => {
    const fewer = itin({
      itineraryId: "fewer",
      fingerprint: "fp_fewer",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 0,
      walkingSeconds: 100,
      satisfaction: completeSat,
    });
    const more = itin({
      itineraryId: "more",
      fingerprint: "fp_more",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 2,
      walkingSeconds: 100,
      satisfaction: completeSat,
    });
    expect(compareConstrained(fewer, more)).toBeLessThan(0);
    expect(rankConstrained([more, fewer])[0]?.itineraryId).toBe("fewer");
  });

  it("ADR-0007 isolated pair: less walking ranks first", () => {
    const lessWalk = itin({
      itineraryId: "less_walk",
      fingerprint: "fp_lw",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 1,
      walkingSeconds: 50,
      satisfaction: completeSat,
    });
    const moreWalk = itin({
      itineraryId: "more_walk",
      fingerprint: "fp_mw",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 1,
      walkingSeconds: 400,
      satisfaction: completeSat,
    });
    expect(compareConstrained(lessWalk, moreWalk)).toBeLessThan(0);
    expect(rankConstrained([moreWalk, lessWalk])[0]?.itineraryId).toBe(
      "less_walk",
    );
  });

  it("ADR-0007 isolated pair: higher realtimeConfidence ranks first", () => {
    const high = itin({
      itineraryId: "high",
      fingerprint: "fp_high",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 1,
      walkingSeconds: 100,
      realtimeConfidence: "high",
      satisfaction: completeSat,
    });
    const none = itin({
      itineraryId: "none",
      fingerprint: "fp_none",
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 1,
      walkingSeconds: 100,
      realtimeConfidence: "none",
      satisfaction: completeSat,
    });
    expect(compareConstrained(high, none)).toBeLessThan(0);
    expect(rankConstrained([none, high])[0]?.itineraryId).toBe("high");
  });
});

describe("validateCandidateDraft", () => {
  it("rejects empty legs", () => {
    expect(validateCandidateDraft(validTransitDraft({ legs: [] })).reason).toBe(
      "empty_legs",
    );
  });

  it("rejects negative durationSeconds", () => {
    expect(
      validateCandidateDraft(validTransitDraft({ durationSeconds: -1 })).reason,
    ).toBe("negative_durationSeconds");
  });

  it("rejects negative walkingSeconds", () => {
    expect(
      validateCandidateDraft(validTransitDraft({ walkingSeconds: -5 })).reason,
    ).toBe("negative_walkingSeconds");
  });

  it("rejects negative waitingSeconds", () => {
    expect(
      validateCandidateDraft(validTransitDraft({ waitingSeconds: -1 })).reason,
    ).toBe("negative_waitingSeconds");
  });

  it("rejects negative transferCount", () => {
    expect(
      validateCandidateDraft(validTransitDraft({ transferCount: -1 })).reason,
    ).toBe("negative_transferCount");
  });

  it("rejects transit depart after arrive", () => {
    expect(
      validateCandidateDraft(
        validTransitDraft({
          legs: [
            {
              legId: "t1",
              kind: "transit",
              lineId: "2",
              from: { name: "A" },
              to: { name: "B" },
              departTime: "2026-07-30T14:10:00.000Z",
              arriveTime: "2026-07-30T14:00:00.000Z",
            },
          ],
        }),
      ).reason,
    ).toBe("transit_depart_after_arrive");
  });

  it("rejects non-chronological overlapping transit legs", () => {
    expect(
      validateCandidateDraft(
        validTransitDraft({
          transferCount: 1,
          legs: [
            {
              legId: "t1",
              kind: "transit",
              lineId: "A",
              from: { name: "A" },
              to: { name: "B" },
              departTime: "2026-07-30T14:00:00.000Z",
              arriveTime: "2026-07-30T14:20:00.000Z",
            },
            {
              legId: "t2",
              kind: "transit",
              lineId: "B",
              from: { name: "B" },
              to: { name: "C" },
              departTime: "2026-07-30T14:10:00.000Z",
              arriveTime: "2026-07-30T14:25:00.000Z",
            },
          ],
        }),
      ).reason,
    ).toBe("legs_non_chronological");
  });

  it("accepts a valid draft", () => {
    expect(validateCandidateDraft(validTransitDraft()).ok).toBe(true);
  });
});

describe("explanation builder", () => {
  it("emits facts consistent with satisfaction", () => {
    const satisfaction = computeSatisfaction(
      ["F", "B"],
      [
        {
          legId: "t1",
          kind: "transit",
          lineId: "F",
          from: { name: "A" },
          to: { name: "B" },
          departTime: "2026-07-30T14:00:00.000Z",
          arriveTime: "2026-07-30T14:10:00.000Z",
        },
      ],
    );
    const explanation = buildExplanation({
      satisfaction,
      transferCount: 0,
      walkingSeconds: 120,
      waitingSeconds: 60,
      realtimeConfidence: "medium",
      baselineDeltaSeconds: 240,
    });
    expect(explanation.facts.filter((f) => f.type === "line_used").map((f) => f.lineId)).toEqual([
      "F",
    ]);
    expect(explanation.facts.filter((f) => f.type === "line_omitted").map((f) => f.lineId)).toEqual([
      "B",
    ]);
    expect(explanation.baselineDeltaSeconds).toBe(240);
    expect(explanation.facts.some((f) => f.type === "baseline_delta")).toBe(true);
  });
});

describe("runRouteSearch outcomes", () => {
  it("baseline-only when 0 selected lines", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "baseline_only" });
    const result = await runRouteSearch(provider, baseRequest([]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.constrained).toEqual([]);
    expect(result.satisfactionSummary.requestedCount).toBe(0);
    expect(result.satisfactionSummary.completeMatchFound).toBe(true);
    expect(result.baseline.length).toBeGreaterThan(0);
    expect(result.baseline[0]?.satisfaction.feasibility).toBe("not_applicable");
    expect(result.dataDegradation).toBeNull();
  });

  it("baseline_only fixture + selectedLineIds [2] yields complete match", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "baseline_only" });
    const result = await runRouteSearch(provider, baseRequest(["2"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.satisfactionSummary.completeMatchFound).toBe(true);
    expect(result.constraintInfeasible).toBe(false);
    expect(result.constrained[0]?.satisfaction.isComplete).toBe(true);
    expect(result.constrained[0]?.satisfaction.satisfiedLineIds).toEqual(["2"]);
    expect(result.baseline.length).toBeGreaterThan(0);
    expect(result.constrained[0]?.perLineRideSeconds["2"]).toBeGreaterThan(0);
  });

  it("complete outranks faster partial in fixture search", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "complete_f_b" });
    const result = await runRouteSearch(provider, baseRequest(["F", "B"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.constrained[0]?.satisfaction.isComplete).toBe(true);
    expect(result.constrained[0]?.satisfaction.satisfiedLineIds).toEqual(["F", "B"]);
    expect(result.constrained.length).toBeLessThanOrEqual(3);
  });

  it("supports 5 selected lines", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "five_lines" });
    const result = await runRouteSearch(
      provider,
      baseRequest(["A", "C", "E", "B", "D"]),
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.satisfactionSummary.requestedCount).toBe(5);
    expect(result.satisfactionSummary.completeMatchFound).toBe(true);
    expect(result.constrained[0]?.satisfaction.satisfactionCount).toBe(5);
  });

  it("returns no_transit_path for empty candidate set", async () => {
    const provider = new FixtureCandidateProvider({ empty: true });
    const result = await runRouteSearch(provider, baseRequest(["A"]));
    expect(result.kind).toBe("no_transit_path");
  });

  it("returns insufficient coverage for an empty exhausted preference search", async () => {
    const provider: CandidateProvider & {
      lastCandidateCoverage: {
        status: "exhausted";
        familiesAttempted: ["baseline", "preference_biased"];
        candidateCount: 0;
        preferenceCoveringCandidateCount: 0;
        budgetExhausted: true;
      };
    } = {
      id: "empty-exhausted",
      lastCandidateCoverage: {
        status: "exhausted",
        familiesAttempted: ["baseline", "preference_biased"],
        candidateCount: 0,
        preferenceCoveringCandidateCount: 0,
        budgetExhausted: true,
      },
      async generateCandidates() {
        return [];
      },
    };

    const result = await runRouteSearch(provider, baseRequest(["A"]));
    expect(result.kind).toBe("insufficient_candidate_coverage");
  });

  it("returns insufficient_candidate_coverage when budget exhausted", async () => {
    const provider = new FixtureCandidateProvider({ exhaustBudget: true });
    const result = await runRouteSearch(provider, baseRequest(["A"]));
    expect(result.kind).toBe("insufficient_candidate_coverage");
  });

  it("marks constraint infeasible while returning partials", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "partial_a_g_l" });
    const result = await runRouteSearch(provider, baseRequest(["A", "G", "L"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.constraintInfeasible).toBe(true);
    expect(result.satisfactionSummary.completeMatchFound).toBe(false);
    expect(result.constrained[0]?.satisfaction.feasibility).toBe("partial");
    expect(result.constrained[0]?.satisfaction.omittedLineIds).toContain("G");
  });

  it("is deterministic across repeated runs", async () => {
    const provider = new FixtureCandidateProvider({ scenario: "complete_f_b" });
    const req = baseRequest(["B", "F", "F"]);
    const a = await runRouteSearch(provider, req);
    const b = await runRouteSearch(provider, req);
    expect(a).toEqual(b);
  });

  it("drops invalid drafts and counts rejection reasons", async () => {
    const provider: CandidateProvider = {
      id: "invalid-mix",
      async generateCandidates() {
        return [
          validTransitDraft({ itineraryId: "good" }),
          validTransitDraft({
            itineraryId: "bad_neg",
            durationSeconds: -10,
          }),
          validTransitDraft({
            itineraryId: "bad_empty",
            legs: [],
          }),
        ];
      },
    };
    const result = await runRouteSearch(provider, baseRequest(["2"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.invalidDraftRejectionCounts.negative_durationSeconds).toBe(1);
    expect(result.invalidDraftRejectionCounts.empty_legs).toBe(1);
    expect(result.constrained[0]?.itineraryId).toBe("good");
  });

  it("returns data_unavailable without fabricating results", async () => {
    const provider: CandidateProvider = {
      id: "should-not-run",
      async generateCandidates() {
        throw new Error("provider should not be called when unavailable");
      },
    };
    const result = await runRouteSearch(provider, {
      ...baseRequest(["F"]),
      snapshot: {
        ...SYNTHETIC_SNAPSHOT,
        dataMode: "unavailable",
      },
    });
    expect(result.kind).toBe("data_unavailable");
    if (result.kind !== "data_unavailable") return;
    expect(result.requestedCount).toBe(1);
  });

  it("forces realtimeConfidence none under schedule_only and sets degradation", async () => {
    const provider: CandidateProvider = {
      id: "sched",
      async generateCandidates() {
        return [
          validTransitDraft({
            itineraryId: "liveish",
            realtimeConfidence: "high",
            candidateFamily: "baseline",
          }),
        ];
      },
    };
    const snapshot: RoutingSnapshotHandle = {
      ...SYNTHETIC_SNAPSHOT,
      dataMode: "schedule_only",
    };
    const result = await runRouteSearch(provider, {
      ...baseRequest(["2"]),
      snapshot,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.dataDegradation).toBe("schedule_only");
    expect(result.baseline[0]?.realtimeConfidence).toBe("none");
    expect(result.constrained[0]?.realtimeConfidence).toBe("none");
  });

  it("caps realtimeConfidence to low under stale and sets degradation", async () => {
    const provider: CandidateProvider = {
      id: "stale",
      async generateCandidates() {
        return [
          validTransitDraft({
            itineraryId: "staleish",
            realtimeConfidence: "high",
            candidateFamily: "baseline",
          }),
        ];
      },
    };
    const result = await runRouteSearch(provider, {
      ...baseRequest(["2"]),
      snapshot: { ...SYNTHETIC_SNAPSHOT, dataMode: "stale" },
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.dataDegradation).toBe("stale");
    expect(result.constrained[0]?.realtimeConfidence).toBe("low");
  });
});

describe("applyDataModeConfidence", () => {
  it("maps schedule_only to none and stale high to low", () => {
    expect(applyDataModeConfidence("high", "schedule_only")).toBe("none");
    expect(applyDataModeConfidence("high", "stale")).toBe("low");
    expect(applyDataModeConfidence("none", "stale")).toBe("none");
    expect(applyDataModeConfidence("medium", "live")).toBe("medium");
  });
});

describe("fingerprint", () => {
  it("is stable for identical content", () => {
    const draft: RawCandidateDraft = {
      itineraryId: "x",
      durationSeconds: 100,
      arrivalTime: "2026-07-30T14:00:00.000Z",
      walkingSeconds: 10,
      waitingSeconds: 5,
      transferCount: 0,
      realtimeConfidence: "none",
      candidateFamily: "baseline",
      legs: [
        {
          legId: "t",
          kind: "transit",
          lineId: "L",
          from: { name: "A" },
          to: { name: "B" },
          departTime: "2026-07-30T13:50:00.000Z",
          arriveTime: "2026-07-30T14:00:00.000Z",
        },
      ],
    };
    const fp1 = fingerprintItinerary(draft);
    const fp2 = fingerprintItinerary(draft);
    expect(fp1).toBe(fp2);
    expect(fp1.startsWith("fp_")).toBe(true);
  });

  it("ignores provider walk legId but includes distanceMeters in fingerprint material", () => {
    const base = {
      arrivalTime: "2026-07-30T14:00:00.000Z",
      transferCount: 0,
      walkingSeconds: 60,
      durationSeconds: 60,
    };
    const a = fingerprintItinerary({
      ...base,
      legs: [
        {
          legId: "w_a",
          kind: "walk",
          durationSeconds: 60,
          outOfSystem: true,
          distanceMeters: 80,
        },
      ],
    });
    const b = fingerprintItinerary({
      ...base,
      legs: [
        {
          legId: "w_b",
          kind: "walk",
          durationSeconds: 60,
          outOfSystem: true,
          distanceMeters: 80,
        },
      ],
    });
    const c = fingerprintItinerary({
      ...base,
      legs: [
        {
          legId: "w_a",
          kind: "walk",
          durationSeconds: 60,
          outOfSystem: true,
          distanceMeters: 120,
        },
      ],
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("ignores lying provider fingerprint for dedupe and tie-break", async () => {
    const legs: Leg[] = [
      {
        legId: "t1",
        kind: "transit",
        lineId: "2",
        from: { name: "A" },
        to: { name: "B" },
        departTime: "2026-07-30T14:00:00.000Z",
        arriveTime: "2026-07-30T14:10:00.000Z",
      },
    ];
    const honestFp = fingerprintItinerary({
      legs,
      arrivalTime: "2026-07-30T14:10:00.000Z",
      transferCount: 0,
      walkingSeconds: 0,
      durationSeconds: 600,
    });
    const provider: CandidateProvider = {
      id: "liar",
      async generateCandidates(_req: CandidateSearchRequest) {
        return [
          {
            itineraryId: "a",
            durationSeconds: 600,
            arrivalTime: "2026-07-30T14:10:00.000Z",
            walkingSeconds: 0,
            waitingSeconds: 0,
            transferCount: 0,
            realtimeConfidence: "none",
            candidateFamily: "baseline",
            fingerprint: "fp_LIAR_AAAA",
            legs,
          },
          {
            itineraryId: "b",
            durationSeconds: 600,
            arrivalTime: "2026-07-30T14:10:00.000Z",
            walkingSeconds: 0,
            waitingSeconds: 0,
            transferCount: 0,
            realtimeConfidence: "none",
            candidateFamily: "preference_biased",
            fingerprint: "fp_LIAR_BBBB",
            legs: [...legs],
          },
        ];
      },
    };
    const result = await runRouteSearch(provider, baseRequest(["2"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // Identical content → same recomputed fingerprint → deduped to one.
    expect(result.constrained).toHaveLength(1);
    expect(result.constrained[0]?.fingerprint).toBe(honestFp);
    expect(result.constrained[0]?.fingerprint).not.toContain("LIAR");
  });
});

describe("schema validation", () => {
  it("validates a produced itinerary against itinerary.schema.json", async () => {
    const { default: Ajv2020 } = await import(
      path.join(contractsRoot, "node_modules/ajv/dist/2020.js")
    );
    const { default: addFormats } = await import(
      path.join(contractsRoot, "node_modules/ajv-formats/dist/index.js")
    );
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    addFormats(ajv);

    const satisfactionSchema = require(
      path.join(contractsRoot, "schemas/satisfaction.schema.json"),
    );
    const itinerarySchema = require(
      path.join(contractsRoot, "schemas/itinerary.schema.json"),
    );
    ajv.addSchema(satisfactionSchema, satisfactionSchema.$id);
    // Resolve relative $ref used by itinerary.schema.json
    ajv.addSchema(satisfactionSchema, "satisfaction.schema.json");
    const validate = ajv.compile(itinerarySchema);

    const provider = new FixtureCandidateProvider({ scenario: "complete_f_b" });
    const result = await runRouteSearch(provider, baseRequest(["F", "B"]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const itinerary = result.constrained[0];
    expect(itinerary).toBeDefined();
    // Strip library-only field before contract schema validation.
    const { perLineRideSeconds: _extra, ...contractItinerary } = itinerary!;
    void _extra;
    const ok = validate(contractItinerary);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });
});

describe("performance smoke", () => {
  it("ranks 1000 candidates in a bounded time", () => {
    const candidates: Itinerary[] = Array.from({ length: 1000 }, (_, i) => {
      const satisfactionCount = i % 6;
      return enrichCandidate(
        {
          itineraryId: `bench_${i}`,
          durationSeconds: 1000 + (i % 50),
          arrivalTime: new Date(Date.parse("2026-07-30T14:00:00.000Z") + i * 1000).toISOString(),
          walkingSeconds: i % 400,
          waitingSeconds: i % 200,
          transferCount: i % 4,
          realtimeConfidence: (["high", "medium", "low", "none"] as const)[i % 4]!,
          candidateFamily: "constrained",
          legs: [
            {
              legId: `t_${i}`,
              kind: "transit",
              lineId: ["A", "B", "C", "D", "E", "F"][satisfactionCount] ?? "A",
              from: { name: "O" },
              to: { name: "D" },
              departTime: "2026-07-30T13:50:00.000Z",
              arriveTime: new Date(Date.parse("2026-07-30T14:00:00.000Z") + i * 1000).toISOString(),
            },
          ],
        },
        ["A", "B", "C", "D", "E"],
        null,
      );
    });

    const t0 = performance.now();
    const ranked = rankOnly(candidates, "constrained");
    const ms = performance.now() - t0;
    expect(ranked).toHaveLength(3);
    expect(ms).toBeLessThan(500);
    // eslint-disable-next-line no-console
    console.log(`rank_1000_candidates_ms=${ms.toFixed(3)}`);
  });
});
