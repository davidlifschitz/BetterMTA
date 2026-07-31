/**
 * Snapshot assembly + retained manifests for live multi-feed polls.
 */

import { createHash } from "node:crypto";
import {
  computeDataMode,
  computeRealtimeAgeSeconds,
} from "../freshness.js";
import type { RealtimeIngestor } from "../realtime/ingest.js";
import type { ParsedRealtimeFeed } from "../realtime/parser.js";
import type {
  DataMode,
  FeedFreshnessStatus,
  FreshnessPolicy,
  PerFeedStatus,
  RealtimeSnapshot,
  SnapshotManifest,
  SnapshotManifestFeed,
} from "../types.js";
import { DEFAULT_FRESHNESS_POLICY } from "../types.js";
import { REALTIME_FEEDS, REQUIRED_FEED_IDS } from "./feeds.js";
import { isHollowParsedFeed } from "./hollow.js";

export interface AssembledFeedInput {
  feedId: string;
  parsed: ParsedRealtimeFeed | null;
  fetchedAt: string | null;
  headerTimestamp: number | null;
  error?: string;
  /** When poll failed but raw LKG exists, use its ages */
  fromLkg?: boolean;
}

function ageOf(
  headerTimestamp: number | null,
  fetchedAt: string | null,
  nowMs: number,
): number | null {
  if (headerTimestamp != null && headerTimestamp > 0) {
    return Math.max(0, Math.floor(nowMs / 1000 - headerTimestamp));
  }
  if (fetchedAt) {
    const t = Date.parse(fetchedAt);
    if (!Number.isNaN(t)) return Math.max(0, Math.floor((nowMs - t) / 1000));
  }
  return null;
}

export function classifyFeedAge(
  ageSeconds: number | null,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): FeedFreshnessStatus {
  if (ageSeconds == null) return "never_fetched";
  if (ageSeconds <= policy.liveMaxAgeSeconds) return "fresh";
  if (ageSeconds <= policy.staleMaxAgeSeconds) return "stale";
  return "unavailable";
}

/**
 * Overall dataMode from required feeds:
 * - all required fresh → live
 * - any required stale (and none unavailable) → stale
 * - any required unavailable / never_fetched → schedule_only
 * Alerts feed is optional for mode.
 */
export function computeMultiFeedDataMode(
  perFeed: Record<string, PerFeedStatus>,
  options?: { synthetic?: boolean; hasRealtimePayload?: boolean },
): DataMode {
  if (options?.synthetic) return "synthetic";
  if (options?.hasRealtimePayload === false) return "schedule_only";

  const required = REQUIRED_FEED_IDS.map((id) => perFeed[id]).filter(Boolean);
  if (required.length === 0) return "schedule_only";

  if (required.some((f) => f!.status === "unavailable" || f!.status === "never_fetched")) {
    return "schedule_only";
  }
  if (required.every((f) => f!.status === "fresh")) return "live";
  if (required.some((f) => f!.status === "stale")) return "stale";
  return "schedule_only";
}

export function buildPerFeedStatus(
  inputs: AssembledFeedInput[],
  nowMs: number,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): Record<string, PerFeedStatus> {
  const byId = new Map(inputs.map((i) => [i.feedId, i]));
  const out: Record<string, PerFeedStatus> = {};

  for (const def of REALTIME_FEEDS) {
    const input = byId.get(def.feedId);
    const age = input
      ? ageOf(input.headerTimestamp, input.fetchedAt, nowMs)
      : null;
    let status = classifyFeedAge(age, policy);
    if (input?.error && !input.fromLkg) {
      // Failed poll with no LKG
      if (!input.headerTimestamp && !input.fetchedAt) status = "never_fetched";
      else status = classifyFeedAge(age, policy);
    }
    const parsed = input?.parsed;
    out[def.feedId] = {
      feedId: def.feedId,
      headerTimestamp: input?.headerTimestamp
        ? new Date(input.headerTimestamp * 1000).toISOString()
        : parsed?.feedTimestampIso ?? null,
      fetchedAt: input?.fetchedAt ?? null,
      ageSeconds: age,
      status,
      entityCounts: {
        tripUpdates: parsed?.tripUpdates.length ?? 0,
        alerts: parsed?.alerts.length ?? 0,
        vehicles: parsed?.vehicleCount ?? 0,
        quarantined: parsed?.quarantined.length ?? 0,
      },
      required: def.requiredForMode,
      error: input?.error,
    };
  }
  return out;
}

