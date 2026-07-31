import type { CandidateProvider } from "./candidate-provider.ts";
import type {
  CandidateSearchRequest,
  RawCandidateDraft,
  RoutingSnapshotHandle,
  TransitLeg,
  WalkingLeg,
} from "./types.ts";

/**
 * Deterministic offline candidate provider.
 * All outputs are synthetic fixtures — never present as live navigation.
 *
 * Realtime confidence: default synthetic candidates use `"none"`.
 * The only exception is scenario `"ranking_demo"`, which intentionally varies
 * confidence so ADR-0007 realtime ordering can be exercised end-to-end.
 */
export class FixtureCandidateProvider implements CandidateProvider {
  readonly id = "fixture-synthetic";

  constructor(
    private readonly options: {
      /** Force empty result → no_transit_path */
      empty?: boolean;
      /** Emit coverage exhaustion sentinel */
      exhaustBudget?: boolean;
      /** Scenario key selecting canned drafts */
      scenario?:
        | "complete_f_b"
        | "partial_a_g_l"
        | "baseline_only"
        | "diverse_rank"
        | "five_lines"
        | "ranking_demo"
        | "empty";
    } = {},
  ) {}

  async generateCandidates(
    request: CandidateSearchRequest,
  ): Promise<RawCandidateDraft[]> {
    assertSyntheticSnapshot(request.snapshot);

    if (this.options.empty || this.options.scenario === "empty") {
      return [];
    }
    if (this.options.exhaustBudget) {
      return [
        {
          itineraryId: "__coverage_exhausted__",
          durationSeconds: 0,
          arrivalTime: "2026-07-30T00:00:00.000Z",
          walkingSeconds: 0,
          waitingSeconds: 0,
          transferCount: 0,
          legs: [
            {
              legId: "leg_none",
              kind: "walk",
              durationSeconds: 0,
              outOfSystem: true,
            },
          ],
          realtimeConfidence: "none",
          candidateFamily: "baseline",
        },
      ];
    }

    const scenario =
      this.options.scenario ??
      inferScenario(request.selectedLineIds);

    switch (scenario) {
      case "baseline_only":
        return [baselineOnlyDraft()];
      case "partial_a_g_l":
        return [baselineF(), partialAGL()];
      case "five_lines":
        return fiveLineDrafts();
      case "diverse_rank":
        return diverseRankDrafts(request.selectedLineIds);
      case "ranking_demo":
        // Explicit ranking-demo: varies realtimeConfidence for ADR-0007 demos.
        return rankingDemoDrafts(request.selectedLineIds);
      case "complete_f_b":
      default:
        return [baselineF(), completeFB(), partialFOnly(), slowCompleteFB()];
    }
  }
}

function assertSyntheticSnapshot(snapshot: RoutingSnapshotHandle): void {
  if (snapshot.dataMode !== "synthetic") {
    // Fixture provider only serves synthetic snapshots in tests.
    // Production OTP adapter will accept live/schedule_only/stale.
    throw new Error(
      `FixtureCandidateProvider requires dataMode=synthetic (got ${snapshot.dataMode})`,
    );
  }
}

function inferScenario(
  selected: readonly string[],
):
  | "complete_f_b"
  | "partial_a_g_l"
  | "baseline_only"
  | "diverse_rank"
  | "five_lines"
  | "ranking_demo"
  | "empty" {
  if (selected.length === 0) return "baseline_only";
  if (selected.length === 5) return "five_lines";
  if (selected.includes("G") && selected.includes("A")) return "partial_a_g_l";
  if (selected.includes("F") && selected.includes("B")) return "complete_f_b";
  return "diverse_rank";
}

function walk(
  legId: string,
  durationSeconds: number,
  outOfSystem = true,
): WalkingLeg {
  return { legId, kind: "walk", durationSeconds, outOfSystem };
}

function transit(
  legId: string,
  lineId: string,
  from: string,
  to: string,
  departTime: string,
  arriveTime: string,
  tripId?: string,
): TransitLeg {
  return {
    legId,
    kind: "transit",
    lineId,
    tripId: tripId ?? null,
    from: { name: from, stationId: `st_${from.replace(/\s+/g, "_").toLowerCase()}` },
    to: { name: to, stationId: `st_${to.replace(/\s+/g, "_").toLowerCase()}` },
    departTime,
    arriveTime,
    durationSeconds: Math.max(
      0,
      Math.round((Date.parse(arriveTime) - Date.parse(departTime)) / 1000),
    ),
    sourceEngineIds: { engine: "fixture", dataMode: "synthetic" },
  };
}

function baselineF(): RawCandidateDraft {
  return {
    itineraryId: "itin_base_f",
    durationSeconds: 1680,
    arrivalTime: "2026-07-30T14:28:00.000Z",
    walkingSeconds: 240,
    waitingSeconds: 180,
    transferCount: 0,
    realtimeConfidence: "none",
    candidateFamily: "baseline",
    legs: [
      walk("leg_w1", 180),
      transit(
        "leg_t1",
        "F",
        "Carroll St",
        "42 St-Bryant Park",
        "2026-07-30T14:03:00.000Z",
        "2026-07-30T14:26:00.000Z",
        "trip_f_1",
      ),
      walk("leg_w2", 60),
    ],
  };
}

