import { Readable } from "node:stream";
import Fastify, {
  type FastifyInstance,
  type FastifyError,
} from "fastify";
import { FixtureDataAdapter } from "./adapters/fixture/FixtureDataAdapter.js";
import { FixtureRoutingAdapter } from "./adapters/fixture/FixtureRoutingAdapter.js";
import { LiveDataAdapter } from "./adapters/live/LiveDataAdapter.js";
import { LiveRoutingAdapter } from "./adapters/live/LiveRoutingAdapter.js";
import {
  createGeocoderProvider,
  GeocodeQueryCache,
  GeocodeResolveCache,
} from "./adapters/places/index.js";
import { MemoryCache } from "./cache/memoryCache.js";
import {
  assertProductionAdapterLockout,
  loadConfig,
  type ApiConfig,
} from "./config.js";
import { CONTRACT_VERSION, MAX_PAYLOAD_BYTES } from "./constants.js";
import { ApiError } from "./errors/apiError.js";
import { createLogger } from "./logging/logger.js";
import { LatencyHistogram } from "./metrics/latency.js";
import { PrivacySafeMetrics } from "./metrics/privacyMetrics.js";
import { FixedWindowRateLimiter } from "./plugins/rateLimit.js";
import {
  sendApiError,
  setContractHeaders,
  setSecurityHeaders,
  type AppDeps,
} from "./plugins/helpers.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMetricsRoute } from "./routes/internal/metrics.js";
import { registerLinesRoute } from "./routes/v1/lines.js";
import { registerPlacesRoute } from "./routes/v1/places.js";
import { registerRouteSearch } from "./routes/v1/routesSearch.js";
import { registerStatusRoute } from "./routes/v1/status.js";
import { newRequestId } from "./services/routeSearch.js";
import type { LinesResponse, RouteSearchResponse } from "./types.js";
import { loadValidators } from "./validation/ajv.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export interface BuildAppOptions {
  config?: Partial<ApiConfig>;
  deps?: Partial<AppDeps>;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  const config = loadConfig(options.config);
  assertProductionAdapterLockout(config.adapterMode);

  const logger = options.deps?.logger ?? createLogger(config.logLevel);

  const { data, routing } = await resolveAdapters(config, logger, options.deps);

  const validators =
    options.deps?.validators ?? loadValidators(config.contractsRoot);
  const rateLimiter =
    options.deps?.rateLimiter ??
    new FixedWindowRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);
  const readRateLimiter =
    options.deps?.readRateLimiter ??
    new FixedWindowRateLimiter(
      config.cheapRateLimitMax,
      config.rateLimitWindowMs,
    );
  const linesCache =
    options.deps?.linesCache ??
    new MemoryCache<LinesResponse>(config.linesCacheTtlMs);
  const routeCache =
    options.deps?.routeCache ??
    new MemoryCache<RouteSearchResponse>(config.routeCacheTtlMs);
  const latency = options.deps?.latency ?? new LatencyHistogram();
  const privacyMetrics =
    options.deps?.privacyMetrics ?? new PrivacySafeMetrics();

  const deps: AppDeps = {
    config,
    logger,
    data,
    routing,
    validators,
    rateLimiter,
    readRateLimiter,
    linesCache,
    routeCache,
    latency,
    privacyMetrics,
  };

  const app = Fastify({
    logger: false,
    bodyLimit: MAX_PAYLOAD_BYTES,
    trustProxy: config.trustProxy,
    requestIdHeader: "x-request-id",
    genReqId: () => newRequestId(),
  });

  app.addHook("onRequest", async (request, reply) => {
    request.requestId = newRequestId(request.headers["x-request-id"]);
    request.startedAt = Date.now();
    setSecurityHeaders(reply);
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = Date.now() - (request.startedAt ?? Date.now());
    deps.latency.observe(durationMs);
    const snap = deps.latency.snapshot();
    deps.logger.debug("request_complete", {
      requestId: request.requestId,
      route: request.routeOptions?.url,
      method: request.method,
      statusCode: reply.statusCode,
      durationMs,
      latencyCount: snap.count,
      latencyP50Ms: snap.p50Ms,
      latencyP95Ms: snap.p95Ms,
      latencyP99Ms: snap.p99Ms,
    });
  });

  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.method !== "POST") return payload;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of payload) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_PAYLOAD_BYTES) {
        request.rawBody = Buffer.concat(chunks);
        // Drain remaining and mark oversized via rawBody length check in handler,
        // but Fastify bodyLimit should also trip. Keep collecting capped marker.
        throw new ApiError(
          "invalid_input",
          `Payload exceeds ${MAX_PAYLOAD_BYTES} byte limit.`,
          request.requestId,
          { maxBytes: MAX_PAYLOAD_BYTES },
        );
      }
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw;
    return Readable.from(raw);
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId ?? newRequestId();
    if (error instanceof ApiError) {
      sendApiError(reply, error, logger);
      return;
    }

    const fe = error as FastifyError;
    if (fe.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      sendApiError(
        reply,
        new ApiError(
          "invalid_input",
          `Payload exceeds ${MAX_PAYLOAD_BYTES} byte limit.`,
          requestId,
          { maxBytes: MAX_PAYLOAD_BYTES },
        ),
        logger,
      );
      return;
    }

    if (fe.validation) {
      sendApiError(
        reply,
        new ApiError("invalid_input", fe.message, requestId),
        logger,
      );
      return;
    }

    logger.error("unhandled_error", {
      requestId,
      errorCode: "internal_error",
      message: fe.message,
    });
    sendApiError(
      reply,
      new ApiError("internal_error", "An unexpected error occurred.", requestId),
      logger,
    );
  });

  app.addHook("onSend", async (request, reply, payload) => {
    setSecurityHeaders(reply);
    if (!reply.hasHeader("X-Request-Id")) {
      setContractHeaders(reply, request.requestId ?? newRequestId());
    } else if (!reply.hasHeader("X-Contract-Version")) {
      reply.header("X-Contract-Version", CONTRACT_VERSION);
    }
    return payload;
  });

  await registerRouteSearch(app, deps);
  await registerLinesRoute(app, deps);
  await registerPlacesRoute(app, deps);
  await registerStatusRoute(app, deps);
  await registerHealthRoutes(app, deps);
  await registerMetricsRoute(app, deps);

  return { app, deps };
}

