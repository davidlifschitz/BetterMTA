#!/usr/bin/env node

import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const RELEASE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DATA_MODES = new Set(["live", "stale", "schedule_only", "synthetic", "unavailable"]);
const CONTRACT_VERSION = "2026-07-31";
const STATUS_FIELDS = new Set([
  "contractVersion",
  "dataMode",
  "staticDatasetVersion",
  "realtimeSnapshotId",
  "realtimeAgeSeconds",
  "degraded",
  "messages",
]);

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
const MAX_STATUS_RESPONSE_BYTES = 64 * 1024;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

function failUsage(message = "invalid arguments") {
  if (message === "invalid arguments") {
    console.error("ERROR invalid_arguments");
  } else {
    console.error(`Load probe refused: ${message}`);
  }
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
    } else if (flag === "--release-commit") {
      const value = takeValue(args, index, flag);
      if (!RELEASE_COMMIT_PATTERN.test(value)) {
        throw new Error("invalid release commit");
      }
      options.releaseCommit = value;
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
  if (!options.baseUrl || !options.releaseCommit) {
    throw new Error("base URL and release commit are required");
  }
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
    throw new Error("invalid target");
  }
  if (
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid target");
  }
  const local = isLoopbackHostname(url.hostname);
  if (local) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid target");
    }
  } else {
    if (url.protocol !== "https:") throw new Error("remote target must use HTTPS");
    if (confirmation !== "LOAD_TEST") throw new Error("remote target requires confirmation");
  }
  return { origin: url.origin, targetClass: local ? "local" : "remote" };
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

async function drainBody(response, maxBytes, retain) {
  if (!response.body) return { bytes: Buffer.alloc(0), tooLarge: false };
  const reader = response.body.getReader();
  const chunks = retain ? [] : null;
  let responseBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      responseBytes += value.byteLength;
      if (responseBytes > maxBytes) {
        await reader.cancel();
        return { bytes: Buffer.alloc(0), tooLarge: true };
      }
      if (chunks) chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return { bytes: chunks ? Buffer.concat(chunks) : Buffer.alloc(0), tooLarge: false };
}

async function readBoundedFile(path, maxBytes) {
  let handle;
  try {
    handle = await open(path, "r");
    const chunks = [];
    const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    let totalBytes = 0;
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) throw new Error("fixture too large");
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks);
  } finally {
    await handle?.close();
  }
}

function safeStatusToken(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
    !value.includes("..")
  );
}

function parseStatus(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("malformed status");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed status");
  }
  const keys = Object.keys(parsed);
  if (
    keys.length > STATUS_FIELDS.size ||
    !keys.every((key) => STATUS_FIELDS.has(key)) ||
    parsed.contractVersion !== CONTRACT_VERSION ||
    !DATA_MODES.has(parsed.dataMode) ||
    !safeStatusToken(parsed.staticDatasetVersion)
  ) {
    throw new Error("malformed status");
  }
  if (
    parsed.realtimeSnapshotId !== undefined &&
    parsed.realtimeSnapshotId !== null &&
    !safeStatusToken(parsed.realtimeSnapshotId)
  ) {
    throw new Error("malformed status");
  }
  if (
    parsed.realtimeAgeSeconds !== undefined &&
    parsed.realtimeAgeSeconds !== null &&
    (!Number.isInteger(parsed.realtimeAgeSeconds) || parsed.realtimeAgeSeconds < 0)
  ) {
    throw new Error("malformed status");
  }
  if (
    typeof parsed.degraded !== "boolean" ||
    !Array.isArray(parsed.messages) ||
    parsed.messages.length > 32 ||
    parsed.messages.some((message) => typeof message !== "string" || message.length > 256)
  ) {
    throw new Error("malformed status");
  }
  const identity = {
    contractVersion: parsed.contractVersion,
    dataMode: parsed.dataMode,
    staticDatasetVersion: parsed.staticDatasetVersion,
    realtimeSnapshotId: parsed.realtimeSnapshotId ?? null,
  };
  return {
    dataMode: parsed.dataMode,
    degraded: parsed.degraded,
    snapshotFingerprint: createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex"),
  };
}

async function readStatus(url, timeoutMs) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await drainBody(response, MAX_STATUS_RESPONSE_BYTES, true);
    if (!response.ok || body.tooLarge) throw new Error("malformed status");
    return { ok: true, ...parseStatus(body.bytes) };
  } catch {
    return { ok: false, failureKind: "status_missing_or_malformed" };
  }
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
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseBody = await drainBody(response, MAX_RESPONSE_BYTES, false);
    const responseTooLarge = responseBody.tooLarge;
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
      failureKind:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "timeout"
          : "network",
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

