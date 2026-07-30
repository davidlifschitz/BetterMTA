/**
 * BetterMTA data platform process entrypoint.
 * Startup: load active static → start pollers → start internal server.
 * Graceful shutdown on SIGTERM / SIGINT.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInternalAuthConfig,
  loadRealtimeLiveConfig,
} from "./realtime-live/config.js";
import { REALTIME_FEEDS } from "./realtime-live/feeds.js";
import { RawFeedStore } from "./realtime-live/raw-store.js";
import { SnapshotManifestStore } from "./realtime-live/snapshot-assembly.js";
import { RealtimePoller } from "./realtime-live/poller.js";
import {
  closeInternalServer,
  createInternalServer,
  listenInternalServer,
} from "./internal-server.js";
import { safeLog } from "./realtime-live/log.js";
import { DataPlatform } from "./platform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = join(__dirname, "..");

export interface GatewayHandle {
  platform: DataPlatform;
  poller: RealtimePoller;
  stop: () => Promise<void>;
}

export async function startGateway(options?: {
  env?: NodeJS.ProcessEnv;
  serviceRoot?: string;
}): Promise<GatewayHandle> {
  const env = options?.env ?? process.env;
  const serviceRoot = options?.serviceRoot ?? SERVICE_ROOT;
  const rtConfig = loadRealtimeLiveConfig({ env, serviceRoot });
  assertInternalAuthConfig(rtConfig);

  const platform = new DataPlatform({ env, serviceRoot });
  const startup = platform.loadActiveFromDisk();
  safeLog("info", "static_startup", {
    ready: startup.ready,
    versionId: startup.versionId,
    loadedFromDisk: startup.loadedFromDisk,
  });

  if (!startup.ready && rtConfig.staticRefreshOnBoot) {
    safeLog("info", "static_refresh_on_boot", {});
    try {
      const outcome = await platform.refreshStatic();
      safeLog("info", "static_refresh_result", {
        status: outcome.status,
        versionId: "versionId" in outcome ? outcome.versionId : null,
      });
    } catch (err) {
      safeLog("error", "static_refresh_on_boot_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const rawStore = new RawFeedStore({
    dataDir: rtConfig.dataDir,
    mirrorToDisk: rtConfig.mirrorRawToDisk,
  });
  rawStore.loadFromDisk(REALTIME_FEEDS.map((f) => f.feedId));

  const manifestStore = new SnapshotManifestStore(
    rtConfig.manifestRetain,
    rtConfig.manifestExpiryMs,
  );

  const poller = new RealtimePoller({
    config: rtConfig,
    rawStore,
    ingestor: platform.realtimeIngestor,
    manifestStore,
    getStaticDataset: () => platform.staticStore.getActive(),
  });

  const server = createInternalServer({
    platform,
    poller,
    config: rtConfig,
    manifestStore,
  });

  await listenInternalServer(server, rtConfig.internalPort);
  poller.start();

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    safeLog("info", "gateway_shutdown_begin", {});
    platform.stopRefreshScheduler();
    await poller.stop();
    await closeInternalServer(server);
    safeLog("info", "gateway_shutdown_complete", {});
  };

  return { platform, poller, stop };
}

async function main(): Promise<void> {
  const handle = await startGateway();

  const onSignal = (sig: string) => {
    safeLog("info", "signal_received", { signal: sig });
    void handle.stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
}

const isDirect =
  process.argv[1] &&
  import.meta.url ===
    (await import("node:url")).pathToFileURL(process.argv[1]!).href;

if (isDirect) {
  main().catch((err) => {
    safeLog("error", "gateway_fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
