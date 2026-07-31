import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { MetricsRegistry } from "../metrics.js";
import type { StaticDatasetStore } from "../static/store.js";
import { StaticImporter } from "../static/importer.js";
import {
  loadStaticPipelineConfig,
  STATIC_ATTRIBUTION,
  STATIC_LICENSE_NOTE,
  type StaticPipelineConfig,
} from "./config.js";
import {
  formatChecksum,
  normalizeSha256,
  sha256Buffer,
  versionIdFromSha256,
} from "./checksum.js";
import {
  downloadStaticGtfsZip,
  removeTempFile,
  DownloadError,
  type DownloadOptions,
} from "./download.js";
import { extractGtfsZip, ZipIntegrityError } from "./zip.js";
import { validateExtractedGtfs } from "./validate.js";
import {
  activateVersion,
  pruneVersions,
  readActivePointer,
  readVersionMetadata,
  staticStorePaths,
  storeVersionDataset,
  versionDir,
  type ActivePointer,
  type AtomicWriteFn,
  defaultAtomicWrite,
} from "./version-store.js";
import {
  DefaultGraphBuildTrigger,
  type GraphBuildTrigger,
} from "./trigger.js";
import { defaultLogger, sanitizeUrl, type Logger } from "./log.js";

export type Clock = () => Date;

export interface RefreshDeps {
  config: StaticPipelineConfig;
  metrics: MetricsRegistry;
  staticStore: StaticDatasetStore;
  staticImporter: StaticImporter;
  trigger?: GraphBuildTrigger;
  logger?: Logger;
  clock?: Clock;
  fetchFn?: typeof fetch;
  atomicWrite?: AtomicWriteFn;
  /** Override download (tests). */
  downloadFn?: (opts: DownloadOptions) => ReturnType<typeof downloadStaticGtfsZip>;
}

export type RefreshOutcome =
  | { status: "activated"; versionId: string; sha256: string }
  | { status: "unchanged"; versionId: string; sha256: string }
  | { status: "failed"; error: string; code: string };

/**
 * One refresh tick: download → checksum → short-circuit if unchanged →
 * validate → store → activate → graph-build trigger.
 * Failures leave the active version untouched.
 */
