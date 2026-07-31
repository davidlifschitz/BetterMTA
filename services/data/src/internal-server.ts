/**
 * Internal (non-public) HTTP surface for OTP updaters and ops.
 * Auth: Authorization: Bearer ${BETTERMTA_INTERNAL_TOKEN} on all /internal/*.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { RealtimePoller } from "./realtime-live/poller.js";
import type { SnapshotManifestStore } from "./realtime-live/snapshot-assembly.js";
import type { RealtimeLiveConfig } from "./realtime-live/config.js";
import { getFeedDef, REALTIME_FEEDS } from "./realtime-live/feeds.js";
import {
  buildLineCatalog,
  buildStationCatalog,
} from "./realtime-live/catalog.js";
import { safeLog } from "./realtime-live/log.js";
import type { StaticDataset } from "./types.js";

export interface InternalServerPlatform {
  isReady(): boolean;
  staticStore: {
    getActive(): StaticDataset | null;
  };
  realtimeStore: {
    getLatest(): {
      snapshotId: string;
      dataMode: string;
      ageSeconds: number;
      perFeed?: Record<string, unknown>;
    } | null;
  };
}

export interface InternalServerOptions {
  platform: InternalServerPlatform;
  poller: RealtimePoller;
  config: RealtimeLiveConfig;
  manifestStore: SnapshotManifestStore;
  activeSince?: () => string | null;
}

function readBearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? null;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { error: "unauthorized" });
}

export function createInternalServer(options: InternalServerOptions): Server {
  const { platform, poller, config, manifestStore } = options;

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      const path = url.pathname;

      if (!path.startsWith("/internal")) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }

      const tokenOk =
        config.internalToken != null &&
        readBearer(req) === config.internalToken;
      const anonOk =
        !config.internalToken &&
        config.allowAnonInternal &&
        config.nodeEnv !== "production";
      if (!tokenOk && !anonOk) {
        unauthorized(res);
        return;
      }

      if (req.method === "GET" && path === "/internal/health") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "GET" && path === "/internal/ready") {
        if (platform.isReady()) {
          sendJson(res, 200, { ready: true });
        } else {
          sendJson(res, 503, { ready: false, reason: "static_not_active" });
        }
        return;
      }

      if (req.method === "GET" && path === "/internal/status") {
        const active = platform.staticStore.getActive();
        const snap =
          poller.getLatestSnapshot() ?? platform.realtimeStore.getLatest();
        const manifest = poller.getLatestManifest() ?? manifestStore.latest();
        sendJson(res, 200, {
          staticVersionId: active?.staticDatasetVersion ?? null,
          activeSince:
            options.activeSince?.() ?? active?.activatedAt ?? null,
          realtime: snap
            ? {
                snapshotId: snap.snapshotId,
                dataMode: snap.dataMode,
                ageSeconds: "ageSeconds" in snap ? snap.ageSeconds : null,
                perFeed: snap.perFeed ?? manifest?.perFeed ?? {},
              }
            : null,
          ready: platform.isReady(),
        });
        return;
      }

      if (req.method === "GET" && path === "/internal/feeds") {
        const raws = poller.getRawStore().list();
        sendJson(res, 200, {
          feeds: REALTIME_FEEDS.map((f) => {
            const r = raws.find((x) => x.feedId === f.feedId);
            return {
              feedId: f.feedId,
              trunk: f.trunk,
              requiredForMode: f.requiredForMode,
              present: Boolean(r),
              fetchedAt: r?.fetchedAt ?? null,
              headerTimestamp: r
                ? new Date(r.headerTimestamp * 1000).toISOString()
                : null,
              byteSize: r?.byteSize ?? null,
            };
          }),
        });
        return;
      }

      const feedMatch = /^\/internal\/feeds\/([^/]+)$/.exec(path);
      if (req.method === "GET" && feedMatch) {
        const feedId = decodeURIComponent(feedMatch[1]!);
        if (!getFeedDef(feedId)) {
          sendJson(res, 404, { error: "unknown_feed", feedId });
          return;
        }
        const raw = poller.getRawStore().get(feedId);
        if (!raw) {
          sendJson(res, 404, { error: "feed_not_fetched", feedId });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/x-protobuf",
          "Cache-Control": "no-store",
          "X-Feed-Header-Timestamp": String(raw.headerTimestamp),
          "X-Fetched-At": raw.fetchedAt,
          "Content-Length": raw.bytes.length,
        });
        res.end(raw.bytes);
        return;
      }

      if (req.method === "GET" && path === "/internal/catalog/lines") {
        const active = platform.staticStore.getActive();
        if (!active) {
          sendJson(res, 503, { error: "static_not_active" });
          return;
        }
        sendJson(res, 200, {
          staticVersionId: active.staticDatasetVersion,
          lines: buildLineCatalog(active),
        });
        return;
      }

      if (req.method === "GET" && path === "/internal/catalog/stations") {
        const active = platform.staticStore.getActive();
        if (!active) {
          sendJson(res, 503, { error: "static_not_active" });
          return;
        }
        sendJson(res, 200, {
          staticVersionId: active.staticDatasetVersion,
          stations: buildStationCatalog(active),
        });
        return;
      }

      if (req.method === "GET" && path === "/internal/manifests") {
        sendJson(res, 200, { manifests: manifestStore.list() });
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (err) {
      safeLog("error", "internal_server_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      sendJson(res, 500, { error: "internal_error" });
    }
  });

  return server;
}

export async function listenInternalServer(
  server: Server,
  port: number,
  /**
   * Bind host. Defaults to loopback for compose (socat bridges the Docker net).
   * On Fly activate set BETTERMTA_DATA_BIND_HOST=0.0.0.0 for private networking.
   */
  host: string = process.env.BETTERMTA_DATA_BIND_HOST ?? "127.0.0.1",
): Promise<Server> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  safeLog("info", "internal_server_listening", { port, host });
  return server;
}

export async function closeInternalServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
