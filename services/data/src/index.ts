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

export * from "./static-pipeline/index.js";

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
import {
  loadStaticPipelineConfig,
  type StaticPipelineConfig,
} from "./static-pipeline/config.js";
import {
  assertFixtureStaticAllowed,
  isStaticReady,
  loadActiveStaticFromDisk,
  type StartupLoadResult,
} from "./static-pipeline/readiness.js";
import {
  rollbackStaticVersion,
  runStaticRefresh,
  startStaticRefreshScheduler,
  type RefreshDeps,
  type RefreshOutcome,
  type SchedulerHandle,
} from "./static-pipeline/refresh.js";
import {
  RecordingGraphBuildTrigger,
  type GraphBuildTrigger,
} from "./static-pipeline/trigger.js";
import { listRetainedVersions } from "./static-pipeline/version-store.js";

export type { FeedInput, IngestOptions, ImportOptions };

export interface DataPlatformOptions {
  metrics?: MetricsRegistry;
  policy?: FreshnessPolicy;
  /** Pipeline config; when omitted, loaded lazily from env on first use. */
  pipelineConfig?: StaticPipelineConfig;
  serviceRoot?: string;
  env?: NodeJS.ProcessEnv;
  graphBuildTrigger?: GraphBuildTrigger;
}

/** Convenience façade composing static + realtime stores. */
export class DataPlatform {
  readonly metrics: MetricsRegistry;
  readonly staticStore: StaticDatasetStore;
  readonly realtimeStore: RealtimeSnapshotStore;
  readonly staticImporter: StaticImporter;
  readonly realtimeIngestor: RealtimeIngestor;
  readonly policy: FreshnessPolicy;
  private readonly env: NodeJS.ProcessEnv;
  private readonly serviceRoot: string;
  private _pipelineConfig: StaticPipelineConfig | null;
  private scheduler: SchedulerHandle | null = null;
  private graphBuildTrigger: GraphBuildTrigger | undefined;

  constructor(options?: DataPlatformOptions) {
    this.metrics = options?.metrics ?? new MetricsRegistry();
    this.policy = options?.policy ?? DEFAULT_FRESHNESS_POLICY;
    this.staticStore = new StaticDatasetStore();
    this.realtimeStore = new RealtimeSnapshotStore();
    this.staticImporter = new StaticImporter(this.staticStore, this.metrics);
    this.realtimeIngestor = new RealtimeIngestor(
      this.realtimeStore,
      this.metrics,
    );
    this.env = options?.env ?? process.env;
    this.serviceRoot = options?.serviceRoot ?? process.cwd();
    this._pipelineConfig = options?.pipelineConfig ?? null;
    this.graphBuildTrigger = options?.graphBuildTrigger;
  }

  get pipelineConfig(): StaticPipelineConfig {
    if (!this._pipelineConfig) {
      this._pipelineConfig = loadStaticPipelineConfig({
        env: this.env,
        serviceRoot: this.serviceRoot,
      });
    }
    return this._pipelineConfig;
  }

  /**
   * Fixture / pre-extracted directory import.
   * Refused in production; requires BETTERMTA_ALLOW_FIXTURE_STATIC=true otherwise.
   */
  importStatic(dir: string, options?: ImportOptions) {
    assertFixtureStaticAllowed({
      nodeEnv: this.pipelineConfig.nodeEnv,
      allowFixtureStatic: this.pipelineConfig.allowFixtureStatic,
    });
    return this.staticImporter.importFromDirectory(dir, {
      ...options,
      synthetic: options?.synthetic ?? true,
    });
  }

  /** True when an active static dataset is loaded in memory. */
  isReady(): boolean {
    return isStaticReady(this.staticStore);
  }

  /**
   * Startup: load active.json from disk with zero network calls.
   * Returns not-ready when no active version exists yet.
   */
  loadActiveFromDisk(): StartupLoadResult {
    return loadActiveStaticFromDisk({
      config: this.pipelineConfig,
      metrics: this.metrics,
      staticStore: this.staticStore,
      staticImporter: this.staticImporter,
    });
  }

  /** Run one production refresh cycle. */
  refreshStatic(): Promise<RefreshOutcome> {
    return runStaticRefresh(this.refreshDeps());
  }

  startRefreshScheduler(options?: {
    runImmediately?: boolean;
  }): SchedulerHandle {
    this.scheduler?.stop();
    this.scheduler = startStaticRefreshScheduler(
      this.refreshDeps(),
      options,
    );
    return this.scheduler;
  }

  stopRefreshScheduler(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }

  rollbackStatic(versionId: string) {
    return rollbackStaticVersion(
      {
        config: this.pipelineConfig,
        metrics: this.metrics,
        staticStore: this.staticStore,
        staticImporter: this.staticImporter,
      },
      versionId,
    );
  }

  listStaticVersions(): string[] {
    return listRetainedVersions(this.pipelineConfig.dataDir);
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

  private refreshDeps(): RefreshDeps {
    return {
      config: this.pipelineConfig,
      metrics: this.metrics,
      staticStore: this.staticStore,
      staticImporter: this.staticImporter,
      trigger: this.graphBuildTrigger,
    };
  }
}

export { RecordingGraphBuildTrigger };
