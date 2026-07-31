/**
 * Release-subset policy: soft / pending / fixture-soft-live cases must never
 * be merge-blocking members of the release subset.
 */
import type { BenchmarkCase, SutMode } from "./types.js";

export type SoftSubsetCase = Pick<
  BenchmarkCase,
  "caseId" | "tags" | "classification" | "sut"
>;

export function isSoftCase(
  c: SoftSubsetCase,
  sutMode: SutMode = "fixture"
): boolean {
  if ((c.tags ?? []).includes("soft_feasibility")) return true;
  if (c.classification === "pending_live_integration") return true;
  // Live cases are soft placeholders under fixture SUT (cannot execute without HTTP).
  if (
    (c.classification === "live" || c.sut.kind === "live") &&
    sutMode !== "live"
  ) {
    return true;
  }
  return false;
}

/**
 * Returns human-readable violations when any subset case is soft under the
 * active SUT mode (soft_feasibility, pending_live_integration, or live under
 * fixture SUT). Empty array means the subset is hard-eligible.
 */
export function collectSoftSubsetViolations(
  cases: SoftSubsetCase[],
  caseIds: string[],
  sutMode: SutMode
): string[] {
  const byId = new Map(cases.map((c) => [c.caseId, c]));
  const violations: string[] = [];

  for (const id of caseIds) {
    const c = byId.get(id);
    if (!c) continue;
    if (!isSoftCase(c, sutMode)) continue;

    const reasons: string[] = [];
    if ((c.tags ?? []).includes("soft_feasibility")) {
      reasons.push("tag:soft_feasibility");
    }
    if (c.classification === "pending_live_integration") {
      reasons.push("classification:pending_live_integration");
    }
    if (
      (c.classification === "live" || c.sut.kind === "live") &&
      sutMode !== "live"
    ) {
      reasons.push("live_case_soft_under_fixture_sut");
    }
    if (reasons.length === 0) {
      reasons.push("isSoftCase");
    }
    violations.push(
      `${id}: soft/pending case must not appear in release-subset (${reasons.join(", ")})`
    );
  }

  return violations;
}
