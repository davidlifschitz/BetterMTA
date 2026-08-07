import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runSyntheticLoad } from "../run-synthetic-load-evidence.mjs";
import test from "node:test";

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");
const loadScript = join(repoRoot, "infra/public-beta/load-route-search.mjs");
const originScript = join(repoRoot, "infra/public-beta/verify-public-origin.mjs");
const previewEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-preview-evidence.mjs",
);
const accessibilityEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-accessibility-evidence.mjs",
);
const incidentReadinessEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-incident-readiness-evidence.mjs",
);
const privacySupportReadinessEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-privacy-support-readiness-evidence.mjs",
);
const claimsScanScript = join(repoRoot, "infra/public-beta/scan-public-claims.mjs");
const claimsReadinessEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-claims-readiness-evidence.mjs",
);
const loadReadinessEvidenceScript = join(
  repoRoot,
  "infra/public-beta/write-load-readiness-evidence.mjs",
);
const syntheticLoadRunnerScript = join(
  repoRoot,
  "infra/public-beta/run-synthetic-load-evidence.mjs",
);
const readinessScript = join(repoRoot, "infra/public-beta/validate-readiness.mjs");
const CLAIMS_METHODOLOGY_FILES = [
  "benchmarks/README.md",
  "benchmarks/docs/HUMAN_REVIEW.md",
  "benchmarks/docs/CI_QUALITY_GATES.md",
];
const CLAIMS_CANONICAL_NONCLAIM_FILES = [
  "docs/public-beta/LIMITATIONS.md",
  "apps/web/src/app/limitations/page.tsx",
];

const REQUIRED_GATES = [
  "hosted_private_beta",
  "load_p95",
  "preview_deployment",
  "production_rollback",
  "accessibility_core_flow",
  "incident_response",
  "public_origin_tls",
  "limitations_copy",
  "privacy_support_approval",
  "claims_discipline",
];

async function runNode(script, args = [], { timeout = 30_000, env = {} } = {}) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? 99 : error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function copyClaimsScanInputs(root) {
  await cp(join(repoRoot, "apps/web/src"), join(root, "apps/web/src"), {
    recursive: true,
  });
  await mkdir(join(root, "docs/public-beta"), { recursive: true });
  await cp(
    join(repoRoot, "docs/public-beta/LIMITATIONS.md"),
    join(root, "docs/public-beta/LIMITATIONS.md"),
  );
  for (const relativePath of CLAIMS_METHODOLOGY_FILES) {
    const destination = join(root, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(repoRoot, relativePath), destination);
  }
}

async function replaceCanonicalNonclaim(root, replacement) {
  for (const relativePath of CLAIMS_CANONICAL_NONCLAIM_FILES) {
    const filePath = join(root, relativePath);
    const text = await readFile(filePath, "utf8");
    await writeFile(filePath, text.replaceAll("does not claim to beat", replacement));
  }
}

async function replaceRenderedPageNonclaim(root, replacement) {
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  await writeFile(filePath, text.replaceAll("does not claim to beat", replacement));
}

async function removeRenderedPageNonclaimSentence(root) {
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  const replaced = text.replace(
    /BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper,\s+the MTA, or another product\./,
    "This page describes limitations.",
  );
  assert.notEqual(replaced, text);
  await writeFile(filePath, replaced);
}

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
}

function publicWebHeaders(nonce, overrides = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(self)",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-permitted-cross-domain-policies": "none",
    ...overrides,
  };
}

function publicOriginFixture({
  fixedNonce = false,
  omitFrame = false,
  largeLimitations = false,
  dataMode = "live",
} = {}) {
  let webRequests = 0;
  return (request, response) => {
    request.resume();
    if (request.url === "/" || request.url === "/limitations") {
      webRequests += 1;
      const nonce = fixedNonce ? "c2FtZS1ub25jZQ==" : Buffer.from(`nonce-${webRequests}`).toString("base64");
      const overrides = omitFrame ? { "x-frame-options": undefined } : {};
      const headers = Object.fromEntries(
        Object.entries(publicWebHeaders(nonce, overrides)).filter(([, value]) => value !== undefined),
      );
      response.writeHead(200, headers);
      if (request.url === "/") {
        response.end('<!doctype html><a href="/limitations">Public-beta limitations</a>');
      } else if (largeLimitations) {
        response.end("x".repeat(1024 * 1024 + 1));
      } else {
        response.end(
          "<!doctype html><h1>BetterMTA beta limitations</h1>" +
            "<p>NYC subway-first. No account is required. " +
            "BetterMTA does not claim to beat another product.</p>",
        );
      }
      return;
    }
    if (request.url === "/health/live" || request.url === "/health/ready") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ dataMode, staticDatasetVersion: "test-v1" }));
      return;
    }
    response.writeHead(404).end();
  };
}

function loadStatusBody(overrides = {}) {
  return canonicalLoadStatusBody(overrides);
}

function canonicalLoadStatusBody(overrides = {}) {
  return JSON.stringify({
    contractVersion: "2026-07-31",
    dataMode: "synthetic",
    staticDatasetVersion: "test-v1",
    realtimeSnapshotId: "rt-test-v1",
    realtimeAgeSeconds: 0,
    degraded: false,
    messages: [],
    ...overrides,
  });
}

test("bounded local load probe emits privacy-safe passing evidence", async () => {
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "a".repeat(40),
      "--requests",
      "8",
      "--concurrency",
      "2",
      "--warmup",
      "1",
      "--p95-ms",
      "2000",
      "--max-error-rate",
      "0",
    ]);

    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, "PASS");
    assert.equal(evidence.targetClass, "local");
    assert.equal(evidence.requestCount, 8);
    assert.equal(evidence.failureCount, 0);
    assert.equal(evidence.thresholds.p95Ms, 2000);
    assert.equal(evidence.releaseCommit, "a".repeat(40));
    assert.equal(evidence.dataMode, "synthetic");
    assert.match(evidence.snapshotFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(evidence.snapshotStable, true);
    assert(!result.stdout.includes(new URL(baseUrl).host));
  });
});

test("load probe fails when the allowed error rate is exceeded", async () => {
  let requests = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    requests += 1;
    response.writeHead(requests % 2 === 0 ? 503 : 200, {
      "content-type": "application/json",
    });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "b".repeat(40),
      "--requests",
      "6",
      "--concurrency",
      "2",
      "--warmup",
      "0",
      "--max-error-rate",
      "0",
    ]);

    assert.equal(result.code, 1);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, "FAIL");
    assert(evidence.failureCount > 0);
  });
});

test("load probe refuses insecure remote targets without exposing the hostname", async () => {
  const result = await runNode(loadScript, [
    "--base-url",
    "http://private.example.invalid",
    "--release-commit",
    "c".repeat(40),
    "--requests",
    "1",
    "--concurrency",
    "1",
  ]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /HTTPS|remote target/i);
  assert(!result.stderr.includes("private.example.invalid"));
});

test("load probe bounds response bodies instead of buffering an endless response", async () => {
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    const chunk = "x".repeat(64 * 1024);
    const timer = setInterval(() => response.write(chunk), 2);
    response.once("close", () => clearInterval(timer));
  }, async (baseUrl) => {
    const result = await runNode(
      loadScript,
      [
        "--base-url",
        baseUrl,
        "--release-commit",
        "d".repeat(40),
        "--requests",
        "1",
        "--concurrency",
        "1",
        "--warmup",
        "0",
      ],
      { timeout: 3_000 },
    );

    assert.equal(result.code, 1, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.failureKinds.response_too_large, 1);
  });
});

test("load probe rejects missing or hostile release commits without reflection", async () => {
  const missing = await runNode(loadScript, [
    "--base-url",
    "http://127.0.0.1:8080",
  ]);
  assert.equal(missing.code, 2);
  assert.equal(missing.stdout, "");
  assert.equal(missing.stderr, "ERROR invalid_arguments\n");

  const hostile = "A".repeat(39) + "!\nprivate.example.invalid";
  const malformed = await runNode(loadScript, [
    "--base-url",
    "http://127.0.0.1:8080",
    "--release-commit",
    hostile,
  ]);
  assert.equal(malformed.code, 2);
  assert.equal(malformed.stdout, "");
  assert.equal(malformed.stderr, "ERROR invalid_arguments\n");
  assert(!malformed.stderr.includes("private.example.invalid"));
});

test("load probe fails closed when the status snapshot changes", async () => {
  let statusReads = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      statusReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody({
        staticDatasetVersion: statusReads === 1 ? "test-v1" : "test-v2",
      }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "e".repeat(40),
      "--requests",
      "2",
      "--concurrency",
      "1",
      "--warmup",
      "0",
      "--max-error-rate",
      "0",
    ]);
    assert.equal(result.code, 1);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, "FAIL");
    assert.equal(evidence.failureKinds.snapshot_changed, 1);
    assert.equal(evidence.snapshotStable, false);
    assert(!result.stdout.includes(new URL(baseUrl).host));
  });
});

test("load probe rejects missing or malformed status without reflecting response data", async () => {
  for (const statusResponse of [null, "{\"dataMode\":\"synthetic\",\"staticDatasetVersion\":\"bad\\nprivate.example.invalid\"}"]) {
    await withServer((request, response) => {
      request.resume();
      if (request.url === "/v1/status") {
        if (statusResponse === null) {
          response.writeHead(404, { "content-type": "application/json" });
          response.end("{}");
        } else {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(statusResponse);
        }
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    }, async (baseUrl) => {
      const result = await runNode(loadScript, [
        "--base-url",
        baseUrl,
        "--release-commit",
        "f".repeat(40),
        "--requests",
        "1",
        "--concurrency",
        "1",
        "--warmup",
        "0",
      ]);
      assert.equal(result.code, 1);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.status, "FAIL");
      assert.equal(evidence.failureKinds.status_missing_or_malformed, 1);
      assert(!result.stdout.includes("private.example.invalid"));
    });
  }
});