function completeFB(): RawCandidateDraft {
  return {
    itineraryId: "itin_complete_fb",
    durationSeconds: 1920,
    arrivalTime: "2026-07-30T14:32:00.000Z",
    walkingSeconds: 300,
    waitingSeconds: 240,
    transferCount: 1,
    realtimeConfidence: "none",
    candidateFamily: "targeted_combination",
    legs: [
      walk("leg_cw1", 180),
      transit(
        "leg_cf",
        "F",
        "Carroll St",
        "West 4 St",
        "2026-07-30T14:03:00.000Z",
        "2026-07-30T14:12:00.000Z",
        "trip_f_2",
      ),
      walk("leg_ct", 120, false),
      transit(
        "leg_cb",
        "B",
        "West 4 St",
        "42 St-Bryant Park",
        "2026-07-30T14:16:00.000Z",
        "2026-07-30T14:30:00.000Z",
        "trip_b_1",
      ),
      walk("leg_cw2", 120),
    ],
  };
}

/** Faster than complete but only satisfies F — must lose to complete. */
function partialFOnly(): RawCandidateDraft {
  return {
    itineraryId: "itin_partial_f_fast",
    durationSeconds: 1500,
    arrivalTime: "2026-07-30T14:25:00.000Z",
    walkingSeconds: 200,
    waitingSeconds: 100,
    transferCount: 0,
    realtimeConfidence: "none",
    candidateFamily: "preference_biased",
    legs: [
      walk("leg_pf_w1", 120),
      transit(
        "leg_pf",
        "F",
        "Carroll St",
        "42 St-Bryant Park",
        "2026-07-30T14:02:00.000Z",
        "2026-07-30T14:23:00.000Z",
        "trip_f_fast",
      ),
      walk("leg_pf_w2", 80),
    ],
  };
}

/** Complete but slower — ranks after faster complete on arrival. */
function slowCompleteFB(): RawCandidateDraft {
  return {
    itineraryId: "itin_complete_fb_slow",
    durationSeconds: 2400,
    arrivalTime: "2026-07-30T14:45:00.000Z",
    walkingSeconds: 400,
    waitingSeconds: 300,
    transferCount: 1,
    realtimeConfidence: "none",
    candidateFamily: "preference_biased",
    legs: [
      walk("leg_scw1", 200),
      transit(
        "leg_scf",
        "F",
        "Carroll St",
        "West 4 St",
        "2026-07-30T14:05:00.000Z",
        "2026-07-30T14:18:00.000Z",
      ),
      walk("leg_sct", 180, false),
      transit(
        "leg_scb",
        "B",
        "West 4 St",
        "42 St-Bryant Park",
        "2026-07-30T14:25:00.000Z",
        "2026-07-30T14:42:00.000Z",
      ),
      walk("leg_scw2", 200),
    ],
  };
}

function baselineOnlyDraft(): RawCandidateDraft {
  return {
    itineraryId: "itin_sched_2",
    durationSeconds: 2400,
    arrivalTime: "2026-07-30T17:40:00.000Z",
    walkingSeconds: 420,
    waitingSeconds: 360,
    transferCount: 0,
    realtimeConfidence: "none",
    candidateFamily: "baseline",
    legs: [
      walk("leg_b_w1", 240),
      transit(
        "leg_b_2",
        "2",
        "Church Av",
        "Times Sq-42 St",
        "2026-07-30T17:05:00.000Z",
        "2026-07-30T17:35:00.000Z",
      ),
      walk("leg_b_w2", 180),
    ],
  };
}

function partialAGL(): RawCandidateDraft {
  return {
    itineraryId: "itin_partial_al",
    durationSeconds: 2100,
    arrivalTime: "2026-07-30T15:10:00.000Z",
    walkingSeconds: 360,
    waitingSeconds: 300,
    transferCount: 1,
    realtimeConfidence: "none",
    candidateFamily: "constrained",
    legs: [
      walk("leg_p_w1", 180),
      transit(
        "leg_p_a",
        "A",
        "Hoyt-Schermerhorn",
        "14 St",
        "2026-07-30T14:40:00.000Z",
        "2026-07-30T14:55:00.000Z",
      ),
      walk("leg_p_t", 180, false),
      transit(
        "leg_p_l",
        "L",
        "6 Av",
        "1 Av",
        "2026-07-30T15:00:00.000Z",
        "2026-07-30T15:07:00.000Z",
      ),
      walk("leg_p_w2", 180),
    ],
  };
}

