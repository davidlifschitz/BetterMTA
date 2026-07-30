import type { FastifyInstance } from "fastify";
import { ApiError } from "../../errors/apiError.js";
import { MAX_PAYLOAD_BYTES } from "../../constants.js";
import { formatAjvErrors } from "../../validation/ajv.js";
import type { RouteSearchRequest } from "../../types.js";
import { executeRouteSearch, newRequestId } from "../../services/routeSearch.js";
import {
  assertRateLimit,
  sendApiError,
  setContractHeaders,
  type AppDeps,
} from "../../plugins/helpers.js";

export async function registerRouteSearch(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.post("/v1/routes/search", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);

    try {
      assertRateLimit(deps, request, requestId);

      const raw = request.rawBody;
      if (raw !== undefined && Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES) {
        throw new ApiError(
          "invalid_input",
          `Payload exceeds ${MAX_PAYLOAD_BYTES} byte limit.`,
          requestId,
          { maxBytes: MAX_PAYLOAD_BYTES },
        );
      }

      const body = request.body as RouteSearchRequest | undefined;
      if (!body || typeof body !== "object") {
        throw new ApiError(
          "invalid_input",
          "Request body must be a JSON object.",
          requestId,
        );
      }

      const valid = deps.validators.validateRouteSearchRequest(body);
      if (!valid) {
        throw new ApiError(
          "invalid_input",
          formatAjvErrors(deps.validators.validateRouteSearchRequest.errors),
          requestId,
          { validationErrors: deps.validators.validateRouteSearchRequest.errors },
        );
      }

      // uniqueItems in schema should catch duplicates, but also enforce max 5 explicitly.
      if (
        Array.isArray(body.selectedLineIds) &&
        new Set(body.selectedLineIds).size !== body.selectedLineIds.length
      ) {
        throw new ApiError(
          "invalid_input",
          "selectedLineIds must be unique.",
          requestId,
        );
      }

      const controller = new AbortController();
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutMs = deps.config.requestTimeoutMs;

      const hardTimeout = new Promise<never>((_, reject) => {
        hardTimer = setTimeout(() => {
          controller.abort();
          reject(new ApiError("timeout", "Route search timed out.", requestId));
        }, timeoutMs);
      });

      const experimentSeed =
        deps.config.allowExperimentSeed &&
        typeof request.headers["x-experiment-seed"] === "string"
          ? request.headers["x-experiment-seed"]
          : undefined;

      const work = executeRouteSearch({
        body,
        requestId,
        experimentSeed,
        data: deps.data,
        routing: deps.routing,
        routeCache: deps.routeCache,
        signal: controller.signal,
      });

      try {
        const result = await Promise.race([work, hardTimeout]);
        deps.logger.info("route_search_ok", {
          requestId,
          route: "/v1/routes/search",
          method: "POST",
          statusCode: 200,
          durationMs: Date.now() - request.startedAt,
          dataMode: result.dataMode,
        });
        return reply.status(200).send(result);
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.code === "timeout"
        ) {
          throw err;
        }
        if (controller.signal.aborted) {
          throw new ApiError("timeout", "Route search timed out.", requestId);
        }
        throw err;
      } finally {
        if (hardTimer !== undefined) clearTimeout(hardTimer);
        // Swallow late rejection if the hard timeout won the race.
        void work.catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        sendApiError(reply, err, deps.logger);
        return;
      }
      deps.logger.error("route_search_unexpected", {
        requestId,
        errorCode: "internal_error",
      });
      sendApiError(
        reply,
        new ApiError("internal_error", "An unexpected error occurred.", requestId),
        deps.logger,
      );
    }
  });
}
