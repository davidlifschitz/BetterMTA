/** BetterMTA shared contract types — conductor-owned, implementation-neutral. */
export const CONTRACT_VERSION = "2026-07-31" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

export type RealtimeConfidence = "high" | "medium" | "low" | "none";

/** Place type discriminator (`placeType` equivalent). */
export type PlaceKind =
  | "station"
  | "address"
  | "poi"
  | "current_location"
  | "coordinate";

/**
 * BetterMTA place-provider id. Opaque product key — never a vendor hostname.
 * `station_index` = GTFS station autocomplete; `geocoder` = address/POI adapter.
 */
export type PlaceProviderId = "station_index" | "geocoder" | (string & {});

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
  /** Preferred subway lineIds to maximize (ADR-0023). Internal ids; GS stays GS. */
  selectedLineIds?: string[];
  clientContext?: {
    viewport?: "mobile" | "desktop";
    experimentOptIn?: boolean;
  };
}

/** Privacy-safe preferred-line candidate-generation diagnostics (ADR-0023). */
export interface CandidateCoverage {
  status: CandidateCoverageStatus;
  familiesAttempted: CandidateFamily[];
  candidateCount: number;
  preferenceCoveringCandidateCount: number;
  budgetExhausted: boolean;
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
    | "connector_filled"
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
  /** Optional; clients must tolerate absence for older servers. */
  candidateCoverage?: CandidateCoverage;
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
  /** BetterMTA provider id (e.g. station_index, geocoder); never a vendor hostname. */
  provider?: PlaceProviderId;
  /** Opaque upstream id; use placeId in PlaceRef, not this field. */
  providerPlaceId?: string;
  formattedAddress?: string;
  /** Required for UI when showing geocode-backed address/POI results. */
  attribution?: string;
}

export interface PlaceSearchResponse {
  contractVersion: ContractVersion;
  query: string;
  /** Optional response-level attribution for UI chrome. */
  attribution?: string;
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

/** Suggested details for insufficient_candidate_coverage (still under free-form details). */
export type InsufficientCandidateCoverageDetails = CandidateCoverage & {
  requestedLineIds?: string[];
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown> | InsufficientCandidateCoverageDetails;
  };
}

/**
 * Privacy-safe logging representation for place/route requests.
 * Never log precise lat/lon, raw proximity pins, or full street queries by default.
 */
export interface PrivacySafePlaceLogRef {
  refType: "placeId" | "stationId" | "coordinate";
  placeId?: string;
  stationId?: string;
  /** Coarsened only (e.g. ~1km grid); omit when unused. */
  coarseGrid?: string;
  provider?: PlaceProviderId;
  kind?: PlaceKind;
}

export interface PrivacySafeRouteSearchLog {
  requestId: string;
  origin: PrivacySafePlaceLogRef;
  destination: PrivacySafePlaceLogRef;
  selectedLineIds?: string[];
  timingType: Timing["type"];
  /** Truncated/hashed query text if place search was involved; never full address by default. */
  placeQueryHash?: string;
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
