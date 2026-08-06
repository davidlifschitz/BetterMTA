#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "../..");

const REQUIRED_GATES = Object.freeze([
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
]);
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

function parseArgs(args) {
  const options = { repoRoot: defaultRepoRoot };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--structure-only") {
      options.structureOnly = true;
    } else if (["--evidence", "--repo-root", "--expected-commit"].includes(flag)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value`);
      }
      if (flag === "--evidence") options.evidence = value;
      if (flag === "--repo-root") options.repoRoot = resolve(value);
      if (flag === "--expected-commit") options.expectedCommit = value;
      index += 1;
    } else {
      throw new Error("unknown option");
    }
  }
  if (options.structureOnly === Boolean(options.evidence)) {
    throw new Error("choose exactly one of --structure-only or --evidence");
  }
  return options;
}

function readText(repoRoot, path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function validateStructure(repoRoot) {
  const failures = [];
  const requiredFiles = [
    "infra/public-beta/load-route-search.mjs",
    "infra/public-beta/verify-public-origin.mjs",
    "infra/public-beta/write-preview-evidence.mjs",
    "infra/public-beta/write-accessibility-evidence.mjs",
    "infra/public-beta/write-incident-readiness-evidence.mjs",
    "infra/public-beta/write-privacy-support-readiness-evidence.mjs",
    "infra/public-beta/scan-public-claims.mjs",
    "infra/public-beta/write-claims-readiness-evidence.mjs",
    "infra/public-beta/validate-readiness.mjs",
    "infra/public-beta/tests/public-beta-readiness.test.mjs",
    "infra/public-beta/README.md",
    "docs/public-beta/READINESS.md",
    "docs/public-beta/INCIDENT_PLAYBOOK.md",
    "docs/public-beta/INCIDENT_DRILL.md",
    "docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md",
    "docs/private-beta/PRIVACY_POLICY_DRAFT.md",
    "docs/private-beta/SUPPORT_WORKFLOW_DRAFT.md",
    "docs/private-beta/SUPPORT_LOG_TEMPLATE.md",
    "docs/public-beta/LIMITATIONS.md",
    "docs/public-beta/PUBLICATION_REVIEW.md",
    "docs/public-beta/ACCESSIBILITY_REVIEW.md",
    "docs/public-beta/evidence-template.json",
    "benchmarks/README.md",
    "benchmarks/docs/HUMAN_REVIEW.md",
    "benchmarks/docs/CI_QUALITY_GATES.md",
    "apps/web/src/app/limitations/page.tsx",
    "apps/web/src/middleware.ts",
    "apps/web/e2e/live.spec.cjs",
    "apps/api/src/logging/privacy.ts",
    "apps/api/src/logging/logger.ts",
    "apps/api/test/privacy.test.ts",
    "infra/observability/log-fields.md",
    "infra/security/GUARDRAILS.md",
  ];
  for (const path of requiredFiles) {
    if (!existsSync(resolve(repoRoot, path))) failures.push(`missing:${path}`);
  }
  if (failures.length > 0) return failures;

  const readiness = readText(repoRoot, "docs/public-beta/READINESS.md");
  if (!/Current status:\*\* `NOT_READY`/.test(readiness)) {
    failures.push("readiness-status-not-fail-closed");
  }

  const incident = readText(repoRoot, "docs/public-beta/INCIDENT_PLAYBOOK.md");
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
    if (!new RegExp(`^## .*${heading}`, "m").test(incident)) {
      failures.push(`incident-heading:${heading.toLowerCase()}`);
    }
  }

  const privacySupportApproval = readText(
    repoRoot,
    "docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md",
  );
  if (
    !/Current status:\*\* `PENDING_OWNER_LEGAL_AND_OPERATIONAL_APPROVAL`/.test(
      privacySupportApproval,
    )
  ) {
    failures.push("privacy-support-approval:status");
  }
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
    if (!new RegExp(`^## ${heading}`, "m").test(privacySupportApproval)) {
      failures.push(
        `privacy-support-approval:${heading.toLowerCase().replaceAll(" ", "-")}`,
      );
    }
  }

  const privacyPolicy = readText(
    repoRoot,
    "docs/private-beta/PRIVACY_POLICY_DRAFT.md",
  );
  for (const [label, pattern] of [
    ["draft", /not published and not an active policy/i],
    ["providers", /final published policy must name the providers actually active/i],
    ["retention", /ordinary operational logs is \*\*14 days\*\*/i],
    ["deletion", /request deletion where practicable/i],
    ["place-ref", /PlaceRefs/i],
  ]) {
    if (!pattern.test(privacyPolicy)) failures.push(`privacy-policy:${label}`);
  }

  const supportWorkflow = readText(
    repoRoot,
    "docs/private-beta/SUPPORT_WORKFLOW_DRAFT.md",
  );
  for (const [label, pattern] of [
    ["inactive", /no support channel or cohort has been activated/i],
    ["private-channel", /private\*{0,2}\s+support channel/i],
    ["safe-intake", /Never request a full home\/work address/i],
    ["response-owner", /Product\/operations owner/i],
    ["rollback", /rollback-private-beta[.]sh/],
  ]) {
    if (!pattern.test(supportWorkflow)) failures.push(`support-workflow:${label}`);
  }

  const supportLog = readText(
    repoRoot,
    "docs/private-beta/SUPPORT_LOG_TEMPLATE.md",
  );
  for (const [label, pattern] of [
    ["restricted", /owner-restricted location, not in Git/i],
    ["case-id", /Case ID/],
    ["deletion", /Sensitive original deleted/],
    ["forbidden", /Never place tester emails/i],
  ]) {
    if (!pattern.test(supportLog)) failures.push(`support-log:${label}`);
  }

  const privacyHelper = readText(repoRoot, "apps/api/src/logging/privacy.ts");
  const logger = readText(repoRoot, "apps/api/src/logging/logger.ts");
  const privacyTests = readText(repoRoot, "apps/api/test/privacy.test.ts");
  const logFields = readText(repoRoot, "infra/observability/log-fields.md");
  const guardrails = readText(repoRoot, "infra/security/GUARDRAILS.md");
  for (const [label, text, pattern] of [
    ["place-ref", privacyHelper, /toPrivacySafePlaceLogRef/],
    ["selected-line-count", privacyHelper, /selectedLineCount/],
    ["redaction", logger, /redactSensitive/],
    ["coordinate-detection", logger, /looksLikePreciseCoordinatePair/],
    ["privacy-tests", privacyTests, /never logs opaque geocode PlaceRef tokens/],
    ["forbidden-fields", logFields, /MUST NOT.*retain/is],
    ["guardrails", guardrails, /no default precise-coord retention/i],
  ]) {
    if (!pattern.test(text)) failures.push(`privacy-controls:${label}`);
  }

  const incidentDrill = readText(repoRoot, "docs/public-beta/INCIDENT_DRILL.md");
  if (!/Current status:\*\* `PENDING_OWNER_APPROVAL_AND_DRILL`/.test(incidentDrill)) {
    failures.push("incident-drill:status");
  }
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
    if (!new RegExp(`^## ${heading}`, "m").test(incidentDrill)) {
      failures.push(`incident-drill:${heading.toLowerCase().replaceAll(" ", "-")}`);
    }
  }

  const accessibilityReview = readText(
    repoRoot,
    "docs/public-beta/ACCESSIBILITY_REVIEW.md",
  );
  if (!/Current status:\*\* `PENDING_HUMAN_REVIEW`/.test(accessibilityReview)) {
    failures.push("accessibility-review:status");
  }
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
    if (!new RegExp(`^## ${heading}`, "m").test(accessibilityReview)) {
      failures.push(`accessibility-review:${heading.toLowerCase().replaceAll(" ", "-")}`);
    }
  }

  const limitations = readText(repoRoot, "docs/public-beta/LIMITATIONS.md");
  for (const [label, pattern] of [
    ["scope", /NYC subway/i],
    ["freshness", /stale|degraded/i],
    ["account", /no account/i],
    ["claims", /no claim.*Google|does not claim.*Google/i],
  ]) {
    if (!pattern.test(limitations)) failures.push(`limitations:${label}`);
  }

  const limitationsPage = readText(
    repoRoot,
    "apps/web/src/app/limitations/page.tsx",
  );
  for (const [label, pattern] of [
    ["heading", /BetterMTA beta limitations/],
    ["scope", /NYC subway-first/i],
    ["account", /No account is required/i],
    ["claims", /does not claim to beat/i],
    ["return-link", /Back to trip planner/],
  ]) {
    if (!pattern.test(limitationsPage)) {
      failures.push(`limitations-page:${label}`);
    }
  }

  const claimsScanner = readText(
    repoRoot,
    "infra/public-beta/scan-public-claims.mjs",
  );
  for (const [label, pattern] of [
    ["publishable-surfaces", /apps\/web\/src/],
    ["limitations-surface", /docs\/public-beta\/LIMITATIONS[.]md/],
    ["named-competitors", /Google\\s\+Maps|Apple\\s\+Maps|Citymapper|MTA/],
    ["explicit-nonclaim", /does.*not.*claim.*to.*beat/],
    ["route-set-comparison", /fastest\\s\+baseline/],
    ["next-font-google", /next.*font.*google/],
    ["fixed-error", /prohibited_named_competitor_claim/],
    ["methodology-contract", /benchmarks\/docs\/HUMAN_REVIEW[.]md/],
    ["methodology-markers", /METHODOLOGY_CONTRACTS|markers/],
    ["canonical-nonclaim-files", /CANONICAL_NONCLAIM_FILES/],
    ["contraction-nonclaim", /doesn.*t|don.*t/],
    ["neutral-mta-copy", /SAFE_NEUTRAL_COPY_PATTERNS/],
    ["neutral-copy-boundaries", /hasStatementBoundary|removeSafeNeutralCopy/],
    ["rendered-nonclaim-check", /RENDERED_NONCLAIM/],
    ["comment-resistant-rendered-check", /stripSourceComments/],
    ["returned-jsx-extraction", /extractLimitationsPageReturnedJsx/],
    ["balanced-return-parsing", /findMatchingDelimiter/],
    ["executable-source-mask", /maskNonExecutableSource/],
    ["masked-signature-discovery", /executableSource/],
    ["single-return-contract", /returnCount\s*!==\s*1/],
    ["invalid-page-structure", /invalid_limitations_page_structure/],
    ["skip-return-expression", /index\s*=\s*expressionEnd/],
    ["surface-symlink-failure", /symlink_in_public_surface/],
    ["methodology-symlink-failure", /symlink_in_methodology_contract/],
  ]) {
    if (!pattern.test(claimsScanner)) {
      failures.push(`claims-scanner:${label}`);
    }
  }

  const claimsWriter = readText(
    repoRoot,
    "infra/public-beta/write-claims-readiness-evidence.mjs",
  );
  for (const [label, pattern] of [
    ["commit-binding", /releaseCommit/],
    ["scan-status", /scanStatus/],
    ["pending-status", /AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING/],
    ["publication-pending", /publicationReviewStatus:\s*"pending"/],
    ["comparative-not-authorized", /comparativeClaimsStatus:\s*"not_authorized"/],
    ["not-gate-pass", /eligibleForGatePass:\s*false/],
  ]) {
    if (!pattern.test(claimsWriter)) {
      failures.push(`claims-evidence:${label}`);
    }
  }

  const publicationReview = readText(
    repoRoot,
    "docs/public-beta/PUBLICATION_REVIEW.md",
  );
  if (!/Current status:\*\* `PENDING_PUBLICATION_REVIEW`/.test(publicationReview)) {
    failures.push("publication-review:status");
  }
  for (const heading of [
    "Scope and prerequisites",
    "Publication inventory",
    "Claims classification",
    "Benchmark evidence",
    "Limitations and attribution",
    "Findings",
    "Sign-off",
  ]) {
    if (!new RegExp(`^## ${heading}`, "m").test(publicationReview)) {
      failures.push(
        `publication-review:${heading.toLowerCase().replaceAll(" ", "-")}`,
      );
    }
  }

  const middleware = readText(repoRoot, "apps/web/src/middleware.ts");
  for (const [label, pattern] of [
    ["nonce", /crypto[.]randomUUID/],
    ["csp", /Content-Security-Policy/],
    ["nosniff", /X-Content-Type-Options/],
    ["frame", /X-Frame-Options/],
    ["permissions", /Permissions-Policy/],
    ["referrer", /Referrer-Policy/],
  ]) {
    if (!pattern.test(middleware)) failures.push(`web-headers:${label}`);
  }
  if (/script-src[^;\n]*unsafe-(?:inline|eval)/.test(middleware)) {
    failures.push("web-headers:unsafe-script-source");
  }

  const originVerifier = readText(
    repoRoot,
    "infra/public-beta/verify-public-origin.mjs",
  );
  for (const [label, pattern] of [
    ["remote-confirmation", /PUBLIC_ORIGIN_CHECK/],
    ["https", /remote target must use HTTPS/],
    ["commit-binding", /releaseCommit/],
    ["bounded-body", /MAX_RESPONSE_BYTES/],
    ["nonce-rotation", /nonce-not-rotated/],
    ["privacy-safe-output", /failureCodes/],
  ]) {
    if (!pattern.test(originVerifier)) {
      failures.push(`public-origin-verifier:${label}`);
    }
  }

  const liveE2e = readText(repoRoot, "apps/web/e2e/live.spec.cjs");
  for (const [label, pattern] of [
    ["keyboard", /keyboard-only search flow/],
    ["mobile-targets", /mobile viewport layout: readable results \+ 44px line toggles/],
    ["axe", /a11y smoke: search \+ results screens/],
    ["limitations", /public-beta limitations are discoverable/],
    ["headers", /nonce-based baseline security headers/],
    ["csp-console", /cspConsoleErrors/],
  ]) {
    if (!pattern.test(liveE2e)) failures.push(`web-e2e:${label}`);
  }

  const accessibilityWriter = readText(
    repoRoot,
    "infra/public-beta/write-accessibility-evidence.mjs",
  );
  for (const [label, pattern] of [
    ["commit-binding", /releaseCommit/],
    ["automated-status", /AUTOMATED_PASS_HUMAN_PENDING/],
    ["human-pending", /humanReviewStatus:\s*"pending"/],
    ["not-gate-pass", /eligibleForGatePass:\s*false/],
  ]) {
    if (!pattern.test(accessibilityWriter)) {
      failures.push(`accessibility-evidence:${label}`);
    }
  }

  const incidentReadinessWriter = readText(
    repoRoot,
    "infra/public-beta/write-incident-readiness-evidence.mjs",
  );
  for (const [label, pattern] of [
    ["commit-binding", /releaseCommit/],
    ["playbook-status", /PLAYBOOK_PASS_ROTA_DRILL_PENDING/],
    ["rota-pending", /rotaStatus:\s*"pending_owner_approval"/],
    ["channel-pending", /channelStatus:\s*"pending_owner_approval"/],
    ["drill-pending", /tabletopDrillStatus:\s*"pending"/],
    ["not-gate-pass", /eligibleForGatePass:\s*false/],
  ]) {
    if (!pattern.test(incidentReadinessWriter)) {
      failures.push(`incident-readiness-evidence:${label}`);
    }
  }

  const privacySupportReadinessWriter = readText(
    repoRoot,
    "infra/public-beta/write-privacy-support-readiness-evidence.mjs",
  );
  for (const [label, pattern] of [
    ["commit-binding", /releaseCommit/],
    ["controls-status", /CONTROLS_PASS_APPROVAL_CHANNEL_PENDING/],
    ["policy-pending", /policyApprovalStatus:\s*"pending_owner_legal"/],
    ["retention-pending", /retentionEnforcementStatus:\s*"pending_deployed_evidence"/],
    ["channel-pending", /supportChannelStatus:\s*"pending_owner_approval"/],
    ["owner-pending", /responseOwnerStatus:\s*"pending_owner_approval"/],
    ["not-gate-pass", /eligibleForGatePass:\s*false/],
  ]) {
    if (!pattern.test(privacySupportReadinessWriter)) {
      failures.push(`privacy-support-readiness-evidence:${label}`);
    }
  }

  const workflow = readText(repoRoot, ".github/workflows/ci.yml");
  for (const [label, pattern] of [
    ["job", /^  public-beta-readiness:/m],
    ["contracts-install", /npm --prefix contracts ci/],
    ["browser-install", /playwright install --with-deps chromium/],
    ["e2e", /npm --prefix apps\/web run e2e/],
    ["accessibility-writer", /write-accessibility-evidence[.]mjs/],
    ["accessibility-artifact", /public-beta-accessibility-/],
    ["incident-readiness-writer", /write-incident-readiness-evidence[.]mjs/],
    ["incident-readiness-artifact", /public-beta-incident-readiness-/],
    ["privacy-support-writer", /write-privacy-support-readiness-evidence[.]mjs/],
    ["privacy-support-artifact", /public-beta-privacy-support-/],
    ["claims-commit", /CLAIMS_RELEASE_COMMIT:\s*\$\{\{ github[.]event[.]pull_request[.]head[.]sha \|\| github[.]sha \}\}/],
    ["claims-scanner", /scan-public-claims[.]mjs/],
    ["claims-scan-artifact", /infra\/public-beta\/evidence\/claims\/scan[.]json/],
    ["claims-writer", /write-claims-readiness-evidence[.]mjs/],
    ["claims-result-artifact", /infra\/public-beta\/evidence\/claims\/result[.]json/],
    ["claims-artifact", /public-beta-claims-\$\{\{ github[.]run_id \}\}/],
    ["node-tests", /node --test infra\/public-beta\/tests\/[^\s]+/],
    ["structure", /validate-readiness[.]mjs --structure-only/],
  ]) {
    if (!pattern.test(workflow)) failures.push(`workflow:${label}`);
  }
  const readinessJob = workflow.match(
    /^  public-beta-readiness:\n[\s\S]*?(?=^  public-beta-preview:)/m,
  )?.[0];
  if (!readinessJob) {
    failures.push("workflow:public-beta-readiness-job");
  } else {
    const structureIndex = readinessJob.indexOf("validate-readiness.mjs --structure-only");
    const scanIndex = readinessJob.indexOf("scan-public-claims.mjs");
    const writerIndex = readinessJob.indexOf("write-claims-readiness-evidence.mjs");
    const artifactIndex = readinessJob.indexOf("public-beta-claims-${{ github.run_id }}");
    if (
      structureIndex < 0 ||
      scanIndex < 0 ||
      writerIndex < 0 ||
      artifactIndex < 0 ||
      !(structureIndex < scanIndex && scanIndex < writerIndex && writerIndex < artifactIndex)
    ) {
      failures.push("workflow:claims-order");
    }
    const claimsCommitEnvLine = readinessJob
      .split("\n")
      .find((line) => line.includes("CLAIMS_RELEASE_COMMIT:"));
    const checkoutRefLine = readinessJob
      .split("\n")
      .find((line) => line.trim().startsWith("ref:"));
    if (!claimsCommitEnvLine || !checkoutRefLine) {
      failures.push("workflow:claims-checkout-ref");
    } else if (
      checkoutRefLine.trim().slice("ref:".length).trim() !==
      claimsCommitEnvLine.slice(claimsCommitEnvLine.indexOf(":") + 1).trim()
    ) {
      failures.push("workflow:claims-checkout-ref-mismatch");
    }
  }

  try {
    const template = JSON.parse(
      readText(repoRoot, "docs/public-beta/evidence-template.json"),
    );
    const ids = (template.gates ?? []).map((gate) => gate.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify([...REQUIRED_GATES].sort())) {
      failures.push("evidence-template:gate-set");
    }
    if ((template.gates ?? []).some((gate) => gate.status === "pass")) {
      failures.push("evidence-template:must-not-claim-pass");
    }
  } catch {
    failures.push("evidence-template:invalid-json");
  }
  return failures;
}

