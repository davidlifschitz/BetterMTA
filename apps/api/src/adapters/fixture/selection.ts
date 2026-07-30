/**
 * Fixture route selection rules (fixture-backed RoutingAdapter).
 *
 * Evaluated in order after place/line validation:
 *
 * 1. origin or destination placeId/stationId is a no-path sentinel
 *    (`pl_unreachable`, `st_unreachable`) → typed error `no_transit_path`
 * 2. origin placeId `pl_coverage_fail` → `insufficient_candidate_coverage`
 * 3. origin placeId `pl_data_unavailable` → `data_unavailable`
 * 4. origin placeId `pl_timeout` → wait until request abort/timeout
 * 5. `selectedLineIds` empty → `routes/baseline-only.json` (`schedule_only`)
 * 6. sorted selected lines equal `["7"]` → `routes/degraded-realtime.json` (`stale`)
 * 7. sorted selected lines equal `["F","B"]` → `routes/complete-match.json` (`synthetic`)
 * 8. sorted selected lines equal `["A","G","L"]` (or any other non-empty known set)
 *    → `routes/partial-match.json` (`synthetic`)
 *
 * Responses keep the fixture `dataMode` honestly. `requestId` and
 * `experiment.explanationVariant` are overwritten from the live request.
 */

export type RouteFixtureKind =
  | "baseline-only"
  | "complete-match"
  | "partial-match"
  | "degraded-realtime";

export type RouteFixtureSelection =
  | { kind: "fixture"; fixture: RouteFixtureKind; path: string }
  | {
      kind: "error";
      code:
        | "no_transit_path"
        | "insufficient_candidate_coverage"
        | "data_unavailable"
        | "timeout";
      message: string;
      details?: Record<string, unknown>;
    };

const FIXTURE_PATH: Record<RouteFixtureKind, string> = {
  "baseline-only": "routes/baseline-only.json",
  "complete-match": "routes/complete-match.json",
  "partial-match": "routes/partial-match.json",
  "degraded-realtime": "routes/degraded-realtime.json",
};

export function selectRouteFixture(input: {
  originKey: string;
  destinationKey: string;
  selectedLineIds: string[];
}): RouteFixtureSelection {
  const keys = [input.originKey, input.destinationKey];
  if (
    keys.some((k) => k === "place:pl_unreachable" || k === "station:st_unreachable")
  ) {
    return {
      kind: "error",
      code: "no_transit_path",
      message: "No subway path was found between these places.",
      details: {},
    };
  }
  if (input.originKey === "place:pl_coverage_fail") {
    return {
      kind: "error",
      code: "insufficient_candidate_coverage",
      message: "Routing budget exhausted before trustworthy candidates were found.",
    };
  }
  if (input.originKey === "place:pl_data_unavailable") {
    return {
      kind: "error",
      code: "data_unavailable",
      message: "Transit data is temporarily unavailable.",
    };
  }
  if (input.originKey === "place:pl_timeout") {
    return {
      kind: "error",
      code: "timeout",
      message: "Route search timed out.",
    };
  }

  const sorted = input.selectedLineIds.slice().sort();
  if (sorted.length === 0) {
    return {
      kind: "fixture",
      fixture: "baseline-only",
      path: FIXTURE_PATH["baseline-only"],
    };
  }
  if (sorted.join(",") === "7") {
    return {
      kind: "fixture",
      fixture: "degraded-realtime",
      path: FIXTURE_PATH["degraded-realtime"],
    };
  }
  if (sorted.join(",") === "B,F") {
    return {
      kind: "fixture",
      fixture: "complete-match",
      path: FIXTURE_PATH["complete-match"],
    };
  }
  return {
    kind: "fixture",
    fixture: "partial-match",
    path: FIXTURE_PATH["partial-match"],
  };
}

export function placeRefKey(ref: {
  placeId?: string;
  stationId?: string;
  coordinate?: { lat: number; lon: number };
}): string {
  if (ref.placeId) return `place:${ref.placeId}`;
  if (ref.stationId) return `station:${ref.stationId}`;
  if (ref.coordinate) {
    return `coord:${ref.coordinate.lat.toFixed(5)},${ref.coordinate.lon.toFixed(5)}`;
  }
  return "unknown";
}