export class SnapshotManifestStore {
  private readonly items: SnapshotManifest[] = [];

  constructor(
    private readonly retain = 20,
    private readonly expiryMs = 30 * 60 * 1000,
  ) {}

  put(manifest: SnapshotManifest, nowMs = Date.now()): void {
    this.items.push(manifest);
    this.prune(nowMs);
  }

  list(nowMs = Date.now()): SnapshotManifest[] {
    this.prune(nowMs);
    return [...this.items];
  }

  latest(): SnapshotManifest | null {
    return this.items[this.items.length - 1] ?? null;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.expiryMs;
    while (this.items.length > 0) {
      const first = this.items[0]!;
      if (Date.parse(first.createdAt) < cutoff) this.items.shift();
      else break;
    }
    while (this.items.length > this.retain) this.items.shift();
  }
}

export function manifestFromSnapshot(
  snapshot: RealtimeSnapshot,
  perFeed: Record<string, PerFeedStatus>,
): SnapshotManifest {
  const perFeedOut: Record<string, SnapshotManifestFeed> = {};
  for (const [id, f] of Object.entries(perFeed)) {
    perFeedOut[id] = {
      feedId: id,
      headerTimestamp: f.headerTimestamp,
      fetchedAt: f.fetchedAt,
      ageSeconds: f.ageSeconds,
      status: f.status,
      entityCounts: f.entityCounts,
    };
  }
  return {
    snapshotId: snapshot.snapshotId,
    createdAt: snapshot.ingestedAt,
    staticVersionId: snapshot.staticDatasetVersion,
    dataMode: snapshot.dataMode,
    perFeed: perFeedOut,
  };
}

/**
 * Assemble multi-feed parsed results into a RealtimeSnapshot via RealtimeIngestor,
 * then overlay per-feed status and multi-feed dataMode.
 */
