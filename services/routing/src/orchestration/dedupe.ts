/**
 * Deterministic draft dedupe by content fingerprint (ADR-0023).
 * First-seen wins — callers must pass drafts in stable family order.
 */

import { fingerprintItinerary } from "../fingerprint.ts";
import type { RawCandidateDraft } from "../types.ts";

export function dedupeDraftsByFingerprint(
  drafts: readonly RawCandidateDraft[],
): RawCandidateDraft[] {
  const seen = new Set<string>();
  const out: RawCandidateDraft[] = [];
  for (const draft of drafts) {
    const fp = fingerprintItinerary({
      legs: draft.legs,
      arrivalTime: draft.arrivalTime,
      transferCount: draft.transferCount,
      walkingSeconds: draft.walkingSeconds,
      durationSeconds: draft.durationSeconds,
    });
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(draft);
  }
  return out;
}
