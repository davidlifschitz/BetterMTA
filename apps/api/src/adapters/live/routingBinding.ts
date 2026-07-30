/**
 * Local binding types for @bettermta/routing.
 * createOtpCandidateProvider may not exist yet — feature-detect at wiring time.
 * runRouteSearch + CandidateProvider already exist in the package.
 */

export interface CandidateProvider {
  readonly id: string;
  generateCandidates(request: unknown): Promise<unknown[]>;
}

export interface OtpCandidateProviderOptions {
  otpBaseUrl: string;
  timeoutMs?: number;
  numItineraries?: number;
  graphVersion?: string | null;
  routeIdToLineId: (gtfsRouteId: string) => string | null;
  now?: () => number;
}

export type CreateOtpCandidateProvider = (
  opts: OtpCandidateProviderOptions,
) => CandidateProvider;

export type RouteSearchOutcome =
  | {
      kind: "ok";
      baseline: unknown[];
      constrained: unknown[];
      satisfactionSummary: {
        bestSatisfactionCount: number;
        requestedCount: number;
        completeMatchFound: boolean;
      };
      constraintInfeasible: boolean;
      dataDegradation: "schedule_only" | "stale" | null;
      invalidDraftRejectionCounts: Record<string, number>;
    }
  | { kind: "no_transit_path"; requestedCount: number }
  | {
      kind: "insufficient_candidate_coverage";
      requestedCount: number;
      reason: string;
    }
  | {
      kind: "data_unavailable";
      requestedCount: number;
      reason: string;
    }
  | {
      kind: "timeout";
      requestedCount: number;
      reason: string;
    };

export type RunRouteSearch = (
  provider: CandidateProvider,
  request: unknown,
) => Promise<RouteSearchOutcome>;

export interface RoutingModuleBinding {
  runRouteSearch: RunRouteSearch;
  createOtpCandidateProvider: CreateOtpCandidateProvider | null;
}

/**
 * Load @bettermta/routing. Feature-detect createOtpCandidateProvider so tests
 * and partial builds still wire; inject CandidateProvider in tests instead.
 */
export async function loadRoutingModule(): Promise<RoutingModuleBinding> {
  const mod = (await import("@bettermta/routing")) as Record<string, unknown>;
  const runRouteSearch = mod.runRouteSearch;
  if (typeof runRouteSearch !== "function") {
    throw new Error(
      "@bettermta/routing is missing runRouteSearch; rebuild services/routing.",
    );
  }
  const create =
    typeof mod.createOtpCandidateProvider === "function"
      ? (mod.createOtpCandidateProvider as CreateOtpCandidateProvider)
      : null;
  return {
    runRouteSearch: runRouteSearch as RunRouteSearch,
    createOtpCandidateProvider: create,
  };
}

/** Sync helper when the module is already resolvable (preferred in production wiring). */
export function tryGetCreateOtpCandidateProvider(
  mod: Record<string, unknown>,
): CreateOtpCandidateProvider | null {
  return typeof mod.createOtpCandidateProvider === "function"
    ? (mod.createOtpCandidateProvider as CreateOtpCandidateProvider)
    : null;
}
