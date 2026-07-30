import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, deps } = await buildApp({ config });

  try {
    await app.listen({ port: config.port, host: config.host });
    deps.logger.info("server_started", {
      port: config.port,
      host: config.host,
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
