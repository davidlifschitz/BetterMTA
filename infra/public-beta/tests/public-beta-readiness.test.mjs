import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");
const loadScript = join(repoRoot, "infra/public-beta/load-route-search.mjs");
const readinessScript = join(repoRoot, "infra/public-beta/validate-readiness.mjs");

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

async function runNode(script, args = [], { timeout = 30_000 } = {}) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout,
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

test("bounded local load probe emits privacy-safe passing evidence", async () => {
  await withServer((request, response) => {
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
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
    assert(!result.stdout.includes(new URL(baseUrl).host));
  });
});

test("load probe fails when the allowed error rate is exceeded", async () => {
  let requests = 0;
  await withServer((request, response) => {
    request.resume();
    requests += 1;
    response.writeHead(requests % 2 === 0 ? 503 : 200, {
      "content-type": "application/json",
    });
    response.end("{}");
  }, async (baseUrl) => {
    const result = await runNode(loadScript, [
      "--base-url",
      baseUrl,
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

  const workflow = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  for (const pattern of [
    /^  public-beta-readiness:/m,
    /npm --prefix contracts ci/,
    /playwright install --with-deps chromium/,
    /npm --prefix apps\/web run e2e/,
    /node --test infra\/public-beta\/tests\/[^\s]+/,
    /validate-readiness[.]mjs --structure-only/,
  ]) {
    assert.match(workflow, pattern);
  }
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
