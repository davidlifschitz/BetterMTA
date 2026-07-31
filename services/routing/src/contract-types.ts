/**
 * Structural mirror of conductor-owned types from contracts/typescript/index.ts.
 * Do not diverge silently — propose contract changes under docs/proposals/.
 * Contract version: 2026-07-31 (Wave 0B additive lock; consume only — do not edit contracts/**).
 */

export const CONTRACT_VERSION = "2026-07-31" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

export type RealtimeConfidence = "high" | "medium" | "low" | "none";

export type Feasibility =
  | "complete"
  | "partial"
  | "none"
  | "not_applicable";

export type CandidateFamily =
  | "baseline"
  | "constrained"
  | "preference_biased"
  | "targeted_combination";

/** Privacy-safe candidate-generation outcome (ADR-0023). */
export type CandidateCoverageStatus = "adequate" | "degraded" | "exhausted";

export interface CandidateCoverage {
  status: CandidateCoverageStatus;
  familiesAttempted: CandidateFamily[];
  candidateCount: number;
  preferenceCoveringCandidateCount: number;
  budgetExhausted: boolean;
}

export type PlaceRef =
  | { placeId: string }
  | { stationId: string }
  | { coordinate: { lat: number; lon: number }; label?: string };

export type Timing =
  | { type: "depart_now" }
  | { type: "depart_at"; time: string }
  | { type: "arrive_by"; time: string };

export interface SatisfactionResult {
  requestedLineIds: string[];
  satisfiedLineIds: string[];
  omittedLineIds: string[];
  satisfactionCount: number;
  requestedCount: number;
  isComplete: boolean;
  feasibility: Feasibility;
}

export interface ExplanationFact {
  type:
    | "line_used"
    | "line_omitted"
    | "transfer"
    | "walk"
    | "wait"
    | "realtime"
    | "baseline_delta"
    | "alert"
    | "connector_filled";
  message: string;
  lineId?: string;
  seconds?: number;
}

export interface Explanation {
  summary: string;
  facts: ExplanationFact[];
  baselineDeltaSeconds?: number | null;
}

export interface ReliabilityAssessment {
  level: "high" | "medium" | "low" | "unknown";
  basis: string;
  displayEligible: boolean;
}

export interface ServiceAlert {
  alertId: string;
  header: string;
  description?: string;
  severity?: "info" | "warning" | "severe" | "unknown";
  affectedLineIds?: string[];
}

export interface StopRef {
  name: string;
  stationId?: string;
  stopId?: string;
}

export interface TransitLeg {
  legId: string;
  kind: "transit";
  lineId: string;
  tripId?: string | null;
  headsign?: string;
  from: StopRef;
  to: StopRef;
  departTime: string;
  arriveTime: string;
  durationSeconds?: number;
  sourceEngineIds?: Record<string, string>;
}

export interface WalkingLeg {
  legId: string;
  kind: "walk";
  durationSeconds: number;
  distanceMeters?: number;
  outOfSystem: boolean;
  instruction?: string;
}

export type Leg = TransitLeg | WalkingLeg;

export interface Itinerary {
  itineraryId: string;
  fingerprint: string;
  durationSeconds: number;
  arrivalTime: string;
  walkingSeconds: number;
  waitingSeconds: number;
  transferCount: number;
  lineSequence: string[];
  legs: Leg[];
  satisfaction: SatisfactionResult;
  realtimeConfidence: RealtimeConfidence;
  alerts: ServiceAlert[];
  explanation: Explanation;
  reliability?: ReliabilityAssessment | null;
  candidateFamily?: CandidateFamily;
}

export interface RoutingSnapshotHandle {
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
}

export const CONSTRAINED_RANKING_ORDER = [
  "satisfactionCount:desc",
  "arrivalTime:asc",
  "transferCount:asc",
  "walkingSeconds:asc",
  "realtimeConfidence:desc",
  "fingerprint:asc",
] as const;

export const MAX_SELECTED_LINES = 5 as const;
export const MAX_RETURNED_ITINERARIES = 3 as const;
