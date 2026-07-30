import type { FastifyInstance } from "fastify";
import { ApiError } from "../../errors/apiError.js";
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

      // Do not log proximity coordinates.
      const result = await deps.data.searchPlaces({
        query: q,
        limit,
        proximityLat,
        proximityLon,
      });

      deps.logger.info("places_ok", {
        requestId,
        route: "/v1/places/search",
        method: "GET",
        statusCode: 200,
        durationMs: Date.now() - request.startedAt,
        queryLength: q.length,
        resultCount: result.places.length,
        proximityProvided: proximityLat !== undefined,
      });

      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof ApiError) {
        sendApiError(reply, err, deps.logger);
        return;
      }
      sendApiError(
        reply,
        new ApiError("internal_error", "An unexpected error occurred.", requestId),
        deps.logger,
      );
    }
  });
}
