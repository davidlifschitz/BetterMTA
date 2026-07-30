import { createHash } from "node:crypto";
import {
  computeDataMode,
  computeRealtimeAgeSeconds,
  isWithinRetention,
} from "../freshness.js";
import type { LineMappingEntry } from "../types.js";
import { MetricsRegistry } from "../metrics.js";
import type {
  DataMode,
  NormalizedTripUpdate,
  RealtimeSnapshot,
  ServiceAlert,
  QuarantinedEntity,
  FreshnessPolicy,
} from "../types.js";
import { DEFAULT_FRESHNESS_POLICY } from "../types.js";
import {
  parseRealtimeFeedJson,
  type GtfsRtFeedJson,
  type ParsedRealtimeFeed,
} from "./parser.js";
import { RealtimeSnapshotStore } from "./store.js";

export interface FeedInput {
  feedId: string;
  /** Parsed JSON object, or null to simulate empty fetch body */
  payload: unknown;
}

export interface IngestOptions {
  staticDatasetVersion: string | null;
  knownTripIds?: Set<string>;
  lineMapping?: LineMappingEntry[];
  ingestedAt?: string;
  nowMs?: number;
  synthetic?: boolean;
  policy?: FreshnessPolicy;
  snapshotIdPrefix?: string;
}

export interface IngestResult {
  snapshot: RealtimeSnapshot;
  pollDurationMs: number;
}

function buildSnapshotId(
  prefix: string,
  ingestedAt: string,
  feedIds: string[],
): string {
  const h = createHash("sha256")
    .update(ingestedAt)
    .update(feedIds.sort().join(","))
    .digest("hex")
    .slice(0, 10);
  const day = ingestedAt.slice(0, 10).replace(/-/g, "");
  return `${prefix}_${day}_${h}`;
}

function mergeFeeds(feeds: ParsedRealtimeFeed[]): {
  tripUpdates: NormalizedTripUpdate[];
  alerts: ServiceAlert[];
  quarantined: QuarantinedEntity[];
  parseErrors: number;
  vehicleCount: number;
  feedTimestamps: Record<string, string>;
  partialFeeds: string[];
  failedFeeds: Array<{ feedId: string; reason: string }>;
} {
  const tripUpdates: NormalizedTripUpdate[] = [];
  const alerts: ServiceAlert[] = [];
  const quarantined: QuarantinedEntity[] = [];
  let parseErrors = 0;
  let vehicleCount = 0;
  const feedTimestamps: Record<string, string> = {};
  const partialFeeds: string[] = [];
  const failedFeeds: Array<{ feedId: string; reason: string }> = [];

  for (const f of feeds) {
    if (f.simulatedFailure) {
      failedFeeds.push(f.simulatedFailure);
      continue;
    }
    tripUpdates.push(...f.tripUpdates);
    alerts.push(...f.alerts);
    quarantined.push(...f.quarantined);
    parseErrors += f.parseErrors;
    vehicleCount += f.vehicleCount;
    if (f.feedTimestampIso) {
      feedTimestamps[f.feedId] = f.feedTimestampIso;
    } else if (f.tripUpdates.length === 0 && f.alerts.length === 0) {
      // empty but successful poll
      partialFeeds.push(f.feedId);
    }
  }

  return {
    tripUpdates,
    alerts,
    quarantined,
    parseErrors,
    vehicleCount,
    feedTimestamps,
    partialFeeds,
    failedFeeds,
  };
}

export class RealtimeIngestor {
  constructor(
    private readonly store: RealtimeSnapshotStore,
    private readonly metrics: MetricsRegistry,
  ) {}

