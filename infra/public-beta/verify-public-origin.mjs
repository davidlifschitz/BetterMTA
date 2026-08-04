#!/usr/bin/env node

import { isIP } from "node:net";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

function failUsage(message) {
  console.error(`Public-origin verification refused: ${message}`);
  process.exitCode = 2;
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    confirmTarget: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (["--web-url", "--api-url", "--release-commit", "--confirm-target"].includes(flag)) {
      const value = takeValue(args, index, flag);
      if (flag === "--web-url") options.webUrl = value;
      if (flag === "--api-url") options.apiUrl = value;
      if (flag === "--release-commit") options.releaseCommit = value;
      if (flag === "--confirm-target") options.confirmTarget = value;
      index += 1;
    } else if (flag === "--timeout-ms") {
      const value = Number(takeValue(args, index, flag));
      if (!Number.isInteger(value) || value < 100 || value > 60_000) {
        throw new Error("--timeout-ms is outside its safe range");
      }
      options.timeoutMs = value;
      index += 1;
    } else {
      throw new Error("unknown option");
    }
  }
  if (!options.webUrl) throw new Error("--web-url is required");
  if (!options.apiUrl) throw new Error("--api-url is required");
  if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
    throw new Error("--release-commit must be a full lowercase Git SHA");
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

function validateOrigin(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute origin`);
  }
  if (
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must contain only an origin`);
  }

  const local = isLoopbackHostname(url.hostname);
  if (local) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${label} local target must use HTTP or HTTPS`);
    }
  } else {
    if (url.protocol !== "https:") {
      throw new Error(`${label} remote target must use HTTPS`);
    }
    if (isIP(url.hostname)) {
      throw new Error(`${label} remote target must use a DNS hostname`);
    }
  }
  return {
    origin: url.origin,
    targetClass: local ? "local" : "remote",
  };
}

function validateTargets(options) {
  const web = validateOrigin(options.webUrl, "web URL");
  const api = validateOrigin(options.apiUrl, "API URL");
  if (web.targetClass !== api.targetClass) {
    throw new Error("web and API targets must both be local or remote");
  }
  if (
    web.targetClass === "remote" &&
    options.confirmTarget !== "PUBLIC_ORIGIN_CHECK"
  ) {
    throw new Error(
      "remote targets require --confirm-target PUBLIC_ORIGIN_CHECK",
    );
  }
  return { web, api, targetClass: web.targetClass };
}

async function readBoundedBody(response) {
  if (!response.body) return { body: "", tooLarge: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return { body: "", tooLarge: true };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { body, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

async function fetchPath(origin, path, timeoutMs) {
  try {
    const response = await fetch(new URL(path, origin), {
      method: "GET",
      headers: { accept: "text/html, application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const { body, tooLarge } = await readBoundedBody(response);
    return { response, body, tooLarge };
  } catch (error) {
    return {
      failureKind: error?.name === "TimeoutError" ? "timeout" : "network",
    };
  }
}

function httpFailure(label, result, failures) {
  if (result.failureKind) {
    failures.push(`${label}:${result.failureKind}`);
    return true;
  }
  if (result.tooLarge) {
    failures.push(`${label}:response-too-large`);
    return true;
  }
  const status = result.response.status;
  if (status < 200 || status >= 300) {
    const classCode = Math.floor(status / 100);
    failures.push(`${label}:http-${classCode}xx`);
    return true;
  }
  return false;
}

function cspDirective(csp, name) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

function validateWebHeaders(label, response, failures) {
  const headers = response.headers;
  const exactHeaders = [
    ["cross-origin-opener-policy", "same-origin"],
    ["cross-origin-resource-policy", "same-origin"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["x-permitted-cross-domain-policies", "none"],
  ];
  for (const [header, expected] of exactHeaders) {
    if ((headers.get(header) ?? "").toLowerCase() !== expected.toLowerCase()) {
      failures.push(`${label}:${header}`);
    }
  }

  const permissions = (headers.get("permissions-policy") ?? "").toLowerCase();
  for (const policy of ["camera=()", "microphone=()", "geolocation=(self)"]) {
    if (!permissions.includes(policy)) failures.push(`${label}:permissions-policy`);
  }

  const csp = headers.get("content-security-policy") ?? "";
  const requiredDirectives = [
    ["default-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  for (const [name, source] of requiredDirectives) {
    if (!(cspDirective(csp, name) ?? "").includes(source)) {
      failures.push(`${label}:csp:${name}`);
    }
  }
  const script = cspDirective(csp, "script-src") ?? "";
  if (!script.includes("'self'") || !script.includes("'strict-dynamic'")) {
    failures.push(`${label}:csp:script-src`);
  }
  if (/unsafe-(?:inline|eval)/i.test(script)) {
    failures.push(`${label}:csp:unsafe-script-source`);
  }
  const nonce = script.match(/'nonce-([A-Za-z0-9+/_=-]+)'/)?.[1] ?? null;
  if (!nonce) failures.push(`${label}:csp:nonce`);
  return nonce;
}

function validateHtml(label, result, markers, failures) {
  if (httpFailure(label, result, failures)) return null;
  if (!(result.response.headers.get("content-type") ?? "").includes("text/html")) {
    failures.push(`${label}:content-type`);
  }
  const nonce = validateWebHeaders(label, result.response, failures);
  for (const [marker, pattern] of markers) {
    if (!pattern.test(result.body)) failures.push(`${label}:body:${marker}`);
  }
  return nonce;
}

function validateJson(label, result, failures) {
  if (httpFailure(label, result, failures)) return null;
  if (!(result.response.headers.get("content-type") ?? "").includes("application/json")) {
    failures.push(`${label}:content-type`);
  }
  try {
    const parsed = JSON.parse(result.body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      failures.push(`${label}:json-shape`);
      return null;
    }
    return parsed;
  } catch {
    failures.push(`${label}:invalid-json`);
    return null;
  }
}

async function main() {
  let options;
  let targets;
  try {
    options = parseArgs(process.argv.slice(2));
    targets = validateTargets(options);
  } catch (error) {
    failUsage(error instanceof Error ? error.message : "invalid arguments");
    return;
  }

  const [rootFirst, rootSecond, limitations, live, ready, status] =
    await Promise.all([
      fetchPath(targets.web.origin, "/", options.timeoutMs),
      fetchPath(targets.web.origin, "/", options.timeoutMs),
      fetchPath(targets.web.origin, "/limitations", options.timeoutMs),
      fetchPath(targets.api.origin, "/health/live", options.timeoutMs),
      fetchPath(targets.api.origin, "/health/ready", options.timeoutMs),
      fetchPath(targets.api.origin, "/v1/status", options.timeoutMs),
    ]);

  const failures = [];
  const firstNonce = validateHtml(
    "web:root",
    rootFirst,
    [["limitations-link", /href=["']\/limitations(?:["'?#])/i]],
    failures,
  );
  const secondNonce = httpFailure("web:root-repeat", rootSecond, failures)
    ? null
    : validateWebHeaders("web:root-repeat", rootSecond.response, failures);
  validateHtml(
    "web:limitations",
    limitations,
    [
      ["heading", /BetterMTA beta limitations/i],
      ["scope", /NYC subway-first/i],
      ["account", /No account is required/i],
      ["claims", /does not claim to beat/i],
    ],
    failures,
  );
  if (firstNonce && secondNonce && firstNonce === secondNonce) {
    failures.push("web:csp:nonce-not-rotated");
  }

  const liveBody = validateJson("api:health-live", live, failures);
  if (liveBody && typeof liveBody.status !== "string") {
    failures.push("api:health-live:status");
  }
  const readyBody = validateJson("api:health-ready", ready, failures);
  if (readyBody && typeof readyBody.status !== "string") {
    failures.push("api:health-ready:status");
  }
  const statusBody = validateJson("api:status", status, failures);
  let dataMode = null;
  if (statusBody) {
    const reportedDataMode = statusBody.dataMode;
    if (["live", "stale", "schedule_only"].includes(reportedDataMode)) {
      dataMode = reportedDataMode;
    } else {
      dataMode = "invalid";
      failures.push("api:status:data-mode");
    }
    if (
      typeof statusBody.staticDatasetVersion !== "string" ||
      statusBody.staticDatasetVersion.length === 0
    ) {
      failures.push("api:status:static-dataset-version");
    }
  }

  const failureCodes = [...new Set(failures)].sort();
  const passed = failureCodes.length === 0;
  const remote = targets.targetClass === "remote";
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: passed ? (remote ? "PASS" : "LOCAL_CHECK_PASS") : "FAIL",
    targetClass: targets.targetClass,
    releaseCommit: options.releaseCommit,
    eligibleForPublicOriginEvidence: passed && remote,
    transport: remote ? "https-runtime-verified" : "local-development",
    dataMode,
    failureCount: failureCodes.length,
    failureCodes,
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  process.exitCode = passed ? 0 : 1;
}

await main();
