#!/usr/bin/env node
import { resolveSutMode, runBenchmarks } from "./runner.js";
import type { SutMode } from "./types.js";

function parseSutArg(argv: string[]): SutMode | undefined {
  const idx = argv.indexOf("--sut");
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("-")) {
    throw new Error("--sut requires live|fixture");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized !== "live" && normalized !== "fixture") {
    throw new Error(`Invalid --sut=${value} (expected live|fixture)`);
  }
  return normalized;
}

async function main() {
  const argv = process.argv.slice(2);
  const validateOnly = argv.includes("--validate-only");
  const sutMode = resolveSutMode(parseSutArg(argv));
  const result = await runBenchmarks({ validateOnly, sutMode });
  console.log(result.human);
  if (result.shadowReportPaths) {
    console.log("");
    console.log(`Shadow report JSON: ${result.shadowReportPaths.jsonPath}`);
    console.log(`Shadow report TXT:  ${result.shadowReportPaths.txtPath}`);
  }
  if (validateOnly) {
    process.exit(0);
  }
  if (!result.report) {
    process.exit(2);
  }
  process.exit(result.report.totals.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
