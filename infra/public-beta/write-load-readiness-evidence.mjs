#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const DATA_MODES = new Set(["live", "stale", "schedule_only", "synthetic", "unavailable"]);
const MAX_PROBE_BYTES = 1024 * 1024;
const PROBE_FIELDS = new Set([
  "schemaVersion",
  "generatedAt",
  "status",
  "targetClass",
  "releaseCommit",
  "routePath",
  "dataMode",
  "snapshotFingerprint",
  "snapshotStable",
  "statusChecks",
  "requestCount",
  "concurrency",
  "warmupCount",
  "elapsedMs",
  "successCount",
  "failureCount",
  "errorRate",
  "p50Ms",
  "p95Ms",
  "p99Ms",
  "thresholds",
  "failureKinds",
]);
const STATUS_CHECK_FIELDS = new Set(["before", "after"]);
const THRESHOLD_FIELDS = new Set(["p95Ms", "maxErrorRate"]);
const FAILURE_KIND_FIELDS = new Set([
  "status_missing_or_malformed",
  "status_degraded",
  "snapshot_changed",
  "response_too_large",
  "timeout",
  "network",
  "http_1xx",
  "http_2xx",
  "http_3xx",
  "http_4xx",
  "http_5xx",
  "latency_threshold_exceeded",
]);
const CHECKS = Object.freeze([
  "release-commit-bound",
  "status-before-and-after-pass",
  "data-snapshot-stable",
  "p95-under-threshold",
  "error-rate-within-threshold",
  "loopback-only-synthetic-target",
]);

function fail(code) {
  console.error(`ERROR ${code}`);
  process.exitCode = 2;
}

function takeValue(args, index) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("missing value");
  return value;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--probe") {
      if (options.probePath) throw new Error("duplicate probe");
      options.probePath = takeValue(args, index);
      index += 1;
    } else if (flag === "--release-commit") {
      if (options.releaseCommit) throw new Error("duplicate commit");
      options.releaseCommit = takeValue(args, index);
      index += 1;
    } else {
      throw new Error("unknown option");
    }
  }
  if (!options.probePath || !RELEASE_COMMIT_PATTERN.test(options.releaseCommit ?? "")) {
    throw new Error("invalid arguments");
  }
  return options;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function boundedIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction = "") => `.${fraction.padEnd(3, "0")}Z`,
  );
  return new Date(parsed).toISOString() === normalized;
}

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validateProbe(probe, expectedCommit) {
  if (!hasExactKeys(probe, PROBE_FIELDS)) throw new Error("invalid probe");
  if (probe.schemaVersion !== 1 || probe.status !== "PASS") throw new Error("invalid probe");
  if (!boundedIsoTimestamp(probe.generatedAt)) throw new Error("invalid probe");
  if (!RELEASE_COMMIT_PATTERN.test(probe.releaseCommit ?? "") || probe.releaseCommit !== expectedCommit) {
    throw new Error("invalid probe");
  }
  if (probe.targetClass !== "local" || probe.routePath !== "/v1/routes/search") {
    throw new Error("invalid probe");
  }
  if (probe.dataMode !== "synthetic" || !FINGERPRINT_PATTERN.test(probe.snapshotFingerprint ?? "")) {
    throw new Error("invalid probe");
  }
  if (
    probe.snapshotStable !== true ||
    !hasExactKeys(probe.statusChecks, STATUS_CHECK_FIELDS) ||
    probe.statusChecks.before !== "pass" ||
    probe.statusChecks.after !== "pass"
  ) {
    throw new Error("invalid probe");
  }
  if (
    !boundedInteger(probe.requestCount, 100, 5_000) ||
    !boundedInteger(probe.concurrency, 1, 50) ||
    !boundedInteger(probe.warmupCount, 0, 500) ||
    !finite(probe.elapsedMs) ||
    !boundedInteger(probe.successCount, 0, 5_000) ||
    !boundedInteger(probe.failureCount, 0, 5_000) ||
    probe.successCount + probe.failureCount !== probe.requestCount ||
    !finite(probe.p50Ms) ||
    !finite(probe.p95Ms) ||
    !finite(probe.p99Ms) ||
    probe.p50Ms < 0 ||
    probe.p95Ms < 0 ||
    probe.p99Ms < 0 ||
    probe.p50Ms > probe.p95Ms ||
    probe.p95Ms > probe.p99Ms ||
    !finite(probe.errorRate) ||
    probe.errorRate < 0 ||
    probe.errorRate > 1 ||
    probe.errorRate !== Number((probe.failureCount / probe.requestCount).toFixed(6))
  ) {
    throw new Error("invalid probe");
  }
  if (!hasExactKeys(probe.thresholds, THRESHOLD_FIELDS)) throw new Error("invalid probe");
  const { p95Ms, maxErrorRate } = probe.thresholds;
  if (
    !finite(p95Ms) ||
    p95Ms <= 0 ||
    !finite(maxErrorRate) ||
    maxErrorRate < 0 ||
    maxErrorRate > 1 ||
    probe.p95Ms >= p95Ms ||
    probe.errorRate > maxErrorRate
  ) {
    throw new Error("invalid probe");
  }
  if (
    !isPlainObject(probe.failureKinds) ||
    Object.keys(probe.failureKinds).some(
      (key) =>
        !FAILURE_KIND_FIELDS.has(key) ||
        !boundedInteger(probe.failureKinds[key], 0, probe.requestCount),
    )
  ) {
    throw new Error("invalid probe");
  }
  if (!DATA_MODES.has(probe.dataMode)) throw new Error("invalid probe");
}

async function readProbe(path) {
  try {
    const details = await lstat(path);
    if (!details.isFile() || details.size > MAX_PROBE_BYTES) throw new Error("invalid probe");
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("invalid probe");
  }
}

export function buildEvidence(probe, expectedCommit, generatedAt = new Date().toISOString()) {
  validateProbe(probe, expectedCommit);
  if (!boundedIsoTimestamp(generatedAt)) throw new Error("invalid evidence");
  return {
    schemaVersion: 1,
    status: "SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING",
    evidenceClass: "ci-load-p95-readiness",
    gateId: "load_p95",
    probeClass: "synthetic-local",
    targetApprovalStatus: "pending",
    dataSnapshotStatus: "synthetic",
    releaseCommit: expectedCommit,
    dataMode: probe.dataMode,
    snapshotFingerprint: probe.snapshotFingerprint,
    metrics: {
      requestCount: probe.requestCount,
      successCount: probe.successCount,
      failureCount: probe.failureCount,
      errorRate: probe.errorRate,
      p50Ms: probe.p50Ms,
      p95Ms: probe.p95Ms,
      p99Ms: probe.p99Ms,
    },
    requestCount: probe.requestCount,
    p95Ms: probe.p95Ms,
    errorRate: probe.errorRate,
    thresholds: {
      p95Ms: probe.thresholds.p95Ms,
      maxErrorRate: probe.thresholds.maxErrorRate,
    },
    checks: [...CHECKS],
    eligibleForGatePass: false,
    betaCapacityEvidence: false,
    productionMutation: false,
    generatedAt,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch {
    fail("invalid_arguments");
    return;
  }
  try {
    const probe = await readProbe(options.probePath);
    const evidence = buildEvidence(probe, options.releaseCommit);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch {
    fail("invalid_probe");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
