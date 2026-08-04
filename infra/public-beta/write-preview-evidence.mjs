#!/usr/bin/env node

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
    else if (flag === "--image-id") options.imageId = value;
    else if (flag === "--smoke-status") options.smokeStatus = value;
    else return null;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments");
} else if (!/^[0-9a-f]{40}$/.test(options.releaseCommit ?? "")) {
  fail("invalid_release_commit");
} else if (!/^sha256:[0-9a-f]{64}$/.test(options.imageId ?? "")) {
  fail("invalid_image_id");
} else if (options.smokeStatus !== "pass") {
  fail("invalid_smoke_status");
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "PASS",
        previewClass: "ci-runner-local-production-container",
        releaseCommit: options.releaseCommit,
        imageId: options.imageId,
        smokeStatus: options.smokeStatus,
        productionMutation: false,
        externalReachabilityVerified: false,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}
