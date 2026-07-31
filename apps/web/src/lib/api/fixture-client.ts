import type {
  ApiErrorBody,
  ExplanationFact,
  LinesResponse,
  PlaceSearchResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  StatusResponse,
} from "@/lib/contracts";
import { ApiClientError, type BetterMtaApi } from "@/lib/api/types";
import { GS_FALLBACK_LINE } from "@/lib/line-display";

import linesFixture from "../../../../../contracts/fixtures/lines/subway-lines.json";
import placesFixture from "../../../../../contracts/fixtures/places/place-search.json";
import addressPlacesFixture from "../../../../../contracts/fixtures/places/place-search-address.json";
import healthyStatus from "../../../../../contracts/fixtures/status/healthy.json";
import degradedStatus from "../../../../../contracts/fixtures/status/degraded.json";
import completeMatch from "../../../../../contracts/fixtures/routes/complete-match.json";
import partialMatch from "../../../../../contracts/fixtures/routes/partial-match.json";
import baselineOnly from "../../../../../contracts/fixtures/routes/baseline-only.json";
import degradedRealtime from "../../../../../contracts/fixtures/routes/degraded-realtime.json";
import noTransitPath from "../../../../../contracts/fixtures/errors/no-transit-path.json";
import unknownLine from "../../../../../contracts/fixtures/errors/unknown-line.json";
import insufficientCoverage from "../../../../../contracts/fixtures/errors/insufficient-candidate-coverage.json";

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

function withConnectorDemo(res: RouteSearchResponse): RouteSearchResponse {
  const next = clone(res);
  const fact: ExplanationFact = {
    type: "connector_filled",
    message:
      "Added an unselected connector line to complete a practical trip with your preferences.",
    lineId: "D",
  };
  for (const itin of next.constrained.itineraries) {
    if (!itin.explanation.facts.some((f) => f.type === "connector_filled")) {
      itin.explanation.facts = [...itin.explanation.facts, fact];
    }
  }
  return next;
}

/**
 * Fixture-mode client. Selects contracted fixtures by request shape so the UI
 * can exercise complete / partial / stale / schedule_only / error states
 * without a live backend.
 *
 * Scenario map (documented for QA):
 * - selected lines empty → baseline-only (schedule_only)
 * - selected F+B → complete-match (synthetic) + connector_filled demo fact
 * - selected A+G+L → partial-match (synthetic)
 * - selected 7 → degraded-realtime (stale)
 * - selected 2+7+GS → insufficient_candidate_coverage
 * - selected includes Z9 → unknown_line error
 * - origin/destination placeId contains "nopath" → no_transit_path
 * - origin placeId contains "unavailable" → data_unavailable error
 * - place query matching address fixture labels → address/POI results
 * - otherwise with lines → complete-match; without → baseline-only
 */
export function createFixtureApiClient(): BetterMtaApi {
  return {
    async getLines(): Promise<LinesResponse> {
      const base = clone(linesFixture as LinesResponse);
      if (!base.lines.some((l) => l.lineId.toUpperCase() === "GS")) {
        base.lines = [...base.lines, clone(GS_FALLBACK_LINE)];
      }
      return base;
    },

    async searchPlaces(query: string): Promise<PlaceSearchResponse> {
      const q = query.trim().toLowerCase();
      const stations = clone(placesFixture as PlaceSearchResponse);
      const addresses = clone(addressPlacesFixture as PlaceSearchResponse);
      const allPlaces = [...stations.places, ...addresses.places];
      if (!q) {
        return {
          contractVersion: stations.contractVersion,
          query,
          places: [],
        };
      }
      const places = allPlaces.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.placeId.toLowerCase().includes(q) ||
          (p.borough?.toLowerCase().includes(q) ?? false) ||
          (p.formattedAddress?.toLowerCase().includes(q) ?? false),
      );
      const hasGeocode = places.some(
        (p) => p.provider === "geocoder" || p.kind === "address" || p.kind === "poi",
      );
      return {
        contractVersion: stations.contractVersion,
        query,
        attribution: hasGeocode ? addresses.attribution : undefined,
        places,
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

      const key = lineKey(selected);

      // ADR-0023 coverage failure demo (Park→Penn style preferred set).
      if (key === "2,7,GS") {
        throw new ApiClientError(
          503,
          clone(insufficientCoverage as ApiErrorBody),
        );
      }

      const known = new Set(
        (linesFixture as LinesResponse).lines.map((l) => l.lineId.toUpperCase()),
      );
      known.add("GS");
      const unknown = selected.filter((id) => !known.has(id.toUpperCase()));
      if (unknown.length > 0) {
        const body = clone(unknownLine as ApiErrorBody);
        body.error.details = { unknownLineIds: unknown };
        throw new ApiClientError(400, body);
      }

      if (key === "") {
        return clone(baselineOnly as RouteSearchResponse);
      }
      if (key === "B,F") {
        return withConnectorDemo(clone(completeMatch as RouteSearchResponse));
      }
      if (key === "A,G,L") {
        return clone(partialMatch as RouteSearchResponse);
      }
      if (key === "7") {
        return clone(degradedRealtime as RouteSearchResponse);
      }

      // Default constrained demo: complete-match shape for any other selection.
      return withConnectorDemo(clone(completeMatch as RouteSearchResponse));
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
