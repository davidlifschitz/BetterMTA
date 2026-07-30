import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInvariants } from "./invariants/index.js";
import {
  BENCHMARKS_ROOT,
  REPORTS_DIR,
  caseToRequest,
  loadAndValidateCases,
} from "./paths.js";
import { buildReport, formatHumanReport } from "./report.js";
import {
  buildShadowEntry,
  writeShadowReport,
  type ShadowCaseEntry,
  type ShadowReport,
} from "./shadow-report.js";
import {
  CaseAwareFixtureSut,
  FixtureSystemUnderTest,
  HybridLiveSut,
} from "./sut.js";
import { LiveSystemUnderTest } from "./sut-live.js";
import { isSoftCase } from "./release-subset-policy.js";
import type {
  BenchmarkCase,
  CaseResult,
  SutMode,
  SystemUnderTest,
} from "./types.js";

export { isSoftCase } from "./release-subset-policy.js";

export interface RunOptions {
  validateOnly?: boolean;
  outDir?: string;
  sut?: SystemUnderTest;
  sutMode?: SutMode;
  /** When set, only these case IDs are executed (order preserved from corpus load). */
  caseIds?: string[];
}

export function resolveSutMode(
  explicit?: SutMode,
  env: NodeJS.ProcessEnv = process.env
): SutMode {
  if (explicit) return explicit;
  const raw = (env.BETTERMTA_SUT ?? "fixture").trim().toLowerCase();
  if (raw === "live" || raw === "fixture") return raw;
  throw new Error(
    `Invalid BETTERMTA_SUT="${env.BETTERMTA_SUT}" (expected live|fixture)`
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
      sutMode: resolveSutMode(options.sutMode),
      shadowReportPaths: null,
    };
  }

  const sutMode = resolveSutMode(options.sutMode);
  const fixtureInner = FixtureSystemUnderTest.fromCases(allCases);

  let sut: SystemUnderTest;
  let hybrid: HybridLiveSut | null = null;
  let fixtureSut: CaseAwareFixtureSut | null = null;

  if (options.sut) {
    sut = options.sut;
  } else if (sutMode === "live") {
    hybrid = new HybridLiveSut(new LiveSystemUnderTest(), fixtureInner);
    sut = hybrid;
  } else {
    fixtureSut = new CaseAwareFixtureSut(fixtureInner);
    sut = fixtureSut;
  }

  const findings: string[] = [];
  const results: CaseResult[] = [];
  const shadowEntries: ShadowCaseEntry[] = [];

  for (const c of cases) {
    if (fixtureSut) fixtureSut.setActiveCase(c.caseId);
    if (hybrid) hybrid.setActiveCase(c);

    const request = caseToRequest(c);
    const soft = isSoftCase(c, sutMode);

    // Under fixture SUT, skip live cases as soft (do not fail CI).
    if (
      sutMode === "fixture" &&
      (c.classification === "live" || c.sut.kind === "live")
    ) {
      results.push({
        caseId: c.caseId,
        title: c.title,
        classification: c.classification,
        categories: c.categories ?? [],
        assertions: [
          {
            invariantId: "valid_itinerary_structure",
            status: "skip",
            message:
              "Skipped under fixture SUT — set BETTERMTA_SUT=live to execute against HTTP API",
          },
        ],
        // soft placeholder (not a pass); skipped=false so report soft totals stay coherent
        passed: true,
        skipped: false,
        soft: true,
      });
      continue;
    }

    const hitLive = Boolean(hybrid?.usesLiveHttp(c));
    let response;
    let repeat;
    let latencyMs = 0;
    try {
      response = await sut.search(request);
      if (hitLive && hybrid) {
        latencyMs = hybrid.live.lastMeta?.latencyMs ?? 0;
      }
      repeat = await sut.search(request);
    } catch (err) {
      const message = (err as Error).message;
      if (hitLive && hybrid) {
        latencyMs = hybrid.live.lastMeta?.latencyMs ?? 0;
        shadowEntries.push(
          buildShadowEntry({
            benchmarkCase: c,
            request,
            latencyMs,
            error: message,
          })
        );
      }
      results.push({
        caseId: c.caseId,
        title: c.title,
        classification: c.classification,
        categories: c.categories ?? [],
        assertions: [
          {
            invariantId: "valid_itinerary_structure",
            status: "fail",
            message: `SUT error: ${message}`,
          },
        ],
        passed: false,
        skipped: false,
        soft,
      });
      continue;
    }

    if (hitLive) {
      shadowEntries.push(
        buildShadowEntry({
          benchmarkCase: c,
          request,
          response,
          latencyMs,
        })
      );
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

  let shadowReportPaths: { jsonPath: string; txtPath: string } | null = null;
  if (sutMode === "live" && shadowEntries.length > 0) {
    const shadow: ShadowReport = {
      generatedAt: report.generatedAt,
      sutName: sut.name,
      apiBase:
        hybrid?.live.baseUrl ??
        process.env.BETTERMTA_LIVE_API_BASE ??
        "http://127.0.0.1:8080",
      humanValidityDefault: "pending_review",
      cases: shadowEntries,
    };
    shadowReportPaths = await writeShadowReport(outDir, shadow);
  }

  return {
    validateOnly: false as const,
    caseCount: cases.length,
    cases,
    report,
    human,
    jsonPath,
    txtPath,
    sutMode,
    shadowReportPaths,
    reportsDir: outDir || REPORTS_DIR,
  };
}
