import { timingSafeEqual } from "node:crypto";
import type { AppDeps, FastifyInstance } from "../../plugins/helpers.js";
import { renderPrometheusMetrics } from "../../metrics/prometheus.js";

function authorized(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

/** Registered only when BETTERMTA_METRICS_TOKEN is configured. */
export async function registerMetricsRoute(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  const token = deps.config.metricsToken;
  if (!token) return;

  app.get("/internal/metrics", async (request, reply) => {
    const auth =
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined;
    if (!authorized(auth, token)) {
      reply.header("WWW-Authenticate", "Bearer");
      return reply.status(401).send();
    }

    reply.header("Cache-Control", "no-store");
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return reply.send(
      renderPrometheusMetrics({
        requestLatency: deps.latency.snapshot(),
        privacy: deps.privacyMetrics.snapshot(),
      }),
    );
  });
}
