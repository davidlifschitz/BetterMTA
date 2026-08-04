#!/usr/bin/env node

const CHECKS = Object.freeze([
  "keyboard-only-core-flow",
  "mobile-44px-targets",
  "axe-wcag2a-wcag2aa",
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
    else if (flag === "--suite-status") options.suiteStatus = value;
    else return null;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments");
} else if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
  fail("invalid_release_commit");
} else if (options.suiteStatus !== "pass") {
  fail("invalid_suite_status");
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "AUTOMATED_PASS_HUMAN_PENDING",
        evidenceClass: "ci-mocked-live-accessibility",
        gateId: "accessibility_core_flow",
        releaseCommit: options.releaseCommit,
        checks: CHECKS,
        humanReviewStatus: "pending",
        eligibleForGatePass: false,
        productionMutation: false,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}