export async function runStaticRefresh(
  deps: RefreshDeps,
): Promise<RefreshOutcome> {
  const logger = deps.logger ?? defaultLogger;
  const clock = deps.clock ?? (() => new Date());
  const atomicWrite = deps.atomicWrite ?? defaultAtomicWrite;
  const paths = staticStorePaths(deps.config.dataDir);
  await mkdir(paths.tempDir, { recursive: true });

  const started = Date.now();
  let tempZip: string | null = null;
  let extractDir: string | null = null;

  try {
    const downloadFn = deps.downloadFn ?? downloadStaticGtfsZip;
    const downloaded = await downloadFn({
      url: deps.config.staticGtfsUrl,
      tempDir: paths.tempDir,
      maxBytes: deps.config.maxBytes,
      timeoutMs: deps.config.timeoutMs,
      fetchFn: deps.fetchFn,
      logger,
    });
    tempZip = downloaded.tempFilePath;
    deps.metrics.incr("bettermta_static_download_success_total");
    deps.metrics.setGauge(
      "bettermta_static_download_bytes",
      downloaded.byteSize,
    );

    const zipBytes = readFileSync(downloaded.tempFilePath);
    const sha256 = sha256Buffer(zipBytes);
    const versionId = versionIdFromSha256(sha256);
    const checksum = formatChecksum(sha256);

    logger("info", "Checksum computed", {
      stage: "checksum",
      versionId,
      sha256,
      bytes: downloaded.byteSize,
    });

    const active = readActivePointer(deps.config.dataDir);
    if (active && normalizeSha256(active.sha256) === sha256) {
      deps.metrics.incr("bettermta_static_refresh_unchanged_total");
      logger("info", "Static GTFS unchanged; skipping activation", {
        stage: "checksum",
        versionId: active.versionId,
        sha256,
      });
      return { status: "unchanged", versionId: active.versionId, sha256 };
    }

    extractDir = join(paths.tempDir, `extract-${versionId}-${Date.now()}`);
    await extractGtfsZip(downloaded.tempFilePath, extractDir);
    logger("info", "ZIP extracted", { stage: "extract", versionId });

    const validation = validateExtractedGtfs(extractDir, {
      now: clock(),
      serviceCoverageDays: deps.config.serviceCoverageDays,
      minStops: deps.config.minStops,
      minRoutes: deps.config.minRoutes,
    });

    if (!validation.ok) {
      deps.metrics.incr("bettermta_static_validation_failures_total");
      deps.metrics.incr("bettermta_static_refresh_failure_total");
      const first = validation.issues.find((i) => i.severity === "error");
      logger("error", "Static GTFS validation failed", {
        stage: "validate",
        versionId,
        errorCode: first?.code ?? "validation_failed",
        issueCount: validation.issues.length,
      });
      return {
        status: "failed",
        error: first?.message ?? "validation failed",
        code: first?.code ?? "validation_failed",
      };
    }

    logger("info", "Validation passed", {
      stage: "validate",
      versionId,
      stops: validation.tableCounts.stops,
      routes: validation.tableCounts.routes,
    });

    const fetchedAt = clock().toISOString();
    storeVersionDataset({
      dataDir: deps.config.dataDir,
      extractDir,
      metadata: {
        versionId,
        sha256,
        sourceUrl: sanitizeUrl(deps.config.staticGtfsUrl),
        fetchedAt,
        byteSize: downloaded.byteSize,
        serviceDateRange: validation.serviceDateRange,
        tableCounts: validation.tableCounts,
        attribution: STATIC_ATTRIBUTION,
        licenseNote: STATIC_LICENSE_NOTE,
      },
    });

    const pointer: ActivePointer = {
      versionId,
      sha256,
      activatedAt: fetchedAt,
    };

    try {
      activateVersion(deps.config.dataDir, pointer, atomicWrite);
    } catch (err) {
      deps.metrics.incr("bettermta_static_activation_failures_total");
      deps.metrics.incr("bettermta_static_refresh_failure_total");
      logger("error", "Activation failed; active version untouched", {
        stage: "activate",
        versionId,
        errorCode: "activation_failed",
      });
      return {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        code: "activation_failed",
      };
    }

    // Load into in-memory store via existing importer
    const importResult = deps.staticImporter.importFromDirectory(
      versionDir(deps.config.dataDir, versionId),
      {
        source: "mta-subway-gtfs",
        importedAt: fetchedAt,
        activate: true,
        version: versionId,
        checksum,
      },
    );

    if (!importResult.validationOk || !importResult.activated) {
      // Disk active.json already written — try to restore previous pointer if any
      deps.metrics.incr("bettermta_static_activation_failures_total");
      deps.metrics.incr("bettermta_static_refresh_failure_total");
      if (active) {
        try {
          activateVersion(deps.config.dataDir, active, atomicWrite);
        } catch {
          /* best effort */
        }
      }
      return {
        status: "failed",
        error: "Importer refused activation after disk write",
        code: "import_activation_failed",
      };
    }

    pruneVersions(
      deps.config.dataDir,
      deps.config.retainVersions,
      versionId,
    );

    const trigger =
      deps.trigger ??
      new DefaultGraphBuildTrigger({
        dataDir: deps.config.dataDir,
        webhookUrl: deps.config.graphBuildWebhook,
        atomicWrite,
        fetchFn: deps.fetchFn,
        logger,
      });

    await trigger.onNewVersionActivated({
      versionId,
      sha256,
      requestedAt: fetchedAt,
    });
    deps.metrics.incr("bettermta_graph_build_triggers_total");

    deps.metrics.incr("bettermta_static_refresh_success_total");
    deps.metrics.setGauge("bettermta_static_ready", 1);
    deps.metrics.setStaticStatus("active", versionId);
    deps.metrics.markLastSuccessfulUpdate(fetchedAt);
    deps.metrics.setGauge(
      "bettermta_static_refresh_duration_ms",
      Date.now() - started,
    );

    logger("info", "Static GTFS activated", {
      stage: "activate",
      versionId,
      sha256,
      durationMs: Date.now() - started,
    });

    return { status: "activated", versionId, sha256 };
  } catch (err) {
    deps.metrics.incr("bettermta_static_refresh_failure_total");
    let code = "refresh_error";
    if (err instanceof DownloadError) {
      code = err.code;
      deps.metrics.incr("bettermta_static_download_failures_total", 1, {
        code: err.code,
      });
    } else if (err instanceof ZipIntegrityError) {
      code = err.code;
      deps.metrics.incr("bettermta_static_validation_failures_total");
    }
    logger("error", "Static refresh failed", {
      stage: "refresh",
      errorCode: code,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      code,
    };
  } finally {
    if (tempZip) await removeTempFile(tempZip);
    if (extractDir) {
      try {
        const { rm } = await import("node:fs/promises");
        await rm(extractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export interface SchedulerHandle {
  stop: () => void;
  /** Fire one tick immediately (optional). */
  runNow: () => Promise<RefreshOutcome>;
}

/**
 * Start/stop-able refresh scheduler.
 */
export function startStaticRefreshScheduler(
  deps: RefreshDeps,
  options?: { runImmediately?: boolean },
): SchedulerHandle {
  const logger = deps.logger ?? defaultLogger;
  let stopped = false;
  let running: Promise<RefreshOutcome> | null = null;

  const runNow = async () => {
    if (running) return running;
    running = runStaticRefresh(deps).finally(() => {
      running = null;
    });
    return running;
  };

  if (options?.runImmediately) {
    void runNow();
  }

  const timer = setInterval(() => {
    if (stopped) return;
    void runNow();
  }, deps.config.refreshIntervalMs);
  // Don't keep process alive solely for the timer in tests
  if (typeof timer.unref === "function") timer.unref();

  logger("info", "Static refresh scheduler started", {
    stage: "scheduler",
    intervalMs: deps.config.refreshIntervalMs,
  });

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      logger("info", "Static refresh scheduler stopped", { stage: "scheduler" });
    },
    runNow,
  };
}

/**
 * Roll back active.json (+ in-memory store) to a prior retained version.
 */
export function rollbackStaticVersion(
  deps: {
    config: StaticPipelineConfig;
    metrics: MetricsRegistry;
    staticStore: StaticDatasetStore;
    staticImporter: StaticImporter;
    atomicWrite?: AtomicWriteFn;
    clock?: Clock;
    logger?: Logger;
  },
  targetVersionId: string,
): ActivePointer {
  const logger = deps.logger ?? defaultLogger;
  const clock = deps.clock ?? (() => new Date());
  const atomicWrite = deps.atomicWrite ?? defaultAtomicWrite;
  const meta = readVersionMetadata(deps.config.dataDir, targetVersionId);
  if (!meta) {
    throw new Error(`Unknown version for rollback: ${targetVersionId}`);
  }
  const activatedAt = clock().toISOString();
  const pointer: ActivePointer = {
    versionId: targetVersionId,
    sha256: meta.sha256,
    activatedAt,
  };
  activateVersion(deps.config.dataDir, pointer, atomicWrite);

  const result = deps.staticImporter.importFromDirectory(
    versionDir(deps.config.dataDir, targetVersionId),
    {
      source: "mta-subway-gtfs",
      importedAt: activatedAt,
      activate: true,
      version: targetVersionId,
      checksum: formatChecksum(meta.sha256),
    },
  );
  if (!result.activated) {
    throw new Error(`Rollback import failed for ${targetVersionId}`);
  }

  deps.metrics.incr("bettermta_static_rollback_total");
  deps.metrics.setStaticStatus("active", targetVersionId);
  deps.metrics.setGauge("bettermta_static_ready", 1);
  logger("info", "Rolled back static version", {
    stage: "rollback",
    versionId: targetVersionId,
  });
  return pointer;
}

export function createRefreshDepsFromEnv(options: {
  metrics: MetricsRegistry;
  staticStore: StaticDatasetStore;
  staticImporter: StaticImporter;
  serviceRoot?: string;
  env?: NodeJS.ProcessEnv;
  trigger?: GraphBuildTrigger;
}): RefreshDeps {
  const config = loadStaticPipelineConfig({
    env: options.env,
    serviceRoot: options.serviceRoot,
  });
  return {
    config,
    metrics: options.metrics,
    staticStore: options.staticStore,
    staticImporter: options.staticImporter,
    trigger: options.trigger,
  };
}
