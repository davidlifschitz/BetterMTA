import type { FastifyInstance } from "fastify";
import { ApiError } from "../../errors/apiError.js";
import { newRequestId } from "../../services/routeSearch.js";
import {
  assertRateLimit,
  sendApiError,
  setContractHeaders,
  type AppDeps,
} from "../../plugins/helpers.js";

export async function registerStatusRoute(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.get("/v1/status", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);

    try {
      assertRateLimit(deps, request, requestId, deps.readRateLimiter);

      const status = await deps.data.getStatus();
      deps.logger.info("status_ok", {
        requestId,
        route: "/v1/status",
        method: "GET",
        statusCode: 200,
        durationMs: Date.now() - request.startedAt,
        dataMode: status.dataMode,
        degraded: status.degraded,
      });
      return reply.status(200).send(status);
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
