/** BetterMTA shared contract types — conductor-owned, implementation-neutral. */
export const CONTRACT_VERSION = "2026-07-30" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

export type RealtimeConfidence = "high" | "medium" | "low" | "none";

export type PlaceKind =
  | "station"
  | "address"
  | "poi"
  | "current_location"
  | "coordinate";

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

export type ApiErrorCode =
  | "invalid_input"
  | "unknown_place"
  | "unknown_line"
  | "no_transit_path"
  | "incomplete_selected_line_satisfaction"
  | "insufficient_candidate_coverage"
  | "timeout"
  | "data_unavailable"
  | "stale_realtime"
  | "rate_limited"
  | "internal_error";

export interface Coordinates {
  lat: number;
  lon: number;
}

export type PlaceRef =
  | { placeId: string }
  | { stationId: string }
  | { coordinate: Coordinates; label?: string };

export type Timing =
  | { type: "depart_now" }
  | { type: "depart_at"; time: string }
  | { type: "arrive_by"; time: string };

export interface RouteSearchRequest {
  origin: PlaceRef;
  destination: PlaceRef;
  timing: Timing;
  selectedLineIds?: string[];
  clientContext?: {
    viewport?: "mobile" | "desktop";
    experimentOptIn?: boolean;
  };
}

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
    | "alert";
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

export interface FreshnessWarning {
  code: string;
  message: string;
}

export interface Freshness {
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
  warnings: FreshnessWarning[];
}

export interface RouteSearchResponse {
  contractVersion: ContractVersion;
  requestId: string;
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  freshness: Freshness;
  baseline: { itineraries: Itinerary[] };
  constrained: {
    itineraries: Itinerary[];
    satisfactionSummary: {
      bestSatisfactionCount: number;
      requestedCount: number;
      completeMatchFound: boolean;
    };
  };
  experiment?: {
    explanationVariant?: "concise" | "detailed";
  };
}

export interface Line {
  lineId: string;
  label: string;
  displayName: string;
  color: string;
  textColor: string;
  isActive: boolean;
  gtfsRouteIds: string[];
}

export interface LinesResponse {
  contractVersion: ContractVersion;
  staticDatasetVersion: string;
  lines: Line[];
}

export interface Place {
  placeId: string;
  label: string;
  kind: PlaceKind;
  stationId?: string;
  borough?: string;
  lat?: number;
  lon?: number;
}

export interface PlaceSearchResponse {
  contractVersion: ContractVersion;
  query: string;
  places: Place[];
}

export interface StatusResponse {
  contractVersion: ContractVersion;
  dataMode: DataMode;
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  realtimeAgeSeconds?: number | null;
  degraded: boolean;
  messages: string[];
}

export interface RoutingSnapshotHandle {
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

/** Lexicographic ranking keys for constrained itineraries (documentation aid). */
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