function currentCommit(repoRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function safeArtifact(repoRoot, artifact) {
  if (typeof artifact !== "string" || artifact.length === 0 || isAbsolute(artifact)) {
    return null;
  }
  const candidate = resolve(repoRoot, artifact);
  const rel = relative(repoRoot, candidate);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === "..") return null;
  if (!existsSync(candidate)) return null;
  const artifactStat = statSync(candidate);
  if (!artifactStat.isFile()) return null;
  const realRoot = realpathSync(repoRoot);
  const realCandidate = realpathSync(candidate);
  const realRel = relative(realRoot, realCandidate);
  if (realRel.startsWith(`..${sep}`) || realRel === "..") return null;
  return { path: realCandidate, size: artifactStat.size };
}

function evaluateEvidence(manifest, { repoRoot, expectedCommit }) {
  const reasons = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest:shape"];
  }
  if (manifest.schemaVersion !== 1) reasons.push("manifest:schema-version");
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/.test(manifest.releaseId ?? "")) {
    reasons.push("manifest:release-id");
  }
  if (Number.isNaN(Date.parse(manifest.generatedAt ?? ""))) {
    reasons.push("manifest:generated-at");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.commit ?? "")) {
    reasons.push("manifest:commit-shape");
  } else if (manifest.commit !== expectedCommit) {
    reasons.push("manifest:commit-mismatch");
  }

  const gates = Array.isArray(manifest.gates) ? manifest.gates : [];
  const byId = new Map();
  for (const gate of gates) {
    if (
      !gate ||
      typeof gate.id !== "string" ||
      !/^[a-z][a-z0-9_]{2,63}$/.test(gate.id) ||
      byId.has(gate.id)
    ) {
      reasons.push("gate:duplicate-or-invalid-id");
      continue;
    }
    byId.set(gate.id, gate);
  }
  for (const id of REQUIRED_GATES) {
    const gate = byId.get(id);
    if (!gate) {
      reasons.push(`gate:${id}:missing`);
      continue;
    }
    if (gate.status !== "pass") reasons.push(`gate:${id}:not-pass`);
    if (Number.isNaN(Date.parse(gate.observedAt ?? ""))) {
      reasons.push(`gate:${id}:observed-at`);
    }
    const artifact = safeArtifact(repoRoot, gate.artifact);
    if (!artifact) {
      reasons.push(`gate:${id}:artifact`);
      continue;
    }
    if (artifact.size > MAX_ARTIFACT_BYTES) {
      reasons.push(`gate:${id}:artifact-too-large`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/.test(gate.sha256 ?? "")) {
      reasons.push(`gate:${id}:sha256-shape`);
      continue;
    }
    const actual = createHash("sha256")
      .update(readFileSync(artifact.path))
      .digest("hex");
    if (actual !== gate.sha256) reasons.push(`gate:${id}:sha256-mismatch`);
  }
  for (const id of byId.keys()) {
    if (!REQUIRED_GATES.includes(id)) reasons.push("gate:unexpected-id");
  }
  return [...new Set(reasons)].sort();
}

