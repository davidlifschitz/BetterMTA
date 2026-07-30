/** Default OTP plan searchWindow: 45 minutes (seconds). */
export const DEFAULT_SEARCH_WINDOW_SECONDS = 45 * 60;

/**
 * GraphQL plan query modeled on services/otp/recorded captures.
 *
 * Request timing: we derive a timezone-safe UTC date + time from an epoch-millis
 * `dateTime` variable (never local-naive wall-clock strings). The epoch is
 * included in the variables payload for observability and tests.
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

/**
 * Derive UTC date (YYYY-MM-DD) and time (HH:mm:ss) from epoch millis.
 * OTP's legacy `plan` args take String date/time; we always send UTC components
 * derived from the absolute instant (never a local-naive wall clock).
 */
export function epochToUtcDateTimeParts(epochMs: number): {
  date: string;
  time: string;
} {
  const d = new Date(epochMs);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Invalid epoch millis: ${epochMs}`);
  }
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return { date, time };
}

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
