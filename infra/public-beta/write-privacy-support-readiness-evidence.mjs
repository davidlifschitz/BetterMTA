#!/usr/bin/env node

const CHECKS = Object.freeze([
  "policy-and-provider-disclosure",
  "retention-and-deletion-contract",
  "privacy-safe-logging-controls",
  "support-intake-and-response",
]);

function fail(code) {
  process.stderr.write(`ERROR ${code}\n`);
  process.exitCode = 2;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    if (flag === "--release-commit") options.releaseCommit = value;
    else if (flag === "--controls-status") options.controlsStatus = value;
    else return null;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments");
} else if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
  fail("invalid_release_commit");
} else if (options.controlsStatus !== "pass") {
  fail("invalid_controls_status");
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "CONTROLS_PASS_APPROVAL_CHANNEL_PENDING",
        evidenceClass: "ci-privacy-support-readiness",
        gateId: "privacy_support_approval",
        releaseCommit: options.releaseCommit,
        checks: CHECKS,
        policyApprovalStatus: "pending_owner_legal",
        retentionEnforcementStatus: "pending_deployed_evidence",
        supportChannelStatus: "pending_owner_approval",
        responseOwnerStatus: "pending_owner_approval",
        eligibleForGatePass: false,
        productionMutation: false,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}
