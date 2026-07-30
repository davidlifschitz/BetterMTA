import type { CandidateProvider } from "./candidate-provider.ts";
import { fingerprintItinerary } from "./fingerprint.ts";
import { buildExplanation } from "./explanation.ts";
import {
  rankBaseline,
  rankConstrained,
  truncateTop,
} from "./ranking.ts";
import {
  computePerLineRideSeconds,
  computeSatisfaction,
  lineSequenceFromLegs,
  normalizeSelectedLineIds,
} from "./satisfaction.ts";
import type {
  CandidateItinerary,
  CandidateSearchRequest,
  DataMode,
  Itinerary,
  RawCandidateDraft,
  RealtimeConfidence,
} from "./types.ts";
import { MAX_RETURNED_ITINERARIES } from "./types.ts";
import {
  countRejection,
  validateCandidateDraft,
} from "./validate.ts";

export type DataDegradation = "schedule_only" | "stale";

/** Library-only itinerary extras (not part of API contract shapes). */
export type RankedItinerary = Itinerary & {
  perLineRideSeconds: Record<string, number>;
};

export type RouteSearchOutcome =
  | {
      kind: "ok";
      baseline: RankedItinerary[];
      constrained: RankedItinerary[];
      satisfactionSummary: {
        bestSatisfactionCount: number;
        requestedCount: number;
        completeMatchFound: boolean;
      };
      /** True when selected lines cannot be fully satisfied; partials may still be present. */
      constraintInfeasible: boolean;
      /** Soft degradation when snapshot is schedule_only or stale. */
      dataDegradation: DataDegradation | null;
      /** Counts of drafts dropped by the validity gate, keyed by reject reason. */
      invalidDraftRejectionCounts: Record<string, number>;
    }
  | { kind: "no_transit_path"; requestedCount: number }
  | {
      kind: "insufficient_candidate_coverage";
      requestedCount: number;
      reason: string;
    }
  | {
      kind: "data_unavailable";
      requestedCount: number;
      reason: string;
    };

function arrivalMs(iso: string): number {
  return Date.parse(iso);
}

/**
 * Force realtime confidence from snapshot dataMode.
 * schedule_only → none; stale → low (cap upward confidence).
 */
export function applyDataModeConfidence(
  confidence: RealtimeConfidence,
  dataMode: DataMode,
): RealtimeConfidence {
  if (dataMode === "schedule_only") return "none";
  if (dataMode === "stale") {
    // Cap at low: never claim medium/high under stale feeds.
    if (confidence === "high" || confidence === "medium") return "low";
    return confidence;
  }
  return confidence;
}

export function enrichCandidate(
  draft: RawCandidateDraft | CandidateItinerary,
  selectedLineIds: readonly string[],
  baselineBestArrival: string | null,
  dataMode: DataMode = "synthetic",
): RankedItinerary {
  const legs = draft.legs;
  const satisfaction = computeSatisfaction(selectedLineIds, legs);
  // Always recompute from content — ignore provider-supplied fingerprints.
  const fingerprint = fingerprintItinerary({
    legs,
    arrivalTime: draft.arrivalTime,
    transferCount: draft.transferCount,
    walkingSeconds: draft.walkingSeconds,
    durationSeconds: draft.durationSeconds,
  });

  let baselineDeltaSeconds: number | null = null;
  if (baselineBestArrival) {
    baselineDeltaSeconds =
      arrivalMs(draft.arrivalTime) - arrivalMs(baselineBestArrival);
  }

  const realtimeConfidence = applyDataModeConfidence(
    draft.realtimeConfidence,
    dataMode,
  );

  const isBaselineFamily = draft.candidateFamily === "baseline";
  const explanation = buildExplanation({
    satisfaction: isBaselineFamily
      ? computeSatisfaction([], legs)
      : satisfaction,
    transferCount: draft.transferCount,
    walkingSeconds: draft.walkingSeconds,
    waitingSeconds: draft.waitingSeconds,
    realtimeConfidence,
    baselineDeltaSeconds: isBaselineFamily ? null : baselineDeltaSeconds,
    alertCount: draft.alerts?.length ?? 0,
  });

  const effectiveSatisfaction = isBaselineFamily
    ? computeSatisfaction([], legs)
    : satisfaction;

  return {
    itineraryId: draft.itineraryId,
    fingerprint,
    durationSeconds: draft.durationSeconds,
    arrivalTime: draft.arrivalTime,
    walkingSeconds: draft.walkingSeconds,
    waitingSeconds: draft.waitingSeconds,
    transferCount: draft.transferCount,
    lineSequence: lineSequenceFromLegs(legs),
    legs,
    satisfaction: effectiveSatisfaction,
    realtimeConfidence,
    alerts: draft.alerts ?? [],
    explanation,
    reliability: null,
    candidateFamily: draft.candidateFamily,
    perLineRideSeconds: computePerLineRideSeconds(legs),
  };
}

function dedupeByFingerprint(items: readonly RankedItinerary[]): RankedItinerary[] {
  const seen = new Set<string>();
  const out: RankedItinerary[] = [];
  for (const item of items) {
    if (seen.has(item.fingerprint)) continue;
    seen.add(item.fingerprint);
    out.push(item);
  }
  return out;
}

function withConstrainedSatisfaction(
  itin: RankedItinerary,
  selectedLineIds: readonly string[],
): RankedItinerary {
  const satisfaction = computeSatisfaction(selectedLineIds, itin.legs);
  return {
    ...itin,
    satisfaction,
    explanation: buildExplanation({
      satisfaction,
      transferCount: itin.transferCount,
      walkingSeconds: itin.walkingSeconds,
      waitingSeconds: itin.waitingSeconds,
      realtimeConfidence: itin.realtimeConfidence,
      baselineDeltaSeconds: itin.explanation.baselineDeltaSeconds ?? null,
      alertCount: itin.alerts.length,
    }),
  };
}

