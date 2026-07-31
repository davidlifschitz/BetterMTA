import type {
  ApiErrorBody,
  LinesResponse,
  PlaceSearchResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  StatusResponse,
} from "@/lib/contracts";
import { ApiClientError, type BetterMtaApi } from "@/lib/api/types";

import linesFixture from "../../../../../contracts/fixtures/lines/subway-lines.json";
import placesFixture from "../../../../../contracts/fixtures/places/place-search.json";
import healthyStatus from "../../../../../contracts/fixtures/status/healthy.json";
import degradedStatus from "../../../../../contracts/fixtures/status/degraded.json";
import completeMatch from "../../../../../contracts/fixtures/routes/complete-match.json";
import partialMatch from "../../../../../contracts/fixtures/routes/partial-match.json";
import baselineOnly from "../../../../../contracts/fixtures/routes/baseline-only.json";
import degradedRealtime from "../../../../../contracts/fixtures/routes/degraded-realtime.json";
import noTransitPath from "../../../../../contracts/fixtures/errors/no-transit-path.json";
import unknownLine from "../../../../../contracts/fixtures/errors/unknown-line.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function lineKey(ids: string[] | undefined): string {
  return [...(ids ?? [])].map((id) => id.toUpperCase()).sort().join(",");
}

function placeLabel(ref: RouteSearchRequest["origin"]): string {
  if ("placeId" in ref) return ref.placeId.toLowerCase();
  if ("stationId" in ref) return ref.stationId.toLowerCase();
  return (ref.label ?? `${ref.coordinate.lat},${ref.coordinate.lon}`).toLowerCase();
}

/**
 * Fixture-mode client. Selects contracted fixtures by request shape so the UI
 * can exercise complete / partial / stale / schedule_only / error states
 * without a live backend.
 *
 * Scenario map (documented for QA):
 * - selected lines empty → baseline-only (schedule_only)
 * - selected F+B → complete-match (synthetic)
 * - selected A+G+L → partial-match (synthetic)
 * - selected 7 → degraded-realtime (stale)
 * - selected includes Z9 → unknown_line error
 * - origin/destination placeId contains "nopath" → no_transit_path
 * - origin placeId contains "unavailable" → data_unavailable error
 * - otherwise with lines → complete-match; without → baseline-only
 */
export function createFixtureApiClient(): BetterMtaApi {
  return {
    async getLines(): Promise<LinesResponse> {
      return clone(linesFixture as LinesResponse);
    },

    async searchPlaces(query: string): Promise<PlaceSearchResponse> {
      const q = query.trim().toLowerCase();
      const all = clone(placesFixture as PlaceSearchResponse);
      if (!q) {
        return { ...all, query, places: [] };
      }
      return {
        ...all,
        query,
        places: all.places.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.placeId.toLowerCase().includes(q) ||
            (p.borough?.toLowerCase().includes(q) ?? false),
        ),
      };
    },

    async getStatus(): Promise<StatusResponse> {
      return clone(healthyStatus as StatusResponse);
    },

    async searchRoutes(request: RouteSearchRequest): Promise<RouteSearchResponse> {
      await delay(120);

      const selected = request.selectedLineIds ?? [];
      const originKey = placeLabel(request.origin);
      const destKey = placeLabel(request.destination);

      if (originKey.includes("unavailable") || destKey.includes("unavailable")) {
        throw new ApiClientError(503, {
          error: {
            code: "data_unavailable",
            message: "Routing is temporarily unavailable. Please try again later.",
            requestId: "req_fixture_unavailable",
            details: {},
          },
        });
      }

      if (originKey.includes("nopath") || destKey.includes("nopath")) {
        throw new ApiClientError(404, clone(noTransitPath as ApiErrorBody));
      }

      if (selected.some((id) => id.toUpperCase() === "Z9")) {
        throw new ApiClientError(400, clone(unknownLine as ApiErrorBody));
      }

      const known = new Set(
        (linesFixture as LinesResponse).lines.map((l) => l.lineId.toUpperCase()),
      );
      const unknown = selected.filter((id) => !known.has(id.toUpperCase()));
      if (unknown.length > 0) {
        const body = clone(unknownLine as ApiErrorBody);
        body.error.details = { unknownLineIds: unknown };
        throw new ApiClientError(400, body);
      }

      const key = lineKey(selected);

      if (key === "") {
        return clone(baselineOnly as RouteSearchResponse);
      }
      if (key === "B,F") {
        return clone(completeMatch as RouteSearchResponse);
      }
      if (key === "A,G,L") {
        return clone(partialMatch as RouteSearchResponse);
      }
      if (key === "7") {
        return clone(degradedRealtime as RouteSearchResponse);
      }

      // Default constrained demo: complete-match shape for any other selection.
      return clone(completeMatch as RouteSearchResponse);
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exposed for tests that need degraded status without a live network. */
export function createDegradedStatusFixture(): StatusResponse {
  return clone(degradedStatus as StatusResponse);
}