test("load probe refuses a redirected status response without contacting the second origin", async () => {
  let secondOriginHits = 0;
  await withServer((request, response) => {
    secondOriginHits += 1;
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(canonicalLoadStatusBody());
  }, async (secondBaseUrl) => {
    await withServer((request, response) => {
      request.resume();
      if (request.url === "/v1/status") {
        response.writeHead(302, { location: `${secondBaseUrl}/v1/status` });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    }, async (baseUrl) => {
      const result = await runNode(loadScript, [
        "--base-url",
        baseUrl,
        "--release-commit",
        "1".repeat(40),
        "--requests",
        "1",
        "--concurrency",
        "1",
        "--warmup",
        "0",
      ]);
      assert.equal(result.code, 1);
      assert.equal(secondOriginHits, 0);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.failureKinds.status_missing_or_malformed, 1);
      assert(!result.stdout.includes(new URL(secondBaseUrl).host));
    });
  });
});

test("load probe refuses a redirected route response without contacting the second origin", async () => {
  let secondOriginRouteHits = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.method === "POST" && request.url === "/v1/routes/search") {
      secondOriginRouteHits += 1;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (secondBaseUrl) => {
    await withServer((request, response) => {
      request.resume();
      if (request.url === "/v1/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(loadStatusBody());
        return;
      }
      if (request.method === "POST" && request.url === "/v1/routes/search") {
        response.writeHead(302, { location: `${secondBaseUrl}/v1/routes/search` });
        response.end();
        return;
      }
      response.writeHead(404).end();
    }, async (baseUrl) => {
      const result = await runNode(loadScript, [
        "--base-url",
        baseUrl,
        "--release-commit",
        "2".repeat(40),
        "--requests",
        "1",
        "--concurrency",
        "1",
        "--warmup",
        "0",
      ]);
      assert.equal(result.code, 1);
      assert.equal(secondOriginRouteHits, 0);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.failureKinds.network, 1);
      assert(!result.stdout.includes(new URL(secondBaseUrl).host));
    });
  });
});

test("load probe fails on a bounded route timeout while retaining fixed failure kinds", async () => {
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    setTimeout(() => response.end("{}"), 100);
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "1".repeat(40),
      "--requests",
      "1",
      "--concurrency",
      "1",
      "--warmup",
      "0",
      "--timeout-ms",
      "100",
    ]);
    assert.equal(result.code, 1);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.failureKinds.timeout, 1);
  });
});

test("load probe accepts a serialized fixture body at the exact request-size limit", async () => {
  const maxBodyBytes = 1024 * 1024;
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-fixture-boundary-"));
  const fixturePath = join(root, "fixture.json");
  const emptyPayload = JSON.stringify({ payload: "" });
  const fixture = JSON.stringify({
    payload: "x".repeat(maxBodyBytes - Buffer.byteLength(emptyPayload)),
  });
  assert.equal(Buffer.byteLength(fixture), maxBodyBytes);
  await writeFile(fixturePath, fixture);
  let routeBodyBytes = 0;
  await withServer((request, response) => {
    if (request.url === "/v1/status") {
      request.resume();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    request.on("data", (chunk) => {
      routeBodyBytes += chunk.length;
    });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--fixture",
      fixturePath,
      "--release-commit",
      "3".repeat(40),
      "--requests",
      "1",
      "--concurrency",
      "1",
      "--warmup",
      "0",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(routeBodyBytes, maxBodyBytes);
  });
  await rm(root, { recursive: true, force: true });
});

test("load probe rejects a fixture one byte over the request-size limit before any fetch", async () => {
  const maxFixtureBytes = 1024 * 1024;
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-fixture-oversize-"));
  const fixturePath = join(root, "fixture.json");
  const prefix = JSON.stringify({ payload: "x" });
  await writeFile(fixturePath, `${prefix}${" ".repeat(maxFixtureBytes + 1 - Buffer.byteLength(prefix))}`);
  let fetches = 0;
  await withServer((request, response) => {
    fetches += 1;
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(loadStatusBody());
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--fixture",
      fixturePath,
      "--release-commit",
      "4".repeat(40),
      "--requests",
      "1",
      "--concurrency",
      "1",
      "--warmup",
      "0",
    ]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR invalid_arguments\n");
    assert.equal(fetches, 0);
  });
  await rm(root, { recursive: true, force: true });
});

test("load probe accepts the complete canonical status and excludes dynamic health fields from snapshot identity", async () => {
  let statusReads = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      statusReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(canonicalLoadStatusBody({
        realtimeAgeSeconds: statusReads,
        messages: [`bounded diagnostic ${statusReads}`],
      }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "8".repeat(40),
      "--requests",
      "2",
      "--concurrency",
      "1",
      "--warmup",
      "0",
    ]);
    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.dataMode, "synthetic");
    assert.equal(evidence.snapshotStable, true);
  });
});

test("load probe does not call a degraded canonical status healthy", async () => {
  let routeRequests = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(canonicalLoadStatusBody({ degraded: true, messages: ["degraded"] }));
      return;
    }
    routeRequests += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "8".repeat(40),
      "--requests",
      "1",
      "--concurrency",
      "1",
      "--warmup",
      "0",
    ]);
    assert.equal(result.code, 1);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.statusChecks.before, "degraded");
    assert.equal(evidence.failureKinds.status_degraded, 1);
    assert.equal(routeRequests, 0);
  });
});

test("load probe rejects extra canonical status fields without reflecting their values", async () => {
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(canonicalLoadStatusBody({
        hostileExtra: "private.example.invalid",
      }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "9".repeat(40),
      "--requests",
      "1",
      "--concurrency",
      "1",
      "--warmup",
      "0",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /status_missing_or_malformed/);
    assert(!result.stdout.includes("private.example.invalid"));
  });
});

test("load p95 gating includes a slow failed request at the exact allowed error-rate boundary", async () => {
  let routeRequests = 0;
  await withServer((request, response) => {
    request.resume();
    if (request.url === "/v1/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(loadStatusBody());
      return;
    }
    routeRequests += 1;
    if (routeRequests === 100) {
      setTimeout(() => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end("{}");
      }, 100);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
      "--release-commit",
      "a".repeat(40),
      "--requests",
      "100",
      "--concurrency",
      "1",
      "--warmup",
      "0",
      "--p95-ms",
      "50",
      "--max-error-rate",
      "0.01",
      "--timeout-ms",
      "500",
    ]);
    assert.equal(result.code, 1);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.errorRate, 0.01);
    assert.equal(evidence.failureCount, 1);
  });
});

test("load readiness writer emits synthetic pending, gate-ineligible evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-writer-"));
  const probePath = join(root, "probe.json");
  const releaseCommit = "2".repeat(40);
  await writeFile(probePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-08-05T00:00:00.000Z",
    status: "PASS",
    targetClass: "local",
    releaseCommit,
    routePath: "/v1/routes/search",
    requestCount: 100,
    concurrency: 5,
    warmupCount: 5,
    elapsedMs: 50,
    successCount: 100,
    failureCount: 0,
    errorRate: 0,
    p50Ms: 1,
    p95Ms: 2,
    p99Ms: 3,
    thresholds: { p95Ms: 2000, maxErrorRate: 0.01 },
    failureKinds: {},
    dataMode: "synthetic",
    snapshotFingerprint: "3".repeat(64),
    snapshotStable: true,
    statusChecks: { before: "pass", after: "pass" },
  }) + "\n");
  const result = await runNode(loadReadinessEvidenceScript, [
    "--probe",
    probePath,
    "--release-commit",
    releaseCommit,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual({
    schemaVersion: evidence.schemaVersion,
    status: evidence.status,
    evidenceClass: evidence.evidenceClass,
    gateId: evidence.gateId,
    probeClass: evidence.probeClass,
    targetApprovalStatus: evidence.targetApprovalStatus,
    dataSnapshotStatus: evidence.dataSnapshotStatus,
    releaseCommit: evidence.releaseCommit,
    dataMode: evidence.dataMode,
    snapshotFingerprint: evidence.snapshotFingerprint,
    eligibleForGatePass: evidence.eligibleForGatePass,
    productionMutation: evidence.productionMutation,
    betaCapacityEvidence: evidence.betaCapacityEvidence,
  }, {
    schemaVersion: 1,
    status: "SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING",
    evidenceClass: "ci-load-p95-readiness",
    gateId: "load_p95",
    probeClass: "synthetic-local",
    targetApprovalStatus: "pending",
    dataSnapshotStatus: "synthetic",
    releaseCommit,
    dataMode: "synthetic",
    snapshotFingerprint: "3".repeat(64),
    eligibleForGatePass: false,
    productionMutation: false,
    betaCapacityEvidence: false,
  });
  assert.equal(evidence.requestCount, 100);
  assert.equal(evidence.p95Ms, 2);
  assert.match(evidence.generatedAt, /^2026|^20/);
  assert(!/https?:|hostname|url|private.example/i.test(result.stdout));
});

