/**
 * Thin privacy signal helpers for route-search responses.
 * Safe to call when Wave 1B/1C fields (`candidateCoverage`) are absent —
 * preference aggregates use satisfactionSummary counts only.
 */

import type { Logger } from "../logging/logger.js";
import { buildPrivacySafeRouteSearchLog } from "../logging/privacy.js";
import type { PrivacySafeMetrics } from "../metrics/privacyMetrics.js";
import type { RouteSearchRequest, RouteSearchResponse } from "../types.js";

type CandidateCoverageLike = {
  status?: string;
  familiesAttempted?: string[];
  candidateCount?: number;
  preferenceCoveringCandidateCount?: number;
  budgetExhausted?: boolean;
};

function asCandidateCoverage(
  value: unknown,
): CandidateCoverageLike | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as CandidateCoverageLike;
}

/**
 * Emit privacy-safe route_search log fields + bounded preference/coverage metrics.
 * Does not retain OD coordinates, address text, or preferred-line ID lists.
 */
export function recordRouteSearchPrivacySignals(input: {
  body: RouteSearchRequest;
  result: RouteSearchResponse;
  requestId: string;
  durationMs: number;
  logger: Logger;
  privacyMetrics: PrivacySafeMetrics;
  /** When routing returns ApiError details with CandidateCoverage. */
  coverageFromError?: CandidateCoverageLike;
}): void {
  const { body, result, requestId, durationMs, logger, privacyMetrics } = input;

  const privacyLog = buildPrivacySafeRouteSearchLog({
    requestId,
    origin: body.origin,
    destination: body.destination,
    timingType: body.timing.type,
    selectedLineIds: body.selectedLineIds,
  });

  const summary = result.constrained.satisfactionSummary;
  privacyMetrics.recordPreferenceCoverage({
    requestedCount: summary.requestedCount,
    satisfactionCount: summary.bestSatisfactionCount,
    isComplete: summary.completeMatchFound,
  });

  const coverage =
    input.coverageFromError ??
    asCandidateCoverage(
      (result as RouteSearchResponse & { candidateCoverage?: unknown })
        .candidateCoverage,
    );

  if (coverage) {
    const status =
      coverage.status === "adequate" ||
      coverage.status === "degraded" ||
      coverage.status === "exhausted"
        ? coverage.status
        : "unknown";
    privacyMetrics.recordCandidateCoverage({
      status,
      familiesAttemptedCount: Array.isArray(coverage.familiesAttempted)
        ? coverage.familiesAttempted.length
        : 0,
      candidateCount:
        typeof coverage.candidateCount === "number"
          ? coverage.candidateCount
          : 0,
      preferenceCoveringCandidateCount:
        typeof coverage.preferenceCoveringCandidateCount === "number"
          ? coverage.preferenceCoveringCandidateCount
          : 0,
      budgetExhausted: Boolean(coverage.budgetExhausted),
    });
  }

  logger.info("route_search_ok", {
    route: "/v1/routes/search",
    method: "POST",
    statusCode: 200,
    durationMs,
    dataMode: result.dataMode,
    ...privacyLog,
    requestedCount: summary.requestedCount,
    bestSatisfactionCount: summary.bestSatisfactionCount,
    completeMatchFound: summary.completeMatchFound,
    resultCount: result.constrained.itineraries.length,
    ...(coverage?.status ? { candidateCoverageStatus: coverage.status } : {}),
    ...(coverage?.budgetExhausted !== undefined
      ? { budgetExhausted: coverage.budgetExhausted }
      : {}),
  });
}

/**
 * Hook for insufficient_candidate_coverage errors (Wave 1B/1C).
 * Call from error path when details carry CandidateCoverage fields.
 */
export function recordInsufficientCoveragePrivacySignals(input: {
  privacyMetrics: PrivacySafeMetrics;
  details?: CandidateCoverageLike;
}): void {
  const coverage = input.details;
  if (!coverage) {
    input.privacyMetrics.recordCandidateCoverage({
      status: "exhausted",
      familiesAttemptedCount: 0,
      candidateCount: 0,
      preferenceCoveringCandidateCount: 0,
      budgetExhausted: true,
    });
    return;
  }
  input.privacyMetrics.recordCandidateCoverage({
    status: "exhausted",
    familiesAttemptedCount: Array.isArray(coverage.familiesAttempted)
      ? coverage.familiesAttempted.length
      : 0,
    candidateCount:
      typeof coverage.candidateCount === "number" ? coverage.candidateCount : 0,
    preferenceCoveringCandidateCount:
      typeof coverage.preferenceCoveringCandidateCount === "number"
        ? coverage.preferenceCoveringCandidateCount
        : 0,
    budgetExhausted: coverage.budgetExhausted ?? true,
  });
}
