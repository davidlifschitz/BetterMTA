import { randomUUID } from "node:crypto";
import { isDataUnavailableError } from "../adapters/live/errors.js";
import { ApiError } from "../errors/apiError.js";
import { assignExplanationVariant } from "../experiments/assign.js";
import { buildRouteCacheKey } from "../cache/routeCacheKey.js";
import type { MemoryCache } from "../cache/memoryCache.js";
import type { DataAdapter, RoutingAdapter } from "../adapters/types.js";
import type { RouteSearchRequest, RouteSearchResponse } from "../types.js";
import { MAX_REQUEST_ID_LENGTH, MAX_SELECTED_LINES } from "../constants.js";

export async function executeRouteSearch(input: {
  body: RouteSearchRequest;
  requestId: string;
  experimentSeed?: string;
  data: DataAdapter;
  routing: RoutingAdapter;
  routeCache: MemoryCache<RouteSearchResponse>;
  signal: AbortSignal;
}): Promise<RouteSearchResponse> {
  const { body, requestId, data, routing, routeCache, signal } = input;

  try {
    // ADR-0014: arrive-by deferred for beta — reject with clear 400 (invalid_input).
    if (body.timing?.type === "arrive_by") {
      throw new ApiError(
        "invalid_input",
        "Arrive-by search is not supported in this beta. Use depart_now or depart_at.",
        requestId,
        { field: "timing.type", value: "arrive_by" },
      );
    }

    const readiness = await data.getReadiness();
    if (!readiness.staticOk) {
      throw new ApiError(
        "data_unavailable",
        "Static transit dataset is not available.",
        requestId,
        { reasons: readiness.reasons },
      );
    }

    const selected = normalizeSelectedLines(body.selectedLineIds);
    if (selected.length > MAX_SELECTED_LINES) {
      throw new ApiError(
        "invalid_input",
        `At most ${MAX_SELECTED_LINES} selected lines are allowed.`,
        requestId,
        { maxSelectedLines: MAX_SELECTED_LINES },
      );
    }

    await assertKnownPlaces(body, data, requestId);
    await assertKnownLines(selected, data, requestId);

    const snapshot = await data.getSnapshotHandle();
    const explanationVariant = assignExplanationVariant(
      requestId,
      input.experimentSeed,
    );

    const cacheKey = buildRouteCacheKey({
      request: body,
      selectedLineIds: selected,
      staticDatasetVersion: snapshot.staticDatasetVersion,
      realtimeSnapshotId: snapshot.realtimeSnapshotId,
      explanationVariant,
    });

    const cached = routeCache.get(cacheKey);
    if (cached) {
      return { ...cached, requestId };
    }

    const response = await routing.searchRoutes({
      request: { ...body, selectedLineIds: selected },
      selectedLineIds: selected,
      snapshot,
      requestId,
      explanationVariant,
      signal,
    });

    routeCache.set(cacheKey, response);
    return response;
  } catch (err) {
    if (isDataUnavailableError(err)) {
      throw new ApiError("data_unavailable", err.message, requestId);
    }
    throw err;
  }
}

function normalizeSelectedLines(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function assertKnownPlaces(
  body: RouteSearchRequest,
  data: DataAdapter,
  requestId: string,
): Promise<void> {
  for (const label of ["origin", "destination"] as const) {
    const ref = body[label];
    if ("coordinate" in ref) continue;
    const resolved = await data.resolvePlace(
      "placeId" in ref ? { placeId: ref.placeId } : { stationId: ref.stationId },
    );
    if (!resolved) {
      throw new ApiError(
        "unknown_place",
        `Could not resolve ${label}.`,
        requestId,
        {
          field: label,
          ...("placeId" in ref
            ? { placeId: ref.placeId }
            : { stationId: ref.stationId }),
        },
      );
    }
  }
}

async function assertKnownLines(
  selected: string[],
  data: DataAdapter,
  requestId: string,
): Promise<void> {
  if (!selected.length) return;
  const known = await data.knownLineIds();
  const unknown = selected.filter((id) => !known.has(id));
  if (unknown.length) {
    throw new ApiError(
      "unknown_line",
      "One or more selected lines are not recognized.",
      requestId,
      { unknownLineIds: unknown },
    );
  }
}

/**
 * Sanitize a client-supplied X-Request-Id: strip control chars, trim, cap length.
 * Returns undefined when the value is empty after sanitization.
 */
export function sanitizeRequestId(
  provided?: string | string[],
): string | undefined {
  const raw = Array.isArray(provided) ? provided[0] : provided;
  if (typeof raw !== "string") return undefined;
  // Strip ASCII control characters (incl. DEL).
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, MAX_REQUEST_ID_LENGTH);
}

export function newRequestId(provided?: string | string[]): string {
  const cleaned = sanitizeRequestId(provided);
  if (cleaned) return cleaned;
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
