/** Default OTP plan searchWindow: 45 minutes (seconds). */
export const DEFAULT_SEARCH_WINDOW_SECONDS = 45 * 60;

/** OTP graph `transitModelTimeZone` — plan String date/time are wall-clock in this zone. */
export const OTP_GRAPH_TIME_ZONE = "America/New_York";

const PLAN_SELECTION = `
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
`.trim();

/**
 * Baseline GraphQL plan query (recorded-fixture compatible).
 * Preference/via knobs are added only when orchestration needs them.
 */
export const OTP_PLAN_QUERY = buildPlanQueryDocument({
  includeUnpreferred: false,
  includeVia: false,
});

export interface PlanViaVisitInput {
  label?: string;
  lat: number;
  lon: number;
  /** OTP Duration string; default no mandatory wait. */
  minimumWaitTime?: string;
}

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
  unpreferredRoutes?: string;
  unpreferredCost?: string;
  via?: Array<{
    visit: {
      label?: string;
      coordinate: { lat: number; lon: number };
      minimumWaitTime?: string;
    };
  }>;
}

export interface BuildPlanRequestOptions {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  date: string;
  time: string;
  numItineraries: number;
  searchWindow: number;
  dateTime: number;
  unpreferredRoutes?: string[] | null;
  unpreferredCost?: string | null;
  via?: PlanViaVisitInput | null;
}

function buildPlanQueryDocument(flags: {
  includeUnpreferred: boolean;
  includeVia: boolean;
}): string {
  const varDecls = [
    "$fromLat: Float!",
    "$fromLon: Float!",
    "$toLat: Float!",
    "$toLon: Float!",
    "$date: String",
    "$time: String",
    "$numItineraries: Int",
    "$searchWindow: Long",
  ];
  const planArgs = [
    "from: { lat: $fromLat, lon: $fromLon }",
    "to: { lat: $toLat, lon: $toLon }",
    "date: $date",
    "time: $time",
    "numItineraries: $numItineraries",
    "searchWindow: $searchWindow",
    "transportModes: [{ mode: SUBWAY }, { mode: WALK }]",
  ];

  if (flags.includeUnpreferred) {
    varDecls.push("$unpreferredRoutes: String", "$unpreferredCost: String");
    planArgs.push(
      "unpreferred: { routes: $unpreferredRoutes, unpreferredCost: $unpreferredCost }",
    );
  }
  if (flags.includeVia) {
    varDecls.push("$via: [PlanViaLocationInput!]");
    planArgs.push("via: $via");
  }

  return `
query BetterMtaPlan(
  ${varDecls.join("\n  ")}
) {
  plan(
    ${planArgs.join("\n    ")}
  ) {
    ${PLAN_SELECTION}
  }
}
`.trim();
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

export function buildPlanRequestBody(opts: BuildPlanRequestOptions): {
  query: string;
  variables: PlanQueryVariables;
} {
  const includeUnpreferred = Boolean(
    opts.unpreferredRoutes && opts.unpreferredRoutes.length > 0,
  );
  const includeVia = Boolean(opts.via);
  const query = buildPlanQueryDocument({ includeUnpreferred, includeVia });

  const variables: PlanQueryVariables = {
    fromLat: opts.fromLat,
    fromLon: opts.fromLon,
    toLat: opts.toLat,
    toLon: opts.toLon,
    date: opts.date,
    time: opts.time,
    numItineraries: opts.numItineraries,
    searchWindow: opts.searchWindow,
    dateTime: opts.dateTime,
  };

  if (includeUnpreferred && opts.unpreferredRoutes) {
    variables.unpreferredRoutes = opts.unpreferredRoutes.join(",");
    variables.unpreferredCost = opts.unpreferredCost ?? "300 + 1.5 x";
  }
  if (includeVia && opts.via) {
    variables.via = [
      {
        visit: {
          label: opts.via.label,
          coordinate: { lat: opts.via.lat, lon: opts.via.lon },
          minimumWaitTime: opts.via.minimumWaitTime ?? "0s",
        },
      },
    ];
  }

  return { query, variables };
}

export function otpGraphqlUrl(otpBaseUrl: string): string {
  const base = otpBaseUrl.replace(/\/+$/, "");
  return `${base}/otp/gtfs/v1`;
}
