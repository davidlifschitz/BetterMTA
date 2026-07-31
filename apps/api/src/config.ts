import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHEAP_RATE_LIMIT_MAX_DEFAULT,
  DATA_CATALOG_TTL_MS_DEFAULT,
  DATA_INTERNAL_URL_DEFAULT,
  DATA_STATUS_TTL_MS_DEFAULT,
  GEOCODER_MAX_ATTEMPTS_DEFAULT,
  GEOCODER_MIN_INTERVAL_MS_DEFAULT,
  GEOCODER_QUERY_CACHE_MAX_DEFAULT,
  GEOCODER_QUERY_CACHE_TTL_MS_DEFAULT,
  GEOCODER_RESOLVE_CACHE_TTL_MS_DEFAULT,
  GEOCODER_TIMEOUT_MS_DEFAULT,
  LINES_CACHE_TTL_MS_DEFAULT,
  NOMINATIM_BASE_URL_DEFAULT,
  OTP_PROBE_TTL_MS_DEFAULT,
  OTP_TIMEOUT_MS_DEFAULT,
  OTP_URL_DEFAULT,
  RATE_LIMIT_MAX_DEFAULT,
  RATE_LIMIT_WINDOW_MS_DEFAULT,
  REQUEST_TIMEOUT_MS_DEFAULT,
  ROUTE_CACHE_TTL_MS_DEFAULT,
} from "./constants.js";
import type { GeocoderProviderName } from "./adapters/places/createGeocoder.js";
import {
  isAddressPoiEnabled,
  loadFeatureFlags,
} from "./adapters/places/flags.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

export type AdapterReadyMode =
  | "healthy"
  | "degraded"
  | "not_ready_static"
  | "not_ready_realtime";

export type AdapterMode = "fixture" | "live";

