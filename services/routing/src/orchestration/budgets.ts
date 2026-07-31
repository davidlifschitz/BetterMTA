/**
 * Strict query/candidate budgets for preferred-line orchestration (ADR-0023).
 * Documented limits — do not invent unbounded multi-query fan-out.
 */

/** Soft ceiling on distinct drafts retained after dedupe (search default). */
export const DEFAULT_CANDIDATE_BUDGET = 64;

/** Hard ceiling on OTP plan calls per route search. */
export const MAX_OTP_QUERIES = 6;

/** Itineraries requested per family query. */
export const BASELINE_NUM_ITINERARIES = 8;
export const PREFERENCE_BIASED_NUM_ITINERARIES = 6;
export const VIA_NUM_ITINERARIES = 4;
export const TARGETED_SUBSET_NUM_ITINERARIES = 4;

/** Max via-station family queries (subset of MAX_OTP_QUERIES). */
export const MAX_VIA_QUERIES = 2;

/** Max preferred-subset targeted queries beyond the primary bias query. */
export const MAX_SUBSET_QUERIES = 1;

/**
 * Modest OTP unpreferred cost: fixed seconds + transit-time multiplier.
 * Soft bias only — connectors remain allowed (fill-the-gaps).
 */
export const DEFAULT_UNPREFERRED_COST = "300 + 1.5 x";

/** Stronger bias for targeted subset queries (still not a hard ban). */
export const STRONG_UNPREFERRED_COST = "900 + 2.5 x";

/** Corridor / proximity radius for topology sensibility (meters). */
export const TOPOLOGY_PROXIMITY_METERS = 3200;
