/**
 * Local routing types. Contract shapes mirrored in ./contract-types.ts
 * (source of truth: contracts/typescript/index.ts).
 */
export type {
  CandidateCoverage,
  CandidateCoverageStatus,
  CandidateFamily,
  DataMode,
  Explanation,
  ExplanationFact,
  Feasibility,
  Itinerary,
  Leg,
  PlaceRef,
  RealtimeConfidence,
  RoutingSnapshotHandle,
  SatisfactionResult,
  ServiceAlert,
  Timing,
  TransitLeg,
  WalkingLeg,
} from "./contract-types.ts";

export {
  CONTRACT_VERSION,
  CONSTRAINED_RANKING_ORDER,
  MAX_RETURNED_ITINERARIES,
  MAX_SELECTED_LINES,
} from "./contract-types.ts";

import type {
  CandidateFamily,
  Itinerary,
  Leg,
  RealtimeConfidence,
  RoutingSnapshotHandle,
  ServiceAlert,
  Timing,
} from "./contract-types.ts";

/** Itinerary still in the candidate pool (contract CandidateItinerary). */
export type CandidateItinerary = Itinerary & {
  candidateFamily?: CandidateFamily;
};

/** Raw engine/fixture draft before satisfaction + explanation enrichment. */
export interface RawCandidateDraft {
  itineraryId: string;
  durationSeconds: number;
  arrivalTime: string;
  walkingSeconds: number;
  waitingSeconds: number;
  transferCount: number;
  legs: Leg[];
  realtimeConfidence: RealtimeConfidence;
  alerts?: ServiceAlert[];
  candidateFamily: CandidateFamily;
  /**
   * Ignored if present — fingerprint is always recomputed from content
   * via fingerprintItinerary (never trust provider-supplied values).
   */
  fingerprint?: string;
}

export interface ResolvedPlace {
  label: string;
  lat: number;
  lon: number;
  placeId?: string;
  stationId?: string;
}

export interface CandidateSearchRequest {
  origin: ResolvedPlace;
  destination: ResolvedPlace;
  timing: Timing;
  /** Caller should pass ≤5; library dedupes and throws TooManySelectedLinesError if >5. */
  selectedLineIds: string[];
  snapshot: RoutingSnapshotHandle;
  /** Soft budget for provider-side enumeration; used for coverage outcomes. */
  candidateBudget?: number;
}
