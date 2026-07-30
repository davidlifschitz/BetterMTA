import type { CandidateProvider } from "../candidate-provider.ts";

/**
 * Options for createOtpCandidateProvider.
 * Binding public interface for Phase 6 backend — keep these fields stable.
 */
export interface OtpCandidateProviderOptions {
  /** e.g. http://otp:8080 or http://localhost:8090 */
  otpBaseUrl: string;
  /** Hard AbortController budget per query. Default 4000. */
  timeoutMs?: number;
  /** Candidate diversity. Default 8. */
  numItineraries?: number;
  /** Stamped into sourceEngineIds; null => "unknown". */
  graphVersion?: string | null;
  /**
   * Injected GTFS route id → BetterMTA lineId mapping.
   * Single source of truth lives in the data service.
   * Returning null rejects the candidate as malformed (counted, not thrown).
   */
  routeIdToLineId: (gtfsRouteId: string) => string | null;
  /** Clock injection for tests. */
  now?: () => number;
  /**
   * Optional fetch injection for tests / custom agents.
   * Defaults to globalThis.fetch.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * OTP plan searchWindow in seconds. Default 2700 (45 minutes).
   * Documented in ROUTING_ENGINE_SPEC.md.
   */
  searchWindowSeconds?: number;
  /** Per-query latency / result hook for backend metrics. */
  onQuery?: (stats: OtpQueryStats) => void;
}

export interface OtpQueryStats {
  durationMs: number;
  ok: boolean;
  itineraryCount: number;
  rejectedCount: number;
  errorKind?: "timeout" | "unavailable" | "bad_response";
}

export type OtpRejectReason =
  | "empty_legs"
  | "non_chronological"
  | "zero_duration_transit"
  | "unmappable_route"
  | "missing_times";

export interface OtpCandidateProvider extends CandidateProvider {
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly lastQueryStats: OtpQueryStats | null;
  resetCounters(): void;
}

/** OTP GraphQL plan itinerary (subset we consume). */
export interface OtpPlanResponse {
  data?: {
    plan?: {
      itineraries?: OtpItinerary[] | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
}

export interface OtpItinerary {
  duration?: number;
  startTime?: number | string;
  endTime?: number | string;
  /** Unaliased OTP 2.9 fields (epoch millis or OffsetDateTime). */
  start?: number | string;
  end?: number | string;
  walkDistance?: number;
  numberOfTransfers?: number;
  legs?: OtpLeg[] | null;
}

export interface OtpLeg {
  mode?: string;
  startTime?: OtpLegTime | number | string;
  endTime?: OtpLegTime | number | string;
  start?: OtpLegTime | number | string;
  end?: OtpLegTime | number | string;
  duration?: number;
  from?: OtpPlace;
  to?: OtpPlace;
  route?: {
    gtfsId?: string;
    shortName?: string;
    longName?: string;
    mode?: string;
  } | null;
  trip?: { gtfsId?: string } | null;
}

export interface OtpLegTime {
  scheduledTime?: number | string | null;
  estimated?: { time?: number | string | null } | null;
}

export interface OtpPlace {
  name?: string;
  lat?: number;
  lon?: number;
  stop?: {
    gtfsId?: string;
    name?: string;
    code?: string | null;
  } | null;
}
