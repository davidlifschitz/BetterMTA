/**
 * Typed configuration for the production static GTFS pipeline.
 */

export interface StaticPipelineConfig {
  /** HTTPS (or test HTTP / file) URL for the subway GTFS zip. */
  staticGtfsUrl: string;
  /** Absolute data directory root. */
  dataDir: string;
  /** Max download size in bytes. */
  maxBytes: number;
  /** Download / fetch timeout in ms. */
  timeoutMs: number;
  /** Refresh scheduler interval in ms. */
  refreshIntervalMs: number;
  /** Number of version directories to retain (including active). */
  retainVersions: number;
  /** Minimum stop row count for production feed sanity. */
  minStops: number;
  /** Minimum route row count for production feed sanity. */
  minRoutes: number;
  /** Inclusive days of service coverage required from "today" (today..today+N). */
  serviceCoverageDays: number;
  /** Optional webhook for graph-build trigger. */
  graphBuildWebhook: string | null;
  /** Allow fixture/static directory import (test/dev only). */
  allowFixtureStatic: boolean;
  /** NODE_ENV value. */
  nodeEnv: string;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  /** Service package root — used to resolve default relative data dir. */
  serviceRoot?: string;
}

const DEFAULT_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_REFRESH_MS = 86_400_000;
const DEFAULT_RETAIN = 3;
const DEFAULT_MIN_STOPS = 400;
const DEFAULT_MIN_ROUTES = 20;
const DEFAULT_COVERAGE_DAYS = 7;

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

function resolveDataDir(
  raw: string | undefined,
  serviceRoot: string,
): string {
  const value = raw && raw.trim().length > 0 ? raw.trim() : "var/data";
  if (value.startsWith("/")) return value;
  return `${serviceRoot.replace(/\/$/, "")}/${value}`;
}

/**
 * Load and validate static pipeline config from environment.
 */
export function loadStaticPipelineConfig(
  options: LoadConfigOptions = {},
): StaticPipelineConfig {
  const env = options.env ?? process.env;
  const serviceRoot = options.serviceRoot ?? process.cwd();

  const staticGtfsUrl =
    env.BETTERMTA_STATIC_GTFS_URL?.trim() || DEFAULT_URL;
  if (!/^https?:\/\//i.test(staticGtfsUrl) && !staticGtfsUrl.startsWith("file:")) {
    // Allow absolute/relative local paths for gated integration tests.
    if (!staticGtfsUrl.startsWith("/") && !/^[.]{1,2}\//.test(staticGtfsUrl)) {
      throw new Error(
        `Invalid BETTERMTA_STATIC_GTFS_URL: must be http(s), file://, or a filesystem path`,
      );
    }
  }

  const maxBytes = parsePositiveInt(
    env.BETTERMTA_STATIC_MAX_BYTES,
    DEFAULT_MAX_BYTES,
    "BETTERMTA_STATIC_MAX_BYTES",
  );
  const timeoutMs = parsePositiveInt(
    env.BETTERMTA_STATIC_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "BETTERMTA_STATIC_TIMEOUT_MS",
  );
  const refreshIntervalMs = parsePositiveInt(
    env.BETTERMTA_REFRESH_INTERVAL_MS,
    DEFAULT_REFRESH_MS,
    "BETTERMTA_REFRESH_INTERVAL_MS",
  );
  const retainVersions = parsePositiveInt(
    env.BETTERMTA_STATIC_RETAIN_VERSIONS,
    DEFAULT_RETAIN,
    "BETTERMTA_STATIC_RETAIN_VERSIONS",
  );
  const minStops = parsePositiveInt(
    env.BETTERMTA_STATIC_MIN_STOPS,
    DEFAULT_MIN_STOPS,
    "BETTERMTA_STATIC_MIN_STOPS",
  );
  const minRoutes = parsePositiveInt(
    env.BETTERMTA_STATIC_MIN_ROUTES,
    DEFAULT_MIN_ROUTES,
    "BETTERMTA_STATIC_MIN_ROUTES",
  );
  const serviceCoverageDays = parsePositiveInt(
    env.BETTERMTA_STATIC_SERVICE_COVERAGE_DAYS,
    DEFAULT_COVERAGE_DAYS,
    "BETTERMTA_STATIC_SERVICE_COVERAGE_DAYS",
  );

  const webhook = env.BETTERMTA_GRAPH_BUILD_WEBHOOK?.trim() || null;
  if (webhook && !/^https?:\/\//i.test(webhook)) {
    throw new Error(
      "Invalid BETTERMTA_GRAPH_BUILD_WEBHOOK: must be http(s) URL",
    );
  }

  return {
    staticGtfsUrl,
    dataDir: resolveDataDir(env.BETTERMTA_DATA_DIR, serviceRoot),
    maxBytes,
    timeoutMs,
    refreshIntervalMs,
    retainVersions,
    minStops,
    minRoutes,
    serviceCoverageDays,
    graphBuildWebhook: webhook,
    allowFixtureStatic: env.BETTERMTA_ALLOW_FIXTURE_STATIC === "true",
    nodeEnv: env.NODE_ENV ?? "development",
  };
}

export const STATIC_ATTRIBUTION =
  "Schedule data © Metropolitan Transportation Authority";

export const STATIC_LICENSE_NOTE =
  "MTA developer / open data terms apply. BetterMTA is not affiliated with or endorsed by the MTA.";