function countFailure(failureKinds, kind) {
  failureKinds[kind] = (failureKinds[kind] ?? 0) + 1;
}

function emptyMetrics(options) {
  return {
    requestCount: 0,
    concurrency: options.concurrency,
    warmupCount: options.warmup,
    elapsedMs: 0,
    successCount: 0,
    failureCount: 0,
    errorRate: 0,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    thresholds: {
      p95Ms: options.p95Ms,
      maxErrorRate: options.maxErrorRate,
    },
    failureKinds: {},
  };
}

async function main() {
  let options;
  let target;
  try {
    options = parseArgs(process.argv.slice(2));
    target = validateTarget(options.baseUrl, options.confirmTarget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "remote target must use HTTPS" || message === "remote target requires confirmation") {
      failUsage(message);
    } else {
      failUsage();
    }
    return;
  }

  let fixture;
  try {
    fixture = JSON.parse(
      (await readBoundedFile(options.fixture, MAX_REQUEST_BODY_BYTES)).toString("utf8"),
    );
    const bodyBytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
    if (bodyBytes > MAX_REQUEST_BODY_BYTES) throw new Error("fixture too large");
  } catch {
    failUsage();
    return;
  }
  const body = JSON.stringify(fixture);
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    failUsage();
    return;
  }
  const routeUrl = new URL("/v1/routes/search", target.origin);
  const statusUrl = new URL("/v1/status", target.origin);
  const before = await readStatus(statusUrl, options.timeoutMs);
  const beforeStatus = before.ok ? (before.degraded ? "degraded" : "pass") : "fail";
  const statusChecks = { before: beforeStatus, after: "not_run" };
  const failureKinds = {};

  if (!before.ok) {
    countFailure(failureKinds, before.failureKind);
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "FAIL",
      targetClass: target.targetClass,
      releaseCommit: options.releaseCommit,
      routePath: "/v1/routes/search",
      dataMode: "invalid",
      snapshotFingerprint: null,
      snapshotStable: false,
      statusChecks,
      ...emptyMetrics(options),
      failureKinds,
    };
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    process.exitCode = 1;
    return;
  }

  if (before.degraded) {
    countFailure(failureKinds, "status_degraded");
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "FAIL",
      targetClass: target.targetClass,
      releaseCommit: options.releaseCommit,
      routePath: "/v1/routes/search",
      dataMode: before.dataMode,
      snapshotFingerprint: before.snapshotFingerprint,
      snapshotStable: false,
      statusChecks,
      ...emptyMetrics(options),
      failureKinds,
    };
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    process.exitCode = 1;
    return;
  }

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
  const after = await readStatus(statusUrl, options.timeoutMs);
  statusChecks.after = after.ok ? (after.degraded ? "degraded" : "pass") : "fail";

  const measuredDurations = results.map((result) => result.durationMs);
  const successCount = results.filter((result) => result.ok).length;
  const failureCount = results.length - successCount;
  const errorRate = Number((failureCount / results.length).toFixed(6));
  const failureKindsFromRequests = {};
  for (const result of results) {
    if (result.failureKind) countFailure(failureKindsFromRequests, result.failureKind);
  }
  Object.assign(failureKinds, failureKindsFromRequests);
  const snapshotStable = after.ok && after.snapshotFingerprint === before.snapshotFingerprint;
  if (!after.ok) countFailure(failureKinds, after.failureKind);
  if (after.ok && after.degraded) countFailure(failureKinds, "status_degraded");
  if (after.ok && !snapshotStable) countFailure(failureKinds, "snapshot_changed");
  const p95Ms = percentile(measuredDurations, 0.95);
  const slowFailedRequests = results.filter(
    (result) => !result.ok && result.durationMs >= options.p95Ms,
  ).length;
  if (slowFailedRequests > 0) countFailure(failureKinds, "latency_threshold_exceeded");
  const passed =
    before.ok &&
    !before.degraded &&
    after.ok &&
    !after.degraded &&
    snapshotStable &&
    p95Ms !== null &&
    p95Ms < options.p95Ms &&
    slowFailedRequests === 0 &&
    errorRate <= options.maxErrorRate;

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: passed ? "PASS" : "FAIL",
    targetClass: target.targetClass,
    releaseCommit: options.releaseCommit,
    routePath: "/v1/routes/search",
    dataMode: before.dataMode,
    snapshotFingerprint: before.snapshotFingerprint,
    snapshotStable,
    statusChecks,
    requestCount: results.length,
    concurrency: options.concurrency,
    warmupCount: options.warmup,
    elapsedMs,
    successCount,
    failureCount,
    errorRate,
    p50Ms: percentile(measuredDurations, 0.5),
    p95Ms,
    p99Ms: percentile(measuredDurations, 0.99),
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