test("load readiness writer rejects malformed or hostile probe inputs without reflection", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-writer-invalid-"));
  const releaseCommit = "4".repeat(40);
  const baseProbe = {
    schemaVersion: 1,
    generatedAt: "2026-08-05T00:00:00.000Z",
    status: "PASS",
    targetClass: "local",
    releaseCommit,
    routePath: "/v1/routes/search",
    requestCount: 100,
    concurrency: 5,
    warmupCount: 5,
    elapsedMs: 50,
    successCount: 100,
    failureCount: 0,
    errorRate: 0,
    p50Ms: 1,
    p95Ms: 2,
    p99Ms: 3,
    thresholds: { p95Ms: 2000, maxErrorRate: 0.01 },
    dataMode: "synthetic",
    snapshotFingerprint: "5".repeat(64),
    snapshotStable: true,
    statusChecks: { before: "pass", after: "pass" },
  };
  for (const [name, probe, expected] of [
    ["hostile", { ...baseProbe, releaseCommit: "bad\nprivate.example.invalid" }, "invalid_arguments"],
    ["changed", { ...baseProbe, snapshotStable: false }, "invalid_probe"],
    ["threshold", { ...baseProbe, p95Ms: 2000 }, "invalid_probe"],
    ["non-monotonic", { ...baseProbe, p50Ms: 3, p95Ms: 2, p99Ms: 4 }, "invalid_probe"],
  ]) {
    const probePath = join(root, `${name}.json`);
    await writeFile(probePath, JSON.stringify(probe));
    const result = await runNode(loadReadinessEvidenceScript, [
      "--probe",
      probePath,
      "--release-commit",
      releaseCommit,
    ]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${name === "hostile" ? "invalid_probe" : expected}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("load readiness writer rejects unexpected top-level and nested probe keys without reflection", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-writer-schema-"));
  const releaseCommit = "b".repeat(40);
  const baseProbe = {
    schemaVersion: 1,
    generatedAt: "2026-08-05T00:00:00.000Z",
    status: "PASS",
    targetClass: "local",
    releaseCommit,
    routePath: "/v1/routes/search",
    dataMode: "synthetic",
    snapshotFingerprint: "6".repeat(64),
    snapshotStable: true,
    statusChecks: { before: "pass", after: "pass" },
    requestCount: 100,
    concurrency: 5,
    warmupCount: 5,
    elapsedMs: 50,
    successCount: 100,
    failureCount: 0,
    errorRate: 0,
    p50Ms: 1,
    p95Ms: 2,
    p99Ms: 3,
    thresholds: { p95Ms: 2000, maxErrorRate: 0.01 },
    failureKinds: {},
  };
  for (const [name, probe] of [
    ["top-level", { ...baseProbe, hostile: "private.example.invalid" }],
    ["thresholds", { ...baseProbe, thresholds: { ...baseProbe.thresholds, hostile: "private.example.invalid" } }],
    ["status-checks", { ...baseProbe, statusChecks: { ...baseProbe.statusChecks, hostile: "private.example.invalid" } }],
    ["failure-kinds", { ...baseProbe, failureKinds: { hostile: "private.example.invalid" } }],
  ]) {
    const probePath = join(root, `${name}.json`);
    await writeFile(probePath, JSON.stringify(probe));
    const result = await runNode(loadReadinessEvidenceScript, [
      "--probe",
      probePath,
      "--release-commit",
      releaseCommit,
    ]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR invalid_probe\n");
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("synthetic load runner emits only probe and pending result artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-"));
  const releaseCommit = "6".repeat(40);
  const result = await runNode(syntheticLoadRunnerScript, [
    "--release-commit",
    releaseCommit,
    "--output-dir",
    root,
  ], { timeout: 30_000 });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.deepEqual(await (await import("node:fs/promises")).readdir(root), ["probe.json", "result.json"]);
  const probe = JSON.parse(await readFile(join(root, "probe.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "result.json"), "utf8"));
  assert.equal(probe.releaseCommit, releaseCommit);
  assert.equal(probe.requestCount, 100);
  assert.equal(probe.targetClass, "local");
  assert.equal(evidence.status, "SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING");
  assert.equal(evidence.eligibleForGatePass, false);
  assert.equal(evidence.betaCapacityEvidence, false);
  assert(!/127[.]0[.]0[.]1|localhost|https?:|hostname|url/i.test(JSON.stringify({ probe, evidence })));
});

test("synthetic load runner rejects non-absolute output paths without reflection", async () => {
  const hostile = "relative\nprivate.example.invalid";
  const result = await runNode(syntheticLoadRunnerScript, [
    "--release-commit",
    "7".repeat(40),
    "--output-dir",
    hostile,
  ]);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR invalid_arguments\n");
  assert(!result.stderr.includes("private.example.invalid"));
});

test("synthetic load runner removes staged and partial artifacts after deterministic failure injection", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-failure-"));
  await assert.rejects(
    runSyntheticLoad({ outputDir: root, releaseCommit: "c".repeat(40) }, { failureAt: "after-probe" }),
    /injected failure/,
  );
  assert.deepEqual(await (await import("node:fs/promises")).readdir(root), []);
});

test("synthetic load runner cleans every injected pre-publication failure phase", async () => {
  for (const phase of [
    "probe",
    "writer",
    "validation",
    "write",
    "publication",
    "after-probe",
    "before-result",
    "after-result",
  ]) {
    const root = await mkdtemp(join(tmpdir(), `bettermta-load-runner-${phase}-`));
    const outputDir = join(root, "output");
    await mkdir(outputDir);
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "5".repeat(40) },
        { failureAt: phase },
      ),
      /injected failure/,
      phase,
    );
    assert.deepEqual(await readdir(outputDir), [], phase);
    assert.deepEqual(
      (await readdir(root)).filter((entry) => entry.includes(".stage-")),
      [],
      phase,
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner rejects a symlinked final output directory without following it", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-symlink-"));
  const target = join(root, "target");
  const output = join(root, "output");
  await mkdir(target);
  await symlink(target, output, "dir");
  const result = await runNode(syntheticLoadRunnerScript, [
    "--release-commit",
    "d".repeat(40),
    "--output-dir",
    output,
  ]);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR invalid_arguments\n");
  assert.deepEqual(await (await import("node:fs/promises")).readdir(target), []);
});

test("synthetic load runner permits a legitimate macOS /tmp ancestor", async () => {
  const root = await mkdtemp(join("/tmp", "bettermta-load-runner-tmp-"));
  try {
    const result = await runNode(syntheticLoadRunnerScript, [
      "--release-commit",
      "e".repeat(40),
      "--output-dir",
      root,
    ], { timeout: 30_000 });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await (await import("node:fs/promises")).readdir(root), ["probe.json", "result.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner safely replaces a final output symlink swapped before publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-swap-"));
  const outputDir = join(root, "output");
  const targetDir = join(root, "symlink-target");
  await mkdir(outputDir);
  await mkdir(targetDir);
  let swapped = false;
  let publication = "success";
  try {
    await runSyntheticLoad(
      { outputDir, releaseCommit: "6".repeat(40) },
      {
        beforePublish: async ({ outputDir: swappedOutputDir }) => {
          await rmdir(swappedOutputDir);
          await symlink(targetDir, swappedOutputDir, "dir");
          swapped = true;
        },
      },
    );
  } catch (error) {
    publication = "failed";
    assert.equal(error.message, "synthetic publication failed");
  }
  assert.equal(swapped, true);
  const outputStats = await lstat(outputDir);
  assert.equal(outputStats.isSymbolicLink(), false);
  assert.deepEqual(
    await readdir(outputDir),
    publication === "success" ? ["probe.json", "result.json"] : [],
  );
  assert.deepEqual(await readdir(targetDir), []);
  assert.deepEqual(
    (await readdir(root)).filter((entry) => entry.includes(".stage-")),
    [],
  );
  await rm(root, { recursive: true, force: true });
});

test("synthetic load runner restores an empty real directory after a symlink swap and failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-symlink-failure-"));
  const outputDir = join(root, "output");
  const targetDir = join(root, "symlink-target");
  await mkdir(outputDir);
  await mkdir(targetDir);
  let swapped = false;
  try {
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "7".repeat(40) },
        {
          failureAt: "publication",
          beforePublish: async ({ outputDir: swappedOutputDir }) => {
            await rmdir(swappedOutputDir);
            await symlink(targetDir, swappedOutputDir, "dir");
            swapped = true;
          },
        },
      ),
      (error) => error.message === "injected failure",
    );
    assert.equal(swapped, true);
    const outputStats = await lstat(outputDir);
    assert.equal(outputStats.isDirectory(), true);
    assert.equal(outputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual(await readdir(targetDir), []);
    assert.deepEqual((await readdir(root)).filter((entry) => entry.includes(".stage-")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner restores an empty real directory after a regular-file swap and failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-file-failure-"));
  const outputDir = join(root, "output");
  await mkdir(outputDir);
  let swapped = false;
  try {
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "8".repeat(40) },
        {
          failureAt: "publication",
          beforePublish: async ({ outputDir: swappedOutputDir }) => {
            await rmdir(swappedOutputDir);
            await writeFile(swappedOutputDir, "hostile replacement");
            swapped = true;
          },
        },
      ),
      (error) => error.message === "injected failure",
    );
    assert.equal(swapped, true);
    const outputStats = await lstat(outputDir);
    assert.equal(outputStats.isDirectory(), true);
    assert.equal(outputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual((await readdir(root)).filter((entry) => entry.includes(".stage-")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner quarantines a non-empty final output on publication failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-nonempty-output-"));
  const outputDir = join(root, "output");
  try {
    await mkdir(outputDir);
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "a".repeat(40) },
        {
          beforePublish: async ({ outputDir: hostileOutputDir }) => {
            await writeFile(join(hostileOutputDir, "hostile.json"), "hostile");
          },
        },
      ),
      (error) => error.message === "synthetic publication failed",
    );
    const outputStats = await lstat(outputDir);
    assert.equal(outputStats.isDirectory(), true);
    assert.equal(outputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual(
      (await readdir(root)).filter(
        (entry) => entry.includes(".stage-") || entry.includes(".quarantine-"),
      ),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner cleans the anchored parent after a renamed and replaced parent swap", async () => {
  const container = await mkdtemp(join(tmpdir(), "bettermta-load-runner-parent-swap-"));
  const root = join(container, "parent");
  await mkdir(root);
  const outputDir = join(root, "output");
  const movedParent = join(container, "moved-parent");
  await mkdir(outputDir);
  let swapped = false;
  try {
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "9".repeat(40) },
        {
          failureAt: "publication",
          beforePublish: async () => {
            await rename(root, movedParent);
            await mkdir(root);
            swapped = true;
          },
        },
      ),
      (error) => error.message === "synthetic output parent changed",
    );
    assert.equal(swapped, true);
    const anchoredOutputStats = await lstat(join(movedParent, "output"));
    assert.equal(anchoredOutputStats.isDirectory(), true);
    assert.equal(anchoredOutputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(join(movedParent, "output")), []);
    assert.deepEqual(
      (await readdir(movedParent)).filter((entry) => entry.includes(".stage-")),
      [],
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});

test("synthetic load runner rejects an unexpected staged file added after pre-publication validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-inventory-race-"));
  const outputDir = join(root, "output");
  await mkdir(outputDir);
  try {
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "a".repeat(40) },
        {
          beforePublish: async ({ stageDir }) => {
            await writeFile(join(stageDir, "unexpected.json"), "{}");
          },
        },
      ),
      (error) => error.message === "synthetic artifact inventory failed",
    );
    const outputStats = await lstat(outputDir);
    assert.equal(outputStats.isDirectory(), true);
    assert.equal(outputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual((await readdir(root)).filter((entry) => entry.includes(".stage-")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner rejects a result schema mutation after pre-publication validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-result-race-"));
  const outputDir = join(root, "output");
  await mkdir(outputDir);
  try {
    await assert.rejects(
      runSyntheticLoad(
        { outputDir, releaseCommit: "b".repeat(40) },
        {
          beforePublish: async ({ stageDir }) => {
            const resultPath = join(stageDir, "result.json");
            const result = JSON.parse(await readFile(resultPath, "utf8"));
            result.unexpected = "hostile";
            await writeFile(resultPath, `${JSON.stringify(result)}\n`);
          },
        },
      ),
      (error) => error.message === "synthetic artifact inventory failed",
    );
    const outputStats = await lstat(outputDir);
    assert.equal(outputStats.isDirectory(), true);
    assert.equal(outputStats.isSymbolicLink(), false);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual((await readdir(root)).filter((entry) => entry.includes(".stage-")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner serializes concurrent calls without touching the rejected output", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-concurrent-"));
  const firstOutput = join(root, "first-output");
  const secondOutput = join(root, "second-output");
  await mkdir(firstOutput);
  let releaseHook;
  let enteredResolve;
  const entered = new Promise((resolve) => {
    enteredResolve = resolve;
  });
  const hold = new Promise((resolve) => {
    releaseHook = resolve;
  });
  const first = runSyntheticLoad(
    { outputDir: firstOutput, releaseCommit: "c".repeat(40) },
    {
      beforePublish: async () => {
        enteredResolve();
        await hold;
      },
    },
  );
  try {
    await entered;
    await assert.rejects(
      runSyntheticLoad({ outputDir: secondOutput, releaseCommit: "d".repeat(40) }),
      (error) => error.message === "synthetic load runner already active",
    );
    const activeEntries = await readdir(root);
    assert.equal(activeEntries.includes("second-output"), false);
    assert.equal(
      activeEntries.some(
        (entry) => entry.includes(".stage-") && !entry.startsWith("first-output.stage-"),
      ),
      false,
    );
    releaseHook();
    await first;
    assert.deepEqual(await readdir(firstOutput), ["probe.json", "result.json"]);
    assert.equal(process.cwd().includes(root), false);
  } finally {
    releaseHook();
    await first.catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic load runner recovers a cwd-changing publication hook before relative cleanup and publish", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-cwd-hook-"));
  const outputDir = join(root, "output");
  const unrelated = await mkdtemp(join(tmpdir(), "bettermta-load-runner-unrelated-"));
  const originalCwd = process.cwd();
  await mkdir(outputDir);
  try {
    await runSyntheticLoad(
      { outputDir, releaseCommit: "e".repeat(40) },
      {
        beforePublish: async () => {
          process.chdir(unrelated);
        },
      },
    );
    assert.deepEqual(await readdir(outputDir), ["probe.json", "result.json"]);
    assert.deepEqual(await readdir(unrelated), []);
    assert.equal(process.cwd(), originalCwd);
  } finally {
    try {
      process.chdir(originalCwd);
    } catch {
      // Preserve the primary test failure if cwd restoration is unavailable.
    }
    await rm(root, { recursive: true, force: true });
    await rm(unrelated, { recursive: true, force: true });
  }
});

test("synthetic load runner rejects semantic cross-file mutations after pre-publication validation", async () => {
  const mutations = [
    ["invalid probe timestamp", async (stageDir) => {
      const probePath = join(stageDir, "probe.json");
      const probe = JSON.parse(await readFile(probePath, "utf8"));
      probe.generatedAt = "not-a-date";
      await writeFile(probePath, `${JSON.stringify(probe)}\n`);
    }],
    ["negative result metric", async (stageDir) => {
      const resultPath = join(stageDir, "result.json");
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      result.metrics.successCount = -1;
      await writeFile(resultPath, `${JSON.stringify(result)}\n`);
    }],
    ["different result fingerprint", async (stageDir) => {
      const resultPath = join(stageDir, "result.json");
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      result.snapshotFingerprint = "f".repeat(64);
      await writeFile(resultPath, `${JSON.stringify(result)}\n`);
    }],
    ["cross-file release commit mismatch", async (stageDir) => {
      const resultPath = join(stageDir, "result.json");
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      result.releaseCommit = "a".repeat(40);
      await writeFile(resultPath, `${JSON.stringify(result)}\n`);
    }],
  ];
  for (const [label, mutate] of mutations) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-semantic-race-"));
    const outputDir = join(root, "output");
    await mkdir(outputDir);
    try {
      await assert.rejects(
        runSyntheticLoad(
          { outputDir, releaseCommit: "f".repeat(40) },
          { beforePublish: async ({ stageDir }) => mutate(stageDir) },
        ),
        (error) => error.message === "synthetic artifact inventory failed",
        label,
      );
      const outputStats = await lstat(outputDir);
      assert.equal(outputStats.isDirectory(), true, label);
      assert.equal(outputStats.isSymbolicLink(), false, label);
      assert.deepEqual(await readdir(outputDir), [], label);
      assert.deepEqual(
        (await readdir(root)).filter((entry) => entry.includes(".stage-")),
        [],
        label,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("public-origin verifier emits commit-bound privacy-safe local evidence", async () => {
  await withServer(publicOriginFixture(), async (baseUrl) => {
    const result = await runNode(originScript, [
      "--web-url",
      baseUrl,
      "--api-url",
      baseUrl,
      "--release-commit",
      "a".repeat(40),
      "--timeout-ms",
      "2000",
    ]);

    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, "LOCAL_CHECK_PASS");
    assert.equal(evidence.targetClass, "local");
    assert.equal(evidence.releaseCommit, "a".repeat(40));
    assert.equal(evidence.failureCount, 0);
    assert.deepEqual(evidence.failureCodes, []);
    assert.equal(evidence.eligibleForPublicOriginEvidence, false);
    assert(!result.stdout.includes(new URL(baseUrl).host));
  });
});

test("public-origin verifier refuses insecure or unconfirmed remote targets without hostname leakage", async () => {
  for (const args of [
    [
      "--web-url",
      "http://private.example.invalid",
      "--api-url",
      "http://api.example.invalid",
    ],
    [
      "--web-url",
      "https://private.example.invalid",
      "--api-url",
      "https://api.example.invalid",
    ],
  ]) {
    const result = await runNode(originScript, [
      ...args,
      "--release-commit",
      "b".repeat(40),
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /HTTPS|confirm-target/i);
    assert(!result.stderr.includes("private.example.invalid"));
    assert(!result.stderr.includes("api.example.invalid"));
  }
});

test("public-origin verifier fails closed on missing headers and nonce reuse", async () => {
  await withServer(
    publicOriginFixture({ fixedNonce: true, omitFrame: true }),
    async (baseUrl) => {
      const result = await runNode(originScript, [
        "--web-url",
        baseUrl,
        "--api-url",
        baseUrl,
        "--release-commit",
        "c".repeat(40),
      ]);

      assert.equal(result.code, 1, result.stderr);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.status, "FAIL");
      assert(evidence.failureCodes.includes("web:root:x-frame-options"));
      assert(evidence.failureCodes.includes("web:limitations:x-frame-options"));
      assert(evidence.failureCodes.includes("web:csp:nonce-not-rotated"));
      assert(!result.stdout.includes(new URL(baseUrl).host));
    },
  );
});

test("public-origin verifier bounds response bodies", async () => {
  await withServer(
    publicOriginFixture({ largeLimitations: true }),
    async (baseUrl) => {
      const result = await runNode(originScript, [
        "--web-url",
        baseUrl,
        "--api-url",
        baseUrl,
        "--release-commit",
        "d".repeat(40),
      ]);

      assert.equal(result.code, 1, result.stderr);
      const evidence = JSON.parse(result.stdout);
      assert(evidence.failureCodes.includes("web:limitations:response-too-large"));
      assert(!result.stdout.includes(new URL(baseUrl).host));
    },
  );
});

test("public-origin verifier never reflects an unexpected data mode", async () => {
  await withServer(
    publicOriginFixture({ dataMode: "unexpected\nprivate.example.invalid" }),
    async (baseUrl) => {
      const result = await runNode(originScript, [
        "--web-url",
        baseUrl,
        "--api-url",
        baseUrl,
        "--release-commit",
        "e".repeat(40),
      ]);

      assert.equal(result.code, 1, result.stderr);
      const evidence = JSON.parse(result.stdout);
      assert.equal(evidence.dataMode, "invalid");
      assert(evidence.failureCodes.includes("api:status:data-mode"));
      assert(!result.stdout.includes("private.example.invalid"));
    },
  );
});

test("preview evidence binds a passing runner-local container to commit and image", async () => {
  const releaseCommit = "a".repeat(40);
  const imageId = `sha256:${"b".repeat(64)}`;
  const result = await runNode(previewEvidenceScript, [
    "--release-commit",
    releaseCommit,
    "--image-id",
    imageId,
    "--smoke-status",
    "pass",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      previewClass: evidence.previewClass,
      releaseCommit: evidence.releaseCommit,
      imageId: evidence.imageId,
      smokeStatus: evidence.smokeStatus,
      productionMutation: evidence.productionMutation,
      externalReachabilityVerified: evidence.externalReachabilityVerified,
    },
    {
      schemaVersion: 1,
      status: "PASS",
      previewClass: "ci-runner-local-production-container",
      releaseCommit,
      imageId,
      smokeStatus: "pass",
      productionMutation: false,
      externalReachabilityVerified: false,
    },
  );
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|hostname|url/i.test(result.stdout));
});

test("preview evidence rejects malformed identifiers without reflecting them", async () => {
  const hostile = "invalid\nprivate.example.invalid";
  for (const { args, errorCode } of [
    {
      args: [
        "--release-commit",
        hostile,
        "--image-id",
        `sha256:${"b".repeat(64)}`,
        "--smoke-status",
        "pass",
      ],
      errorCode: "invalid_release_commit",
    },
    {
      args: [
        "--release-commit",
        "a".repeat(40),
        "--image-id",
        hostile,
        "--smoke-status",
        "pass",
      ],
      errorCode: "invalid_image_id",
    },
  ]) {
    const result = await runNode(previewEvidenceScript, args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${errorCode}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("accessibility evidence records automated pass while human review stays pending", async () => {
  const releaseCommit = "c".repeat(40);
  const result = await runNode(accessibilityEvidenceScript, [
    "--release-commit",
    releaseCommit,
    "--suite-status",
    "pass",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      evidenceClass: evidence.evidenceClass,
      gateId: evidence.gateId,
      releaseCommit: evidence.releaseCommit,
      checks: evidence.checks,
      humanReviewStatus: evidence.humanReviewStatus,
      eligibleForGatePass: evidence.eligibleForGatePass,
      productionMutation: evidence.productionMutation,
    },
    {
      schemaVersion: 1,
      status: "AUTOMATED_PASS_HUMAN_PENDING",
      evidenceClass: "ci-mocked-live-accessibility",
      gateId: "accessibility_core_flow",
      releaseCommit,
      checks: [
        "keyboard-only-core-flow",
        "mobile-44px-targets",
        "axe-wcag2a-wcag2aa",
      ],
      humanReviewStatus: "pending",
      eligibleForGatePass: false,
      productionMutation: false,
    },
  );
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|hostname|url/i.test(result.stdout));
});

test("accessibility evidence rejects malformed inputs without reflecting them", async () => {
  const hostile = "invalid\nprivate.example.invalid";
  for (const { args, errorCode } of [
    {
      args: [
        "--release-commit",
        hostile,
        "--suite-status",
        "pass",
      ],
      errorCode: "invalid_release_commit",
    },
    {
      args: [
        "--release-commit",
        "c".repeat(40),
        "--suite-status",
        hostile,
      ],
      errorCode: "invalid_suite_status",
    },
  ]) {
    const result = await runNode(accessibilityEvidenceScript, args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${errorCode}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("incident readiness evidence keeps owner approval and tabletop drill pending", async () => {
  const releaseCommit = "d".repeat(40);
  const result = await runNode(incidentReadinessEvidenceScript, [
    "--release-commit",
    releaseCommit,
    "--playbook-status",
    "pass",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      evidenceClass: evidence.evidenceClass,
      gateId: evidence.gateId,
      releaseCommit: evidence.releaseCommit,
      checks: evidence.checks,
      rotaStatus: evidence.rotaStatus,
      channelStatus: evidence.channelStatus,
      tabletopDrillStatus: evidence.tabletopDrillStatus,
      eligibleForGatePass: evidence.eligibleForGatePass,
      productionMutation: evidence.productionMutation,
    },
    {
      schemaVersion: 1,
      status: "PLAYBOOK_PASS_ROTA_DRILL_PENDING",
      evidenceClass: "ci-incident-playbook-readiness",
      gateId: "incident_response",
      releaseCommit,
      checks: [
        "detection-severity-roles",
        "stop-response-recovery",
        "privacy-safe-communications-evidence",
      ],
      rotaStatus: "pending_owner_approval",
      channelStatus: "pending_owner_approval",
      tabletopDrillStatus: "pending",
      eligibleForGatePass: false,
      productionMutation: false,
    },
  );
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|hostname|url/i.test(result.stdout));
});

test("incident readiness evidence rejects malformed inputs without reflecting them", async () => {
  const hostile = "invalid\nprivate.example.invalid";
  for (const { args, errorCode } of [
    {
      args: [
        "--release-commit",
        hostile,
        "--playbook-status",
        "pass",
      ],
      errorCode: "invalid_release_commit",
    },
    {
      args: [
        "--release-commit",
        "d".repeat(40),
        "--playbook-status",
        hostile,
      ],
      errorCode: "invalid_playbook_status",
    },
  ]) {
    const result = await runNode(incidentReadinessEvidenceScript, args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${errorCode}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("privacy support evidence keeps policy, retention, channel, and owner approval pending", async () => {
  const releaseCommit = "e".repeat(40);
  const result = await runNode(privacySupportReadinessEvidenceScript, [
    "--release-commit",
    releaseCommit,
    "--controls-status",
    "pass",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      evidenceClass: evidence.evidenceClass,
      gateId: evidence.gateId,
      releaseCommit: evidence.releaseCommit,
      checks: evidence.checks,
      policyApprovalStatus: evidence.policyApprovalStatus,
      retentionEnforcementStatus: evidence.retentionEnforcementStatus,
      supportChannelStatus: evidence.supportChannelStatus,
      responseOwnerStatus: evidence.responseOwnerStatus,
      eligibleForGatePass: evidence.eligibleForGatePass,
      productionMutation: evidence.productionMutation,
    },
    {
      schemaVersion: 1,
      status: "CONTROLS_PASS_APPROVAL_CHANNEL_PENDING",
      evidenceClass: "ci-privacy-support-readiness",
      gateId: "privacy_support_approval",
      releaseCommit,
      checks: [
        "policy-and-provider-disclosure",
        "retention-and-deletion-contract",
        "privacy-safe-logging-controls",
        "support-intake-and-response",
      ],
      policyApprovalStatus: "pending_owner_legal",
      retentionEnforcementStatus: "pending_deployed_evidence",
      supportChannelStatus: "pending_owner_approval",
      responseOwnerStatus: "pending_owner_approval",
      eligibleForGatePass: false,
      productionMutation: false,
    },
  );
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|hostname|url|contact/i.test(result.stdout));
});

test("privacy support evidence rejects malformed inputs without reflecting them", async () => {
  const hostile = "invalid\nprivate.example.invalid";
  for (const { args, errorCode } of [
    {
      args: [
        "--release-commit",
        hostile,
        "--controls-status",
        "pass",
      ],
      errorCode: "invalid_release_commit",
    },
    {
      args: [
        "--release-commit",
        "e".repeat(40),
        "--controls-status",
        hostile,
      ],
      errorCode: "invalid_controls_status",
    },
  ]) {
    const result = await runNode(privacySupportReadinessEvidenceScript, args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${errorCode}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("public claims scanner passes the current copy with privacy-safe evidence", async () => {
  const result = await runNode(claimsScanScript);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      scanClass: evidence.scanClass,
      prohibitedMatches: evidence.prohibitedMatches,
      nonClaimCopyPresent: evidence.nonClaimCopyPresent,
      methodologyFiles: evidence.methodologyFiles,
    },
    {
      schemaVersion: 1,
      status: "PASS",
      scanClass: "public-copy-named-competitor-claims",
      prohibitedMatches: 0,
      nonClaimCopyPresent: true,
      methodologyFiles: [
        "benchmarks/README.md",
        "benchmarks/docs/HUMAN_REVIEW.md",
        "benchmarks/docs/CI_QUALITY_GATES.md",
      ],
    },
  );
  assert.equal(typeof evidence.filesScanned, "number");
  assert(evidence.filesScanned >= 2);
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|\/Users\//i.test(result.stdout));
});

test("public claims scanner ignores fake LimitationsPage signatures in non-executable source", async () => {
  const fakeSignatures = [
    "// export default function LimitationsPage() { return (<p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>); }",
    "/* export default function LimitationsPage() { return (<p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>); } */",
    'const fakeSignature = "export default function LimitationsPage() { return (<p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>); }";',
    "const fakeSignature = `export default function LimitationsPage() { return (<p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>); }`;",
  ];

  for (const fakeSignature of fakeSignatures) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-claims-fake-signature-"));
    await copyClaimsScanInputs(root);
    const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
    const text = await readFile(filePath, "utf8");
    await removeRenderedPageNonclaimSentence(root);
    const realPage = await readFile(filePath, "utf8");
    await writeFile(filePath, `${fakeSignature}\n${realPage}`);

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 2, fakeSignature);
    assert.equal(result.stdout, "", fakeSignature);
    assert.equal(
      result.stderr,
      "ERROR missing_explicit_public_nonclaim\n",
      fakeSignature,
    );
    assert(!result.stderr.includes("Google Maps"));
  }
});

test("public claims scanner rejects a hostile named-competitor claim without reflecting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-hostile-"));
  await copyClaimsScanInputs(root);
  const hostile = "private.example.invalid BetterMTA is better than\nGoogle Maps";
  await writeFile(join(root, "apps/web/src/hostile-claim.ts"), `${hostile}\n`);

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR prohibited_named_competitor_claim\n");
  assert(!result.stderr.includes(hostile));
  assert(!result.stderr.includes("private.example.invalid"));
});

test("public claims scanner rejects a table of named-competitor comparative variants", async () => {
  const hostileVariants = [
    "Compared with Google Maps, BetterMTA arrives sooner.",
    "BetterMTA arrives earlier versus Apple Maps.",
    "BetterMTA arrives sooner vs Citymapper.",
    "BetterMTA takes less time than the MTA.",
    "BetterMTA is better than Google Maps.",
    "BetterMTA outperforms Citymapper.",
  ];

  for (const hostile of hostileVariants) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-claims-variant-"));
    await copyClaimsScanInputs(root);
    await writeFile(join(root, "apps/web/src/hostile-claim.ts"), `${hostile}\n`);

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 1, hostile);
    assert.equal(result.stdout, "", hostile);
    assert.equal(result.stderr, "ERROR prohibited_named_competitor_claim\n", hostile);
    assert(!result.stderr.includes(hostile));
  }
});

test("public claims scanner rejects comparisons wrapping neutral MTA constructs", async () => {
  const neutralConstructs = [
    "official MTA information",
    "Subway schedule and realtime data provided by the Metropolitan Transportation Authority (MTA).",
    "BetterMTA is not affiliated with or endorsed by the MTA.",
    "BetterMTA is not affiliated with or endorsed by the Metropolitan Transportation Authority.",
    "Walking, transfers, service changes, station access, and elevator conditions can change; confirm critical accessibility needs and urgent service conditions with official MTA information.",
    "Confirm critical accessibility needs and urgent service conditions with official MTA information, and follow station staff, posted signs, alerts, and emergency instructions when they conflict with an app result.",
    "Existing line badges use inline CSS custom properties for MTA colors.",
    "Canonical MTA gray for the 42 St Shuttle when catalog omits GS.",
  ];

  for (const neutralConstruct of neutralConstructs) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-claims-neutral-hostile-"));
    await copyClaimsScanInputs(root);
    const hostile = `BetterMTA is better than ${neutralConstruct}`;
    await writeFile(join(root, "apps/web/src/hostile-neutral.ts"), `${hostile}\n`);

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 1, neutralConstruct);
    assert.equal(result.stdout, "", neutralConstruct);
    assert.equal(
      result.stderr,
      "ERROR prohibited_named_competitor_claim\n",
      neutralConstruct,
    );
    assert(!result.stderr.includes(hostile));
  }
});

test("public claims scanner preserves the exact neutral MTA copy", async () => {
  const result = await runNode(claimsScanScript);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).nonClaimCopyPresent, true);
});

test("public claims scanner requires intact nonempty methodology contracts", async () => {
  const cases = [
    {
      label: "empty",
      mutate: async (filePath) => writeFile(filePath, ""),
    },
    {
      label: "directory",
      mutate: async (filePath) => {
        await rm(filePath, { force: true, recursive: true });
        await mkdir(filePath);
      },
    },
    {
      label: "malformed",
      mutate: async (filePath) =>
        writeFile(filePath, "# Wrong contract\nprivate.example.invalid\n"),
    },
  ];

  for (const { label, mutate } of cases) {
    const root = await mkdtemp(join(tmpdir(), `bettermta-claims-methodology-${label}-`));
    await copyClaimsScanInputs(root);
    await mutate(join(root, "benchmarks/README.md"));

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 2, label);
    assert.equal(result.stdout, "", label);
    assert.equal(result.stderr, "ERROR invalid_methodology_contract\n", label);
    assert(!result.stderr.includes("private.example.invalid"));
  }
});

test("public claims scanner rejects symlinks in publishable surfaces and methodology paths", async () => {
  const outsideRoot = await mkdtemp(join(tmpdir(), "bettermta-claims-link-target-"));
  const outsideFile = join(outsideRoot, "hostile.ts");
  await writeFile(
    outsideFile,
    "private.example.invalid Compared with Google Maps, BetterMTA arrives sooner.\n",
  );

  const surfaceRoot = await mkdtemp(join(tmpdir(), "bettermta-claims-surface-link-"));
  await copyClaimsScanInputs(surfaceRoot);
  await symlink(outsideFile, join(surfaceRoot, "apps/web/src/hostile-link.ts"));
  const surfaceResult = await runNode(claimsScanScript, [
    "--repo-root",
    surfaceRoot,
  ]);
  assert.equal(surfaceResult.code, 2);
  assert.equal(surfaceResult.stdout, "");
  assert.equal(surfaceResult.stderr, "ERROR symlink_in_public_surface\n");
  assert(!surfaceResult.stderr.includes("private.example.invalid"));

  const parentSurfaceRoot = await mkdtemp(
    join(tmpdir(), "bettermta-claims-parent-surface-link-"),
  );
  await mkdir(join(parentSurfaceRoot, "apps"), { recursive: true });
  await symlink(outsideRoot, join(parentSurfaceRoot, "apps/web"));
  const parentSurfaceResult = await runNode(claimsScanScript, [
    "--repo-root",
    parentSurfaceRoot,
  ]);
  assert.equal(parentSurfaceResult.code, 2);
  assert.equal(parentSurfaceResult.stdout, "");
  assert.equal(
    parentSurfaceResult.stderr,
    "ERROR symlink_in_public_surface\n",
  );
  assert(!parentSurfaceResult.stderr.includes("private.example.invalid"));

  const methodologyRoot = await mkdtemp(join(tmpdir(), "bettermta-claims-methodology-link-"));
  await copyClaimsScanInputs(methodologyRoot);
  const methodologyPath = join(methodologyRoot, "benchmarks/README.md");
  await rm(methodologyPath);
  await symlink(outsideFile, methodologyPath);
  const methodologyResult = await runNode(claimsScanScript, [
    "--repo-root",
    methodologyRoot,
  ]);
  assert.equal(methodologyResult.code, 2);
  assert.equal(methodologyResult.stdout, "");
  assert.equal(
    methodologyResult.stderr,
    "ERROR symlink_in_methodology_contract\n",
  );
  assert(!methodologyResult.stderr.includes("private.example.invalid"));
});

test("public claims scanner requires the explicit nonclaim in both canonical public files", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-nonclaim-anchor-"));
  await copyClaimsScanInputs(root);
  await replaceCanonicalNonclaim(root, "BetterMTA may compare");
  await writeFile(
    join(root, "apps/web/src/nonclaim-test.ts"),
    "// BetterMTA does not claim to beat Google Maps.\n",
  );

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR missing_explicit_public_nonclaim\n");
  assert(!result.stderr.includes("Google Maps"));
});

test("public claims scanner ignores neither line nor block comment nonclaims in rendered page source", async () => {
  const comments = [
    "// <p>\n// BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper,\n// the MTA, or another product.\n// </p>",
    "/* <p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p> */",
  ];

  for (const comment of comments) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-claims-page-comment-"));
    await copyClaimsScanInputs(root);
    await replaceRenderedPageNonclaim(root, "BetterMTA may compare");
    await writeFile(
      join(root, "apps/web/src/app/limitations/page.tsx"),
      `${await readFile(join(root, "apps/web/src/app/limitations/page.tsx"), "utf8")}\n${comment}\n`,
    );

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 2, comment);
    assert.equal(result.stdout, "", comment);
    assert.equal(result.stderr, "ERROR missing_explicit_public_nonclaim\n", comment);
    assert(!result.stderr.includes("Google Maps"));
  }
});

