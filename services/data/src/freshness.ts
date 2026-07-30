import {
  DEFAULT_FRESHNESS_POLICY,
  type DataMode,
  type Freshness,
  type FreshnessPolicy,
  type RealtimeSnapshot,
} from "./types.js";

/**
 * DATA_CONTRACT §4 freshness policy:
 * - live: age ≤ 90s
 * - stale: age > 90s but ≤ 15min (still usable last-known-good)
 * - schedule_only: no usable realtime, or age > 15min
 * - last-known-good retention ≥ 30min (kept in store; mode may already be schedule_only)
 */

export function computeDataMode(
  ageSeconds: number | null,
  options: {
    hasRealtimePayload: boolean;
    synthetic?: boolean;
    unavailable?: boolean;
    policy?: FreshnessPolicy;
  },
): DataMode {
  if (options.unavailable) return "unavailable";
  if (options.synthetic) return "synthetic";

  const policy = options.policy ?? DEFAULT_FRESHNESS_POLICY;

  if (!options.hasRealtimePayload || ageSeconds === null) {
    return "schedule_only";
  }

  if (ageSeconds <= policy.liveMaxAgeSeconds) return "live";
  if (ageSeconds <= policy.staleMaxAgeSeconds) return "stale";
  return "schedule_only";
}

export function ageSecondsFrom(
  ingestedAtIso: string,
  nowMs: number,
): number {
  const ingested = Date.parse(ingestedAtIso);
  if (Number.isNaN(ingested)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((nowMs - ingested) / 1000));
}

/**
 * Prefer feed header timestamps when present; else fall back to ingestedAt.
 */
export function computeRealtimeAgeSeconds(
  snapshot: Pick<RealtimeSnapshot, "feedTimestamps" | "ingestedAt">,
  nowMs: number,
): number {
  const feedAges: number[] = [];
  for (const ts of Object.values(snapshot.feedTimestamps)) {
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms)) {
      feedAges.push(Math.max(0, Math.floor((nowMs - ms) / 1000)));
    }
  }
  if (feedAges.length > 0) {
    // Conservative: oldest feed drives mode (worst-case freshness)
    return Math.max(...feedAges);
  }
  return ageSecondsFrom(snapshot.ingestedAt, nowMs);
}

export function buildFreshness(
  snapshot: RealtimeSnapshot | null,
  staticActivatedAt: string | null,
  nowMs: number,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): Freshness {
  if (!snapshot) {
    return {
      realtimeAgeSeconds: null,
      staticActivatedAt,
      warnings: [
        {
          code: "schedule_only",
          message: "Live train times are unavailable; showing schedule only.",
        },
      ],
    };
  }

  const age = computeRealtimeAgeSeconds(snapshot, nowMs);
  const mode = computeDataMode(age, {
    hasRealtimePayload: true,
    synthetic: snapshot.synthetic,
    policy,
  });

  const warnings: Freshness["warnings"] = [];
  if (mode === "stale") {
    warnings.push({
      code: "stale_realtime",
      message:
        "Live train times are delayed; showing last known updates.",
    });
  } else if (mode === "schedule_only") {
    warnings.push({
      code: "schedule_only",
      message: "Live train times are unavailable; showing schedule only.",
    });
  } else if (mode === "synthetic") {
    warnings.push({
      code: "synthetic_data",
      message: "Synthetic fixture data — not live navigation.",
    });
  }

  if (snapshot.failedFeeds.length > 0) {
    warnings.push({
      code: "partial_realtime",
      message: "Some realtime feeds failed; results may be incomplete.",
    });
  }

  return {
    realtimeAgeSeconds: age,
    staticActivatedAt,
    warnings,
  };
}

export function isWithinRetention(
  snapshot: RealtimeSnapshot,
  nowMs: number,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): boolean {
  const age = ageSecondsFrom(snapshot.ingestedAt, nowMs);
  return age <= policy.lastKnownGoodRetentionSeconds;
}
