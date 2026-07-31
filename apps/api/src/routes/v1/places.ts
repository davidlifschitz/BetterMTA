import type { FastifyInstance } from "fastify";
import { isDataUnavailableError } from "../../adapters/live/errors.js";
import { ApiError } from "../../errors/apiError.js";
import {
  coarseGridId,
  hashPlaceQuery,
} from "../../logging/privacy.js";
import {
  normalizePlaceProviderMetricId,
  type PlaceProviderResult,
} from "../../metrics/privacyMetrics.js";
import { newRequestId } from "../../services/routeSearch.js";
import {
  assertRateLimit,
  sendApiError,
  setContractHeaders,
  type AppDeps,
} from "../../plugins/helpers.js";

export async function registerPlacesRoute(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.get("/v1/places/search", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);
    const startedMs = request.startedAt ?? Date.now();

    try {
      assertRateLimit(deps, request, requestId);

      const query = request.query as Record<string, unknown>;
      const q = typeof query.q === "string" ? query.q : undefined;
      if (!q || q.length < 1 || q.length > 100) {
        throw new ApiError(
          "invalid_input",
          "Query parameter q is required (1–100 characters).",
          requestId,
          { param: "q" },
        );
      }

      let limit = 8;
      if (query.limit !== undefined) {
        const parsed =
          typeof query.limit === "string"
            ? Number.parseInt(query.limit, 10)
            : Number(query.limit);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 15) {
          throw new ApiError(
            "invalid_input",
            "Query parameter limit must be an integer from 1 to 15.",
            requestId,
            { param: "limit" },
          );
        }
        limit = parsed;
      }

      let proximityLat: number | undefined;
      let proximityLon: number | undefined;
      if (query.proximityLat !== undefined || query.proximityLon !== undefined) {
        if (query.proximityLat === undefined || query.proximityLon === undefined) {
          throw new ApiError(
            "invalid_input",
            "proximityLat and proximityLon must be provided together.",
            requestId,
          );
        }
        proximityLat = Number(query.proximityLat);
        proximityLon = Number(query.proximityLon);
        if (
          !Number.isFinite(proximityLat) ||
          !Number.isFinite(proximityLon) ||
          proximityLat < -90 ||
          proximityLat > 90 ||
          proximityLon < -180 ||
          proximityLon > 180
        ) {
          throw new ApiError(
            "invalid_input",
            "Invalid proximity coordinates.",
            requestId,
          );
        }
      }

      // Do not log proximity coordinates or raw query text (ADR-0022).
      const result = await deps.data.searchPlaces({
        query: q,
        limit,
        proximityLat,
        proximityLon,
      });

      const geocodeCount = result.places.filter(
        (p) => p.provider === "geocoder",
      ).length;
      const durationMs = Date.now() - startedMs;
      const providerIds = new Set(
        result.places
          .map((p) =>
            normalizePlaceProviderMetricId(
              (p as { provider?: string }).provider,
            ),
          )
          .filter((id) => id !== "unknown"),
      );
      const provider =
        providerIds.size === 1
          ? [...providerIds][0]!
          : providerIds.has("geocoder")
            ? "geocoder"
            : providerIds.has("station_index")
              ? "station_index"
              : "unknown";
      const placeResult: PlaceProviderResult =
        result.places.length === 0 ? "empty" : "ok";
      deps.privacyMetrics.recordPlaceProvider({
        provider,
        result: placeResult,
        durationMs,
      });

      const proximityGrid =
        proximityLat !== undefined && proximityLon !== undefined
          ? coarseGridId(proximityLat, proximityLon)
          : undefined;

      deps.logger.info("places_ok", {
        requestId,
        route: "/v1/places/search",
        method: "GET",
        statusCode: 200,
        durationMs,
        queryLength: q.length,
        placeQueryHash: hashPlaceQuery(q),
        resultCount: result.places.length,
        stationResultCount: result.places.length - geocodeCount,
        geocodeResultCount: geocodeCount,
        addressPoiEnabled: deps.config.addressPoiEnabled,
        hasAttribution: Boolean(result.attribution),
        proximityProvided: proximityLat !== undefined,
        ...(proximityGrid ? { proximityGrid } : {}),
        provider,
      });

      return reply.status(200).send(result);
    } catch (err) {
      const durationMs = Date.now() - startedMs;
      if (isDataUnavailableError(err)) {
        deps.privacyMetrics.recordPlaceProvider({
          provider: "unknown",
          result: "unavailable",
          durationMs,
          errorClass: "upstream",
        });
        sendApiError(
          reply,
          new ApiError("data_unavailable", err.message, requestId),
          deps.logger,
        );
        return;
      }
      if (err instanceof ApiError) {
        if (err.code !== "invalid_input" && err.code !== "rate_limited") {
          deps.privacyMetrics.recordPlaceProvider({
            provider: "unknown",
            result: "error",
            durationMs,
            errorClass: "unknown",
          });
        }
        sendApiError(reply, err, deps.logger);
        return;
      }
      deps.privacyMetrics.recordPlaceProvider({
        provider: "unknown",
        result: "error",
        durationMs,
        errorClass: "unknown",
      });
      sendApiError(
        reply,
        new ApiError("internal_error", "An unexpected error occurred.", requestId),
        deps.logger,
      );
    }
  });
}