/**
 * Run BetterMTA constraint orchestration on top of a CandidateProvider.
 * Offline-safe when used with FixtureCandidateProvider.
 */
export async function runRouteSearch(
  provider: CandidateProvider,
  request: CandidateSearchRequest,
): Promise<RouteSearchOutcome> {
  const selectedLineIds = normalizeSelectedLineIds(request.selectedLineIds);
  const requestedCount = selectedLineIds.length;
  const budget = request.candidateBudget ?? 64;
  const dataMode = request.snapshot.dataMode;

  if (dataMode === "unavailable") {
    return {
      kind: "data_unavailable",
      requestedCount,
      reason:
        "Routing snapshot dataMode is unavailable; no itineraries fabricated.",
    };
  }

  const dataDegradation: DataDegradation | null =
    dataMode === "schedule_only" || dataMode === "stale" ? dataMode : null;

  const normalizedRequest: CandidateSearchRequest = {
    ...request,
    selectedLineIds,
    candidateBudget: budget,
  };

  let drafts: Array<RawCandidateDraft | CandidateItinerary>;
  try {
    drafts = await provider.generateCandidates(normalizedRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("INSUFFICIENT_CANDIDATE_COVERAGE")) {
      return {
        kind: "insufficient_candidate_coverage",
        requestedCount,
        reason: message,
      };
    }
    throw err;
  }

  if (drafts.length === 0) {
    return { kind: "no_transit_path", requestedCount };
  }

  // Budget exhaustion signal: provider marked coverage failure via sentinel id.
  // Checked before transit-empty detection so walk-only sentinels are not
  // misclassified as no_transit_path.
  if (drafts.some((d) => d.itineraryId === "__coverage_exhausted__")) {
    return {
      kind: "insufficient_candidate_coverage",
      requestedCount,
      reason: "Candidate budget exhausted without trustworthy itineraries.",
    };
  }

  const invalidDraftRejectionCounts: Record<string, number> = {};
  const validDrafts = drafts.filter((d) => {
    const result = validateCandidateDraft(d);
    if (!result.ok && result.reason) {
      countRejection(invalidDraftRejectionCounts, result.reason);
      return false;
    }
    return true;
  });

  if (validDrafts.length === 0) {
    return { kind: "no_transit_path", requestedCount };
  }

  // First pass: identify baseline-family candidates for delta computation.
  const baselineDrafts = validDrafts.filter(
    (d) => d.candidateFamily === "baseline",
  );
  const preliminaryBaseline = baselineDrafts.map((d) =>
    enrichCandidate(d, [], null, dataMode),
  );
  const rankedBaselineAll = rankBaseline(
    dedupeByFingerprint(preliminaryBaseline),
  );
  const baselineBestArrival = rankedBaselineAll[0]?.arrivalTime ?? null;

  const enrichedAll = validDrafts.map((d) =>
    enrichCandidate(d, selectedLineIds, baselineBestArrival, dataMode),
  );

  const baselinePool = dedupeByFingerprint(
    enrichedAll.filter((i) => i.candidateFamily === "baseline"),
  );

  // When selected lines are present, constrained ranking considers ALL families
  // (including baseline), deduped by fingerprint. Baseline list remains the
  // unbiased time-ranked top-3 from the baseline family only.
  const constrainedSourcePool =
    requestedCount === 0
      ? []
      : dedupeByFingerprint(enrichedAll);

  const anyTransit = enrichedAll.some((i) =>
    i.legs.some((leg) => leg.kind === "transit"),
  );
  if (!anyTransit) {
    return { kind: "no_transit_path", requestedCount };
  }

  const baseline = truncateTop(
    rankBaseline(baselinePool),
    MAX_RETURNED_ITINERARIES,
  ) as RankedItinerary[];

  let constrained: RankedItinerary[] = [];
  let satisfactionSummary = {
    bestSatisfactionCount: 0,
    requestedCount,
    completeMatchFound: requestedCount === 0,
  };
  let constraintInfeasible = false;

  if (requestedCount === 0) {
    constrained = [];
    satisfactionSummary = {
      bestSatisfactionCount: 0,
      requestedCount: 0,
      completeMatchFound: true,
    };
  } else {
    const stamped = constrainedSourcePool.map((itin) =>
      withConstrainedSatisfaction(itin, selectedLineIds),
    );
    const ranked = rankConstrained(stamped);
    constrained = truncateTop(
      ranked,
      MAX_RETURNED_ITINERARIES,
    ) as RankedItinerary[];
    const best = constrained[0];
    const bestSatisfactionCount = best?.satisfaction.satisfactionCount ?? 0;
    const completeMatchFound = constrained.some(
      (c) => c.satisfaction.isComplete,
    );
    constraintInfeasible = !completeMatchFound;
    satisfactionSummary = {
      bestSatisfactionCount,
      requestedCount,
      completeMatchFound,
    };
  }

  if (baseline.length === 0 && constrained.length === 0) {
    return { kind: "no_transit_path", requestedCount };
  }

  return {
    kind: "ok",
    baseline,
    constrained,
    satisfactionSummary,
    constraintInfeasible,
    dataDegradation,
    invalidDraftRejectionCounts,
  };
}

/** Helper for tests/benches: apply ranking only. */
export function rankOnly(
  candidates: readonly Itinerary[],
  mode: "constrained" | "baseline",
): Itinerary[] {
  return mode === "constrained"
    ? truncateTop(rankConstrained(candidates), MAX_RETURNED_ITINERARIES)
    : truncateTop(rankBaseline(candidates), MAX_RETURNED_ITINERARIES);
}