async function resolveAdapters(
  config: ApiConfig,
  logger: AppDeps["logger"],
  depsOverride: Partial<AppDeps> | undefined,
): Promise<{ data: AppDeps["data"]; routing: AppDeps["routing"] }> {
  if (depsOverride?.data && depsOverride?.routing) {
    return { data: depsOverride.data, routing: depsOverride.routing };
  }

  const geocoder = createGeocoderProvider(config, logger);
  const geocodeQueryCache =
    config.addressPoiEnabled && geocoder
      ? new GeocodeQueryCache(
          config.geocoderQueryCacheTtlMs,
          config.geocoderQueryCacheMax,
        )
      : null;
  const geocodeResolveCache =
    config.addressPoiEnabled && geocoder
      ? new GeocodeResolveCache(config.geocoderResolveCacheTtlMs)
      : null;
  const placesOpts = {
    addressPoiEnabled: config.addressPoiEnabled,
    geocoder,
    geocodeQueryCache,
    geocodeResolveCache,
  };

  if (config.adapterMode === "fixture") {
    const data =
      depsOverride?.data ??
      new FixtureDataAdapter(
        config.fixturesRoot,
        config.adapterReadyMode,
        config.permitDegradedReady,
        placesOpts,
      );
    const routing =
      depsOverride?.routing ?? new FixtureRoutingAdapter(config.fixturesRoot);
    return { data, routing };
  }

  // Live mode
  const liveData =
    depsOverride?.data ??
    new LiveDataAdapter({
      baseUrl: config.dataInternalUrl,
      token: config.dataInternalToken,
      statusTtlMs: config.dataStatusTtlMs,
      catalogTtlMs: config.dataCatalogTtlMs,
      permitDegradedReady: config.permitDegradedReady,
      logger,
      ...placesOpts,
    });

  const routing =
    depsOverride?.routing ??
    new LiveRoutingAdapter({
      data: liveData,
      otpBaseUrl: config.otpUrl,
      otpTimeoutMs: config.otpTimeoutMs,
      otpProbeTtlMs: config.otpProbeTtlMs,
      otpGraphVersion: config.otpGraphVersion,
      logger,
    });

  return { data: liveData, routing };
}
