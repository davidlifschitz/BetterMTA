import { CONTRACT_VERSION } from "../../constants.js";
import { ApiError } from "../../errors/apiError.js";
import type { Logger } from "../../logging/logger.js";
import type {
  DataMode,
  Place,
  PlaceRef,
  RouteSearchResponse,
  RoutingSnapshotHandle,
} from "../../types.js";
import type { DataAdapter, RoutingAdapter, RoutingSearchInput } from "../types.js";
import { DataUnavailableError } from "./errors.js";
import type { LiveDataAdapter } from "./LiveDataAdapter.js";
import {
  loadRoutingModule,
  type CandidateProvider,
  type CreateOtpCandidateProvider,
  type RunRouteSearch,
  type RouteSearchOutcome,
} from "./routingBinding.js";
import { SwrTtlCache } from "./swrCache.js";

export interface LiveRoutingAdapterOptions {
  data: DataAdapter;
  otpBaseUrl: string;
  otpTimeoutMs: number;
  otpProbeTtlMs: number;
  otpGraphVersion?: string | null;
  /**
   * Defaults to `process.env.NODE_ENV`. When `"production"` and
   * `otpGraphVersion` is unset, searches fail closed as `data_unavailable`.
   */
  nodeEnv?: string;
  logger?: Logger;
  /** Injected for unit tests — bypasses OTP provider factory. */
  candidateProvider?: CandidateProvider;
  /** Injected createOtpCandidateProvider (feature-detect result). */
  createOtpCandidateProvider?: CreateOtpCandidateProvider | null;
  /** Injected runRouteSearch (defaults to dynamic import). */
  runRouteSearch?: RunRouteSearch;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface DependencyReadiness {
  ok: boolean;
  reasons: string[];
}

export class LiveRoutingAdapter implements RoutingAdapter {
  private readonly data: DataAdapter;
  private readonly otpBaseUrl: string;
  private readonly otpTimeoutMs: number;
  private readonly otpGraphVersion: string | null;
  private readonly nodeEnv: string;
  private readonly logger?: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly injectedProvider?: CandidateProvider;
  private createProvider: CreateOtpCandidateProvider | null;
  private runRouteSearchFn: RunRouteSearch | null;
  private readonly otpProbeCache: SwrTtlCache<boolean>;
  private providerPromise: Promise<CandidateProvider> | null = null;

  constructor(opts: LiveRoutingAdapterOptions) {
    this.data = opts.data;
    this.otpBaseUrl = opts.otpBaseUrl.replace(/\/$/, "");
    this.otpTimeoutMs = opts.otpTimeoutMs;
    this.otpGraphVersion = opts.otpGraphVersion ?? null;
    this.nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? "development";
    this.logger = opts.logger;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.injectedProvider = opts.candidateProvider;
    this.createProvider =
      opts.createOtpCandidateProvider === undefined
        ? null
        : opts.createOtpCandidateProvider;
    this.runRouteSearchFn = opts.runRouteSearch ?? null;
    this.otpProbeCache = new SwrTtlCache(opts.otpProbeTtlMs, this.now);
  }

  async getDependencyReadiness(): Promise<DependencyReadiness> {
    try {
      const ok = await this.otpProbeCache.get(() => this.probeOtp());
      return ok
        ? { ok: true, reasons: [] }
        : { ok: false, reasons: ["otp_unreachable"] };
    } catch {
      return { ok: false, reasons: ["otp_unreachable"] };
    }
  }

  async searchRoutes(input: RoutingSearchInput): Promise<RouteSearchResponse> {
    if (input.signal?.aborted) {
      throw new ApiError("timeout", "Route search timed out.", input.requestId);
    }

    // Snapshot at search time — stamp response from this handle.
    const snapshot = input.snapshot;

    if (snapshot.dataMode === "unavailable" || !snapshot.staticDatasetVersion) {
      throw new ApiError(
        "data_unavailable",
        "Transit data is not available for routing.",
        input.requestId,
      );
    }

    this.assertGraphStaticCoherence(snapshot, input.requestId);

    const origin = await this.resolveToCoordinates(
      input.request.origin,
      "origin",
      input.requestId,
    );
    const destination = await this.resolveToCoordinates(
      input.request.destination,
      "destination",
      input.requestId,
    );

    const runRouteSearch = await this.getRunRouteSearch();
    const provider = await this.getProvider();

    let outcome: RouteSearchOutcome;
    try {
      outcome = await runRouteSearch(provider, {
        origin,
        destination,
        timing: input.request.timing,
        selectedLineIds: input.selectedLineIds,
        snapshot: {
          staticDatasetVersion: snapshot.staticDatasetVersion,
          realtimeSnapshotId: snapshot.realtimeSnapshotId ?? null,
          dataMode: snapshot.dataMode,
          realtimeAgeSeconds: snapshot.realtimeAgeSeconds ?? null,
          staticActivatedAt: snapshot.staticActivatedAt ?? null,
        },
      });
    } catch (err) {
      if (input.signal?.aborted || isTimeoutError(err)) {
        throw new ApiError("timeout", "Route search timed out.", input.requestId);
      }
      if (err instanceof ApiError) throw err;
      if (err instanceof DataUnavailableError) {
        throw new ApiError("data_unavailable", err.message, input.requestId);
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/data_unavailable|unavailable/i.test(message)) {
        throw new ApiError("data_unavailable", message, input.requestId);
      }
      if (/INSUFFICIENT_CANDIDATE_COVERAGE/i.test(message)) {
        throw new ApiError(
          "insufficient_candidate_coverage",
          message,
          input.requestId,
        );
      }
      throw new ApiError(
        "internal_error",
        "Route search failed unexpectedly.",
        input.requestId,
        { cause: message },
      );
    }

    return mapOutcomeToResponse(outcome, input, snapshot);
  }