export interface ApiConfig {
  port: number;
  host: string;
  fixturesRoot: string;
  contractsRoot: string;
  requestTimeoutMs: number;
  rateLimitMax: number;
  cheapRateLimitMax: number;
  rateLimitWindowMs: number;
  linesCacheTtlMs: number;
  routeCacheTtlMs: number;
  adapterReadyMode: AdapterReadyMode;
  /** fixture = contracts fixtures (dev/test only); live = data service + OTP. */
  adapterMode: AdapterMode;
  permitDegradedReady: boolean;
  /** When false, Fastify ignores X-Forwarded-* for client IP. Number = hop count. */
  trustProxy: boolean | number;
  /**
   * Honor X-Rate-Limit-Key. Default ON only when NODE_ENV=test;
   * otherwise requires BETTERMTA_ALLOW_RATE_LIMIT_KEY=true.
   */
  allowRateLimitKey: boolean;
  /**
   * Honor X-Experiment-Seed. Default ON only when NODE_ENV=test;
   * otherwise requires BETTERMTA_ALLOW_EXPERIMENT_SEED=true.
   */
  allowExperimentSeed: boolean;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  /** Base URL for services/data internal HTTP API. */
  dataInternalUrl: string;
  /** Bearer token for data internal API (optional in anon-dev). */
  dataInternalToken: string | null;
  dataStatusTtlMs: number;
  dataCatalogTtlMs: number;
  /** OTP HTTP base URL. */
  otpUrl: string;
  otpTimeoutMs: number;
  otpProbeTtlMs: number;
  /**
   * Optional OTP graph version pin. When set, must share a prefix with the
   * active staticDatasetVersion or searches fail closed as data_unavailable.
   */
  otpGraphVersion: string | null;
  /**
   * ADR-0022: when true, /v1/places/search may append address/POI geocode results.
   * Default false — certified station-index alpha unchanged until go/no-go.
   */
  addressPoiEnabled: boolean;
  /** none | fake (CI) | nominatim (controlled alpha). */
  geocoderProvider: GeocoderProviderName;
  nominatimBaseUrl: string;
  nominatimUserAgent: string | null;
  nominatimEmail: string | null;
  geocoderTimeoutMs: number;
  geocoderMaxAttempts: number;
  geocoderMinIntervalMs: number;
  geocoderQueryCacheTtlMs: number;
  geocoderQueryCacheMax: number;
  geocoderResolveCacheTtlMs: number;
  flagDefaultsPath: string | null;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid integer env ${name}=${raw}`);
  }
  return n;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** false by default; true, or a non-negative hop count for Fly/edge proxies. */
export function envTrustProxy(
  raw = process.env.BETTERMTA_TRUST_PROXY,
): boolean | number {
  if (raw === undefined || raw === "") return false;
  const lower = raw.toLowerCase();
  if (lower === "0" || lower === "false" || lower === "off") return false;
  if (lower === "1" || lower === "true" || lower === "on") return true;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0) return n;
  return false;
}

function testOrFlag(envName: string): boolean {
  if (process.env.NODE_ENV === "test") return true;
  return envBool(envName, false);
}

export function envAdapterMode(
  raw = process.env.BETTERMTA_ADAPTER_MODE,
): AdapterMode {
  if (raw === "fixture" || raw === "live") return raw;
  if (raw !== undefined && raw !== "") {
    throw new Error(
      `Invalid BETTERMTA_ADAPTER_MODE=${raw}; expected fixture|live`,
    );
  }
  return "live";
}

export function envGeocoderProvider(
  raw = process.env.BETTERMTA_GEOCODER_PROVIDER,
): GeocoderProviderName {
  if (raw === undefined || raw === "") return "none";
  if (raw === "none" || raw === "fake" || raw === "nominatim") return raw;
  throw new Error(
    `Invalid BETTERMTA_GEOCODER_PROVIDER=${raw}; expected none|fake|nominatim`,
  );
}

/**
 * ADR-0018: production must never boot in fixture mode.
 * Call before listen (and from buildApp so tests can assert throw).
 */
export function assertProductionAdapterLockout(
  adapterMode: AdapterMode,
  nodeEnv = process.env.NODE_ENV,
): void {
  if (nodeEnv === "production" && adapterMode === "fixture") {
    throw new Error(
      "Refusing to start: BETTERMTA_ADAPTER_MODE=fixture is forbidden when NODE_ENV=production (ADR-0018).",
    );
  }
}

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const readyRaw = process.env.BETTERMTA_ADAPTER_READY_MODE ?? "healthy";
  const adapterReadyMode = (
    ["healthy", "degraded", "not_ready_static", "not_ready_realtime"] as const
  ).includes(readyRaw as AdapterReadyMode)
    ? (readyRaw as AdapterReadyMode)
    : "healthy";

  const tokenRaw = process.env.BETTERMTA_DATA_INTERNAL_TOKEN;
  const graphRaw = process.env.BETTERMTA_OTP_GRAPH_VERSION;
  const nominatimUaRaw = process.env.BETTERMTA_NOMINATIM_USER_AGENT;
  const nominatimEmailRaw = process.env.BETTERMTA_NOMINATIM_EMAIL;
  const flagDefaultsPath =
    process.env.FLAG_DEFAULTS_PATH ??
    process.env.BETTERMTA_FLAG_DEFAULTS_PATH ??
    null;

  const addressPoiEnv = process.env.BETTERMTA_ADDRESS_POI_ENABLED;
  const addressPoiDirect =
    addressPoiEnv === undefined || addressPoiEnv === ""
      ? null
      : envBool("BETTERMTA_ADDRESS_POI_ENABLED", false);

  const featureFlags = loadFeatureFlags({
    featureFlagsJson: process.env.FEATURE_FLAGS_JSON ?? null,
    flagDefaultsPath,
    addressPoiEnabled: addressPoiDirect,
  });

  const base: ApiConfig = {
    port: envInt("PORT", 3080),
    host: process.env.HOST ?? "127.0.0.1",
    fixturesRoot:
      process.env.BETTERMTA_FIXTURES_ROOT ??
      path.join(repoRoot, "contracts", "fixtures"),
    contractsRoot:
      process.env.BETTERMTA_CONTRACTS_ROOT ?? path.join(repoRoot, "contracts"),
    requestTimeoutMs: envInt(
      "BETTERMTA_REQUEST_TIMEOUT_MS",
      REQUEST_TIMEOUT_MS_DEFAULT,
    ),
    rateLimitMax: envInt("BETTERMTA_RATE_LIMIT_MAX", RATE_LIMIT_MAX_DEFAULT),
    cheapRateLimitMax: envInt(
      "BETTERMTA_CHEAP_RATE_LIMIT_MAX",
      CHEAP_RATE_LIMIT_MAX_DEFAULT,
    ),
    rateLimitWindowMs: envInt(
      "BETTERMTA_RATE_LIMIT_WINDOW_MS",
      RATE_LIMIT_WINDOW_MS_DEFAULT,
    ),
    linesCacheTtlMs: envInt(
      "BETTERMTA_LINES_CACHE_TTL_MS",
      LINES_CACHE_TTL_MS_DEFAULT,
    ),
    routeCacheTtlMs: envInt(
      "BETTERMTA_ROUTE_CACHE_TTL_MS",
      ROUTE_CACHE_TTL_MS_DEFAULT,
    ),
    adapterReadyMode,
    adapterMode: envAdapterMode(),
    permitDegradedReady: envBool("BETTERMTA_PERMIT_DEGRADED_READY", true),
    trustProxy: envTrustProxy(),
    allowRateLimitKey: testOrFlag("BETTERMTA_ALLOW_RATE_LIMIT_KEY"),
    allowExperimentSeed: testOrFlag("BETTERMTA_ALLOW_EXPERIMENT_SEED"),
    logLevel: (process.env.BETTERMTA_LOG_LEVEL as ApiConfig["logLevel"]) ?? "info",
    dataInternalUrl:
      process.env.BETTERMTA_DATA_INTERNAL_URL ?? DATA_INTERNAL_URL_DEFAULT,
    dataInternalToken:
      tokenRaw !== undefined && tokenRaw !== "" ? tokenRaw : null,
    dataStatusTtlMs: envInt(
      "BETTERMTA_DATA_STATUS_TTL_MS",
      DATA_STATUS_TTL_MS_DEFAULT,
    ),
    dataCatalogTtlMs: envInt(
      "BETTERMTA_DATA_CATALOG_TTL_MS",
      DATA_CATALOG_TTL_MS_DEFAULT,
    ),
    otpUrl: process.env.BETTERMTA_OTP_URL ?? OTP_URL_DEFAULT,
    otpTimeoutMs: envInt("BETTERMTA_OTP_TIMEOUT_MS", OTP_TIMEOUT_MS_DEFAULT),
    otpProbeTtlMs: envInt(
      "BETTERMTA_OTP_PROBE_TTL_MS",
      OTP_PROBE_TTL_MS_DEFAULT,
    ),
    otpGraphVersion:
      graphRaw !== undefined && graphRaw !== "" ? graphRaw : null,
    addressPoiEnabled: isAddressPoiEnabled(featureFlags),
    geocoderProvider: envGeocoderProvider(),
    nominatimBaseUrl:
      process.env.BETTERMTA_NOMINATIM_BASE_URL ?? NOMINATIM_BASE_URL_DEFAULT,
    nominatimUserAgent:
      nominatimUaRaw !== undefined && nominatimUaRaw !== ""
        ? nominatimUaRaw
        : null,
    nominatimEmail:
      nominatimEmailRaw !== undefined && nominatimEmailRaw !== ""
        ? nominatimEmailRaw
        : null,
    geocoderTimeoutMs: envInt(
      "BETTERMTA_GEOCODER_TIMEOUT_MS",
      GEOCODER_TIMEOUT_MS_DEFAULT,
    ),
    geocoderMaxAttempts: envInt(
      "BETTERMTA_GEOCODER_MAX_ATTEMPTS",
      GEOCODER_MAX_ATTEMPTS_DEFAULT,
    ),
    geocoderMinIntervalMs: envInt(
      "BETTERMTA_GEOCODER_MIN_INTERVAL_MS",
      GEOCODER_MIN_INTERVAL_MS_DEFAULT,
    ),
    geocoderQueryCacheTtlMs: envInt(
      "BETTERMTA_GEOCODER_QUERY_CACHE_TTL_MS",
      GEOCODER_QUERY_CACHE_TTL_MS_DEFAULT,
    ),
    geocoderQueryCacheMax: envInt(
      "BETTERMTA_GEOCODER_QUERY_CACHE_MAX",
      GEOCODER_QUERY_CACHE_MAX_DEFAULT,
    ),
    geocoderResolveCacheTtlMs: envInt(
      "BETTERMTA_GEOCODER_RESOLVE_CACHE_TTL_MS",
      GEOCODER_RESOLVE_CACHE_TTL_MS_DEFAULT,
    ),
    flagDefaultsPath,
  };

  return { ...base, ...overrides };
}
