import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { ApiConfig } from "../src/config.js";
import type { AppDeps } from "../src/plugins/helpers.js";
import { createLogger } from "../src/logging/logger.js";

export async function createTestApp(
  configOverrides: Partial<ApiConfig> = {},
  depsOverrides: Partial<AppDeps> = {},
): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  return buildApp({
    config: {
      logLevel: "silent",
      rateLimitMax: 1000,
      requestTimeoutMs: 500,
      ...configOverrides,
    },
    deps: {
      logger: createLogger("silent"),
      ...depsOverrides,
    },
  });
}

export function jsonHeaders(extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    ...extra,
  };
}