export function assembleLiveSnapshot(options: {
  ingestor: RealtimeIngestor;
  feeds: AssembledFeedInput[];
  staticDatasetVersion: string | null;
  knownTripIds?: Set<string>;
  lineMapping?: import("../types.js").LineMappingEntry[];
  nowMs: number;
  policy?: FreshnessPolicy;
  synthetic?: boolean;
  /**
   * Prior assembled snapshot. When a feed poll is hollow/non-usable, retain
   * that feedId's trip updates (and related entities) from prior rather than
   * wiping the trunk's contribution from the merged snapshot.
   */
  priorSnapshot?: RealtimeSnapshot | null;
}): {
  snapshot: RealtimeSnapshot;
  perFeed: Record<string, PerFeedStatus>;
  manifest: SnapshotManifest;
} {
  const policy = options.policy ?? DEFAULT_FRESHNESS_POLICY;
  const ingestedAt = new Date(options.nowMs).toISOString();

  const successful = options.feeds.filter((f) => f.parsed && !f.parsed.simulatedFailure);
  const feedInputs = successful.map((f) => ({
    feedId: f.feedId,
    // Convert parsed back isn't needed — ingest expects JSON payloads.
    // We bypass JSON by calling a lower-level merge: build a synthetic
    // JSON-shaped payload from parsed results via a dedicated path.
    payload: parsedToJsonPayload(f.parsed!),
  }));

  // Also surface failures
  const failedPayloads = options.feeds
    .filter((f) => f.error && !f.parsed)
    .map((f) => ({
      feedId: f.feedId,
      payload: {
        header: {},
        entity: [],
        _fixtureMeta: {
          feedId: f.feedId,
          simulatedError: "fetch_failure" as const,
        },
      },
    }));

  const { snapshot } = options.ingestor.ingest(
    [...feedInputs, ...failedPayloads],
    {
      staticDatasetVersion: options.staticDatasetVersion,
      knownTripIds: options.knownTripIds,
      lineMapping: options.lineMapping,
      ingestedAt,
      nowMs: options.nowMs,
      synthetic: options.synthetic === true,
      policy,
      snapshotIdPrefix: "rt_live",
    },
  );

  // Re-attach derived cancellations / NYCT fields lost in JSON roundtrip.
  // For hollow feeds, keep prior per-feed entities when available so one
  // empty trunk poll does not wipe that feedId's contribution (High 5).
  const prior = options.priorSnapshot ?? null;
  const mergedFromParsed: import("../types.js").NormalizedTripUpdate[] = [];
  const mergedAlerts: import("../types.js").ServiceAlert[] = [];
  const mergedQuarantined: import("../types.js").QuarantinedEntity[] = [];
  let vehicleTotal = 0;

  for (const f of successful) {
    const hollow = isHollowParsedFeed(f.parsed);
    if (hollow && prior) {
      mergedFromParsed.push(
        ...prior.tripUpdates.filter((t) => t.feedId === f.feedId),
      );
      mergedAlerts.push(...prior.alerts.filter((a) => a.feedId === f.feedId));
      mergedQuarantined.push(
        ...prior.quarantined.filter((q) => q.feedId === f.feedId),
      );
      continue;
    }
    mergedFromParsed.push(...f.parsed!.tripUpdates);
    mergedAlerts.push(...f.parsed!.alerts);
    mergedQuarantined.push(...f.parsed!.quarantined);
    vehicleTotal += f.parsed?.vehicleCount ?? 0;
  }

  const anyWire = successful.some((f) => f.parsed?.hasWireEntities === true);
  const retainedHollowFeed = successful.some(
    (f) => isHollowParsedFeed(f.parsed) && prior,
  );

  if (mergedFromParsed.length > 0 || mergedAlerts.length > 0) {
    snapshot.tripUpdates = mergedFromParsed;
    snapshot.cancellations = mergedFromParsed.filter(
      (t) => t.scheduleRelationship === "canceled",
    );
    snapshot.skippedStops = [];
    for (const t of mergedFromParsed) {
      for (const stu of t.stopTimeUpdates) {
        if (stu.scheduleRelationship === "skipped" && stu.stopId) {
          snapshot.skippedStops.push({
            tripId: t.tripId,
            stopId: stu.stopId,
            feedId: t.feedId,
          });
        }
      }
    }
    snapshot.alerts = mergedAlerts;
    snapshot.quarantined = [
      ...mergedQuarantined,
      ...snapshot.quarantined.filter((q) =>
        snapshot.failedFeeds.some((f) => f.feedId === q.feedId),
      ),
    ];
    snapshot.entityCounts = {
      tripUpdates: mergedFromParsed.length,
      alerts: mergedAlerts.length,
      vehicles: vehicleTotal,
      quarantined: snapshot.quarantined.length,
    };
  }

  // Overlay feed timestamps from headers
  for (const f of options.feeds) {
    if (f.headerTimestamp) {
      snapshot.feedTimestamps[f.feedId] = new Date(
        f.headerTimestamp * 1000,
      ).toISOString();
    } else if (f.parsed?.feedTimestampIso) {
      snapshot.feedTimestamps[f.feedId] = f.parsed.feedTimestampIso;
    }
  }

  const perFeed = buildPerFeedStatus(options.feeds, options.nowMs, policy);
  snapshot.perFeed = perFeed;

  const hasRealtimePayload =
    anyWire && snapshot.tripUpdates.length + snapshot.alerts.length > 0;

  // Prefer multi-feed mode when we have per-feed coverage for required feeds
  const multiMode = computeMultiFeedDataMode(perFeed, {
    synthetic: options.synthetic === true,
    hasRealtimePayload,
  });

  // Classic age blend must ignore optional alert feeds (e.g. camsys-subway-alerts).
  // Required-feed multiMode remains authoritative for live/stale/schedule_only;
  // stale alerts must not poison overall dataMode when TU feeds are fresh.
  const requiredTimestamps: Record<string, string> = {};
  for (const [feedId, ts] of Object.entries(snapshot.feedTimestamps)) {
    const def = REALTIME_FEEDS.find((f) => f.feedId === feedId);
    if (def && !def.requiredForMode) continue;
    requiredTimestamps[feedId] = ts;
  }
  const classicAge = hasRealtimePayload
    ? computeRealtimeAgeSeconds(
        { feedTimestamps: requiredTimestamps, ingestedAt: snapshot.ingestedAt },
        options.nowMs,
      )
    : null;
  const classicMode = computeDataMode(classicAge, {
    hasRealtimePayload,
    synthetic: options.synthetic === true,
    policy,
  });

  // Required-feed multiMode wins for live/stale/schedule_only when it is more
  // optimistic than classic (alerts excluded above). Still take the worse of
  // the two when classic is based only on required feeds.
  snapshot.dataMode = worseMode(multiMode, classicMode);
  snapshot.ageSeconds =
    classicAge ??
    Math.max(
      0,
      ...Object.values(perFeed)
        .filter((f) => f.required && f.ageSeconds != null)
        .map((f) => f.ageSeconds!),
      0,
    );

  // Stable snapshot id including per-feed headers
  const h = createHash("sha256")
    .update(ingestedAt)
    .update(
      Object.entries(snapshot.feedTimestamps)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 10);
  snapshot.snapshotId = `rt_live_${ingestedAt.slice(0, 10).replace(/-/g, "")}_${h}`;

  // Re-commit when hollow-feed retention changed the merged entity set so LKG
  // is not left with a trunk wiped by the initial ingest put.
  if (hasRealtimePayload && retainedHollowFeed) {
    options.ingestor.commitAssembledSnapshot(snapshot, options.nowMs, policy);
  }

  const manifest = manifestFromSnapshot(snapshot, perFeed);
  return { snapshot, perFeed, manifest };
}

