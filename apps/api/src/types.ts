/** Local mirrors of conductor contract types used by the API layer. */

export const CONTRACT_VERSION = "2026-07-31" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

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

export type PlaceRef =
  | { placeId: string }
  | { stationId: string }
  | { coordinate: { lat: number; lon: number }; label?: string };

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

export interface RoutingSnapshotHandle {
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
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
  kind: "station" | "address" | "poi" | "current_location" | "coordinate";
  stationId?: string;
  borough?: string;
  lat?: number;
  lon?: number;
  /** BetterMTA provider id (station_index | geocoder); never a vendor hostname. */
  provider?: string;
  /** Opaque upstream id; clients must use placeId in PlaceRef. */
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

/** Privacy-safe preferred-line coverage diagnostics (ADR-0023). */
export interface CandidateCoverage {
  status: "adequate" | "degraded" | "exhausted";
  familiesAttempted: Array<
    "baseline" | "constrained" | "preference_biased" | "targeted_combination"
  >;
  candidateCount: number;
  preferenceCoveringCandidateCount: number;
  budgetExhausted: boolean;
}

export interface RouteSearchResponse {
  contractVersion: ContractVersion;
  requestId: string;
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  freshness: {
    realtimeAgeSeconds?: number | null;
    staticActivatedAt?: string | null;
    warnings: Array<{ code: string; message: string }>;
  };
  baseline: { itineraries: unknown[] };
  constrained: {
    itineraries: unknown[];
    satisfactionSummary: {
      bestSatisfactionCount: number;
      requestedCount: number;
      completeMatchFound: boolean;
    };
  };
  /** Optional; clients must tolerate absence. */
  candidateCoverage?: CandidateCoverage;
  experiment?: {
    explanationVariant?: "concise" | "detailed";
  };
}

export interface AdapterReadiness {
  staticOk: boolean;
  realtimeOk: boolean;
  degradedPermitted: boolean;
  reasons: string[];
  dataMode: DataMode;
}