function fiveLineDrafts(): RawCandidateDraft[] {
  // Complete uses A,C,E,B,D; also a partial with 3 lines that is faster.
  const complete: RawCandidateDraft = {
    itineraryId: "itin_five_complete",
    durationSeconds: 3600,
    arrivalTime: "2026-07-30T16:00:00.000Z",
    walkingSeconds: 600,
    waitingSeconds: 480,
    transferCount: 4,
    realtimeConfidence: "none",
    candidateFamily: "targeted_combination",
    legs: [
      walk("w0", 120),
      transit("tA", "A", "S1", "S2", "2026-07-30T15:00:00.000Z", "2026-07-30T15:10:00.000Z"),
      walk("w1", 120, false),
      transit("tC", "C", "S2", "S3", "2026-07-30T15:14:00.000Z", "2026-07-30T15:24:00.000Z"),
      walk("w2", 120, false),
      transit("tE", "E", "S3", "S4", "2026-07-30T15:28:00.000Z", "2026-07-30T15:38:00.000Z"),
      walk("w3", 120, false),
      transit("tB", "B", "S4", "S5", "2026-07-30T15:42:00.000Z", "2026-07-30T15:50:00.000Z"),
      walk("w4", 120, false),
      transit("tD", "D", "S5", "S6", "2026-07-30T15:54:00.000Z", "2026-07-30T15:58:00.000Z"),
      walk("w5", 120),
    ],
  };

  const partial: RawCandidateDraft = {
    itineraryId: "itin_five_partial",
    durationSeconds: 2000,
    arrivalTime: "2026-07-30T15:40:00.000Z",
    walkingSeconds: 300,
    waitingSeconds: 200,
    transferCount: 2,
    realtimeConfidence: "none",
    candidateFamily: "preference_biased",
    legs: [
      walk("pw0", 100),
      transit("pA", "A", "S1", "S2", "2026-07-30T15:00:00.000Z", "2026-07-30T15:12:00.000Z"),
      walk("pw1", 100, false),
      transit("pC", "C", "S2", "S3", "2026-07-30T15:16:00.000Z", "2026-07-30T15:28:00.000Z"),
      walk("pw2", 100, false),
      transit("pE", "E", "S3", "S6", "2026-07-30T15:32:00.000Z", "2026-07-30T15:38:00.000Z"),
      walk("pw3", 100),
    ],
  };

  return [baselineF(), complete, partial];
}

function diverseRankDrafts(selected: readonly string[]): RawCandidateDraft[] {
  const line = selected[0] ?? "F";
  return [
    baselineF(),
    {
      itineraryId: "itin_div_1",
      durationSeconds: 1800,
      arrivalTime: "2026-07-30T14:30:00.000Z",
      walkingSeconds: 250,
      waitingSeconds: 150,
      transferCount: 0,
      realtimeConfidence: "none",
      candidateFamily: "preference_biased",
      legs: [
        walk("d_w1", 120),
        transit(
          "d_t1",
          line,
          "Origin",
          "Dest",
          "2026-07-30T14:05:00.000Z",
          "2026-07-30T14:28:00.000Z",
        ),
        walk("d_w2", 130),
      ],
    },
  ];
}

/**
 * ranking_demo — sole fixture scenario that intentionally varies
 * realtimeConfidence (high vs none) with otherwise-equal satisfaction/arrival/
 * transfers/walking so ADR-0007 confidence ordering is visible end-to-end.
 */
function rankingDemoDrafts(selected: readonly string[]): RawCandidateDraft[] {
  const line = selected[0] ?? "F";
  const sharedLegs = (
    suffix: string,
  ): RawCandidateDraft["legs"] => [
    walk(`rd_w1_${suffix}`, 120),
    transit(
      `rd_t_${suffix}`,
      line,
      "Origin",
      "Dest",
      "2026-07-30T14:05:00.000Z",
      "2026-07-30T14:28:00.000Z",
      `trip_rd_${suffix}`,
    ),
    walk(`rd_w2_${suffix}`, 130),
  ];

  return [
    baselineF(),
    {
      itineraryId: "itin_rd_high",
      durationSeconds: 1800,
      arrivalTime: "2026-07-30T14:30:00.000Z",
      walkingSeconds: 250,
      waitingSeconds: 150,
      transferCount: 0,
      realtimeConfidence: "high",
      candidateFamily: "preference_biased",
      legs: sharedLegs("hi"),
    },
    {
      itineraryId: "itin_rd_none",
      durationSeconds: 1800,
      arrivalTime: "2026-07-30T14:30:00.000Z",
      walkingSeconds: 250,
      waitingSeconds: 150,
      transferCount: 0,
      realtimeConfidence: "none",
      candidateFamily: "preference_biased",
      legs: sharedLegs("no"),
    },
  ];
}

export const SYNTHETIC_SNAPSHOT: RoutingSnapshotHandle = {
  staticDatasetVersion: "gtfs_fixture_v1",
  realtimeSnapshotId: "rt_fixture_v1",
  dataMode: "synthetic",
  realtimeAgeSeconds: 0,
  staticActivatedAt: "2026-07-29T06:00:00.000Z",
};