  /**
   * Graph/static coherence (ADR / Phase 6 choice):
   * In production, BETTERMTA_OTP_GRAPH_VERSION must be set (fail closed).
   * When set, its prefix must equal the active staticDatasetVersion.
   * Mismatch means OTP schedule may differ from the catalog →
   * data_unavailable (fail closed), not a soft schedule_only claim.
   */
  private assertGraphStaticCoherence(
    snapshot: RoutingSnapshotHandle,
    requestId: string,
  ): void {
    if (!this.otpGraphVersion) {
      if (this.nodeEnv === "production") {
        this.logger?.warn("otp_graph_version_unset", {
          nodeEnv: this.nodeEnv,
        });
        throw new ApiError(
          "data_unavailable",
          "OTP graph version is not configured; refusing to route without a graph pin in production.",
          requestId,
        );
      }
      return;
    }
    const staticId = snapshot.staticDatasetVersion;
    if (graphVersionMatchesStatic(this.otpGraphVersion, staticId)) return;

    this.logger?.warn("otp_graph_static_mismatch", {
      otpGraphVersion: this.otpGraphVersion,
      staticDatasetVersion: staticId,
      // Do not log coordinates or query text.
    });
    throw new ApiError(
      "data_unavailable",
      "OTP graph version does not match the active static dataset; refusing to route with incoherent schedule data.",
      requestId,
      {
        otpGraphVersion: this.otpGraphVersion,
        staticDatasetVersion: staticId,
      },
    );
  }

  private async resolveToCoordinates(
    ref: PlaceRef,
    field: "origin" | "destination",
    requestId: string,
  ): Promise<{
    label: string;
    lat: number;
    lon: number;
    placeId?: string;
    stationId?: string;
  }> {
    if ("coordinate" in ref) {
      // Coordinate origin/destination passthrough — never log lat/lon.
      return {
        label: ref.label ?? "Coordinate",
        lat: ref.coordinate.lat,
        lon: ref.coordinate.lon,
      };
    }

    const resolved: Place | null = await this.data.resolvePlace(
      "placeId" in ref ? { placeId: ref.placeId } : { stationId: ref.stationId },
    );
    if (!resolved || resolved.lat === undefined || resolved.lon === undefined) {
      throw new ApiError(
        "unknown_place",
        `Could not resolve ${field} to coordinates.`,
        requestId,
        {
          field,
          ...("placeId" in ref
            ? { placeId: ref.placeId }
            : { stationId: ref.stationId }),
        },
      );
    }
    return {
      label: resolved.label,
      lat: resolved.lat,
      lon: resolved.lon,
      placeId: resolved.placeId,
      stationId: resolved.stationId,
    };
  }

  private async getRunRouteSearch(): Promise<RunRouteSearch> {
    if (this.runRouteSearchFn) return this.runRouteSearchFn;
    const binding = await loadRoutingModule();
    this.runRouteSearchFn = binding.runRouteSearch;
    if (this.createProvider === null && binding.createOtpCandidateProvider) {
      this.createProvider = binding.createOtpCandidateProvider;
    }
    return this.runRouteSearchFn;
  }

  private async getProvider(): Promise<CandidateProvider> {
    if (this.injectedProvider) return this.injectedProvider;
    if (this.providerPromise) return this.providerPromise;

    this.providerPromise = (async () => {
      if (!this.createProvider) {
        const binding = await loadRoutingModule();
        this.createProvider = binding.createOtpCandidateProvider;
        this.runRouteSearchFn ??= binding.runRouteSearch;
      }
      if (!this.createProvider) {
        throw new DataUnavailableError(
          "OTP candidate provider is not available (createOtpCandidateProvider missing from @bettermta/routing).",
        );
      }

      const routeIdToLineId = await resolveRouteIdMapper(this.data);
      return this.createProvider({
        otpBaseUrl: this.otpBaseUrl,
        timeoutMs: this.otpTimeoutMs,
        graphVersion: this.otpGraphVersion,
        routeIdToLineId,
        now: this.now,
      });
    })();

    return this.providerPromise;
  }