  /**
   * Ingest one or more recorded feed payloads (offline-safe).
   * Production would poll protobuf endpoints; here we accept JSON fixtures.
   */
  ingest(feeds: FeedInput[], options: IngestOptions): IngestResult {
    const started = Date.now();
    const ingestedAt = options.ingestedAt ?? new Date().toISOString();
    const nowMs = options.nowMs ?? Date.parse(ingestedAt);
    const policy = options.policy ?? DEFAULT_FRESHNESS_POLICY;
    const synthetic = options.synthetic === true;

    // Fail closed: a pinned static version requires an explicit known-trip set.
    // An empty set quarantines every trip update (never silently skip checks).
    const knownTripIds = options.knownTripIds;
    if (options.staticDatasetVersion) {
      if (knownTripIds === undefined) {
        throw new Error(
          "knownTripIds is required when staticDatasetVersion is pinned",
        );
      }
    }

    const parsed = feeds.map((f) =>
      parseRealtimeFeedJson(f.payload, {
        feedId: f.feedId,
        lineMapping: options.lineMapping,
        knownTripIds,
      }),
    );

    const merged = mergeFeeds(parsed);

    for (let i = 0; i < merged.parseErrors; i++) {
      this.metrics.incr("bettermta_parse_errors_total");
    }
    if (merged.quarantined.length > 0) {
      this.metrics.incr(
        "bettermta_broken_references_total",
        merged.quarantined.length,
      );
    }
    this.metrics.incr(
      "bettermta_trip_updates_total",
      merged.tripUpdates.length,
    );
    this.metrics.incr("bettermta_alerts_total", merged.alerts.length);
    this.metrics.incr("bettermta_vehicles_total", merged.vehicleCount);

    const cancellations = merged.tripUpdates.filter(
      (t) => t.scheduleRelationship === "canceled",
    );
    const skippedStops: RealtimeSnapshot["skippedStops"] = [];
    for (const t of merged.tripUpdates) {
      for (const stu of t.stopTimeUpdates) {
        if (stu.scheduleRelationship === "skipped" && stu.stopId) {
          skippedStops.push({
            tripId: t.tripId,
            stopId: stu.stopId,
            feedId: t.feedId,
          });
        }
      }
    }

    // Usable realtime requires trip updates and/or alerts.
    // A fresh header with an empty entity list is NOT usable — do not
    // treat it as live or overwrite last-known-good.
    const hasRealtimePayload =
      merged.tripUpdates.length + merged.alerts.length > 0;

    // All feeds failed ⇒ schedule_only / unavailable path
    const allFailed =
      feeds.length > 0 && merged.failedFeeds.length === feeds.length;

    const draft: RealtimeSnapshot = {
      snapshotId: "",
      staticDatasetVersion: options.staticDatasetVersion,
      ingestedAt,
      feedTimestamps: merged.feedTimestamps,
      entityCounts: {
        tripUpdates: merged.tripUpdates.length,
        alerts: merged.alerts.length,
        vehicles: merged.vehicleCount,
        quarantined: merged.quarantined.length,
      },
      ageSeconds: 0,
      dataMode: "schedule_only",
      tripUpdates: merged.tripUpdates,
      cancellations,
      skippedStops,
      alerts: merged.alerts,
      quarantined: merged.quarantined,
      synthetic,
      partialFeeds: merged.partialFeeds,
      failedFeeds: merged.failedFeeds,
    };

    const age = hasRealtimePayload
      ? computeRealtimeAgeSeconds(draft, nowMs)
      : ageFromIngest(ingestedAt, nowMs);

    let dataMode: DataMode;
    if (synthetic) {
      dataMode = "synthetic";
    } else if (allFailed && !hasRealtimePayload) {
      dataMode = "schedule_only";
    } else {
      dataMode = computeDataMode(hasRealtimePayload ? age : null, {
        hasRealtimePayload,
        synthetic,
        policy,
      });
    }

    draft.ageSeconds = hasRealtimePayload ? age : age;
    draft.dataMode = dataMode;
    draft.snapshotId = buildSnapshotId(
      options.snapshotIdPrefix ?? "rt",
      ingestedAt,
      feeds.map((f) => f.feedId),
    );

    this.metrics.setGauge("bettermta_realtime_age_seconds", draft.ageSeconds);
    this.metrics.setGauge(
      "bettermta_entity_count",
      draft.entityCounts.tripUpdates,
      { kind: "trip_updates" },
    );
    if (dataMode === "stale") {
      this.metrics.setGauge(
        "bettermta_stale_duration_seconds",
        Math.max(0, draft.ageSeconds - policy.liveMaxAgeSeconds),
      );
    } else {
      this.metrics.setGauge("bettermta_stale_duration_seconds", 0);
    }

    const pollDurationMs = Math.max(0, Date.now() - started);
    this.metrics.setGauge(
      "bettermta_realtime_poll_duration_ms",
      pollDurationMs,
    );

    // Only persist usable realtime as latest. Empty-header polls must not
    // overwrite last-known-good; routing falls back to retained LKG.
    if (hasRealtimePayload) {
      if (!allFailed) {
        this.metrics.markLastSuccessfulUpdate(ingestedAt);
      }
      this.store.put(draft, nowMs, policy);
    }

    return { snapshot: draft, pollDurationMs };
  }

  /**
   * Resolve the snapshot that routing should use at `nowMs`, applying
   * freshness policy and last-known-good retention.
   *
   * Empty / header-only snapshots are never preferred over retained LKG.
   * Between 15–30 minutes age, dataMode may be `schedule_only` while
   * `realtimeSnapshotId` remains non-null — consumers must honor dataMode.
   */
  resolveForRouting(
    latest: RealtimeSnapshot | null,
    options: {
      nowMs: number;
      staticDatasetVersion: string;
      policy?: FreshnessPolicy;
    },
  ): RealtimeSnapshot | null {
    const policy = options.policy ?? DEFAULT_FRESHNESS_POLICY;
    const usableLatest =
      latest && isUsableRealtimeSnapshot(latest) ? latest : null;
    const candidate =
      usableLatest ??
      this.store.getLastKnownGood(options.nowMs, policy);

    if (!candidate) return null;

    if (!isWithinRetention(candidate, options.nowMs, policy)) {
      return null;
    }

    const age = computeRealtimeAgeSeconds(candidate, options.nowMs);
    const dataMode = computeDataMode(age, {
      hasRealtimePayload: true,
      synthetic: candidate.synthetic,
      policy,
    });

    return {
      ...candidate,
      ageSeconds: age,
      dataMode,
      staticDatasetVersion:
        candidate.staticDatasetVersion ?? options.staticDatasetVersion,
    };
  }
}

/** True when a snapshot has trip updates and/or alerts (usable for routing). */
export function isUsableRealtimeSnapshot(
  snapshot: Pick<RealtimeSnapshot, "entityCounts" | "tripUpdates" | "alerts">,
): boolean {
  return (
    snapshot.entityCounts.tripUpdates + snapshot.entityCounts.alerts > 0 ||
    snapshot.tripUpdates.length + snapshot.alerts.length > 0
  );
}

function ageFromIngest(ingestedAt: string, nowMs: number): number {
  const t = Date.parse(ingestedAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

export type { GtfsRtFeedJson };
