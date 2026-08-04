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
  ]) {
    assert.match(workflow, pattern);
  }

  const readinessJob = workflow.match(
    /^  public-beta-readiness:\n[\s\S]*?(?=^  public-beta-preview:)/m,
  )?.[0];
  assert(readinessJob, "public-beta-readiness job is required");
  for (const pattern of [
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
