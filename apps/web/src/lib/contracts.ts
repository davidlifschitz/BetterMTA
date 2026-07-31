/**
 * Shared contract types — re-exported from conductor-owned contracts.
 * Do not redefine response shapes here; propose contract changes instead.
 */
export type {
  ApiErrorBody,
  ApiErrorCode,
  CandidateCoverage,
  ContractVersion,
  DataMode,
  Explanation,
  ExplanationFact,
  Freshness,
  Itinerary,
  Leg,
  Line,
  LinesResponse,
  Place,
  PlaceKind,
  PlaceProviderId,
  PlaceRef,
  PlaceSearchResponse,
  RealtimeConfidence,
  ReliabilityAssessment,
  RouteSearchRequest,
  RouteSearchResponse,
  SatisfactionResult,
  ServiceAlert,
  StatusResponse,
  Timing,
  TransitLeg,
  WalkingLeg,
} from "../../../../contracts/typescript/index";

export {
  CONTRACT_VERSION,
  MAX_RETURNED_ITINERARIES,
  MAX_SELECTED_LINES,
} from "../../../../contracts/typescript/index";
