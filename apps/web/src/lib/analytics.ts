/**
 * Privacy-safe analytics dispatcher.
 * Default implementation logs to console (no-op network). Swap transport later.
 *
 * Never include precise coordinates in event payloads.
 */

export type AnalyticsEventName =
  | "search_started"
  | "place_selected"
  | "timing_changed"
  | "line_picker_opened"
  | "line_toggled"
  | "results_viewed"
  | "route_selected"
  | "explanation_expanded"
  | "error_viewed"
  | "lines_updated_rerun"
  | "feedback_submitted"
  | "location_permission";

export type AnalyticsPayload = {
  search_started: {
    hasSelectedLines: boolean;
    selectedLineCount: number;
    timingType: "depart_now" | "depart_at" | "arrive_by";
    viewport: "mobile" | "desktop";
  };
  place_selected: {
    field: "origin" | "destination";
    placeKind?: string;
    /** Opaque place id only — never lat/lon. */
    placeId?: string;
  };
  timing_changed: {
    timingType: "depart_now" | "depart_at" | "arrive_by";
  };
  line_picker_opened: {
    selectedLineCount: number;
    context: "before_search" | "after_search";
  };
  line_toggled: {
    lineId: string;
    selected: boolean;
    selectedLineCount: number;
  };
  results_viewed: {
    requestId: string;
    dataMode: string;
    resultCount: number;
    completeMatchFound: boolean;
    bestSatisfactionCount: number;
    requestedCount: number;
  };
  route_selected: {
    requestId: string;
    itineraryId: string;
    satisfactionCount: number;
    requestedCount: number;
    isComplete: boolean;
  };
  explanation_expanded: {
    itineraryId: string;
    variant?: "concise" | "detailed";
  };
  error_viewed: {
    code: string;
    requestId?: string;
  };
  lines_updated_rerun: {
    selectedLineCount: number;
    preservedOd: true;
  };
  feedback_submitted: {
    /** Anonymous search id only — never OD coordinates or address free text. */
    requestId: string;
    rating: "up" | "down";
    hasComment: boolean;
    /** Optional short comment body; fixture-mode stub may log it locally. */
    comment?: string;
  };
  location_permission: {
    outcome: "granted" | "denied" | "unsupported" | "timeout" | "error";
    mappedToFixtureOrigin: boolean;
  };
};

export type AnalyticsEvent = {
  [K in AnalyticsEventName]: {
    name: K;
    properties: AnalyticsPayload[K];
    ts: string;
  };
}[AnalyticsEventName];

export type AnalyticsDispatcher = (event: AnalyticsEvent) => void;

const consoleDispatcher: AnalyticsDispatcher = (event) => {
  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", event.name, event.properties);
  }
};

let dispatcher: AnalyticsDispatcher = consoleDispatcher;

export function setAnalyticsDispatcher(next: AnalyticsDispatcher): void {
  dispatcher = next;
}

export function track<K extends AnalyticsEventName>(
  name: K,
  properties: AnalyticsPayload[K],
): void {
  dispatcher({
    name,
    properties,
    ts: new Date().toISOString(),
  } as AnalyticsEvent);
}