  private async probeOtp(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(1_500, this.otpTimeoutMs));
    try {
      const res = await this.fetchImpl(this.otpBaseUrl + "/", {
        method: "GET",
        signal: controller.signal,
      });
      // Any HTTP response means the process is reachable.
      return res.status > 0;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function graphVersionMatchesStatic(
  graphVersion: string,
  staticVersionId: string,
): boolean {
  if (!staticVersionId) return false;
  if (graphVersion === staticVersionId) return true;
  // Prefix rule: graph version starts with staticVersionId then a separator.
  // Phase 4 binding uses "<staticVersionId>+otp2.9.0".
  return (
    graphVersion.startsWith(staticVersionId + "+") ||
    graphVersion.startsWith(staticVersionId + "_") ||
    graphVersion.startsWith(staticVersionId + "-") ||
    graphVersion.startsWith(staticVersionId + "/")
  );
}

async function resolveRouteIdMapper(
  data: DataAdapter,
): Promise<(gtfsRouteId: string) => string | null> {
  if (typeof (data as LiveDataAdapter).buildRouteIdToLineId === "function") {
    return (data as LiveDataAdapter).buildRouteIdToLineId();
  }
  // Fallback: no gtfs mapping available from generic DataAdapter.
  return () => null;
}

function mapOutcomeToResponse(
  outcome: RouteSearchOutcome,
  input: RoutingSearchInput,
  snapshot: RoutingSnapshotHandle,
): RouteSearchResponse {
  switch (outcome.kind) {
    case "no_transit_path":
      throw new ApiError(
        "no_transit_path",
        "No transit path found between the origin and destination.",
        input.requestId,
        { requestedCount: outcome.requestedCount },
      );
    case "insufficient_candidate_coverage":
      throw new ApiError(
        "insufficient_candidate_coverage",
        outcome.reason,
        input.requestId,
        {
          requestedCount: outcome.requestedCount,
          requestedLineIds: input.selectedLineIds,
          ...(outcome.candidateCoverage ?? {}),
        },
      );
    case "data_unavailable":
      throw new ApiError(
        "data_unavailable",
        outcome.reason,
        input.requestId,
        { requestedCount: outcome.requestedCount },
      );
    case "timeout":
      throw new ApiError(
        "timeout",
        outcome.reason || "Route search timed out.",
        input.requestId,
        { requestedCount: outcome.requestedCount },
      );
    case "ok": {
      const dataMode: DataMode = snapshot.dataMode;
      const warnings: Array<{ code: string; message: string }> = [];
      if (dataMode === "stale" || outcome.dataDegradation === "stale") {
        warnings.push({
          code: "stale_realtime",
          message:
            "Live train times are delayed; showing last known updates.",
        });
      }
      if (
        dataMode === "schedule_only" ||
        outcome.dataDegradation === "schedule_only"
      ) {
        warnings.push({
          code: "schedule_only",
          message: "Realtime unavailable; times are schedule-based estimates.",
        });
      }
      if (
        outcome.constraintInfeasible &&
        input.selectedLineIds.length > 0 &&
        !outcome.satisfactionSummary.completeMatchFound
      ) {
        warnings.push({
          code: "incomplete_selected_line_satisfaction",
          message:
            "Could not satisfy every selected line; showing the best feasible match.",
        });
      }

      return {
        contractVersion: CONTRACT_VERSION,
        requestId: input.requestId,
        staticDatasetVersion: snapshot.staticDatasetVersion,
        realtimeSnapshotId: snapshot.realtimeSnapshotId ?? null,
        dataMode,
        freshness: {
          realtimeAgeSeconds: snapshot.realtimeAgeSeconds ?? null,
          staticActivatedAt: snapshot.staticActivatedAt ?? null,
          warnings,
        },
        baseline: {
          itineraries: stripLibraryExtras(outcome.baseline),
        },
        constrained: {
          itineraries: stripLibraryExtras(outcome.constrained),
          satisfactionSummary: outcome.satisfactionSummary,
        },
        ...(outcome.candidateCoverage
          ? { candidateCoverage: outcome.candidateCoverage }
          : {}),
        experiment: {
          explanationVariant: input.explanationVariant,
        },
      };
    }
    default: {
      const _exhaustive: never = outcome;
      void _exhaustive;
      throw new ApiError(
        "internal_error",
        "Unknown route search outcome.",
        input.requestId,
      );
    }
  }
}

/** Drop library-only fields (e.g. perLineRideSeconds) from itineraries. */
function stripLibraryExtras(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const copy = { ...(item as Record<string, unknown>) };
    delete copy.perLineRideSeconds;
    return copy;
  });
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; message?: string };
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === "ETIMEDOUT" || e.code === "ABORT_ERR") return true;
  if (typeof e.message === "string" && /timeout/i.test(e.message)) return true;
  return false;
}
