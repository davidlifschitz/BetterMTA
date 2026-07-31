export {
  BASELINE_NUM_ITINERARIES,
  DEFAULT_CANDIDATE_BUDGET,
  DEFAULT_UNPREFERRED_COST,
  MAX_OTP_QUERIES,
  MAX_SUBSET_QUERIES,
  MAX_VIA_QUERIES,
  PREFERENCE_BIASED_NUM_ITINERARIES,
  STRONG_UNPREFERRED_COST,
  TARGETED_SUBSET_NUM_ITINERARIES,
  TOPOLOGY_PROXIMITY_METERS,
  VIA_NUM_ITINERARIES,
} from "./budgets.ts";

export {
  assessCandidateCoverage,
  type CoverageAssessment,
  type CoverageAssessmentInput,
} from "./coverage.ts";

export { dedupeDraftsByFingerprint } from "./dedupe.ts";

export {
  buildOrchestrationQueryPlan,
  type BuildQueryPlanInput,
  type OrchestrationQueryKind,
  type OrchestrationQuerySpec,
} from "./query-plan.ts";

export {
  KNOWN_SUBWAY_LINE_IDS,
  SEEDED_TRANSFER_HUBS,
  createSeededTopology,
  defaultLineIdToGtfsRouteIds,
  defaultPreferredLineTopology,
  haversineMeters,
  isTopologicallySensible,
  selectViaStations,
  unpreferredGtfsRouteIds,
  type LatLon,
  type PreferredLineTopology,
  type TopologyStation,
} from "./topology.ts";
