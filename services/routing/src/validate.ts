import type { CandidateItinerary, Leg, RawCandidateDraft } from "./types.ts";

export type DraftRejectReason =
  | "empty_legs"
  | "negative_durationSeconds"
  | "negative_walkingSeconds"
  | "negative_waitingSeconds"
  | "negative_transferCount"
  | "transit_depart_after_arrive"
  | "legs_non_chronological";

export interface DraftValidationResult {
  ok: boolean;
  reason?: DraftRejectReason;
}

function isNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function transitEndMs(leg: Extract<Leg, { kind: "transit" }>): number {
  return Date.parse(leg.arriveTime);
}

function transitStartMs(leg: Extract<Leg, { kind: "transit" }>): number {
  return Date.parse(leg.departTime);
}

/**
 * Reject invalid drafts before enrichment/ranking.
 * Checks: ≥1 leg; nonnegative duration/walk/wait/transfer metrics;
 * each transit depart ≤ arrive; transit legs non-overlapping in encounter order.
 */
export function validateCandidateDraft(
  draft: RawCandidateDraft | CandidateItinerary,
): DraftValidationResult {
  if (!draft.legs || draft.legs.length === 0) {
    return { ok: false, reason: "empty_legs" };
  }
  if (!isNonNegative(draft.durationSeconds)) {
    return { ok: false, reason: "negative_durationSeconds" };
  }
  if (!isNonNegative(draft.walkingSeconds)) {
    return { ok: false, reason: "negative_walkingSeconds" };
  }
  if (!isNonNegative(draft.waitingSeconds)) {
    return { ok: false, reason: "negative_waitingSeconds" };
  }
  if (!isNonNegative(draft.transferCount)) {
    return { ok: false, reason: "negative_transferCount" };
  }

  let previousTransitArriveMs: number | null = null;
  for (const leg of draft.legs) {
    if (leg.kind !== "transit") continue;
    const departMs = transitStartMs(leg);
    const arriveMs = transitEndMs(leg);
    if (
      !Number.isFinite(departMs) ||
      !Number.isFinite(arriveMs) ||
      departMs > arriveMs
    ) {
      return { ok: false, reason: "transit_depart_after_arrive" };
    }
    if (
      previousTransitArriveMs !== null &&
      departMs < previousTransitArriveMs
    ) {
      return { ok: false, reason: "legs_non_chronological" };
    }
    previousTransitArriveMs = arriveMs;
  }

  return { ok: true };
}

export function countRejection(
  counts: Record<string, number>,
  reason: DraftRejectReason,
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}
