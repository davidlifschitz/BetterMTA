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
 * Note: ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BENCHMARKS_ROOT } from "./paths.js";
import { runBenchmarks } from "./runner.js";
import type { InvariantId } from "./types.js";

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

async function main() {
  try {
    const subsetPath = parseSubsetArg(process.argv.slice(2)) ?? DEFAULT_SUBSET_PATH;
    const caseIds = await loadSubsetCaseIds(subsetPath);

    const result = await runBenchmarks({ caseIds });
    if (result.validateOnly || !result.report) {
      console.error("Unexpected validate-only result in gate");
      process.exit(2);
    }

    const casesById = new Map(result.cases.map((c) => [c.caseId, c]));
    const configFailures: string[] = [];

    for (const id of caseIds) {
      const c = casesById.get(id);
      if (!c) {
        configFailures.push(`${id}: missing from loaded corpus`);
        continue;
      }
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
      for (const a of c.assertions) {
        if (a.status !== "fail") continue;
        if (!MERGE_BLOCKING.has(a.invariantId)) continue;
        blockingFailures.push(`${c.caseId} :: ${a.invariantId} :: ${a.message}`);
      }
    }

    let rankingPasses = 0;
    for (const c of result.report.cases) {
      for (const a of c.assertions) {
        if (RANKING_INVARIANTS.has(a.invariantId) && a.status === "pass") {
          rankingPasses += 1;
        }
      }
    }

    console.log(result.human);
    console.log("");
    console.log(`Release subset: ${subsetPath} (${caseIds.length} cases)`);
    console.log(
      "NOTE: ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate."
    );
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
