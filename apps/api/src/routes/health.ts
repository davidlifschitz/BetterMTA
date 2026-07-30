import type { FastifyInstance } from "fastify";
import { newRequestId } from "../services/routeSearch.js";
import { setContractHeaders, type AppDeps } from "../plugins/helpers.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.get("/health/live", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/health/ready", async (request, reply) => {
    const requestId = newRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    setContractHeaders(reply, requestId);

    const readiness = await deps.data.getReadiness();
    const ready =
      readiness.staticOk &&
      (readiness.realtimeOk || readiness.degradedPermitted);

    if (ready) {
      return reply.status(200).send({
        status: "ready",
        dataMode: readiness.dataMode,
      });
    }

    return reply.status(503).send({
      status: "not_ready",
      reasons:
        readiness.reasons.length > 0
          ? readiness.reasons
          : ["dependency_not_ready"],
    });
  });
}
