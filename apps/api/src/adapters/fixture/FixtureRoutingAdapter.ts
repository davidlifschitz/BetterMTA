import { ApiError } from "../../errors/apiError.js";
import type { RouteSearchResponse } from "../../types.js";
import type { RoutingAdapter, RoutingSearchInput } from "../types.js";
import { readJsonFixture } from "./readJson.js";
import { placeRefKey, selectRouteFixture } from "./selection.js";

export class FixtureRoutingAdapter implements RoutingAdapter {
  constructor(private readonly fixturesRoot: string) {}

  async searchRoutes(input: RoutingSearchInput): Promise<RouteSearchResponse> {
    if (input.signal?.aborted) {
      throw new ApiError("timeout", "Route search timed out.", input.requestId);
    }

    const originKey = placeRefKey(refParts(input.request.origin));
    const destinationKey = placeRefKey(refParts(input.request.destination));
    const selection = selectRouteFixture({
      originKey,
      destinationKey,
      selectedLineIds: input.selectedLineIds,
    });

    if (selection.kind === "error") {
      if (selection.code === "timeout") {
        await waitUntilAborted(input.signal);
        throw new ApiError("timeout", selection.message, input.requestId);
      }
      throw new ApiError(
        selection.code,
        selection.message,
        input.requestId,
        selection.details,
      );
    }

    if (input.artificialDelayMs && input.artificialDelayMs > 0) {
      await delay(input.artificialDelayMs, input.signal, input.requestId);
    }

    const fixture = readJsonFixture<RouteSearchResponse>(
      this.fixturesRoot,
      selection.path,
    );

    return {
      ...fixture,
      requestId: input.requestId,
      experiment: {
        explanationVariant: input.explanationVariant,
      },
    };
  }
}

function refParts(ref: RoutingSearchInput["request"]["origin"]): {
  placeId?: string;
  stationId?: string;
  coordinate?: { lat: number; lon: number };
} {
  if ("placeId" in ref) return { placeId: ref.placeId };
  if ("stationId" in ref) return { stationId: ref.stationId };
  return { coordinate: ref.coordinate };
}

function delay(ms: number, signal?: AbortSignal, requestId = "unknown"): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError("timeout", "Route search timed out.", requestId));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ApiError("timeout", "Route search timed out.", requestId));
      },
      { once: true },
    );
  });
}

function waitUntilAborted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!signal) {
      reject(new Error("AbortSignal required for timeout fixture path"));
      return;
    }
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
