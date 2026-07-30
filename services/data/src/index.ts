/**
 * @bettermta/data — public surface for routing / API adapters.
 */

export type {
  DataMode,
  StaticDatasetStatus,
  RoutingSnapshotHandle,
  StaticDataset,
  RealtimeSnapshot,
  ServiceAlert,
  NormalizedTripUpdate,
  Freshness,
  FreshnessPolicy,
  LineMappingEntry,
} from "./types.js";

export { DEFAULT_FRESHNESS_POLICY } from "./types.js";

export {
  MetricsRegistry,
  globalMetrics,
  type DataMetricsSnapshot,
} from "./metrics.js";

export {
  mapRoutesToLineIds,
  resolveLineId,
  CANONICAL_LINE_COLORS,
} from "./line-mapping.js";

export {
  computeDataMode,
  computeRealtimeAgeSeconds,
  buildFreshness,
  isWithinRetention,
  ageSecondsFrom,
} from "./freshness.js";

export {
  loadGtfsDirectory,
  parseGtfsFiles,
  checksumContents,
} from "./static/gtfs-parser.js";
export { validateGtfs } from "./static/validator.js";
export { StaticImporter } from "./static/importer.js";
export { StaticDatasetStore } from "./static/store.js";

export { parseRealtimeFeedJson } from "./realtime/parser.js";
export { RealtimeIngestor, isUsableRealtimeSnapshot } from "./realtime/ingest.js";
export { RealtimeSnapshotStore } from "./realtime/store.js";

export { buildRoutingSnapshotHandle } from "./snapshot/handle.js";

import { MetricsRegistry } from "./metrics.js";
import { StaticImporter } from "./static/importer.js";
import { StaticDatasetStore } from "./static/store.js";
import { RealtimeIngestor } from "./realtime/ingest.js";
import { RealtimeSnapshotStore } from "./realtime/store.js";
import { buildRoutingSnapshotHandle } from "./snapshot/handle.js";
import type { FeedInput, IngestOptions } from "./realtime/ingest.js";
import type { ImportOptions } from "./static/importer.js";
import {
  DEFAULT_FRESHNESS_POLICY,
  type FreshnessPolicy,
} from "./types.js";

export type { FeedInput, IngestOptions, ImportOptions };

/** Convenience façade composing static + realtime stores. */
export class DataPlatform {
  readonly metrics: MetricsRegistry;
  readonly staticStore: StaticDatasetStore;
  readonly realtimeStore: RealtimeSnapshotStore;
  readonly staticImporter: StaticImporter;
  readonly realtimeIngestor: RealtimeIngestor;
  readonly policy: FreshnessPolicy;

  constructor(options?: {
    metrics?: MetricsRegistry;
    policy?: FreshnessPolicy;
  }) {
    this.metrics = options?.metrics ?? new MetricsRegistry();
    this.policy = options?.policy ?? DEFAULT_FRESHNESS_POLICY;
    this.staticStore = new StaticDatasetStore();
    this.realtimeStore = new RealtimeSnapshotStore();
    this.staticImporter = new StaticImporter(this.staticStore, this.metrics);
    this.realtimeIngestor = new RealtimeIngestor(
      this.realtimeStore,
      this.metrics,
    );
  }

  importStatic(dir: string, options?: ImportOptions) {
    return this.staticImporter.importFromDirectory(dir, options);
  }

  ingestRealtime(feeds: FeedInput[], options: IngestOptions) {
    const active = this.staticStore.getActive();
    return this.realtimeIngestor.ingest(feeds, {
      ...options,
      staticDatasetVersion:
        options.staticDatasetVersion ??
        active?.staticDatasetVersion ??
        null,
      lineMapping: options.lineMapping ?? active?.lineMapping,
      knownTripIds:
        options.knownTripIds ??
        (active
          ? new Set(active.trips.map((t) => t.tripId))
          : undefined),
      policy: options.policy ?? this.policy,
    });
  }

  /** Snapshot handle for a search at `nowMs`. */
  getRoutingHandle(nowMs: number) {
    const staticDataset = this.staticStore.getActive();
    const latest = this.realtimeStore.getLatest();
    const realtime = this.realtimeIngestor.resolveForRouting(latest, {
      nowMs,
      staticDatasetVersion: staticDataset?.staticDatasetVersion ?? "none",
      policy: this.policy,
    });
    return buildRoutingSnapshotHandle({
      staticDataset,
      realtime,
      nowMs,
      policy: this.policy,
    });
  }
}
