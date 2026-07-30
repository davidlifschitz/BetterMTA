import type {
  CandidateItinerary,
  CandidateSearchRequest,
  RawCandidateDraft,
} from "./types.ts";

/**
 * Abstraction over a routing substrate (OTP, MOTIS, fixtures).
 * Implementations must pin results to the provided RoutingSnapshotHandle
 * and must not make live MTA network calls inside unit tests.
 */
export interface CandidateProvider {
  readonly id: string;
  generateCandidates(
    request: CandidateSearchRequest,
  ): Promise<RawCandidateDraft[] | CandidateItinerary[]>;
}
