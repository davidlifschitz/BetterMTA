import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHEAP_RATE_LIMIT_MAX_DEFAULT,
  LINES_CACHE_TTL_MS_DEFAULT,
  RATE_LIMIT_MAX_DEFAULT,
  RATE_LIMIT_WINDOW_MS_DEFAULT,
  REQUEST_TIMEOUT_MS_DEFAULT,
  ROUTE_CACHE_TTL_MS_DEFAULT,
} from "./constants.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

export type AdapterReadyMode =
  | "healthy"
  | "degraded"
  | "not_ready_static"
  | "not_ready_realtime";

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

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const readyRaw = process.env.BETTERMTA_ADAPTER_READY_MODE ?? "healthy";
  const adapterReadyMode = (
    ["healthy", "degraded", "not_ready_static", "not_ready_realtime"] as const
  ).includes(readyRaw as AdapterReadyMode)
    ? (readyRaw as AdapterReadyMode)
    : "healthy";

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
    permitDegradedReady: envBool("BETTERMTA_PERMIT_DEGRADED_READY", true),
    trustProxy: envTrustProxy(),
    allowRateLimitKey: testOrFlag("BETTERMTA_ALLOW_RATE_LIMIT_KEY"),
    allowExperimentSeed: testOrFlag("BETTERMTA_ALLOW_EXPERIMENT_SEED"),
    logLevel: (process.env.BETTERMTA_LOG_LEVEL as ApiConfig["logLevel"]) ?? "info",
  };

  return { ...base, ...overrides };
}
