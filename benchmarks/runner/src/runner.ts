import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInvariants } from "./invariants/index.js";
import {
  BENCHMARKS_ROOT,
  caseToRequest,
  loadAndValidateCases,
} from "./paths.js";
import { buildReport, formatHumanReport } from "./report.js";
import { CaseAwareFixtureSut, FixtureSystemUnderTest } from "./sut.js";
import type { BenchmarkCase, CaseResult, SystemUnderTest } from "./types.js";

export interface RunOptions {
  validateOnly?: boolean;
  outDir?: string;
  sut?: SystemUnderTest;
  /** When set, only these case IDs are executed (order preserved from corpus load). */
  caseIds?: string[];
}

export function isSoftCase(c: BenchmarkCase): boolean {
  return (
    (c.tags ?? []).includes("soft_feasibility") ||
    c.classification === "pending_live_integration"
  );
}

export async function runBenchmarks(options: RunOptions = {}) {
  const { cases: allCases, errors } = await loadAndValidateCases();
  if (errors.length) {
    const msg = errors.map((e) => `${e.file}: ${e.message}`).join("\n");
    throw new Error(`Case validation failed:\n${msg}`);
  }

  let cases = allCases;
  if (options.caseIds) {
    const wanted = new Set(options.caseIds);
    const missing = options.caseIds.filter(
      (id) => !allCases.some((c) => c.caseId === id)
    );
    if (missing.length) {
      throw new Error(
        `Unknown case IDs in subset filter: ${missing.join(", ")}`
      );
    }
    cases = allCases.filter((c) => wanted.has(c.caseId));
  }

  if (options.validateOnly) {
    return {
      validateOnly: true as const,
      caseCount: allCases.length,
      cases: allCases,
      report: null,
      human: `Validated ${allCases.length} benchmark cases against schema.`,
    };
  }

  const fixtureInner = FixtureSystemUnderTest.fromCases(allCases);
  const sut = options.sut ?? new CaseAwareFixtureSut(fixtureInner);

  const findings: string[] = [];
  const results: CaseResult[] = [];

  for (const c of cases) {
    if (sut instanceof CaseAwareFixtureSut) {
      sut.setActiveCase(c.caseId);
    }

    const request = caseToRequest(c);
    const soft = isSoftCase(c);
    let response;
    let repeat;
    try {
      response = await sut.search(request);
      repeat = await sut.search(request);
    } catch (err) {
      results.push({
        caseId: c.caseId,
        title: c.title,
        classification: c.classification,
        categories: c.categories ?? [],
        assertions: [
          {
            invariantId: "valid_itinerary_structure",
            status: "fail",
            message: `SUT error: ${(err as Error).message}`,
          },
        ],
        passed: false,
        skipped: false,
        soft,
      });
      continue;
    }

    const assertions = await runInvariants(c.invariantAssertions, {
      benchmarkCase: c,
      request,
      response,
      repeatResponse: repeat,
    });

    const failed = assertions.filter((a) => a.status === "fail");
    const skipped =
      assertions.length > 0 && assertions.every((a) => a.status === "skip");

    if (
      c.classification === "synthetic_contract_fixture" &&
      failed.length > 0 &&
      c.sut.kind === "conductor_fixture"
    ) {
      findings.push(
        `Conductor fixture "${c.sut.responseId}" failed invariants on case ${c.caseId}: ${failed
          .map((f) => f.invariantId)
          .join(", ")}`
      );
    }

    results.push({
      caseId: c.caseId,
      title: c.title,
      classification: c.classification,
      categories: c.categories ?? [],
      assertions,
      passed: failed.length === 0,
      skipped,
      soft,
    });
  }

  const report = buildReport(sut.name, results, findings);
  const human = formatHumanReport(report);

  const outDir = options.outDir ?? path.join(BENCHMARKS_ROOT, "reports");
  await mkdir(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `benchmark-report-${stamp}.json`);
  const txtPath = path.join(outDir, `benchmark-report-${stamp}.txt`);
  const latestJson = path.join(outDir, "latest.json");
  const latestTxt = path.join(outDir, "latest.txt");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(txtPath, human);
  await writeFile(latestJson, JSON.stringify(report, null, 2));
  await writeFile(latestTxt, human);

  return {
    validateOnly: false as const,
    caseCount: cases.length,
    cases,
    report,
    human,
    jsonPath,
    txtPath,
  };
}
