#!/usr/bin/env node
import { runBenchmarks } from "./runner.js";

async function main() {
  const validateOnly = process.argv.includes("--validate-only");
  const result = await runBenchmarks({ validateOnly });
  console.log(result.human);
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
