import { existsSync } from "node:fs";
import type { MetricsRegistry } from "../metrics.js";
import type { StaticDatasetStore } from "../static/store.js";
import { StaticImporter } from "../static/importer.js";
import type { StaticPipelineConfig } from "./config.js";
import { formatChecksum } from "./checksum.js";
import {
  readActivePointer,
  versionDir,
} from "./version-store.js";
import { defaultLogger, type Logger } from "./log.js";

/**
 * Ready only when a valid active static dataset is loaded in-memory.
 */
export function isStaticReady(staticStore: StaticDatasetStore): boolean {
  return staticStore.getActive() !== null;
}

export interface StartupLoadResult {
  ready: boolean;
  versionId: string | null;
  loadedFromDisk: boolean;
  networkCalls: number;
}

/**
 * On process start: if active.json exists, load that version from disk
 * WITHOUT network. If none exists => not ready.
 */
export function loadActiveStaticFromDisk(options: {
  config: StaticPipelineConfig;
  metrics: MetricsRegistry;
  staticStore: StaticDatasetStore;
  staticImporter: StaticImporter;
  logger?: Logger;
}): StartupLoadResult {
  const logger = options.logger ?? defaultLogger;
  const active = readActivePointer(options.config.dataDir);
  if (!active) {
    options.metrics.setGauge("bettermta_static_ready", 0);
    logger("info", "No active static dataset on disk", { stage: "startup" });
    return {
      ready: false,
      versionId: null,
      loadedFromDisk: false,
      networkCalls: 0,
    };
  }

  const dir = versionDir(options.config.dataDir, active.versionId);
  if (!existsSync(dir)) {
    options.metrics.setGauge("bettermta_static_ready", 0);
    logger("error", "active.json points at missing version dir", {
      stage: "startup",
      versionId: active.versionId,
    });
    return {
      ready: false,
      versionId: active.versionId,
      loadedFromDisk: false,
      networkCalls: 0,
    };
  }

  const result = options.staticImporter.importFromDirectory(dir, {
    source: "mta-subway-gtfs",
    importedAt: active.activatedAt,
    activate: true,
    version: active.versionId,
    checksum: formatChecksum(active.sha256),
  });

  if (!result.activated) {
    options.metrics.setGauge("bettermta_static_ready", 0);
    logger("error", "Failed to load active static version from disk", {
      stage: "startup",
      versionId: active.versionId,
    });
    return {
      ready: false,
      versionId: active.versionId,
      loadedFromDisk: false,
      networkCalls: 0,
    };
  }

  options.metrics.setGauge("bettermta_static_ready", 1);
  options.metrics.setStaticStatus("active", active.versionId);
  logger("info", "Loaded active static dataset from disk", {
    stage: "startup",
    versionId: active.versionId,
  });

  return {
    ready: true,
    versionId: active.versionId,
    loadedFromDisk: true,
    networkCalls: 0,
  };
}

/**
 * Fixture / directory import gate.
 * Production never loads fixtures. Non-production requires explicit flag.
 */
export function assertFixtureStaticAllowed(options: {
  nodeEnv: string;
  allowFixtureStatic: boolean;
}): void {
  if (options.nodeEnv === "production") {
    throw new Error(
      "Fixture static loading is refused when NODE_ENV=production",
    );
  }
  if (!options.allowFixtureStatic) {
    throw new Error(
      "Fixture static loading requires BETTERMTA_ALLOW_FIXTURE_STATIC=true",
    );
  }
}
