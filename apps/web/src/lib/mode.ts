/**
 * Public env-driven mode and feature flags for the web client.
 * NEXT_PUBLIC_* reads use static property access so Next.js can inline them
 * into client bundles. Optional `env` args are for unit tests only.
 */

export type ApiMode = "fixture" | "live";

export function apiMode(env?: NodeJS.ProcessEnv): ApiMode {
  const mode = env
    ? env.NEXT_PUBLIC_API_MODE
    : process.env.NEXT_PUBLIC_API_MODE;
  return mode === "live" ? "live" : "fixture";
}

export function isLiveMode(env?: NodeJS.ProcessEnv): boolean {
  return apiMode(env) === "live";
}

export function isFixtureMode(env?: NodeJS.ProcessEnv): boolean {
  return !isLiveMode(env);
}

/** Feedback flag — default OFF. Only "true" / "1" enable. */
export function isFeedbackEnabled(env?: NodeJS.ProcessEnv): boolean {
  const v = env
    ? env.NEXT_PUBLIC_FLAG_FEEDBACK
    : process.env.NEXT_PUBLIC_FLAG_FEEDBACK;
  return v === "true" || v === "1";
}

/**
 * Live: feedback only when flag is on (ADR-0017).
 * Fixture: keep control for demos even when flag is unset.
 */
export function shouldShowFeedback(env?: NodeJS.ProcessEnv): boolean {
  if (isLiveMode(env)) return isFeedbackEnabled(env);
  return true;
}

/** Arrive-by is deferred for beta live UI (ADR-0014). */
export function shouldOfferArriveBy(env?: NodeJS.ProcessEnv): boolean {
  return isFixtureMode(env);
}

export function resultCountCap(env?: NodeJS.ProcessEnv): number | null {
  const raw = env
    ? env.NEXT_PUBLIC_FLAG_RESULT_COUNT
    : process.env.NEXT_PUBLIC_FLAG_RESULT_COUNT;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Address/POI geocode results in place search (ADR-0022).
 * Default OFF — flag-off keeps prior station-index-first UX.
 * Only "true" / "1" enable. Backend may still omit address/POI;
 * when present, the UI surfaces kind/source/attribution.
 */
export function isAddressPoiSearchEnabled(env?: NodeJS.ProcessEnv): boolean {
  const v = env
    ? env.NEXT_PUBLIC_FLAG_ADDRESS_POI
    : process.env.NEXT_PUBLIC_FLAG_ADDRESS_POI;
  return v === "true" || v === "1";
}