test("public claims scanner requires the nonclaim inside LimitationsPage returned JSX", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-unused-jsx-"));
  await copyClaimsScanInputs(root);
  await removeRenderedPageNonclaimSentence(root);
  await writeFile(
    join(root, "apps/web/src/app/limitations/page.tsx"),
    `${await readFile(join(root, "apps/web/src/app/limitations/page.tsx"), "utf8")}\nconst unusedLimitationsCopy = (\n  <p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>\n);\n`,
  );

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR missing_explicit_public_nonclaim\n");
  assert(!result.stderr.includes("Google Maps"));
});

test("public claims scanner ignores return text and nested callback returns inside returned JSX", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-return-text-"));
  await copyClaimsScanInputs(root);
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  const returnedContent = `      <p>Users can return to the planner.</p>
      {["ready"].map(() => {
        return "nested callback";
      })}
`;
  const marker = '      <header className="info-header">\n';
  assert(text.includes(marker));
  await writeFile(filePath, text.replace(marker, returnedContent + marker));

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).nonClaimCopyPresent, true);
});

test("public claims scanner rejects an unbraced early test return", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-early-return-"));
  await copyClaimsScanInputs(root);
  await removeRenderedPageNonclaimSentence(root);
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  const earlyReturn = `  if (process.env.NODE_ENV === "test")
    return (
      <p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>
    );
`;
  await writeFile(filePath, text.replace("  return (\n", earlyReturn + "  return (\n"));

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR invalid_limitations_page_structure\n");
  assert(!result.stderr.includes("Google Maps"));
});

