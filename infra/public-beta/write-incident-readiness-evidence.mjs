#!/usr/bin/env node

const CHECKS = Object.freeze([
  "detection-severity-roles",
  "stop-response-recovery",
  "privacy-safe-communications-evidence",
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
    else if (flag === "--playbook-status") options.playbookStatus = value;
    else return null;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments");
} else if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
  fail("invalid_release_commit");
} else if (options.playbookStatus !== "pass") {
  fail("invalid_playbook_status");
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "PLAYBOOK_PASS_ROTA_DRILL_PENDING",
        evidenceClass: "ci-incident-playbook-readiness",
        gateId: "incident_response",
        releaseCommit: options.releaseCommit,
        checks: CHECKS,
        rotaStatus: "pending_owner_approval",
        channelStatus: "pending_owner_approval",
        tabletopDrillStatus: "pending",
        eligibleForGatePass: false,
        productionMutation: false,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}
