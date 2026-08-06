#!/usr/bin/env node

const CHECKS = Object.freeze([
  "named-competitor-claim-scan",
  "explicit-public-nonclaim",
  "benchmark-methodology-contract",
  "publication-review-protocol",
]);

function fail(code) {
  process.stderr.write(`ERROR ${code}\n`);
  process.exitCode = 2;
}

function parseArgs(args) {
  if (args.length !== 4) return null;
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      value === undefined ||
      value.startsWith("--")
    ) {
      return null;
    }
    if (flag === "--release-commit") options.releaseCommit = value;
    else if (flag === "--scan-status") options.scanStatus = value;
    else return null;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments");
} else if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
  fail("invalid_release_commit");
} else if (options.scanStatus !== "pass") {
  fail("invalid_scan_status");
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING",
        evidenceClass: "ci-claims-discipline-readiness",
        gateId: "claims_discipline",
        releaseCommit: options.releaseCommit,
        checks: CHECKS,
        publicationReviewStatus: "pending",
        comparativeClaimsStatus: "not_authorized",
        eligibleForGatePass: false,
        productionMutation: false,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}