test("public claims scanner rejects a braced conditional early return", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-braced-return-"));
  await copyClaimsScanInputs(root);
  await removeRenderedPageNonclaimSentence(root);
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  const earlyReturn = `  if (process.env.NODE_ENV === "test") {
    return (
      <p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>
    );
  }
`;
  await writeFile(filePath, text.replace("  return (\n", earlyReturn + "  return (\n"));

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR invalid_limitations_page_structure\n");
  assert(!result.stderr.includes("Google Maps"));
});

test("public claims scanner rejects an unreachable trailing return", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-trailing-return-"));
  await copyClaimsScanInputs(root);
  const filePath = join(root, "apps/web/src/app/limitations/page.tsx");
  const text = await readFile(filePath, "utf8");
  const functionEnd = text.lastIndexOf("\n}\n");
  assert(functionEnd >= 0);
  const trailingReturn = `
  return (
    <p>BetterMTA does not claim to beat Google Maps, Apple Maps, Citymapper, the MTA, or another product.</p>
  );`;
  await writeFile(
    filePath,
    text.slice(0, functionEnd) + trailingReturn + text.slice(functionEnd),
  );

  const result = await runNode(claimsScanScript, ["--repo-root", root]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ERROR invalid_limitations_page_structure\n");
  assert(!result.stderr.includes("Google Maps"));
});

