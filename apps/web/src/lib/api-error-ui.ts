import type { ApiErrorBody, ApiErrorCode } from "@/lib/contracts";
import { formatLineIdList } from "@/lib/line-display";
import type { Line } from "@/lib/contracts";

export type ErrorUiPhase =
  | "no_route"
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "invalid"
  | "error"
  | "coverage_failure";

export type ErrorUi = {
  phase: ErrorUiPhase;
  title: string;
  /** Fallback body when the API message is missing. */
  defaultBody: string;
  testId: string;
};

const BY_CODE: Record<ApiErrorCode, ErrorUi> = {
  no_transit_path: {
    phase: "no_route",
    title: "No subway path found",
    defaultBody: "No subway path was found between these places.",
    testId: "no-route-state",
  },
  data_unavailable: {
    phase: "unavailable",
    title: "Service unavailable",
    defaultBody:
      "Routing is temporarily unavailable. Please try again later.",
    testId: "unavailable-state",
  },
  timeout: {
    phase: "timeout",
    title: "Request timed out",
    defaultBody:
      "The routing service took too long to respond. Please try again.",
    testId: "timeout-state",
  },
  rate_limited: {
    phase: "rate_limited",
    title: "Too many requests",
    defaultBody: "You’ve hit a temporary rate limit. Wait a moment and try again.",
    testId: "rate-limited-state",
  },
  invalid_input: {
    phase: "invalid",
    title: "Check your trip",
    defaultBody: "That request wasn’t valid. Adjust your search and try again.",
    testId: "invalid-state",
  },
  unknown_place: {
    phase: "invalid",
    title: "Place not recognized",
    defaultBody:
      "One of the places wasn’t recognized. Pick a result from the suggestions list.",
    testId: "invalid-state",
  },
  unknown_line: {
    phase: "error",
    title: "Couldn’t find routes",
    defaultBody: "A preferred line wasn’t recognized.",
    testId: "error-state",
  },
  incomplete_selected_line_satisfaction: {
    phase: "error",
    title: "Couldn’t find routes",
    defaultBody: "Couldn’t satisfy your preferred lines for this trip.",
    testId: "error-state",
  },
  insufficient_candidate_coverage: {
    phase: "coverage_failure",
    title: "Couldn’t cover your preferred lines",
    defaultBody:
      "Not enough preference-covering route candidates were available within the search budget. Try again or adjust preferred lines.",
    testId: "coverage-failure-state",
  },
  stale_realtime: {
    phase: "error",
    title: "Couldn’t find routes",
    defaultBody: "Realtime data is too stale to route safely right now.",
    testId: "error-state",
  },
  internal_error: {
    phase: "error",
    title: "Couldn’t find routes",
    defaultBody: "Something went wrong. Please try again.",
    testId: "error-state",
  },
};

export function errorUiForCode(code: string): ErrorUi {
  if (code in BY_CODE) {
    return BY_CODE[code as ApiErrorCode];
  }
  return BY_CODE.internal_error;
}

/** Network abort / unreachable API — honest client-side failure. */
export const NETWORK_UNAVAILABLE_UI: ErrorUi = {
  phase: "unavailable",
  title: "API unavailable",
  defaultBody:
    "Could not reach the BetterMTA API. Check your connection and try again.",
  testId: "unavailable-state",
};

type CoverageDetails = {
  requestedLineIds?: unknown;
  preferenceCoveringCandidateCount?: unknown;
  candidateCount?: unknown;
  budgetExhausted?: unknown;
  status?: unknown;
  familiesAttempted?: unknown;
};

/** Extra rider-facing detail lines for insufficient_candidate_coverage. */
export function coverageFailureDetails(
  body: ApiErrorBody | null | undefined,
  lines: Line[] = [],
): string[] {
  if (!body || body.error.code !== "insufficient_candidate_coverage") {
    return [];
  }
  const d = (body.error.details ?? {}) as CoverageDetails;
  const out: string[] = [];
  if (Array.isArray(d.requestedLineIds) && d.requestedLineIds.length > 0) {
    const ids = d.requestedLineIds.filter(
      (x): x is string => typeof x === "string",
    );
    out.push(`Preferred lines: ${formatLineIdList(ids, lines)}`);
  }
  if (typeof d.preferenceCoveringCandidateCount === "number") {
    out.push(
      `Preference-covering candidates found: ${d.preferenceCoveringCandidateCount}`,
    );
  }
  if (d.budgetExhausted === true || d.status === "exhausted") {
    out.push("Search budget was exhausted before a trustworthy match.");
  }
  return out;
}
