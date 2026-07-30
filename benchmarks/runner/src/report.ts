import type { BenchmarkReport, CaseResult } from "./types.js";

export function buildReport(
  sutName: string,
  cases: CaseResult[],
  findings: string[] = []
): BenchmarkReport {
  const byClassification: BenchmarkReport["byClassification"] = {};
  let assertionsPassed = 0;
  let assertionsFailed = 0;
  let assertionsSkipped = 0;

  for (const c of cases) {
    const bucket = byClassification[c.classification] ?? {
      cases: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      soft: 0,
    };
    bucket.cases += 1;
    if (!c.passed && !c.skipped) bucket.failed += 1;
    else if (c.soft) bucket.soft += 1;
    else if (c.skipped) bucket.skipped += 1;
    else bucket.passed += 1;
    byClassification[c.classification] = bucket;

    for (const a of c.assertions) {
      if (a.status === "pass") assertionsPassed += 1;
      else if (a.status === "fail") assertionsFailed += 1;
      else assertionsSkipped += 1;
    }
  }

  // Soft placeholders that pass structurally count as soft (not pass). Soft cases
  // that fail assertions still count as fail so wiring regressions are visible.
  const failed = cases.filter((c) => !c.passed && !c.skipped).length;
  const soft = cases.filter((c) => c.soft && c.passed && !c.skipped).length;
  const passed = cases.filter(
    (c) => c.passed && !c.skipped && !c.soft
  ).length;
  const skipped = cases.filter((c) => c.skipped && !c.soft).length;

  return {
    generatedAt: new Date().toISOString(),
    sutName,
    totals: {
      cases: cases.length,
      passed,
      failed,
      skipped,
      soft,
      assertionsPassed,
      assertionsFailed,
      assertionsSkipped,
    },
    byClassification,
    cases,
    findings,
  };
}

export function formatHumanReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`BetterMTA Benchmark Report`);
  lines.push(`SUT: ${report.sutName}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(
    `Cases: ${report.totals.cases} | pass=${report.totals.passed} fail=${report.totals.failed} soft=${report.totals.soft} skipped=${report.totals.skipped}`
  );
  lines.push(
    `Assertions: pass=${report.totals.assertionsPassed} fail=${report.totals.assertionsFailed} skip=${report.totals.assertionsSkipped}`
  );
  lines.push("");
  lines.push("By classification:");
  for (const [k, v] of Object.entries(report.byClassification).sort()) {
    lines.push(
      `  ${k}: cases=${v.cases} pass=${v.passed} fail=${v.failed} soft=${v.soft} skipped=${v.skipped}`
    );
  }
  lines.push("");
  for (const c of report.cases) {
    const mark =
      !c.passed && !c.skipped
        ? "FAIL"
        : c.soft
          ? "SOFT"
          : c.skipped
            ? "SKIP"
            : "PASS";
    lines.push(`[${mark}] ${c.caseId} — ${c.title}`);
    for (const a of c.assertions) {
      lines.push(`    ${a.status.toUpperCase()} ${a.invariantId}: ${a.message}`);
    }
  }
  if (report.findings.length) {
    lines.push("");
    lines.push("Findings:");
    for (const f of report.findings) lines.push(`  - ${f}`);
  }
  return lines.join("\n");
}
