/** Default OTP plan searchWindow: 45 minutes (seconds). */
export const DEFAULT_SEARCH_WINDOW_SECONDS = 45 * 60;

/** OTP graph `transitModelTimeZone` — plan String date/time are wall-clock in this zone. */
export const OTP_GRAPH_TIME_ZONE = "America/New_York";

/**
 * GraphQL plan query modeled on services/otp/recorded captures.
 *
 * Request timing: we derive America/New_York wall-clock date + time from an
 * epoch-millis `dateTime` variable (matching OTP's transitModelTimeZone).
 * The epoch is included in the variables payload for observability and tests.
 *
 * Response times: request unaliased `start`/`end` (Itinerary) and LegTime
 * `scheduledTime` so the mapper can accept epoch millis or OffsetDateTime.
 */
export const OTP_PLAN_QUERY = `
query BetterMtaPlan(
  $fromLat: Float!
  $fromLon: Float!
  $toLat: Float!
  $toLon: Float!
  $date: String
  $time: String
  $numItineraries: Int
  $searchWindow: Long
) {
  plan(
    from: { lat: $fromLat, lon: $fromLon }
    to: { lat: $toLat, lon: $toLon }
    date: $date
    time: $time
    numItineraries: $numItineraries
    searchWindow: $searchWindow
    transportModes: [{ mode: SUBWAY }, { mode: WALK }]
  ) {
    itineraries {
      duration
      start
      end
      walkDistance
      numberOfTransfers
      legs {
        mode
        duration
        start { scheduledTime estimated { time } }
        end { scheduledTime estimated { time } }
        from { name lat lon stop { gtfsId name code } }
        to { name lat lon stop { gtfsId name code } }
        route { gtfsId shortName longName mode }
        trip { gtfsId }
      }
    }
  }
}
`.trim();

export interface PlanQueryVariables {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  date: string;
  time: string;
  numItineraries: number;
  searchWindow: number;
  /** Canonical epoch-millis departure instant (observability / tests). */
  dateTime: number;
}

/**
 * Convert an ISO-8601 instant (or Date) to epoch milliseconds.
 * Throws if the value is not a valid absolute instant.
 */
export function isoToEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ISO instant: ${iso}`);
  }
  return ms;
}

const nyDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: OTP_GRAPH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Derive America/New_York wall-clock date (YYYY-MM-DD) and time (HH:mm:ss)
 * from epoch millis. OTP's legacy `plan` args take String date/time interpreted
 * in the graph's `transitModelTimeZone` (America/New_York) — never UTC components
 * from `toISOString()`, which skew departure by the NY offset (~4h EDT / ~5h EST).
 */
export function epochToNyDateTimeParts(epochMs: number): {
  date: string;
  time: string;
} {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`Invalid epoch millis: ${epochMs}`);
  }
  const d = new Date(epochMs);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Invalid epoch millis: ${epochMs}`);
  }
  const parts = Object.fromEntries(
    nyDateTimeFormatter.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return { date, time };
}

/** @deprecated Use {@link epochToNyDateTimeParts}; kept as an alias for callers. */
export const epochToUtcDateTimeParts = epochToNyDateTimeParts;

export function buildPlanRequestBody(vars: PlanQueryVariables): {
  query: string;
  variables: PlanQueryVariables;
} {
  return {
    query: OTP_PLAN_QUERY,
    variables: vars,
  };
}

export function otpGraphqlUrl(otpBaseUrl: string): string {
  const base = otpBaseUrl.replace(/\/+$/, "");
  return `${base}/otp/gtfs/v1`;
}
