export type { CandidateProvider } from "./candidate-provider.ts";
export {
  FixtureCandidateProvider,
  SYNTHETIC_SNAPSHOT,
} from "./fixture-provider.ts";
export {
  computePerLineRideSeconds,
  computeSatisfaction,
  lineSequenceFromLegs,
  normalizeSelectedLineIds,
  TooManySelectedLinesError,
  transitLegsOf,
} from "./satisfaction.ts";
export { fingerprintItinerary } from "./fingerprint.ts";
export {
  compareBaseline,
  compareConstrained,
  rankBaseline,
  rankConstrained,
  realtimeConfidenceRank,
  truncateTop,
} from "./ranking.ts";
export { buildExplanation } from "./explanation.ts";
export {
  validateCandidateDraft,
  type DraftRejectReason,
  type DraftValidationResult,
} from "./validate.ts";
export {
  applyDataModeConfidence,
  enrichCandidate,
  rankOnly,
  runRouteSearch,
  type DataDegradation,
  type RankedItinerary,
  type RouteSearchOutcome,
} from "./search.ts";
export type {
  CandidateItinerary,
  CandidateSearchRequest,
  RawCandidateDraft,
  ResolvedPlace,
} from "./types.ts";
export {
  CONTRACT_VERSION,
  CONSTRAINED_RANKING_ORDER,
  MAX_RETURNED_ITINERARIES,
  MAX_SELECTED_LINES,
} from "./types.ts";
export type {
  CandidateFamily,
  DataMode,
  Explanation,
  Feasibility,
  Itinerary,
  Leg,
  RealtimeConfidence,
  RoutingSnapshotHandle,
  SatisfactionResult,
  Timing,
} from "./types.ts";