function worseMode(a: DataMode, b: DataMode): DataMode {
  const rank: Record<DataMode, number> = {
    live: 0,
    stale: 1,
    schedule_only: 2,
    unavailable: 3,
    synthetic: 4,
  };
  return rank[a] >= rank[b] ? a : b;
}

/** Minimal JSON payload so ingest can record failures / empty; trip bodies re-merged. */
function parsedToJsonPayload(parsed: ParsedRealtimeFeed): unknown {
  return {
    header: {
      gtfsRealtimeVersion: "2.0",
      timestamp: parsed.feedTimestampIso
        ? Math.floor(Date.parse(parsed.feedTimestampIso) / 1000)
        : undefined,
    },
    _fixtureMeta: {
      feedId: parsed.feedId,
      feedTimestampIso: parsed.feedTimestampIso ?? undefined,
    },
    entity: parsed.tripUpdates.map((tu, i) => ({
      id: `tu_${i}`,
      tripUpdate: {
        trip: {
          tripId: tu.tripId,
          routeId: tu.routeId,
          startDate: tu.startDate,
          startTime: tu.startTime,
          scheduleRelationship: tu.scheduleRelationship.toUpperCase(),
        },
        stopTimeUpdate: tu.stopTimeUpdates.map((s) => ({
          stopId: s.stopId,
          stopSequence: s.stopSequence,
          arrival: {
            delay: s.arrivalDelaySeconds ?? undefined,
            time: s.arrivalTime ?? undefined,
          },
          departure: {
            delay: s.departureDelaySeconds ?? undefined,
            time: s.departureTime ?? undefined,
          },
          scheduleRelationship: s.scheduleRelationship?.toUpperCase(),
        })),
      },
    })),
  };
}
