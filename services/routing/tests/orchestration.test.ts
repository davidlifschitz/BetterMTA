import { describe, expect, it } from "vitest";
import {
  assessCandidateCoverage,
  buildOrchestrationQueryPlan,
  createSeededTopology,
  dedupeDraftsByFingerprint,
  DEFAULT_CANDIDATE_BUDGET,
  FixtureCandidateProvider,
  isTopologicallySensible,
  MAX_OTP_QUERIES,
  rankConstrained,
  runRouteSearch,
  selectViaStations,
  SYNTHETIC_SNAPSHOT,
  type RawCandidateDraft,
} from "../src/index.ts";

const MIDTOWN_EAST = {
  label: "Midtown East office",
  lat: 40.7553,
  lon: -73.9755,
  placeId: "pl_midtown_east_office",
  stationId: "st_midtown_east_office",
};

const PENN = {
  label: "34 St-Penn Station",
  lat: 40.7506,
  lon: -73.9935,
  placeId: "pl_penn_34",
  stationId: "st_penn_34",
};

describe("orchestration query plan", () => {
  it("always starts with baseline and stays within MAX_OTP_QUERIES", () => {
    const plan = buildOrchestrationQueryPlan({
      preferredLineIds: ["7", "2", "GS"],
      origin: MIDTOWN_EAST,
      destination: PENN,
    });
    expect(plan[0]?.kind).toBe("baseline");
    expect(plan.length).toBeGreaterThan(1);
    expect(plan.length).toBeLessThanOrEqual(MAX_OTP_QUERIES);
    expect(plan.some((q) => q.kind === "preference_biased")).toBe(true);
    expect(plan.some((q) => q.kind === "via_hint")).toBe(true);
  });

  it("omits preference families when no preferred lines", () => {
    const plan = buildOrchestrationQueryPlan({
      preferredLineIds: [],
      origin: MIDTOWN_EAST,
      destination: PENN,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.candidateFamily).toBe("baseline");
  });

  it("is deterministic across repeated builds", () => {
    const a = buildOrchestrationQueryPlan({
      preferredLineIds: ["GS", "7", "2"],
      origin: MIDTOWN_EAST,
      destination: PENN,
    });
    const b = buildOrchestrationQueryPlan({
      preferredLineIds: ["GS", "7", "2"],
      origin: MIDTOWN_EAST,
      destination: PENN,
    });
    expect(a.map((q) => q.queryKey)).toEqual(b.map((q) => q.queryKey));
  });
});

describe("topology sensibility + via selection", () => {
  it("marks Midtown→Penn with 7/2/GS as topologically sensible", () => {
    expect(
      isTopologicallySensible({
        preferredLineIds: ["7", "2", "GS"],
        origin: MIDTOWN_EAST,
        destination: PENN,
      }),
    ).toBe(true);
  });

  it("does not treat Staten Island line as sensible for Midtown→Penn", () => {
    expect(
      isTopologicallySensible({
        preferredLineIds: ["SI"],
        origin: MIDTOWN_EAST,
        destination: PENN,
      }),
    ).toBe(false);
  });

  it("marks Queens E/F corridor as topologically sensible", () => {
    const jacksonHts = { lat: 40.7466, lon: -73.8913 };
    const forestHills = { lat: 40.7216, lon: -73.8448 };
    expect(
      isTopologicallySensible({
        preferredLineIds: ["E", "F"],
        origin: jacksonHts,
        destination: forestHills,
      }),
    ).toBe(true);
  });

  it("marks Astoria N/W corridor as topologically sensible", () => {
    const ditmars = { lat: 40.775, lon: -73.912 };
    const timesSq = { lat: 40.7553, lon: -73.9874 };
    expect(
      isTopologicallySensible({
        preferredLineIds: ["N", "W"],
        origin: ditmars,
        destination: timesSq,
      }),
    ).toBe(true);
  });

  it("marks Bronx 2/5 corridor as topologically sensible", () => {
    const grandConcourse = { lat: 40.8183, lon: -73.9271 };
    const fulton = { lat: 40.7094, lon: -74.0083 };
    expect(
      isTopologicallySensible({
        preferredLineIds: ["2", "5"],
        origin: grandConcourse,
        destination: fulton,
      }),
    ).toBe(true);
  });

  it("fail-closes incomplete seed lines inside NYC (no silent not-sensible)", () => {
    // Empty topology: known preferred line must still be sensible in NYC.
    const empty = createSeededTopology([]);
    expect(
      isTopologicallySensible({
        preferredLineIds: ["G"],
        origin: MIDTOWN_EAST,
        destination: PENN,
        topology: empty,
      }),
    ).toBe(true);
  });

  it("selects stable via hubs for preferred lines", () => {
    const vias = selectViaStations({
      preferredLineIds: ["7", "2", "GS"],
      origin: MIDTOWN_EAST,
      destination: PENN,
      maxVias: 2,
    });
    expect(vias.length).toBeGreaterThan(0);
    expect(vias.length).toBeLessThanOrEqual(2);
    const again = selectViaStations({
      preferredLineIds: ["7", "2", "GS"],
      origin: MIDTOWN_EAST,
      destination: PENN,
      maxVias: 2,
    });
    expect(vias.map((v) => v.stationId)).toEqual(
      again.map((v) => v.stationId),
    );
  });
});

describe("deterministic dedupe", () => {
  it("keeps first-seen fingerprint and drops duplicates", () => {
    const provider = new FixtureCandidateProvider({
      scenario: "midtown_penn_preference",
    });
    // generate then duplicate
    return provider
      .generateCandidates({
        origin: MIDTOWN_EAST,
        destination: PENN,
        timing: { type: "depart_now" },
        selectedLineIds: ["7", "2", "GS"],
        snapshot: SYNTHETIC_SNAPSHOT,
      })
      .then((drafts) => {
        const doubled = [...drafts, ...drafts];
        const deduped = dedupeDraftsByFingerprint(doubled);
        expect(deduped).toHaveLength(drafts.length);
        expect(dedupeDraftsByFingerprint(deduped)).toEqual(deduped);
      });
  });
});

describe("coverage assessment", () => {
  it("fails closed when budget exhausted without preference coverage", () => {
    const baselineOnly: RawCandidateDraft = {
      itineraryId: "b",
      durationSeconds: 100,
      arrivalTime: "2026-07-30T13:00:00.000Z",
      walkingSeconds: 10,
      waitingSeconds: 10,
      transferCount: 0,
      realtimeConfidence: "none",
      candidateFamily: "baseline",
      legs: [
        {
          legId: "t",
          kind: "transit",
          lineId: "B",
          from: { name: "A" },
          to: { name: "B" },
          departTime: "2026-07-30T12:50:00.000Z",
          arriveTime: "2026-07-30T12:59:00.000Z",
        },
      ],
    };
    const assessed = assessCandidateCoverage({
      preferredLineIds: ["7", "2"],
      familiesAttempted: ["baseline", "preference_biased", "targeted_combination"],
      drafts: [baselineOnly],
      budgetExhausted: true,
      topologicallySensible: true,
    });
    expect(assessed.failInsufficientCoverage).toBe(true);
    expect(assessed.candidateCoverage.status).toBe("exhausted");
    expect(assessed.candidateCoverage.preferenceCoveringCandidateCount).toBe(0);
  });

  it("does not fail when topology is not sensible", () => {
    const assessed = assessCandidateCoverage({
      preferredLineIds: ["SI"],
      familiesAttempted: ["baseline", "preference_biased"],
      drafts: [
        {
          itineraryId: "b",
          durationSeconds: 100,
          arrivalTime: "2026-07-30T13:00:00.000Z",
          walkingSeconds: 10,
          waitingSeconds: 10,
          transferCount: 0,
          realtimeConfidence: "none",
          candidateFamily: "baseline",
          legs: [
            {
              legId: "t",
              kind: "transit",
              lineId: "B",
              from: { name: "A" },
              to: { name: "B" },
              departTime: "2026-07-30T12:50:00.000Z",
              arriveTime: "2026-07-30T12:59:00.000Z",
            },
          ],
        },
      ],
      budgetExhausted: true,
      topologicallySensible: false,
    });
    expect(assessed.failInsufficientCoverage).toBe(false);
  });
});

describe("Midtown→Penn preferred-line regression (ADR-0023)", () => {
  it("recovers >0 preference satisfaction instead of silent 0-of-N", async () => {
    const provider = new FixtureCandidateProvider({
      scenario: "midtown_penn_preference",
    });
    const result = await runRouteSearch(provider, {
      origin: MIDTOWN_EAST,
      destination: PENN,
      timing: { type: "depart_at", time: "2026-07-30T13:00:00.000Z" },
      selectedLineIds: ["7", "2", "GS"],
      snapshot: SYNTHETIC_SNAPSHOT,
      candidateBudget: DEFAULT_CANDIDATE_BUDGET,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.satisfactionSummary.bestSatisfactionCount).toBeGreaterThan(0);
    expect(result.satisfactionSummary.completeMatchFound).toBe(false);
    expect(result.constrained[0]?.satisfaction.satisfactionCount).toBeGreaterThan(
      0,
    );
    // Complete>partial preserved among constrained: max coverage first.
    expect(result.constrained[0]?.satisfaction.satisfactionCount).toBe(2);
    expect(result.constrained[0]?.satisfaction.satisfiedLineIds).toEqual(
      expect.arrayContaining(["7", "2"]),
    );
    expect(result.candidateCoverage?.preferenceCoveringCandidateCount).toBeGreaterThan(
      0,
    );
    // Connector fill-gap fact when unselected lines appear.
    const gsItin = result.constrained.find((c) =>
      c.satisfaction.satisfiedLineIds.includes("GS"),
    );
    expect(
      gsItin?.explanation.facts.some((f) => f.type === "connector_filled"),
    ).toBe(true);
  });

  it("keeps complete match above faster partial (property)", () => {
    const providerDraftsPromise = new FixtureCandidateProvider({
      scenario: "complete_f_b",
    }).generateCandidates({
      origin: { label: "o", lat: 40.67, lon: -74.0 },
      destination: { label: "d", lat: 40.75, lon: -73.98 },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
      snapshot: SYNTHETIC_SNAPSHOT,
    });
    return providerDraftsPromise.then(async (drafts) => {
      const result = await runRouteSearch(
        {
          id: "inline",
          async generateCandidates() {
            return drafts;
          },
        },
        {
          origin: { label: "o", lat: 40.67, lon: -74.0 },
          destination: { label: "d", lat: 40.75, lon: -73.98 },
          timing: { type: "depart_now" },
          selectedLineIds: ["F", "B"],
          snapshot: SYNTHETIC_SNAPSHOT,
        },
      );
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.constrained[0]?.satisfaction.isComplete).toBe(true);
      const ranked = rankConstrained(result.constrained);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1]!.satisfaction.satisfactionCount).toBeGreaterThanOrEqual(
          ranked[i]!.satisfaction.satisfactionCount,
        );
      }
    });
  });
});

describe("orchestration performance smoke", () => {
  it("builds query plans quickly under budget", () => {
    const start = performance.now();
    for (let i = 0; i < 2000; i++) {
      buildOrchestrationQueryPlan({
        preferredLineIds: ["7", "2", "GS", "A", "F"],
        origin: MIDTOWN_EAST,
        destination: PENN,
      });
    }
    const elapsed = performance.now() - start;
    // Pure CPU plan builder; keep a loose bound for shared CI hosts.
    expect(elapsed).toBeLessThan(500);
  });
});
