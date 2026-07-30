/** Benchmark runner types. Domain shapes mirror conductor contracts without importing mutable copies. */

export type CaseClassification =
  | "synthetic_contract_fixture"
  | "recorded_data"
  | "manually_reviewed_real_trip"
  | "pending_live_integration"
  | "external_comparison_manual";

export type Feasibility = "complete" | "partial" | "none" | "not_applicable";

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

export type InvariantId =
  | "valid_itinerary_structure"
  | "origin_destination_consistency"
  | "chronological_legs"
  | "nonnegative_durations"
  | "satisfaction_accounting"
  | "complete_beats_partial"
  | "max_satisfaction_before_time"
  | "deterministic_order"
  | "max_three_itineraries"
  | "honest_data_mode"
  | "impossible_constraint_explanation"
  | "expected_feasibility"
  | "minimum_satisfaction";

export type PlaceRef =
  | { placeId: string }
  | { stationId: string }
  | { coordinate: { lat: number; lon: number }; label?: string };

export type Timing =
  | { type: "depart_now" }
  | { type: "depart_at"; time: string }
  | { type: "arrive_by"; time: string };

export interface BenchmarkCase {
  caseId: string;
  title: string;
  classification: CaseClassification;
  categories?: string[];
  origin: PlaceRef;
  destination: PlaceRef;
  timing: Timing;
  selectedLineIds: string[];
  expectedFeasibility: Feasibility;
  minimumSatisfactionCount: number;
  invariantAssertions: InvariantId[];
  humanReviewNotes: string;
  staticDatasetVersion: string;
  realtimeFixtureVersion: string;
  expectedOriginStationId?: string;
  expectedDestinationStationId?: string;
  sut: {
    kind: "conductor_fixture" | "qa_fixture";
    responseId: string;
  };
  tags?: string[];
}

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

export interface TransitLeg {
  legId: string;
  kind: "transit";
  lineId: string;
  tripId?: string | null;
  headsign?: string;
  from: { name: string; stationId?: string; stopId?: string };
  to: { name: string; stationId?: string; stopId?: string };
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
  realtimeConfidence: "high" | "medium" | "low" | "none";
  alerts: unknown[];
  explanation: {
    summary: string;
    facts: Array<{
      type: string;
      message: string;
      lineId?: string;
      seconds?: number;
    }>;
    baselineDeltaSeconds?: number | null;
  };
  reliability?: unknown;
  candidateFamily?: string;
}

export interface RouteSearchResponse {
  contractVersion: string;
  requestId: string;
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  freshness: {
    realtimeAgeSeconds?: number | null;
    staticActivatedAt?: string | null;
    warnings: Array<{ code: string; message: string }>;
  };
  baseline: { itineraries: Itinerary[] };
  constrained: {
    itineraries: Itinerary[];
    satisfactionSummary: {
      bestSatisfactionCount: number;
      requestedCount: number;
      completeMatchFound: boolean;
    };
  };
  experiment?: { explanationVariant?: "concise" | "detailed" };
}

/** Pluggable system under test. Live routing implements this later. */
export interface SystemUnderTest {
  readonly name: string;
  search(request: RouteSearchRequest): Promise<RouteSearchResponse>;
}

export type AssertionStatus = "pass" | "fail" | "skip";

export interface AssertionResult {
  invariantId: InvariantId;
  status: AssertionStatus;
  message: string;
}

export interface CaseResult {
  caseId: string;
  title: string;
  classification: CaseClassification;
  categories: string[];
  assertions: AssertionResult[];
  passed: boolean;
  skipped: boolean;
  /** Soft/placeholder cases (e.g. soft_feasibility) — must not inflate pass counts. */
  soft: boolean;
}

export interface BenchmarkReport {
  generatedAt: string;
  sutName: string;
  totals: {
    cases: number;
    passed: number;
    failed: number;
    skipped: number;
    soft: number;
    assertionsPassed: number;
    assertionsFailed: number;
    assertionsSkipped: number;
  };
  byClassification: Record<
    string,
    { cases: number; passed: number; failed: number; skipped: number; soft: number }
  >;
  cases: CaseResult[];
  findings: string[];
}
