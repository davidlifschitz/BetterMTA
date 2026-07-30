import type { Itinerary, RealtimeConfidence } from "./types.ts";

const CONFIDENCE_RANK: Record<RealtimeConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export function realtimeConfidenceRank(c: RealtimeConfidence): number {
  return CONFIDENCE_RANK[c];
}

/** Lexicographic compare for constrained candidates (ADR-0007). Negative ⇒ a before b. */
export function compareConstrained(a: Itinerary, b: Itinerary): number {
  if (a.satisfaction.satisfactionCount !== b.satisfaction.satisfactionCount) {
    return b.satisfaction.satisfactionCount - a.satisfaction.satisfactionCount;
  }
  if (a.arrivalTime !== b.arrivalTime) {
    return a.arrivalTime < b.arrivalTime ? -1 : 1;
  }
  if (a.transferCount !== b.transferCount) {
    return a.transferCount - b.transferCount;
  }
  if (a.walkingSeconds !== b.walkingSeconds) {
    return a.walkingSeconds - b.walkingSeconds;
  }
  const conf =
    realtimeConfidenceRank(b.realtimeConfidence) -
    realtimeConfidenceRank(a.realtimeConfidence);
  if (conf !== 0) return conf;
  if (a.fingerprint !== b.fingerprint) {
    return a.fingerprint < b.fingerprint ? -1 : 1;
  }
  return 0;
}

/** Baseline ranking: ADR-0007 steps 2–6 only. */
export function compareBaseline(a: Itinerary, b: Itinerary): number {
  if (a.arrivalTime !== b.arrivalTime) {
    return a.arrivalTime < b.arrivalTime ? -1 : 1;
  }
  if (a.transferCount !== b.transferCount) {
    return a.transferCount - b.transferCount;
  }
  if (a.walkingSeconds !== b.walkingSeconds) {
    return a.walkingSeconds - b.walkingSeconds;
  }
  const conf =
    realtimeConfidenceRank(b.realtimeConfidence) -
    realtimeConfidenceRank(a.realtimeConfidence);
  if (conf !== 0) return conf;
  if (a.fingerprint !== b.fingerprint) {
    return a.fingerprint < b.fingerprint ? -1 : 1;
  }
  return 0;
}

export function rankConstrained(candidates: readonly Itinerary[]): Itinerary[] {
  return [...candidates].sort(compareConstrained);
}

export function rankBaseline(candidates: readonly Itinerary[]): Itinerary[] {
  return [...candidates].sort(compareBaseline);
}

export function truncateTop<T>(items: readonly T[], n: number): T[] {
  return items.slice(0, Math.max(0, n));
}
