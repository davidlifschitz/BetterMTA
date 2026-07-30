/**
 * Live realtime gateway configuration from environment.
 */

import { REALTIME_FEEDS } from "./feeds.js";

export interface RealtimeLiveConfig {
  pollIntervalMs: number;
  /** Optional per-feed poll interval overrides */
  pollIntervalByFeed: Record<string, number>;
  timeoutMs: number;
  maxBytes: number;
  maxRetries: number;
  dataDir: string;
  mirrorRawToDisk: boolean;
  internalPort: number;
  internalToken: string | null;
  allowAnonInternal: boolean;
  nodeEnv: string;
  staticRefreshOnBoot: boolean;
  baseUrl: string;
  /** Snapshot manifest retention */
  manifestRetain: number;
  manifestExpiryMs: number;
}

function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(
      `Invalid ${name}: expected non-negative integer, got ${raw}`,
    );
  }
  return n;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid ${name}: expected positive integer, got ${raw}`);
  }
  return n;
}

function resolveDataDir(raw: string | undefined, serviceRoot: string): string {
  const value = raw && raw.trim().length > 0 ? raw.trim() : "var/data";
  if (value.startsWith("/")) return value;
  return `${serviceRoot.replace(/\/$/, "")}/${value}`;
}

function parseOverrideMap(raw: string | undefined): Record<string, number> {
  if (!raw || !raw.trim()) return {};
  // Format: feedId=ms,feedId=ms
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [id, msRaw] = part.split("=").map((s) => s.trim());
    if (!id || !msRaw) continue;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    out[id] = Math.floor(ms);
  }
  return out;
}

export function loadRealtimeLiveConfig(options?: {
  env?: NodeJS.ProcessEnv;
  serviceRoot?: string;
}): RealtimeLiveConfig {
  const env = options?.env ?? process.env;
  const serviceRoot = options?.serviceRoot ?? process.cwd();
  const nodeEnv = env.NODE_ENV ?? "development";

  return {
    pollIntervalMs: parsePositiveInt(
      env.BETTERMTA_RT_POLL_MS,
      30_000,
      "BETTERMTA_RT_POLL_MS",
    ),
    pollIntervalByFeed: parseOverrideMap(env.BETTERMTA_RT_POLL_MS_BY_FEED),
    timeoutMs: parsePositiveInt(
      env.BETTERMTA_RT_TIMEOUT_MS,
      10_000,
      "BETTERMTA_RT_TIMEOUT_MS",
    ),
    maxBytes: parsePositiveInt(
      env.BETTERMTA_RT_MAX_BYTES,
      5 * 1024 * 1024,
      "BETTERMTA_RT_MAX_BYTES",
    ),
    maxRetries: parseNonNegativeInt(
      env.BETTERMTA_RT_MAX_RETRIES,
      2,
      "BETTERMTA_RT_MAX_RETRIES",
    ),
    dataDir: resolveDataDir(env.BETTERMTA_DATA_DIR, serviceRoot),
    mirrorRawToDisk: env.BETTERMTA_RT_MIRROR_DISK !== "false",
    internalPort: parsePositiveInt(
      env.BETTERMTA_INTERNAL_PORT,
      8081,
      "BETTERMTA_INTERNAL_PORT",
    ),
    internalToken: env.BETTERMTA_INTERNAL_TOKEN?.trim() || null,
    allowAnonInternal: env.BETTERMTA_INTERNAL_ALLOW_ANON === "true",
    nodeEnv,
    staticRefreshOnBoot: env.BETTERMTA_STATIC_REFRESH_ON_BOOT === "true",
    baseUrl:
      env.BETTERMTA_RT_BASE_URL?.trim() ||
      "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds",
    manifestRetain: 20,
    manifestExpiryMs: 30 * 60 * 1000,
  };
}

export function pollIntervalForFeed(
  config: RealtimeLiveConfig,
  feedId: string,
): number {
  return config.pollIntervalByFeed[feedId] ?? config.pollIntervalMs;
}

export function assertInternalAuthConfig(config: RealtimeLiveConfig): void {
  const isProd = config.nodeEnv === "production";
  if (isProd && !config.internalToken) {
    throw new Error(
      "BETTERMTA_INTERNAL_TOKEN is required in production for /internal/* routes",
    );
  }
  if (!isProd && !config.internalToken && !config.allowAnonInternal) {
    throw new Error(
      "Set BETTERMTA_INTERNAL_TOKEN or BETTERMTA_INTERNAL_ALLOW_ANON=true for non-production",
    );
  }
}

export function knownFeedIds(): string[] {
  return REALTIME_FEEDS.map((f) => f.feedId);
}
