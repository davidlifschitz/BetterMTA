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
    const reasons = [...readiness.reasons];

    let dependencyOk = true;
    if (
      deps.config.adapterMode === "live" &&
      typeof deps.routing.getDependencyReadiness === "function"
    ) {
      const dep = await deps.routing.getDependencyReadiness();
      dependencyOk = dep.ok;
      for (const r of dep.reasons) {
        if (!reasons.includes(r)) reasons.push(r);
      }
    }

    const ready =
      readiness.staticOk &&
      (readiness.realtimeOk || readiness.degradedPermitted) &&
      dependencyOk;

    if (ready) {
      return reply.status(200).send({
        status: "ready",
        dataMode: readiness.dataMode,
      });
    }

    return reply.status(503).send({
      status: "not_ready",
      reasons: reasons.length > 0 ? reasons : ["dependency_not_ready"],
    });
  });
}
