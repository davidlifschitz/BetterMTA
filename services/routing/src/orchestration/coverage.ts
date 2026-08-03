/**
 * Privacy-safe candidateCoverage diagnostics + exhaustion decision (ADR-0023).
 */

import type {
  CandidateCoverage,
  CandidateCoverageStatus,
  CandidateFamily,
  RawCandidateDraft,
} from "../types.ts";
import { computeSatisfaction } from "../satisfaction.ts";

export interface CoverageAssessmentInput {
  preferredLineIds: readonly string[];
  familiesAttempted: readonly CandidateFamily[];
  drafts: readonly RawCandidateDraft[];
  /** True when query or candidate budget stopped further generation. */
  budgetExhausted: boolean;
  /**
   * Topology suggests preference-covering candidates should exist.
   * When false, 0-of-N after honest search is constraint infeasibility, not coverage failure.
   */
  topologicallySensible: boolean;
}

export interface CoverageAssessment {
  candidateCoverage: CandidateCoverage;
  /**
   * When true, search should surface insufficient_candidate_coverage rather than
   * a silent 0-of-N success (ADR-0023 §6).
   */
  failInsufficientCoverage: boolean;
}

export function assessCandidateCoverage(
  input: CoverageAssessmentInput,
): CoverageAssessment {
  const preferred = input.preferredLineIds;
  const candidateCount = input.drafts.length;

  let preferenceCoveringCandidateCount = 0;
  if (preferred.length === 0) {
    preferenceCoveringCandidateCount = candidateCount;
  } else {
    for (const draft of input.drafts) {
      const sat = computeSatisfaction(preferred, draft.legs);
      if (sat.satisfactionCount > 0) preferenceCoveringCandidateCount += 1;
    }
  }

  const familiesAttempted = uniqueFamilies(input.familiesAttempted);
  const status = coverageStatus({
    preferredCount: preferred.length,
    preferenceCoveringCandidateCount,
    budgetExhausted: input.budgetExhausted,
    topologicallySensible: input.topologicallySensible,
    familiesAttempted,
  });

  const candidateCoverage: CandidateCoverage = {
    status,
    familiesAttempted,
    candidateCount,
    preferenceCoveringCandidateCount,
    budgetExhausted: input.budgetExhausted,
  };

  const failInsufficientCoverage =
    preferred.length > 0 &&
    input.topologicallySensible &&
    preferenceCoveringCandidateCount === 0 &&
    input.budgetExhausted;

  return { candidateCoverage, failInsufficientCoverage };
}

function coverageStatus(input: {
  preferredCount: number;
  preferenceCoveringCandidateCount: number;
  budgetExhausted: boolean;
  topologicallySensible: boolean;
  familiesAttempted: readonly CandidateFamily[];
}): CandidateCoverageStatus {
  if (input.preferredCount === 0) {
    return input.budgetExhausted ? "degraded" : "adequate";
  }
  if (
    input.preferenceCoveringCandidateCount === 0 &&
    input.budgetExhausted &&
    input.topologicallySensible
  ) {
    return "exhausted";
  }
  if (input.preferenceCoveringCandidateCount === 0) {
    // Honest 0-of-N when topology is not sensible, or degraded under budget pressure.
    return input.budgetExhausted ? "degraded" : "adequate";
  }
  // Preference-covering candidates exist — adequate even if the query plan completed.
  return "adequate";
}

function uniqueFamilies(
  families: readonly CandidateFamily[],
): CandidateFamily[] {
  const order: CandidateFamily[] = [
    "baseline",
    "preference_biased",
    "targeted_combination",
    "constrained",
  ];
  const seen = new Set(families);
  return order.filter((f) => seen.has(f));
}
