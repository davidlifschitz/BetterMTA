import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, deps } = await buildApp({ config });

  // Locked decision: in-memory limiter is single-replica only.
  deps.logger.info("rate_limit_scope", {
    scope: "single_replica_in_memory",
    rateLimitMax: config.rateLimitMax,
    cheapRateLimitMax: config.cheapRateLimitMax,
    windowMs: config.rateLimitWindowMs,
    note: "Not safe across multiple API replicas; sticky session or shared store required for multi-instance.",
  });

  try {
    await app.listen({ port: config.port, host: config.host });
    deps.logger.info("server_started", {
      port: config.port,
      host: config.host,
      adapterMode: config.adapterMode,
      adapterReadyMode: config.adapterReadyMode,
    });
  } catch (err) {
    deps.logger.error("server_start_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

void main();
