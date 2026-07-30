import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import { CONTRACT_VERSION } from "../constants.js";
import { ApiError } from "../errors/apiError.js";
import type { Logger } from "../logging/logger.js";
import type { MemoryCache } from "../cache/memoryCache.js";
import type { LatencyHistogram } from "../metrics/latency.js";
import type { FixedWindowRateLimiter } from "../plugins/rateLimit.js";
import type { DataAdapter, RoutingAdapter } from "../adapters/types.js";
import type { CompiledValidators } from "../validation/ajv.js";
import type { LinesResponse, RouteSearchResponse } from "../types.js";

export interface AppDeps {
  config: ApiConfig;
  logger: Logger;
  data: DataAdapter;
  routing: RoutingAdapter;
  validators: CompiledValidators;
  rateLimiter: FixedWindowRateLimiter;
  /** Larger-bucket limiter for cheap GETs (lines, status). */
  readRateLimiter: FixedWindowRateLimiter;
  linesCache: MemoryCache<LinesResponse>;
  routeCache: MemoryCache<RouteSearchResponse>;
  latency: LatencyHistogram;
}

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    startedAt: number;
  }
}

export function setContractHeaders(reply: FastifyReply, requestId: string): void {
  reply.header("X-Request-Id", requestId);
  reply.header("X-Contract-Version", CONTRACT_VERSION);
}

export function setSecurityHeaders(reply: FastifyReply): void {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
}

export function sendApiError(
  reply: FastifyReply,
  err: ApiError,
  logger: Logger,
): void {
  setContractHeaders(reply, err.requestId);
  logger.warn("api_error", {
    requestId: err.requestId,
    errorCode: err.code,
    statusCode: err.httpStatus,
  });
  void reply.status(err.httpStatus).send(err.toBody());
}

export function clientKey(request: FastifyRequest, config: ApiConfig): string {
  if (config.allowRateLimitKey) {
    const override = request.headers["x-rate-limit-key"];
    if (typeof override === "string" && override.length > 0) return override;
  }
  return request.ip || "unknown";
}

export function assertRateLimit(
  deps: AppDeps,
  request: FastifyRequest,
  requestId: string,
  limiter: FixedWindowRateLimiter = deps.rateLimiter,
): void {
  if (!limiter.allow(clientKey(request, deps.config))) {
    throw new ApiError(
      "rate_limited",
      "Too many requests. Please try again later.",
      requestId,
    );
  }
}

export type { FastifyInstance };
