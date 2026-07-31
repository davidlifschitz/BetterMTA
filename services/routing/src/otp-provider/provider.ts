import { randomUUID } from "node:crypto";
import {
  assessCandidateCoverage,
  buildOrchestrationQueryPlan,
  DEFAULT_CANDIDATE_BUDGET,
  dedupeDraftsByFingerprint,
  defaultLineIdToGtfsRouteIds,
  defaultPreferredLineTopology,
  isTopologicallySensible,
  MAX_OTP_QUERIES,
  type OrchestrationQuerySpec,
} from "../orchestration/index.ts";
import { computeSatisfaction, normalizeSelectedLineIds } from "../satisfaction.ts";
import type {
  CandidateCoverage,
  CandidateFamily,
  CandidateSearchRequest,
  RawCandidateDraft,
} from "../types.ts";
import { OtpProviderError } from "./errors.ts";
import { mapOtpItineraries } from "./map.ts";
import {
  buildPlanRequestBody,
  DEFAULT_SEARCH_WINDOW_SECONDS,
  epochToNyDateTimeParts,
  isoToEpochMs,
  otpGraphqlUrl,
} from "./query.ts";
import type {
  OtpCandidateProvider,
  OtpCandidateProviderOptions,
  OtpPlanResponse,
  OtpQueryStats,
  OtpRejectReason,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_NUM_ITINERARIES = 8;
/** Floor for shortened non-baseline OTP AbortController budgets. */
const NON_BASELINE_TIMEOUT_FLOOR_MS = 500;
/** Cap for non-baseline queries so preference fan-out cannot match full baseline budget. */
const NON_BASELINE_TIMEOUT_CAP_MS = 2500;

/**
 * Shorter per-query budget for preference/via/subset families.
 * Keeps worst-case wall time near baseline + one shortened parallel batch
 * instead of N sequential full timeouts.
 */
export function nonBaselineTimeoutMs(baselineTimeoutMs: number): number {
  if (!Number.isFinite(baselineTimeoutMs) || baselineTimeoutMs <= 0) {
    return NON_BASELINE_TIMEOUT_FLOOR_MS;
  }
  const half = Math.floor(baselineTimeoutMs / 2);
  return Math.min(
    baselineTimeoutMs,
    NON_BASELINE_TIMEOUT_CAP_MS,
    Math.max(NON_BASELINE_TIMEOUT_FLOOR_MS, half),
  );
}

function emptyRejectionCounts(): Record<OtpRejectReason, number> {
  return {
    empty_legs: 0,
    non_chronological: 0,
    zero_duration_transit: 0,
    unmappable_route: 0,
    missing_times: 0,
  };
}

function resolveDepartureEpochMs(
  request: CandidateSearchRequest,
  now: () => number,
): number {
  const timing = request.timing;
  if (timing.type === "depart_at" || timing.type === "arrive_by") {
    return isoToEpochMs(timing.time);
  }
  return now();
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ABORT_ERR";
}

function classifyFetchFailure(err: unknown): OtpProviderError {
  if (isAbortError(err)) {
    return new OtpProviderError("timeout", "OTP plan query timed out", {
      cause: err,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("socket")
  ) {
    return new OtpProviderError(
      "unavailable",
      `OTP unavailable: ${message}`,
      { cause: err },
    );
  }
  return new OtpProviderError("unavailable", `OTP request failed: ${message}`, {
    cause: err,
  });
}

function hasCompleteMatch(
  drafts: readonly RawCandidateDraft[],
  preferredLineIds: readonly string[],
): boolean {
  if (preferredLineIds.length === 0) return true;
  return drafts.some(
    (d) => computeSatisfaction(preferredLineIds, d.legs).isComplete,
  );
}

/**
 * Production CandidateProvider backed by OTP 2.9 GraphQL `/otp/gtfs/v1`.
 * BetterMTA owns multi-family preferred-line orchestration (ADR-0023);
 * satisfaction accounting and ranking stay outside OTP (ADR-0011).
 */
export function createOtpCandidateProvider(
  opts: OtpCandidateProviderOptions,
): OtpCandidateProvider {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baselineNumItineraries = opts.numItineraries ?? DEFAULT_NUM_ITINERARIES;
  const searchWindowSeconds =
    opts.searchWindowSeconds ?? DEFAULT_SEARCH_WINDOW_SECONDS;
  const maxQueries = opts.maxQueries ?? MAX_OTP_QUERIES;
  const graphVersion =
    opts.graphVersion === undefined || opts.graphVersion === null
      ? "unknown"
      : opts.graphVersion;
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const topology = opts.topology ?? defaultPreferredLineTopology();
  const lineIdToGtfsRouteIds =
    opts.lineIdToGtfsRouteIds ?? defaultLineIdToGtfsRouteIds;

  let rejectionCounts = emptyRejectionCounts();
  let lastQueryStats: OtpQueryStats | null = null;
  let lastCandidateCoverage: CandidateCoverage | null = null;

  async function executeOnePlan(input: {
    request: CandidateSearchRequest;
    spec: OrchestrationQuerySpec;
    date: string;
    time: string;
    dateTime: number;
    queryTimeoutMs: number;
  }): Promise<RawCandidateDraft[]> {
    const started = now();
    const queryId = randomUUID();
    const numItineraries =
      input.spec.kind === "baseline"
        ? baselineNumItineraries
        : input.spec.numItineraries;

    const body = buildPlanRequestBody({
      fromLat: input.request.origin.lat,
      fromLon: input.request.origin.lon,
      toLat: input.request.destination.lat,
      toLon: input.request.destination.lon,
      date: input.date,
      time: input.time,
      numItineraries,
      searchWindow: searchWindowSeconds,
      dateTime: input.dateTime,
      unpreferredRoutes: input.spec.unpreferredRoutes ?? null,
      unpreferredCost: input.spec.unpreferredCost ?? null,
      via: input.spec.viaStation
        ? {
            label: input.spec.viaStation.label,
            lat: input.spec.viaStation.lat,
            lon: input.spec.viaStation.lon,
          }
        : null,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.queryTimeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(otpGraphqlUrl(opts.otpBaseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const mapped = classifyFetchFailure(err);
      lastQueryStats = {
        durationMs: Math.max(0, now() - started),
        ok: false,
        itineraryCount: 0,
        rejectedCount: 0,
        errorKind: mapped.kind,
        queryKey: input.spec.queryKey,
        candidateFamily: input.spec.candidateFamily,
      };
      opts.onQuery?.(lastQueryStats);
      throw mapped;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const err = new OtpProviderError(
        "unavailable",
        `OTP HTTP ${response.status}`,
      );
      lastQueryStats = {
        durationMs: Math.max(0, now() - started),
        ok: false,
        itineraryCount: 0,
        rejectedCount: 0,
        errorKind: "unavailable",
        queryKey: input.spec.queryKey,
        candidateFamily: input.spec.candidateFamily,
      };
      opts.onQuery?.(lastQueryStats);
      throw err;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let payload: OtpPlanResponse;
    try {
      const text = await response.text();
      if (
        contentType &&
        !contentType.includes("json") &&
        !text.trimStart().startsWith("{")
      ) {
        throw new Error("non-json body");
      }
      payload = JSON.parse(text) as OtpPlanResponse;
    } catch (err) {
      const mapped = new OtpProviderError(
        "bad_response",
        "OTP returned non-JSON or unparseable body",
        { cause: err },
      );
      lastQueryStats = {
        durationMs: Math.max(0, now() - started),
        ok: false,
        itineraryCount: 0,
        rejectedCount: 0,
        errorKind: "bad_response",
        queryKey: input.spec.queryKey,
        candidateFamily: input.spec.candidateFamily,
      };
      opts.onQuery?.(lastQueryStats);
      throw mapped;
    }

    if (payload.errors && payload.errors.length > 0) {
      const msg = payload.errors.map((e) => e.message ?? "error").join("; ");
      const mapped = new OtpProviderError(
        "unavailable",
        `OTP GraphQL errors: ${msg}`,
      );
      lastQueryStats = {
        durationMs: Math.max(0, now() - started),
        ok: false,
        itineraryCount: 0,
        rejectedCount: 0,
        errorKind: "unavailable",
        queryKey: input.spec.queryKey,
        candidateFamily: input.spec.candidateFamily,
      };
      opts.onQuery?.(lastQueryStats);
      throw mapped;
    }

    const plan = payload.data?.plan;
    if (!plan) {
      const mapped = new OtpProviderError(
        "bad_response",
        "OTP response missing data.plan",
      );
      lastQueryStats = {
        durationMs: Math.max(0, now() - started),
        ok: false,
        itineraryCount: 0,
        rejectedCount: 0,
        errorKind: "bad_response",
        queryKey: input.spec.queryKey,
        candidateFamily: input.spec.candidateFamily,
      };
      opts.onQuery?.(lastQueryStats);
      throw mapped;
    }

    const itineraries = plan.itineraries ?? [];
    const mapped = mapOtpItineraries(itineraries, {
      queryId,
      graphVersion,
      routeIdToLineId: opts.routeIdToLineId,
      candidateFamily: input.spec.candidateFamily,
    });

    for (const [reason, count] of Object.entries(mapped.rejectionCounts)) {
      if (count > 0) {
        rejectionCounts[reason as OtpRejectReason] =
          (rejectionCounts[reason as OtpRejectReason] ?? 0) + count;
      }
    }

    const rejectedCount = Object.values(mapped.rejectionCounts).reduce(
      (a, b) => a + b,
      0,
    );

    lastQueryStats = {
      durationMs: Math.max(0, now() - started),
      ok: true,
      itineraryCount: mapped.drafts.length,
      rejectedCount,
      queryKey: input.spec.queryKey,
      candidateFamily: input.spec.candidateFamily,
    };
    opts.onQuery?.(lastQueryStats);

    return mapped.drafts;
  }

  const provider: OtpCandidateProvider = {
    id: "otp",
    get rejectionCounts() {
      return rejectionCounts;
    },
    get lastQueryStats() {
      return lastQueryStats;
    },
    get lastCandidateCoverage() {
      return lastCandidateCoverage;
    },
    resetCounters() {
      rejectionCounts = emptyRejectionCounts();
      lastQueryStats = null;
      lastCandidateCoverage = null;
    },
    async generateCandidates(
      request: CandidateSearchRequest,
    ): Promise<RawCandidateDraft[]> {
      const preferredLineIds = normalizeSelectedLineIds(request.selectedLineIds);
      const candidateBudget = request.candidateBudget ?? DEFAULT_CANDIDATE_BUDGET;
      const dateTime = resolveDepartureEpochMs(request, now);
      const { date, time } = epochToNyDateTimeParts(dateTime);

      const queryPlan = buildOrchestrationQueryPlan({
        preferredLineIds,
        origin: request.origin,
        destination: request.destination,
        topology,
        maxQueries,
        lineIdToGtfsRouteIds,
      });

      // Allow baseline numItineraries override from provider options.
      if (queryPlan[0]?.kind === "baseline") {
        queryPlan[0] = {
          ...queryPlan[0],
          numItineraries: baselineNumItineraries,
        };
      }

      const familiesAttempted: CandidateFamily[] = [];
      const collected: RawCandidateDraft[] = [];
      let budgetExhausted = false;
      let queriesExecuted = 0;
      let stoppedEarlyWithCoverage = false;

      const baselineSpec = queryPlan[0];
      const remainingSpecs = queryPlan.slice(1);

      // Baseline is always first and hard-fails on timeout/unavailable/bad_response.
      if (baselineSpec) {
        const drafts = await executeOnePlan({
          request,
          spec: baselineSpec,
          date,
          time,
          dateTime,
          queryTimeoutMs: timeoutMs,
        });
        queriesExecuted += 1;
        if (!familiesAttempted.includes(baselineSpec.candidateFamily)) {
          familiesAttempted.push(baselineSpec.candidateFamily);
        }
        for (const draft of drafts) {
          collected.push(draft);
        }
      }

      const dedupedAfterBaseline = dedupeDraftsByFingerprint(collected);
      if (dedupedAfterBaseline.length >= candidateBudget) {
        budgetExhausted = true;
      }
      // Rare for multi-line prefs; common for single-line when baseline already
      // satisfies — skip preference fan-out to cut OTP load/latency.
      if (
        !budgetExhausted &&
        preferredLineIds.length > 0 &&
        hasCompleteMatch(dedupedAfterBaseline, preferredLineIds)
      ) {
        stoppedEarlyWithCoverage = true;
      }

      // Preference/via/subset families run concurrently under the remaining query budget.
      if (
        !stoppedEarlyWithCoverage &&
        !budgetExhausted &&
        remainingSpecs.length > 0 &&
        queriesExecuted < maxQueries
      ) {
        const slots = maxQueries - queriesExecuted;
        const toRun = remainingSpecs.slice(0, slots);
        const preferenceTimeoutMs = nonBaselineTimeoutMs(timeoutMs);

        const settled = await Promise.allSettled(
          toRun.map((spec) =>
            executeOnePlan({
              request,
              spec,
              date,
              time,
              dateTime,
              queryTimeoutMs: preferenceTimeoutMs,
            }),
          ),
        );

        let timeoutError: unknown = null;
        for (let i = 0; i < settled.length; i++) {
          const spec = toRun[i]!;
          const outcome = settled[i]!;
          queriesExecuted += 1;
          if (!familiesAttempted.includes(spec.candidateFamily)) {
            familiesAttempted.push(spec.candidateFamily);
          }

          if (outcome.status === "fulfilled") {
            for (const draft of outcome.value) {
              collected.push(draft);
            }
            continue;
          }

          const err = outcome.reason;
          // Timeouts still hard-fail (after the parallel batch settles).
          // Other non-baseline failures soft-skip — never infer impossibility
          // from one bias/via miss.
          if (err instanceof OtpProviderError && err.kind === "timeout") {
            timeoutError = err;
            continue;
          }
          lastQueryStats = {
            durationMs: lastQueryStats?.durationMs ?? 0,
            ok: false,
            itineraryCount: 0,
            rejectedCount: 0,
            errorKind:
              err instanceof OtpProviderError ? err.kind : "unavailable",
            queryKey: spec.queryKey,
            candidateFamily: spec.candidateFamily,
          };
          opts.onQuery?.(lastQueryStats);
        }
        if (timeoutError) {
          throw timeoutError;
        }
      }

      const dedupedSoFar = dedupeDraftsByFingerprint(collected);
      if (dedupedSoFar.length >= candidateBudget) {
        budgetExhausted = true;
      }
      if (
        !stoppedEarlyWithCoverage &&
        preferredLineIds.length > 0 &&
        hasCompleteMatch(dedupedSoFar, preferredLineIds) &&
        familiesAttempted.length >= 2
      ) {
        stoppedEarlyWithCoverage = true;
      }

      if (
        !stoppedEarlyWithCoverage &&
        queriesExecuted >= maxQueries &&
        queryPlan.length > maxQueries
      ) {
        budgetExhausted = true;
      }
      // Ran every planned query under the hard ceiling without early coverage stop.
      if (
        !stoppedEarlyWithCoverage &&
        queriesExecuted >= queryPlan.length &&
        preferredLineIds.length > 0
      ) {
        budgetExhausted = true;
      }

      const deduped = dedupeDraftsByFingerprint(collected).slice(
        0,
        candidateBudget,
      );
      if (collected.length > deduped.length) {
        budgetExhausted = true;
      }

      const topologicallySensible = isTopologicallySensible({
        preferredLineIds,
        origin: request.origin,
        destination: request.destination,
        topology,
      });

      const assessment = assessCandidateCoverage({
        preferredLineIds,
        familiesAttempted,
        drafts: deduped,
        budgetExhausted,
        topologicallySensible,
      });
      lastCandidateCoverage = assessment.candidateCoverage;

      if (assessment.failInsufficientCoverage) {
        // Sentinel consumed by runRouteSearch — never fabricate preference paths.
        return [
          {
            itineraryId: "__coverage_exhausted__",
            durationSeconds: 0,
            arrivalTime: "1970-01-01T00:00:00.000Z",
            walkingSeconds: 0,
            waitingSeconds: 0,
            transferCount: 0,
            legs: [
              {
                legId: "leg_coverage_exhausted",
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

      return deduped;
    },
  };

  return provider;
}
