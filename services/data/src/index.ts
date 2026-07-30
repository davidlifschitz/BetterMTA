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
  FeedFreshnessStatus,
  PerFeedStatus,
  SnapshotManifest,
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

export * from "./static-pipeline/index.js";
export * from "./realtime-live/index.js";
export {
  createInternalServer,
  listenInternalServer,
  closeInternalServer,
} from "./internal-server.js";
export { startGateway } from "./main.js";
export {
  DataPlatform,
  RecordingGraphBuildTrigger,
  type DataPlatformOptions,
} from "./platform.js";
export type { FeedInput, IngestOptions } from "./realtime/ingest.js";
export type { ImportOptions } from "./static/importer.js";