test("public claims scanner accepts straight and curly contraction nonclaims in canonical files", async () => {
  for (const replacement of ["doesn't claim to beat", "doesn’t claim to beat"]) {
    const root = await mkdtemp(join(tmpdir(), "bettermta-claims-contraction-"));
    await copyClaimsScanInputs(root);
    await replaceCanonicalNonclaim(root, replacement);

    const result = await runNode(claimsScanScript, ["--repo-root", root]);

    assert.equal(result.code, 0, replacement);
    assert.equal(result.stderr, "", replacement);
    assert.equal(JSON.parse(result.stdout).nonClaimCopyPresent, true);
  }
});

test("claims readiness evidence keeps publication review and comparative claims pending", async () => {
  const releaseCommit = "f".repeat(40);
  const result = await runNode(claimsReadinessEvidenceScript, [
    "--release-commit",
    releaseCommit,
    "--scan-status",
    "pass",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      schemaVersion: evidence.schemaVersion,
      status: evidence.status,
      evidenceClass: evidence.evidenceClass,
      gateId: evidence.gateId,
      releaseCommit: evidence.releaseCommit,
      checks: evidence.checks,
      publicationReviewStatus: evidence.publicationReviewStatus,
      comparativeClaimsStatus: evidence.comparativeClaimsStatus,
      eligibleForGatePass: evidence.eligibleForGatePass,
      productionMutation: evidence.productionMutation,
    },
    {
      schemaVersion: 1,
      status: "AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING",
      evidenceClass: "ci-claims-discipline-readiness",
      gateId: "claims_discipline",
      releaseCommit,
      checks: [
        "named-competitor-claim-scan",
        "explicit-public-nonclaim",
        "benchmark-methodology-contract",
        "publication-review-protocol",
      ],
      publicationReviewStatus: "pending",
      comparativeClaimsStatus: "not_authorized",
      eligibleForGatePass: false,
      productionMutation: false,
    },
  );
  assert.match(evidence.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert(!/https?:|hostname|url|contact/i.test(result.stdout));
});

test("claims readiness tools reject malformed arguments with fixed non-reflecting errors", async () => {
  const hostile = "invalid\nprivate.example.invalid";
  for (const { args, errorCode } of [
    {
      args: [],
      errorCode: "invalid_arguments",
    },
    {
      args: [
        "--release-commit",
        hostile,
        "--scan-status",
        "pass",
      ],
      errorCode: "invalid_release_commit",
    },
    {
      args: [
        "--release-commit",
        "f".repeat(40),
        "--scan-status",
        hostile,
      ],
      errorCode: "invalid_scan_status",
    },
  ]) {
    const result = await runNode(claimsReadinessEvidenceScript, args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `ERROR ${errorCode}\n`);
    assert(!result.stderr.includes("private.example.invalid"));
  }

  const scannerResult = await runNode(claimsScanScript, [
    "--repo-root",
    hostile,
  ]);
  assert.equal(scannerResult.code, 2);
  assert.equal(scannerResult.stdout, "");
  assert.equal(scannerResult.stderr, "ERROR invalid_arguments\n");
  assert(!scannerResult.stderr.includes("private.example.invalid"));
});

test("load workflow and README use absolute output paths from the repository root", async () => {
  const workflow = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const readinessJob = workflow.match(
    /^  public-beta-readiness:\n[\s\S]*?(?=^  public-beta-preview:)/m,
  )?.[0];
  assert(readinessJob, "public-beta-readiness job is required");
  assert.match(
    readinessJob,
    /--output-dir "\$GITHUB_WORKSPACE\/infra\/public-beta\/evidence\/load"/,
  );
  assert.doesNotMatch(
    readinessJob,
    /--output-dir infra\/public-beta\/evidence\/load/,
  );

  const loadReadme = await readFile(
    join(repoRoot, "infra/public-beta/README.md"),
    "utf8",
  );
  assert.match(loadReadme, /from the repository root/i);
  assert.match(
    loadReadme,
    /--output-dir "\$PWD\/infra\/public-beta\/evidence\/load"/,
  );
  assert.doesNotMatch(
    loadReadme,
    /--output-dir infra\/public-beta\/evidence\/load/,
  );

  const root = await mkdtemp(join(tmpdir(), "bettermta-load-runner-absolute-"));
  const outputDir = join(root, "evidence", "load");
  try {
    await mkdir(dirname(outputDir), { recursive: true });
    const result = await runNode(syntheticLoadRunnerScript, [
      "--release-commit",
      "f".repeat(40),
      "--output-dir",
      outputDir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await readdir(outputDir), ["probe.json", "result.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("claims discipline structure requires scanner, writer, review document, and ordered workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-claims-structure-"));
  const result = await runNode(readinessScript, [
    "--structure-only",
    "--repo-root",
    root,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing:infra\/public-beta\/scan-public-claims[.]mjs/);
  assert.match(
    result.stderr,
    /missing:infra\/public-beta\/write-claims-readiness-evidence[.]mjs/,
  );
  assert.match(result.stderr, /missing:docs\/public-beta\/PUBLICATION_REVIEW[.]md/);
  assert.match(result.stderr, /missing:benchmarks\/README[.]md/);
  assert.match(result.stderr, /missing:benchmarks\/docs\/HUMAN_REVIEW[.]md/);
  assert.match(result.stderr, /missing:benchmarks\/docs\/CI_QUALITY_GATES[.]md/);

  const workflow = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const readinessJob = workflow.match(
    /^  public-beta-readiness:\n[\s\S]*?(?=^  public-beta-preview:)/m,
  )?.[0];
  assert(readinessJob, "public-beta-readiness job is required");
  for (const pattern of [
    /CLAIMS_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /scan-public-claims[.]mjs/,
    /infra\/public-beta\/evidence\/claims\/scan[.]json/,
    /write-claims-readiness-evidence[.]mjs/,
    /--release-commit "\$CLAIMS_RELEASE_COMMIT"/,
    /--scan-status pass/,
    /infra\/public-beta\/evidence\/claims\/result[.]json/,
    /public-beta-claims-\$\{\{ github[.]run_id \}\}/,
    /actions\/upload-artifact@v7/,
  ]) {
    assert.match(readinessJob, pattern);
  }
  assert(
    readinessJob.indexOf("validate-readiness.mjs --structure-only") <
      readinessJob.indexOf("scan-public-claims.mjs"),
    "claims scan must follow structure validation",
  );
  assert(
    readinessJob.indexOf("scan-public-claims.mjs") <
      readinessJob.indexOf("write-claims-readiness-evidence.mjs"),
    "claims evidence must be written only after the scan passes",
  );
  assert(
    readinessJob.indexOf("write-claims-readiness-evidence.mjs") <
      readinessJob.indexOf("public-beta-claims-${{ github.run_id }}"),
    "claims artifact must be uploaded after evidence is written",
  );

  const claimsCommitEnvLine = readinessJob
    .split("\n")
    .find((line) => line.includes("CLAIMS_RELEASE_COMMIT:"));
  const checkoutRefLine = readinessJob
    .split("\n")
    .find((line) => line.trim().startsWith("ref:"));
  assert(claimsCommitEnvLine, "claims release commit expression is required");
  assert(checkoutRefLine, "readiness checkout must pin an explicit ref");
  assert.equal(
    checkoutRefLine.trim().slice("ref:".length).trim(),
    claimsCommitEnvLine.slice(claimsCommitEnvLine.indexOf(":") + 1).trim(),
    "readiness checkout ref and recorded release commit must be identical",
  );
});

test("repository readiness structure is complete without claiming readiness", async () => {
  const result = await runNode(readinessScript, ["--structure-only"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /STRUCTURE_PASS/);

  const readiness = await readFile(
    join(repoRoot, "docs/public-beta/READINESS.md"),
    "utf8",
  );
  assert.match(readiness, /Current status:\*\* `NOT_READY`/);

  const incident = await readFile(
    join(repoRoot, "docs/public-beta/INCIDENT_PLAYBOOK.md"),
    "utf8",
  );
  for (const heading of [
    "Detection",
    "Severity",
    "Roles",
    "Stop conditions",
    "Response",
    "Communications",
    "Recovery",
    "Evidence",
  ]) {
    assert.match(incident, new RegExp(`^## .*${heading}`, "m"));
  }

  const incidentDrill = await readFile(
    join(repoRoot, "docs/public-beta/INCIDENT_DRILL.md"),
    "utf8",
  );
  assert.match(
    incidentDrill,
    /Current status:\*\* `PENDING_OWNER_APPROVAL_AND_DRILL`/,
  );
  for (const heading of [
    "Scope and prerequisites",
    "Environment and roles",
    "Scenario",
    "Timeline",
    "Stop and rollback decisions",
    "Recovery",
    "Communications and privacy",
    "Findings",
    "Sign-off",
  ]) {
    assert.match(incidentDrill, new RegExp(`^## ${heading}`, "m"));
  }

  const privacySupportApproval = await readFile(
    join(repoRoot, "docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md"),
    "utf8",
  );
  assert.match(
    privacySupportApproval,
    /Current status:\*\* `PENDING_OWNER_LEGAL_AND_OPERATIONAL_APPROVAL`/,
  );
  for (const heading of [
    "Scope and prerequisites",
    "Deployed configuration",
    "Policy and providers",
    "Retention and deletion",
    "Support operations",
    "Privacy and access controls",
    "Findings",
    "Sign-off",
  ]) {
    assert.match(privacySupportApproval, new RegExp(`^## ${heading}`, "m"));
  }

  const limitations = await readFile(
    join(repoRoot, "docs/public-beta/LIMITATIONS.md"),
    "utf8",
  );
  for (const phrase of [
    /NYC subway/i,
    /stale|degraded/i,
    /no account/i,
    /no claim.*Google|does not claim.*Google/i,
  ]) {
    assert.match(limitations, phrase);
  }

  const accessibilityReview = await readFile(
    join(repoRoot, "docs/public-beta/ACCESSIBILITY_REVIEW.md"),
    "utf8",
  );
  assert.match(accessibilityReview, /Current status:\*\* `PENDING_HUMAN_REVIEW`/);
  for (const heading of [
    "Scope and prerequisites",
    "Environment",
    "Core flow",
    "Keyboard",
    "Screen reader",
    "Visual and motion",
    "Findings",
    "Sign-off",
  ]) {
    assert.match(accessibilityReview, new RegExp(`^## ${heading}`, "m"));
  }

  const workflow = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  for (const pattern of [
    /^  public-beta-readiness:/m,
    /npm --prefix contracts ci/,
    /playwright install --with-deps chromium/,
    /npm --prefix apps\/web run e2e/,
    /node --test infra\/public-beta\/tests\/[^\s]+/,
    /validate-readiness[.]mjs --structure-only/,
    /LOAD_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /run-synthetic-load-evidence[.]mjs/,
    /public-beta-load-readiness-\$\{\{ github[.]run_id \}\}/,
  ]) {
    assert.match(workflow, pattern);
  }

  const readinessJob = workflow.match(
    /^  public-beta-readiness:\n[\s\S]*?(?=^  public-beta-preview:)/m,
  )?.[0];
  assert(readinessJob, "public-beta-readiness job is required");
  for (const pattern of [
    /LOAD_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /actions\/checkout@v7[\s\S]*?ref: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /run-synthetic-load-evidence[.]mjs/,
    /--release-commit "\$LOAD_RELEASE_COMMIT"/,
    /--output-dir "\$GITHUB_WORKSPACE\/infra\/public-beta\/evidence\/load"/,
    /infra\/public-beta\/evidence\/load\/(?:probe|result)[.]json/,
    /public-beta-load-readiness-\$\{\{ github[.]run_id \}\}/,
    /retention-days: 14/,
    /ACCESSIBILITY_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /npm --prefix apps\/web run e2e/,
    /write-accessibility-evidence[.]mjs/,
    /--release-commit "\$ACCESSIBILITY_RELEASE_COMMIT"/,
    /--suite-status pass/,
    /infra\/public-beta\/evidence\/accessibility/,
    /public-beta-accessibility-\$\{\{ github[.]run_id \}\}/,
    /actions\/upload-artifact@v7/,
  ]) {
    assert.match(readinessJob, pattern);
  }
  assert.doesNotMatch(
    readinessJob,
    /--output-dir infra\/public-beta\/evidence\/load/,
    "CI must pass an absolute load-evidence output path",
  );
  assert(
    readinessJob.indexOf("validate-readiness.mjs --structure-only") <
      readinessJob.indexOf("run-synthetic-load-evidence.mjs"),
    "synthetic load evidence must run after structure validation",
  );
  assert(
    readinessJob.indexOf("run-synthetic-load-evidence.mjs") <
      readinessJob.indexOf("write-accessibility-evidence.mjs"),
    "synthetic load evidence must run before human-pending evidence writers",
  );
  assert(
    readinessJob.indexOf("run-synthetic-load-evidence.mjs") <
      readinessJob.indexOf("public-beta-load-readiness-${{ github.run_id }}"),
    "synthetic load artifact must upload after the runner completes",
  );
  assert(
    readinessJob.indexOf("npm --prefix apps/web run e2e") <
      readinessJob.indexOf("write-accessibility-evidence.mjs"),
    "accessibility evidence must be written only after the suite passes",
  );
  assert.doesNotMatch(readinessJob, /humanReviewStatus:\s*(?:pass|complete)/i);
  for (const pattern of [
    /INCIDENT_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /write-incident-readiness-evidence[.]mjs/,
    /--release-commit "\$INCIDENT_RELEASE_COMMIT"/,
    /--playbook-status pass/,
    /infra\/public-beta\/evidence\/incident-readiness/,
    /public-beta-incident-readiness-\$\{\{ github[.]run_id \}\}/,
    /actions\/upload-artifact@v7/,
  ]) {
    assert.match(readinessJob, pattern);
  }
  assert(
    readinessJob.indexOf("validate-readiness.mjs --structure-only") <
      readinessJob.indexOf("write-incident-readiness-evidence.mjs"),
    "incident readiness evidence must be written only after playbook structure passes",
  );
  assert.doesNotMatch(readinessJob, /(?:rota|channel|tabletopDrill)Status:\s*(?:pass|approved|active)/i);
  for (const pattern of [
    /PRIVACY_SUPPORT_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /write-privacy-support-readiness-evidence[.]mjs/,
    /--release-commit "\$PRIVACY_SUPPORT_RELEASE_COMMIT"/,
    /--controls-status pass/,
    /infra\/public-beta\/evidence\/privacy-support/,
    /public-beta-privacy-support-\$\{\{ github[.]run_id \}\}/,
    /actions\/upload-artifact@v7/,
  ]) {
    assert.match(readinessJob, pattern);
  }
  assert(
    readinessJob.indexOf("validate-readiness.mjs --structure-only") <
      readinessJob.indexOf("write-privacy-support-readiness-evidence.mjs"),
    "privacy support evidence must be written only after controls structure passes",
  );
  assert.doesNotMatch(
    readinessJob,
    /(?:policyApproval|retentionEnforcement|supportChannel|responseOwner)Status:\s*(?:pass|approved|active)/i,
  );

  const liveE2e = await readFile(join(repoRoot, "apps/web/e2e/live.spec.cjs"), "utf8");
  for (const pattern of [
    /keyboard-only search flow/,
    /mobile viewport layout: readable results \+ 44px line toggles/,
    /a11y smoke: search \+ results screens/,
  ]) {
    assert.match(liveE2e, pattern);
  }

  const previewJob = workflow.match(
    /^  public-beta-preview:\n[\s\S]*?(?=^  [a-z0-9-]+:\n|\z)/m,
  )?.[0];
  assert(previewJob, "public-beta-preview job is required");
  for (const pattern of [
    /docker build/,
    /--file apps\/web\/Dockerfile/,
    /npm --prefix contracts ci/,
    /PREVIEW_RELEASE_COMMIT: \$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/,
    /--build-arg NEXT_PUBLIC_API_BASE_URL=http:\/\/127[.]0[.]0[.]1:3999/,
    /--build-arg NEXT_PUBLIC_API_MODE=live/,
    /--build-arg NEXT_PUBLIC_FLAG_FEEDBACK=false/,
    /--build-arg NEXT_PUBLIC_FLAG_ADDRESS_POI=false/,
    /--publish 127[.]0[.]0[.]1:3100:3000/,
    /BETTERMTA_E2E_EXTERNAL_BASE: http:\/\/127[.]0[.]0[.]1:3100/,
    /npm --prefix apps\/web run e2e/,
    /write-preview-evidence[.]mjs/,
    /--release-commit "\$PREVIEW_RELEASE_COMMIT"/,
    /infra\/public-beta\/evidence\/preview/,
    /actions\/upload-artifact@v7/,
  ]) {
    assert.match(previewJob, pattern);
  }
  assert.doesNotMatch(previewJob, /--release-commit "\$GITHUB_SHA"/);
  assert.doesNotMatch(previewJob, /\bfly(?:ctl)?\b|deploy|secret|scale/i);

  const playwrightConfig = await readFile(
    join(repoRoot, "apps/web/playwright.config.ts"),
    "utf8",
  );
  for (const pattern of [
    /BETTERMTA_E2E_EXTERNAL_BASE/,
    /hostname !== "127[.]0[.]0[.]1"/,
    /webServer: externalBase \? undefined :/,
  ]) {
    assert.match(playwrightConfig, pattern);
  }
});

test("structure validator requires the public limitations, headers, and origin verifier", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-readiness-structure-"));
  const result = await runNode(readinessScript, [
    "--structure-only",
    "--repo-root",
    root,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /missing:apps\/web\/src\/app\/limitations\/page[.]tsx/);
  assert.match(result.stderr, /missing:apps\/web\/src\/middleware[.]ts/);
  assert.match(result.stderr, /missing:infra\/public-beta\/verify-public-origin[.]mjs/);
  assert.match(result.stderr, /missing:infra\/public-beta\/write-load-readiness-evidence[.]mjs/);
  assert.match(result.stderr, /missing:infra\/public-beta\/run-synthetic-load-evidence[.]mjs/);
  assert.match(result.stderr, /missing:infra\/public-beta\/write-preview-evidence[.]mjs/);
  assert.match(
    result.stderr,
    /missing:infra\/public-beta\/write-accessibility-evidence[.]mjs/,
  );
  assert.match(
    result.stderr,
    /missing:docs\/public-beta\/ACCESSIBILITY_REVIEW[.]md/,
  );
  assert.match(
    result.stderr,
    /missing:infra\/public-beta\/write-incident-readiness-evidence[.]mjs/,
  );
  assert.match(result.stderr, /missing:docs\/public-beta\/INCIDENT_DRILL[.]md/);
  assert.match(
    result.stderr,
    /missing:infra\/public-beta\/write-privacy-support-readiness-evidence[.]mjs/,
  );
  assert.match(
    result.stderr,
    /missing:docs\/public-beta\/PRIVACY_SUPPORT_APPROVAL[.]md/,
  );
});

test("pending evidence fails closed as NOT_READY", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-readiness-pending-"));
  const manifest = join(root, "evidence.json");
  await writeFile(
    manifest,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        releaseId: "pending-candidate",
        generatedAt: "2026-08-04T00:00:00Z",
        commit: "a".repeat(40),
        gates: REQUIRED_GATES.map((id) => ({ id, status: "pending" })),
      },
      null,
      2,
    )}\n`,
  );

  const result = await runNode(readinessScript, [
    "--evidence",
    manifest,
    "--repo-root",
    root,
    "--expected-commit",
    "a".repeat(40),
  ]);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).status, "NOT_READY");
});

test("invalid gate identifiers are not reflected into reason codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-readiness-id-"));
  const manifest = join(root, "evidence.json");
  await writeFile(
    manifest,
    `${JSON.stringify({
      schemaVersion: 1,
      releaseId: "invalid-id-candidate",
      generatedAt: "2026-08-04T00:00:00Z",
      commit: "c".repeat(40),
      gates: [{ id: "unexpected\nlog-entry", status: "pass" }],
    })}\n`,
  );

  const result = await runNode(readinessScript, [
    "--evidence",
    manifest,
    "--repo-root",
    root,
    "--expected-commit",
    "c".repeat(40),
  ]);
  assert.equal(result.code, 1);
  const evidence = JSON.parse(result.stdout);
  assert(evidence.reasonCodes.includes("gate:duplicate-or-invalid-id"));
  assert(evidence.reasonCodes.every((reason) => !reason.includes("\n")));
});

test("oversized evidence artifacts are rejected before hashing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-readiness-large-"));
  const artifact = join(root, "oversized.bin");
  const handle = await open(artifact, "w");
  await handle.truncate(50 * 1024 * 1024 + 1);
  await handle.close();
  const manifest = join(root, "evidence.json");
  await writeFile(
    manifest,
    `${JSON.stringify({
      schemaVersion: 1,
      releaseId: "oversized-artifact-candidate",
      generatedAt: "2026-08-04T00:00:00Z",
      commit: "d".repeat(40),
      gates: [
        {
          id: "hosted_private_beta",
          status: "pass",
          artifact: "oversized.bin",
          sha256: "0".repeat(64),
          observedAt: "2026-08-04T00:00:00Z",
        },
      ],
    })}\n`,
  );

  const result = await runNode(readinessScript, [
    "--evidence",
    manifest,
    "--repo-root",
    root,
    "--expected-commit",
    "d".repeat(40),
  ]);
  assert.equal(result.code, 1);
  assert(
    JSON.parse(result.stdout).reasonCodes.includes(
      "gate:hosted_private_beta:artifact-too-large",
    ),
  );
});

test("complete hash-bound evidence evaluates READY_FOR_PUBLIC_BETA", async () => {
  const root = await mkdtemp(join(tmpdir(), "bettermta-readiness-complete-"));
  const evidenceDir = join(root, "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const gates = [];

  for (const id of REQUIRED_GATES) {
    const relativeArtifact = join("evidence", `${id}.txt`);
    const content = `synthetic test evidence for ${id}\n`;
    await writeFile(join(root, relativeArtifact), content);
    gates.push({
      id,
      status: "pass",
      artifact: relativeArtifact,
      sha256: createHash("sha256").update(content).digest("hex"),
      observedAt: "2026-08-04T00:00:00Z",
    });
  }

  const manifest = join(root, "evidence.json");
  await writeFile(
    manifest,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        releaseId: "synthetic-unit-test",
        generatedAt: "2026-08-04T00:00:00Z",
        commit: "b".repeat(40),
        gates,
      },
      null,
      2,
    )}\n`,
  );

  const result = await runNode(readinessScript, [
    "--evidence",
    manifest,
    "--repo-root",
    root,
    "--expected-commit",
    "b".repeat(40),
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "READY_FOR_PUBLIC_BETA");
});
