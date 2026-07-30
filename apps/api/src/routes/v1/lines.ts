import type { FastifyInstance } from "fastify";
import { ApiError } from "../../errors/apiError.js";
import { newRequestId } from "../../services/routeSearch.js";
import {
  assertRateLimit,
  sendApiError,
  setContractHeaders,
  type AppDeps,
} from "../../plugins/helpers.js";

export async function registerLinesRoute(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.get("/v1/lines", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);

    try {
      assertRateLimit(deps, request, requestId, deps.readRateLimiter);

      const snapshot = await deps.data.getSnapshotHandle();
      const cacheKey = `lines:${snapshot.staticDatasetVersion || "missing"}`;
      const cached = deps.linesCache.get(cacheKey);
      if (cached) {
        reply.header("Cache-Control", "public, max-age=60");
        return reply.status(200).send(cached);
      }

      const lines = await deps.data.listLines();
      deps.linesCache.set(cacheKey, lines);
      reply.header("Cache-Control", "public, max-age=60");
      deps.logger.info("lines_ok", {
        requestId,
        route: "/v1/lines",
        method: "GET",
        statusCode: 200,
        durationMs: Date.now() - request.startedAt,
      });
      return reply.status(200).send(lines);
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
