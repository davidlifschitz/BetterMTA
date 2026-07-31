/**
 * Deterministic preferred-line query family plan (ADR-0023 / ROUTING_ENGINE_SPEC §5.1).
 */

import type { CandidateFamily } from "../types.ts";
import {
  BASELINE_NUM_ITINERARIES,
  DEFAULT_UNPREFERRED_COST,
  MAX_OTP_QUERIES,
  MAX_SUBSET_QUERIES,
  MAX_VIA_QUERIES,
  PREFERENCE_BIASED_NUM_ITINERARIES,
  STRONG_UNPREFERRED_COST,
  TARGETED_SUBSET_NUM_ITINERARIES,
  VIA_NUM_ITINERARIES,
} from "./budgets.ts";
import {
  defaultPreferredLineTopology,
  selectViaStations,
  unpreferredGtfsRouteIds,
  type LatLon,
  type PreferredLineTopology,
  type TopologyStation,
} from "./topology.ts";

export type OrchestrationQueryKind =
  | "baseline"
  | "preference_biased"
  | "via_hint"
  | "preferred_subset";

export interface OrchestrationQuerySpec {
  /** Stable id for tests / diagnostics (no PII). */
  queryKey: string;
  kind: OrchestrationQueryKind;
  candidateFamily: CandidateFamily;
  numItineraries: number;
  /** Comma-joinable GTFS route ids for OTP unpreferred.routes */
  unpreferredRoutes?: string[];
  unpreferredCost?: string;
  viaStation?: TopologyStation;
  /** Preferred line subset this query targets (diagnostics). */
  targetLineIds?: string[];
}

export interface BuildQueryPlanInput {
  preferredLineIds: readonly string[];
  origin: LatLon;
  destination: LatLon;
  topology?: PreferredLineTopology;
  maxQueries?: number;
  lineIdToGtfsRouteIds?: (lineId: string) => string[];
}

/**
 * Build an ordered, budgeted list of OTP plan queries.
 * Always starts with unconstrained baseline. Preference families only when
 * preferredLineIds is non-empty.
 */
export function buildOrchestrationQueryPlan(
  input: BuildQueryPlanInput,
): OrchestrationQuerySpec[] {
  const maxQueries = input.maxQueries ?? MAX_OTP_QUERIES;
  const plan: OrchestrationQuerySpec[] = [
    {
      queryKey: "baseline",
      kind: "baseline",
      candidateFamily: "baseline",
      numItineraries: BASELINE_NUM_ITINERARIES,
    },
  ];

  if (input.preferredLineIds.length === 0 || plan.length >= maxQueries) {
    return plan.slice(0, maxQueries);
  }

  const preferred = [...input.preferredLineIds];
  const unpreferred = unpreferredGtfsRouteIds({
    preferredLineIds: preferred,
    lineIdToGtfsRouteIds: input.lineIdToGtfsRouteIds,
  });

  plan.push({
    queryKey: "preference_biased:all",
    kind: "preference_biased",
    candidateFamily: "preference_biased",
    numItineraries: PREFERENCE_BIASED_NUM_ITINERARIES,
    unpreferredRoutes: unpreferred,
    unpreferredCost: DEFAULT_UNPREFERRED_COST,
    targetLineIds: preferred,
  });

  const topology = input.topology ?? defaultPreferredLineTopology();
  const vias = selectViaStations({
    preferredLineIds: preferred,
    origin: input.origin,
    destination: input.destination,
    maxVias: MAX_VIA_QUERIES,
    topology,
  });

  for (const via of vias) {
    if (plan.length >= maxQueries) break;
    plan.push({
      queryKey: `via:${via.stationId}`,
      kind: "via_hint",
      candidateFamily: "targeted_combination",
      numItineraries: VIA_NUM_ITINERARIES,
      viaStation: via,
      // Soft bias still applied so OTP prefers preferred lines through the via.
      unpreferredRoutes: unpreferred,
      unpreferredCost: DEFAULT_UNPREFERRED_COST,
      targetLineIds: preferred.filter((id) => via.lineIds.includes(id)),
    });
  }

  // One k-of-n subset query when ≥2 preferred lines and budget remains.
  if (
    preferred.length >= 2 &&
    MAX_SUBSET_QUERIES > 0 &&
    plan.length < maxQueries
  ) {
    const subset = pickPreferredSubset(preferred);
    const subsetUnpreferred = unpreferredGtfsRouteIds({
      preferredLineIds: subset,
      lineIdToGtfsRouteIds: input.lineIdToGtfsRouteIds,
    });
    plan.push({
      queryKey: `subset:${subset.join("+")}`,
      kind: "preferred_subset",
      candidateFamily: "targeted_combination",
      numItineraries: TARGETED_SUBSET_NUM_ITINERARIES,
      unpreferredRoutes: subsetUnpreferred,
      unpreferredCost: STRONG_UNPREFERRED_COST,
      targetLineIds: subset,
    });
  }

  return plan.slice(0, maxQueries);
}

/** Deterministic half-or-better subset: first ceil(n/2) in sorted lineId order. */
function pickPreferredSubset(preferredLineIds: readonly string[]): string[] {
  const sorted = [...preferredLineIds].sort((a, b) => a.localeCompare(b));
  const k = Math.max(1, Math.ceil(sorted.length / 2));
  return sorted.slice(0, k);
}