function emitEvaluation(status, reasons = []) {
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      status,
      requiredGateCount: REQUIRED_GATES.length,
      failureCount: reasons.length,
      reasonCodes: reasons,
    })}\n`,
  );
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      `Readiness validation refused: ${error instanceof Error ? error.message : "invalid arguments"}`,
    );
    process.exitCode = 2;
    return;
  }

  if (options.structureOnly) {
    const failures = validateStructure(options.repoRoot);
    if (failures.length > 0) {
      console.error(`STRUCTURE_FAIL (${failures.join(",")})`);
      process.exitCode = 1;
      return;
    }
    console.log("STRUCTURE_PASS (readiness mechanics present; release evidence not asserted)");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(options.evidence), "utf8"));
  } catch {
    emitEvaluation("NOT_READY", ["manifest:unreadable"]);
    process.exitCode = 1;
    return;
  }
  let expectedCommit = options.expectedCommit;
  if (!expectedCommit) {
    try {
      expectedCommit = currentCommit(options.repoRoot);
    } catch {
      emitEvaluation("NOT_READY", ["manifest:expected-commit-unavailable"]);
      process.exitCode = 1;
      return;
    }
  }
  const reasons = evaluateEvidence(manifest, {
    repoRoot: options.repoRoot,
    expectedCommit,
  });
  if (reasons.length > 0) {
    emitEvaluation("NOT_READY", reasons);
    process.exitCode = 1;
    return;
  }
  emitEvaluation("READY_FOR_PUBLIC_BETA");
}

main();
