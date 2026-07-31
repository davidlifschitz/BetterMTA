/**
 * Privacy-bounded operational metrics for place/geocode and candidate-coverage
 * paths (Wave 1D). Labels must stay low-cardinality and must never carry
 * address text, POI queries, precise coordinates, vendor IDs, or raw preferred
 * line lists.
 *
 * Routing / places waves can call these hooks when their code lands; names are
 * stable even before exporters are wired (see infra/observability/metrics.md).
 */

import { LatencyHistogram } from "./latency.js";

export type PlaceProviderResult =
  | "ok"
  | "empty"
  | "error"
  | "timeout"
  | "unavailable";

/** BetterMTA provider ids only — never vendor hostnames. */
export type PlaceProviderMetricId = "station_index" | "geocoder" | "unknown";

export type CandidateCoverageStatusMetric =
  | "adequate"
  | "degraded"
  | "exhausted"
  | "unknown";

export type PreferenceCoverageBucket =
  | "none"
  | "partial"
  | "complete"
  | "n_a";

function labelKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
  return `${name}{${parts}}`;
}

export interface PrivacyMetricsSnapshot {
  placeProvider: {
    totals: Record<string, number>;
    latency: ReturnType<LatencyHistogram["snapshot"]>;
  };
  candidateBudget: {
    totals: Record<string, number>;
    lastFamiliesAttempted: number | null;
    lastCandidateCount: number | null;
    lastPreferenceCoveringCount: number | null;
  };
  preferenceCoverage: {
    totals: Record<string, number>;
  };
}

/**
 * In-process counters + latency for P1 place/coverage observability.
 * Safe to share via AppDeps; no location content retained.
 */
export class PrivacySafeMetrics {
  private readonly counters = new Map<string, number>();
  private readonly placeLatency = new LatencyHistogram([
    5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000,
  ]);
  private lastFamiliesAttempted: number | null = null;
  private lastCandidateCount: number | null = null;
  private lastPreferenceCoveringCount: number | null = null;

  private incr(name: string, labels?: Record<string, string>, by = 1): void {
    const k = labelKey(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + by);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(labelKey(name, labels)) ?? 0;
  }

  /**
   * Place / geocode provider latency + result.
   * `provider` must be a BetterMTA id (`station_index` | `geocoder`), never a hostname.
   */
  recordPlaceProvider(input: {
    provider: PlaceProviderMetricId;
    result: PlaceProviderResult;
    durationMs: number;
    /** Optional bounded error class — no free text. */
    errorClass?: "timeout" | "http" | "parse" | "upstream" | "unknown";
  }): void {
    this.placeLatency.observe(input.durationMs);
    this.incr("bettermta_place_provider_total", {
      provider: input.provider,
      result: input.result,
    });
    this.incr("bettermta_places_search_total", { result: input.result });
    if (input.result === "error" || input.result === "timeout" || input.result === "unavailable") {
      this.incr("bettermta_place_provider_errors_total", {
        provider: input.provider,
        reason: input.errorClass ?? input.result,
      });
    }
  }

  /**
   * Candidate-orchestration budget hooks (ADR-0023).
   * Call from routing/API when CandidateCoverage is known — safe before merge.
   */
  recordCandidateCoverage(input: {
    status: CandidateCoverageStatusMetric;
    familiesAttemptedCount: number;
    candidateCount: number;
    preferenceCoveringCandidateCount: number;
    budgetExhausted: boolean;
  }): void {
    this.lastFamiliesAttempted = input.familiesAttemptedCount;
    this.lastCandidateCount = input.candidateCount;
    this.lastPreferenceCoveringCount = input.preferenceCoveringCandidateCount;

    this.incr("bettermta_candidate_coverage_total", {
      status: input.status,
    });
    if (input.budgetExhausted) {
      this.incr("bettermta_candidate_budget_exhausted_total");
    }
    // Gauge-like last-values for ops snapshots (low cardinality).
    this.incr("bettermta_candidate_families_attempted_sum", undefined, input.familiesAttemptedCount);
    this.incr("bettermta_candidate_count_sum", undefined, input.candidateCount);
    this.incr(
      "bettermta_preference_covering_candidate_count_sum",
      undefined,
      input.preferenceCoveringCandidateCount,
    );
  }

  /**
   * Aggregate preference-coverage outcome — counts/buckets only.
   * Do not pass raw preferred-line ID lists.
   */
  recordPreferenceCoverage(input: {
    requestedCount: number;
    satisfactionCount: number;
    isComplete: boolean;
  }): void {
    const bucket = preferenceCoverageBucket(
      input.requestedCount,
      input.satisfactionCount,
      input.isComplete,
    );
    this.incr("bettermta_preference_coverage_total", {
      bucket,
      requested_bucket: requestedCountBucket(input.requestedCount),
    });
  }

  snapshot(): PrivacyMetricsSnapshot {
    const totals: Record<string, number> = {};
    for (const [k, v] of this.counters) totals[k] = v;
    return {
      placeProvider: {
        totals: Object.fromEntries(
          Object.entries(totals).filter(
            ([k]) =>
              k.startsWith("bettermta_place_provider") ||
              k.startsWith("bettermta_places_search"),
          ),
        ),
        latency: this.placeLatency.snapshot(),
      },
      candidateBudget: {
        totals: Object.fromEntries(
          Object.entries(totals).filter(([k]) =>
            k.startsWith("bettermta_candidate"),
          ),
        ),
        lastFamiliesAttempted: this.lastFamiliesAttempted,
        lastCandidateCount: this.lastCandidateCount,
        lastPreferenceCoveringCount: this.lastPreferenceCoveringCount,
      },
      preferenceCoverage: {
        totals: Object.fromEntries(
          Object.entries(totals).filter(([k]) =>
            k.startsWith("bettermta_preference_coverage"),
          ),
        ),
      },
    };
  }

  reset(): void {
    this.counters.clear();
    this.placeLatency.reset();
    this.lastFamiliesAttempted = null;
    this.lastCandidateCount = null;
    this.lastPreferenceCoveringCount = null;
  }
}

export function preferenceCoverageBucket(
  requestedCount: number,
  satisfactionCount: number,
  isComplete: boolean,
): PreferenceCoverageBucket {
  if (requestedCount <= 0) return "n_a";
  if (isComplete || satisfactionCount >= requestedCount) return "complete";
  if (satisfactionCount <= 0) return "none";
  return "partial";
}

/** Bound requested-count label cardinality (0–5 per ADR). */
export function requestedCountBucket(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 5) return "5";
  return String(Math.floor(n));
}

/** Normalize unknown provider strings to bounded metric ids. */
export function normalizePlaceProviderMetricId(
  provider: string | undefined | null,
): PlaceProviderMetricId {
  if (provider === "station_index" || provider === "geocoder") return provider;
  return "unknown";
}
