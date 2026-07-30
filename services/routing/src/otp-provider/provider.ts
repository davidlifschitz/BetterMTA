import { randomUUID } from "node:crypto";
import type { CandidateSearchRequest, RawCandidateDraft } from "../types.ts";
import { OtpProviderError } from "./errors.ts";
import { mapOtpItineraries } from "./map.ts";
import {
  buildPlanRequestBody,
  DEFAULT_SEARCH_WINDOW_SECONDS,
  epochToUtcDateTimeParts,
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

/**
 * Production CandidateProvider backed by OTP 2.9 GraphQL `/otp/gtfs/v1`.
 * Satisfaction accounting and ranking stay outside OTP (ADR-0011).
 */
export function createOtpCandidateProvider(
  opts: OtpCandidateProviderOptions,
): OtpCandidateProvider {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const numItineraries = opts.numItineraries ?? DEFAULT_NUM_ITINERARIES;
  const searchWindowSeconds =
    opts.searchWindowSeconds ?? DEFAULT_SEARCH_WINDOW_SECONDS;
  const graphVersion =
    opts.graphVersion === undefined || opts.graphVersion === null
      ? "unknown"
      : opts.graphVersion;
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);

  let rejectionCounts = emptyRejectionCounts();
  let lastQueryStats: OtpQueryStats | null = null;

  const provider: OtpCandidateProvider = {
    id: "otp",
    get rejectionCounts() {
      return rejectionCounts;
    },
    get lastQueryStats() {
      return lastQueryStats;
    },
    resetCounters() {
      rejectionCounts = emptyRejectionCounts();
      lastQueryStats = null;
    },
    async generateCandidates(
      request: CandidateSearchRequest,
    ): Promise<RawCandidateDraft[]> {
      const started = now();
      const queryId = randomUUID();
      const dateTime = resolveDepartureEpochMs(request, now);
      const { date, time } = epochToUtcDateTimeParts(dateTime);

      const body = buildPlanRequestBody({
        fromLat: request.origin.lat,
        fromLon: request.origin.lon,
        toLat: request.destination.lat,
        toLon: request.destination.lon,
        date,
        time,
        numItineraries,
        searchWindow: searchWindowSeconds,
        dateTime,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        };
        opts.onQuery?.(lastQueryStats);
        throw mapped;
      }

      const plan = payload.data?.plan;
      if (!plan || !Array.isArray(plan.itineraries)) {
        // Distinguish null/missing plan shape from empty itinerary list.
        if (plan && plan.itineraries == null) {
          // treat null itineraries as empty coverage
        } else if (!plan) {
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
          };
          opts.onQuery?.(lastQueryStats);
          throw mapped;
        }
      }

      const itineraries = plan?.itineraries ?? [];
      const mapped = mapOtpItineraries(itineraries, {
        queryId,
        graphVersion,
        routeIdToLineId: opts.routeIdToLineId,
        candidateFamily: "baseline",
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
      };
      opts.onQuery?.(lastQueryStats);

      return mapped.drafts;
    },
  };

  return provider;
}
