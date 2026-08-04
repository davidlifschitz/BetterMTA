#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const DEFAULTS = Object.freeze({
  requests: 100,
  concurrency: 5,
  warmup: 5,
  p95Ms: 2_000,
  maxErrorRate: 0.01,
  timeoutMs: 10_000,
  fixture: resolve(
    repoRoot,
    "contracts/fixtures/routes/request-depart-now.json",
  ),
});
const MAX_RESPONSE_BYTES = 1024 * 1024;

function failUsage(message) {
  console.error(`Load probe refused: ${message}`);
  process.exitCode = 2;
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function finiteNumber(value, flag, { min, max, integer = false }) {
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max ||
    (integer && !Number.isInteger(parsed))
  ) {
    throw new Error(`${flag} is outside its safe range`);
  }
  return parsed;
}

function parseArgs(args) {
  const options = { ...DEFAULTS, confirmTarget: "" };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--base-url") {
      options.baseUrl = takeValue(args, index, flag);
      index += 1;
    } else if (flag === "--fixture") {
      options.fixture = resolve(takeValue(args, index, flag));
      index += 1;
    } else if (flag === "--requests") {
      options.requests = finiteNumber(takeValue(args, index, flag), flag, {
        min: 1,
        max: 5_000,
        integer: true,
      });
      index += 1;
    } else if (flag === "--concurrency") {
      options.concurrency = finiteNumber(takeValue(args, index, flag), flag, {
        min: 1,
        max: 50,
        integer: true,
      });
      index += 1;
    } else if (flag === "--warmup") {
      options.warmup = finiteNumber(takeValue(args, index, flag), flag, {
        min: 0,
        max: 500,
        integer: true,
      });
      index += 1;
    } else if (flag === "--p95-ms") {
      options.p95Ms = finiteNumber(takeValue(args, index, flag), flag, {
        min: 1,
        max: 60_000,
      });
      index += 1;
    } else if (flag === "--max-error-rate") {
      options.maxErrorRate = finiteNumber(takeValue(args, index, flag), flag, {
        min: 0,
        max: 1,
      });
      index += 1;
    } else if (flag === "--timeout-ms") {
      options.timeoutMs = finiteNumber(takeValue(args, index, flag), flag, {
        min: 100,
        max: 120_000,
        integer: true,
      });
      index += 1;
    } else if (flag === "--confirm-target") {
      options.confirmTarget = takeValue(args, index, flag);
      index += 1;
    } else {
      throw new Error("unknown option");
    }
  }
  if (!options.baseUrl) throw new Error("--base-url is required");
  if (options.concurrency > options.requests) {
    options.concurrency = options.requests;
  }
  return options;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  const family = isIP(normalized);
  if (family === 4) return normalized.startsWith("127.");
  if (family === 6) return normalized === "::1";
  return false;
}

function validateTarget(raw, confirmation) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("--base-url must be an absolute origin");
  }
  if (
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error("--base-url must contain only an origin");
  }
  const local = isLoopbackHostname(url.hostname);
  if (local) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("local target must use HTTP or HTTPS");
    }
  } else {
    if (url.protocol !== "https:") {
      throw new Error("remote target must use HTTPS");
    }
    if (confirmation !== "LOAD_TEST") {
      throw new Error("remote target requires --confirm-target LOAD_TEST");
    }
  }
  return { origin: url.origin, targetClass: local ? "local" : "remote" };
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

async function requestOnce(url, body, timeoutMs) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let responseBytes = 0;
    let responseTooLarge = false;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBytes += value.byteLength;
          if (responseBytes > MAX_RESPONSE_BYTES) {
            responseTooLarge = true;
            await reader.cancel();
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    return {
      ok: response.ok && !responseTooLarge,
      durationMs: performance.now() - started,
      failureKind: responseTooLarge
        ? "response_too_large"
        : response.ok
          ? null
          : `http_${Math.floor(response.status / 100)}xx`,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: performance.now() - started,
      failureKind: error?.name === "TimeoutError" ? "timeout" : "network",
    };
  }
}

async function runConcurrent(total, concurrency, operation) {
  const results = new Array(total);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < total) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation();
    }
  }
  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );
  return results;
}

async function main() {
  let options;
  let target;
  try {
    options = parseArgs(process.argv.slice(2));
    target = validateTarget(options.baseUrl, options.confirmTarget);
  } catch (error) {
    failUsage(error instanceof Error ? error.message : "invalid arguments");
    return;
  }

  let fixture;
  try {
    fixture = JSON.parse(await readFile(options.fixture, "utf8"));
  } catch {
    failUsage("request fixture is missing or invalid JSON");
    return;
  }
  const body = JSON.stringify(fixture);
  const routeUrl = new URL("/v1/routes/search", target.origin);

  for (let index = 0; index < options.warmup; index += 1) {
    await requestOnce(routeUrl, body, options.timeoutMs);
  }

  const started = performance.now();
  const results = await runConcurrent(
    options.requests,
    options.concurrency,
    () => requestOnce(routeUrl, body, options.timeoutMs),
  );
  const elapsedMs = Number((performance.now() - started).toFixed(2));
  const successfulDurations = results
    .filter((result) => result.ok)
    .map((result) => result.durationMs);
  const successCount = successfulDurations.length;
  const failureCount = results.length - successCount;
  const errorRate = Number((failureCount / results.length).toFixed(6));
  const p95Ms = percentile(successfulDurations, 0.95);
  const failureKinds = {};
  for (const result of results) {
    if (result.failureKind) {
      failureKinds[result.failureKind] =
        (failureKinds[result.failureKind] ?? 0) + 1;
    }
  }
  const passed =
    p95Ms !== null &&
    p95Ms < options.p95Ms &&
    errorRate <= options.maxErrorRate;

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: passed ? "PASS" : "FAIL",
    targetClass: target.targetClass,
    routePath: "/v1/routes/search",
    requestCount: results.length,
    concurrency: options.concurrency,
    warmupCount: options.warmup,
    elapsedMs,
    successCount,
    failureCount,
    errorRate,
    p50Ms: percentile(successfulDurations, 0.5),
    p95Ms,
    p99Ms: percentile(successfulDurations, 0.99),
    thresholds: {
      p95Ms: options.p95Ms,
      maxErrorRate: options.maxErrorRate,
    },
    failureKinds,
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  process.exitCode = passed ? 0 : 1;
}

await main();
