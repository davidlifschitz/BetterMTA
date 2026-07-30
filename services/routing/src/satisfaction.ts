import type { SatisfactionResult, TransitLeg, Leg } from "./types.ts";
import { MAX_SELECTED_LINES } from "./types.ts";

/** Thrown when deduped selectedLineIds exceeds ADR-0006 max (fail closed). */
export class TooManySelectedLinesError extends Error {
  readonly code = "too_many_selected_lines" as const;
  readonly selectedCount: number;
  readonly maxAllowed: number;

  constructor(selectedCount: number, maxAllowed: number = MAX_SELECTED_LINES) {
    super(
      `Too many selected lines: ${selectedCount} exceeds max ${maxAllowed} (ADR-0006).`,
    );
    this.name = "TooManySelectedLinesError";
    this.selectedCount = selectedCount;
    this.maxAllowed = maxAllowed;
  }
}

/**
 * Normalize selected line IDs: trim, drop empties, dedupe preserving first-seen order.
 * Fail closed when deduped count exceeds MAX_SELECTED_LINES (ADR-0006).
 */
export function normalizeSelectedLineIds(selectedLineIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of selectedLineIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length > MAX_SELECTED_LINES) {
    throw new TooManySelectedLinesError(out.length, MAX_SELECTED_LINES);
  }
  return out;
}

export function transitLegsOf(legs: readonly Leg[]): TransitLeg[] {
  return legs.filter((leg): leg is TransitLeg => leg.kind === "transit");
}

/** Ordered distinct lineIds from transit legs (lineSequence). */
export function lineSequenceFromLegs(legs: readonly Leg[]): string[] {
  const seq: string[] = [];
  const seen = new Set<string>();
  for (const leg of transitLegsOf(legs)) {
    if (seen.has(leg.lineId)) continue;
    seen.add(leg.lineId);
    seq.push(leg.lineId);
  }
  return seq;
}

/**
 * Library-only helper: sum ride seconds per lineId from transit legs.
 * Not part of API contract shapes — exposed on RouteSearchOutcome extras.
 * Uses leg.durationSeconds when present; otherwise arrive−depart.
 */
export function computePerLineRideSeconds(
  legs: readonly Leg[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const leg of transitLegsOf(legs)) {
    const seconds =
      typeof leg.durationSeconds === "number" && Number.isFinite(leg.durationSeconds)
        ? Math.max(0, leg.durationSeconds)
        : Math.max(
            0,
            Math.round(
              (Date.parse(leg.arriveTime) - Date.parse(leg.departTime)) / 1000,
            ),
          );
    out[leg.lineId] = (out[leg.lineId] ?? 0) + seconds;
  }
  return out;
}

/**
 * Exact selected-line satisfaction per DOMAIN_MODEL.
 * - Distinct lines only; duplicates never double-count.
 * - A line counts only if a transit leg uses it.
 * - Local/express sharing the same lineId count once (by construction).
 */
export function computeSatisfaction(
  requestedLineIdsInput: readonly string[],
  legs: readonly Leg[],
): SatisfactionResult {
  const requestedLineIds = normalizeSelectedLineIds(requestedLineIdsInput);
  const requestedCount = requestedLineIds.length;

  if (requestedCount === 0) {
    return {
      requestedLineIds: [],
      satisfiedLineIds: [],
      omittedLineIds: [],
      satisfactionCount: 0,
      requestedCount: 0,
      isComplete: true,
      feasibility: "not_applicable",
    };
  }

  const usedLineIds = new Set(transitLegsOf(legs).map((leg) => leg.lineId));
  const satisfiedLineIds = requestedLineIds.filter((id) => usedLineIds.has(id));
  const omittedLineIds = requestedLineIds.filter((id) => !usedLineIds.has(id));
  const satisfactionCount = satisfiedLineIds.length;
  const isComplete = satisfactionCount === requestedCount;

  let feasibility: SatisfactionResult["feasibility"];
  if (isComplete) feasibility = "complete";
  else if (satisfactionCount > 0) feasibility = "partial";
  else feasibility = "none";

  return {
    requestedLineIds,
    satisfiedLineIds,
    omittedLineIds,
    satisfactionCount,
    requestedCount,
    isComplete,
    feasibility,
  };
}
