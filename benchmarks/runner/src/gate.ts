#!/usr/bin/env node
/**
 * CI quality gate — exit codes:
 *   0 = merge-blocking invariant classes all pass on the release subset
 *   1 = merge-blocking failure
 *   2 = runner / configuration error
 *
 * Merge-blocking classes (ACCEPTANCE_CRITERIA §D):
 *   - valid_itinerary_structure (topology / schema validity)
 *   - satisfaction_accounting (selected-line accounting)
 *   - chronological_legs, nonnegative_durations (structural integrity)
 *   - complete_beats_partial, max_satisfaction_before_time (ranking)
 *   - deterministic_order
 *   - max_three_itineraries
 *   - honest_data_mode
 *   - impossible_constraint_explanation
 *   - origin_destination_consistency
 *   - expected_feasibility, minimum_satisfaction (non-soft synthetic / release subset)
 *
 * Release-subset policy: soft_feasibility / pending_live_integration / live-under-fixture
 * cases in the subset are configuration failures (exit 1). Soft cases never count
 * toward rankingPasses.
 *
 * Note: ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate.
 * Fly-deploy BLOCKED and Google NOT_CLAIMED checklist rows do not fail the gate alone.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BENCHMARKS_ROOT, REPORTS_DIR } from "./paths.js";
import {
  buildReleaseChecklist,
  writeReleaseChecklist,
} from "./release-checklist.js";
import { collectSoftSubsetViolations } from "./release-subset-policy.js";
import { resolveSutMode, runBenchmarks } from "./runner.js";
import type { InvariantId, SutMode } from "./types.js";

const MERGE_BLOCKING: Set<InvariantId> = new Set([
  "valid_itinerary_structure",
  "satisfaction_accounting",
  "chronological_legs",
  "nonnegative_durations",
  "complete_beats_partial",
  "max_satisfaction_before_time",
  "deterministic_order",
  "max_three_itineraries",
  "honest_data_mode",
  "impossible_constraint_explanation",
  "origin_destination_consistency",
  "expected_feasibility",
  "minimum_satisfaction",
]);

const RANKING_INVARIANTS: Set<InvariantId> = new Set([
  "complete_beats_partial",
  "max_satisfaction_before_time",
]);

const DEFAULT_SUBSET_PATH = path.join(BENCHMARKS_ROOT, "release-subset.json");

function parseSubsetArg(argv: string[]): string | undefined {
  const idx = argv.indexOf("--subset");
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("-")) {
    throw new Error("--subset requires a path argument");
  }
  return value;
}

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

async function loadSubsetCaseIds(subsetPath: string): Promise<string[]> {
  const raw = await readFile(subsetPath, "utf8");
  const data = JSON.parse(raw) as { caseIds?: unknown };
  if (!Array.isArray(data.caseIds) || data.caseIds.length === 0) {
    throw new Error(
      `Release subset ${subsetPath} must contain a non-empty caseIds array`
    );
  }
  if (!data.caseIds.every((id) => typeof id === "string" && id.length > 0)) {
    throw new Error(`Release subset ${subsetPath} caseIds must be strings`);
  }
  return data.caseIds as string[];
}

/** True when we already recorded a soft-subset violation for this case id. */
function isSoftListed(configFailures: string[], caseId: string): boolean {
  const prefix = `${caseId}: soft/pending case must not appear in release-subset`;
  return configFailures.some((f) => f.startsWith(prefix));
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    const subsetPath = parseSubsetArg(argv) ?? DEFAULT_SUBSET_PATH;
    const sutMode = resolveSutMode(parseSutArg(argv));
    const caseIds = await loadSubsetCaseIds(subsetPath);

    const result = await runBenchmarks({ caseIds, sutMode });
    if (result.validateOnly || !result.report) {
      console.error("Unexpected validate-only result in gate");
      process.exit(2);
    }

    const casesById = new Map(result.cases.map((c) => [c.caseId, c]));
    const configFailures: string[] = [];

    // Soft/pending/fixture-soft-live cases are forbidden in the release subset.
    for (const v of collectSoftSubsetViolations(
      result.cases,
      caseIds,
      sutMode
    )) {
      configFailures.push(v);
    }

    for (const id of caseIds) {
      const c = casesById.get(id);
      if (!c) {
        configFailures.push(`${id}: missing from loaded corpus`);
        continue;
      }
      if (isSoftListed(configFailures, id)) continue;
      const present = new Set(c.invariantAssertions);
      for (const inv of MERGE_BLOCKING) {
        if (!present.has(inv)) {
          configFailures.push(
            `${id}: merge-blocking invariant "${inv}" soft-omitted / missing from invariantAssertions`
          );
        }
      }
    }

    const blockingFailures: string[] = [];
    for (const c of result.report.cases) {
      if (c.soft) continue;
      for (const a of c.assertions) {
        if (a.status !== "fail") continue;
        if (!MERGE_BLOCKING.has(a.invariantId)) continue;
        blockingFailures.push(`${c.caseId} :: ${a.invariantId} :: ${a.message}`);
      }
    }

    let rankingPasses = 0;
    for (const c of result.report.cases) {
      if (c.soft) continue;
      for (const a of c.assertions) {
        if (RANKING_INVARIANTS.has(a.invariantId) && a.status === "pass") {
          rankingPasses += 1;
        }
      }
    }

    const checklist = buildReleaseChecklist({
      generatedAt: result.report.generatedAt,
      sutMode,
      subsetPath,
      subsetCaseCount: caseIds.length,
      rankingPasses,
      blockingFailures,
      configFailures,
      report: result.report,
      shadowReportPath: result.shadowReportPaths?.jsonPath ?? null,
    });
    const checklistPath = await writeReleaseChecklist(
      result.reportsDir ?? REPORTS_DIR,
      checklist
    );

    console.log(result.human);
    console.log("");
    console.log(`Release subset: ${subsetPath} (${caseIds.length} cases)`);
    console.log(`SUT mode: ${sutMode}`);
    console.log(
      "NOTE: ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate."
    );
    console.log(`Release checklist: ${checklistPath}`);
    if (result.shadowReportPaths) {
      console.log(`Shadow report: ${result.shadowReportPaths.jsonPath}`);
    }
    console.log("");
    for (const item of checklist.items) {
      console.log(`[${item.status}] ${item.id} ${item.title}`);
    }
    console.log("");

    if (configFailures.length) {
      console.error(
        `GATE FAIL: ${configFailures.length} release-subset configuration error(s)`
      );
      for (const f of configFailures) console.error(`  - ${f}`);
      process.exit(1);
    }

    if (rankingPasses === 0) {
      console.error(
        "GATE FAIL: ranking-invariant coverage in the release subset is zero (need ≥1 multi-itinerary case where complete_beats_partial or max_satisfaction_before_time PASSes)"
      );
      process.exit(1);
    }

    if (blockingFailures.length) {
      console.error(
        `GATE FAIL: ${blockingFailures.length} merge-blocking assertion(s)`
      );
      for (const f of blockingFailures) console.error(`  - ${f}`);
      process.exit(1);
    }

    console.log(
      `GATE PASS: all merge-blocking invariant classes passed on release subset (rankingPasses=${rankingPasses})`
    );
    console.log(
      "NOTE: Fly BLOCKED / Google NOT_CLAIMED checklist rows did not affect exit code."
    );
    if (result.report.findings.length) {
      console.log("Findings (non-exit-affecting unless above):");
      for (const f of result.report.findings) console.log(`  - ${f}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`GATE ERROR: ${(err as Error).message}`);
    process.exit(2);
  }
}

main();
