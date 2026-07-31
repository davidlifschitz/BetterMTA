/**
 * Normalize decoded GTFS-RT (with NYCT extensions) into the existing
 * ParsedRealtimeFeed / NormalizedTripUpdate representation.
 *
 * Midnight / service-day rule (implemented + tested):
 * NYCT trip identity uses `start_date` (GTFS service day YYYYMMDD) plus
 * origin time. Post-midnight trips that still belong to the prior service
 * day are encoded in static GTFS with times ≥ 24:00:00 (e.g. 24:30:00 =
 * 00:30 local on the next calendar day). When matching scheduled trips
 * against a `trip_replacement_period` window we convert each trip's first
 * departure into an absolute America/New_York timestamp:
 *   service_date_local_midnight + gtfs_time_seconds
 * where gtfs_time_seconds may exceed 24h. At a 00:30 clock boundary, a trip
 * with service date D-1 and departure 24:30:00 falls at local D 00:30 and
 * is included in windows covering that absolute instant.
 */

import type {
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsStopTime,
  GtfsTrip,
  LineMappingEntry,
  NormalizedTripUpdate,
  QuarantinedEntity,
  ServiceAlert,
  StaticDataset,
  StopTimeUpdate,
} from "../types.js";
import { resolveLineId } from "../line-mapping.js";
import { isServiceIdActiveOnDate } from "../static-pipeline/validate.js";
import type { ParsedRealtimeFeed } from "../realtime/parser.js";
import type {
  DecodedFeedMessage,
  DecodedEntity,
  TripReplacementPeriodDecoded,
} from "./proto.js";
import { isHollowDecodedFeed } from "./hollow.js";

const TZ = "America/New_York";

export interface NormalizeOptions {
  feedId: string;
  lineMapping?: LineMappingEntry[];
  knownTripIds?: Set<string>;
  /** Active static dataset — required for absence-as-cancellation */
  staticDataset?: StaticDataset | null;
  /** Override "now" for service-day helpers (ms) */
  nowMs?: number;
}

function normScheduleRel(
  v: string | undefined,
): NormalizedTripUpdate["scheduleRelationship"] {
  const x = (v ?? "SCHEDULED").toUpperCase();
  switch (x) {
    case "CANCELED":
    case "CANCELLED":
      return "canceled";
    case "ADDED":
      return "added";
    case "UNSCHEDULED":
      return "unscheduled";
    case "REPLACED":
      return "replaced";
    case "DUPLICATED":
      return "duplicated";
    case "DELETED":
      return "deleted";
    default:
      return "scheduled";
  }
}

function normStopRel(
  v: string | undefined,
): StopTimeUpdate["scheduleRelationship"] {
  const x = (v ?? "SCHEDULED").toUpperCase();
  if (x === "SKIPPED") return "skipped";
  if (x === "NO_DATA") return "no_data";
  if (x === "UNSCHEDULED") return "unscheduled";
  return "scheduled";
}

function translateText(
  field?: { translation?: Array<{ text?: string }> },
): string {
  return field?.translation?.[0]?.text ?? "";
}

function severityFrom(level?: string): ServiceAlert["severity"] {
  const x = (level ?? "").toUpperCase();
  if (x === "INFO" || x === "INFORMATION") return "info";
  if (x === "WARNING") return "warning";
  if (x === "SEVERE") return "severe";
  return "unknown";
}

/** Parse GTFS time HH:MM:SS (hours may be ≥ 24) into seconds from service midnight. */
export function gtfsTimeToSeconds(time: string): number | null {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (![h, min, s].every(Number.isFinite)) return null;
  return h * 3600 + min * 60 + s;
}

/**
 * Local midnight (America/New_York) for a YYYYMMDD service date, as POSIX seconds.
 */
export function serviceDateMidnightUnix(yyyymmdd: string): number {
  const y = Number(yyyymmdd.slice(0, 4));
  const mo = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  // Use noon UTC probe then format parts — robust DST handling via Intl.
  // Construct an ISO-like local time and interpret with a known offset loop.
  const guessUtc = Date.UTC(y, mo - 1, d, 5, 0, 0); // ~midnight ET winter
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // Binary-search-ish: find UTC ms where local date is y-mo-d and local time is 00:00:00
  let lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0);
  let hi = Date.UTC(y, mo - 1, d + 1, 12, 0, 0);
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(mid)).map((p) => [p.type, p.value]),
    );
    const localDate = `${parts.year}${parts.month}${parts.day}`;
    const localSec =
      Number(parts.hour) * 3600 +
      Number(parts.minute) * 60 +
      Number(parts.second);
    if (localDate < yyyymmdd || (localDate === yyyymmdd && localSec > 0)) {
      hi = mid;
    } else if (localDate > yyyymmdd) {
      lo = mid;
    } else if (localSec === 0) {
      return Math.floor(mid / 1000);
    } else {
      hi = mid;
    }
  }
  // Fallback: winter EST offset
  void guessUtc;
  return Math.floor(Date.UTC(y, mo - 1, d, 5, 0, 0) / 1000);
}

export function tripStartUnix(
  serviceDateYyyymmdd: string,
  firstDepartureGtfsTime: string,
): number | null {
  const secs = gtfsTimeToSeconds(firstDepartureGtfsTime);
  if (secs == null) return null;
  return serviceDateMidnightUnix(serviceDateYyyymmdd) + secs;
}

function yyyymmddFromUnix(unixSec: number): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(unixSec * 1000)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

function addDaysYyyymmdd(yyyymmdd: string, delta: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const mo = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, mo - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** 0=Sun..6=Sat in America/New_York for a YYYYMMDD service date. */
function weekdayNumber(yyyymmdd: string): number {
  const midnight = serviceDateMidnightUnix(yyyymmdd);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  const wd = fmt.format(new Date(midnight * 1000 + 12 * 3600 * 1000));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 1;
}

function serviceActiveOnDate(
  calendar: GtfsCalendar[],
  calendarDates: readonly GtfsCalendarDate[],
  serviceId: string,
  yyyymmdd: string,
): boolean {
  return isServiceIdActiveOnDate(
    serviceId,
    yyyymmdd,
    weekdayNumber(yyyymmdd),
    calendar,
    calendarDates,
  );
}

function firstDepartureByTrip(
  stopTimes: GtfsStopTime[],
): Map<string, string> {
  const map = new Map<string, { seq: number; time: string }>();
  for (const st of stopTimes) {
    const cur = map.get(st.tripId);
    if (!cur || st.stopSequence < cur.seq) {
      map.set(st.tripId, {
        seq: st.stopSequence,
        time: st.departureTime || st.arrivalTime,
      });
    }
  }
  const out = new Map<string, string>();
  for (const [id, v] of map) out.set(id, v.time);
  return out;
}

/**
 * Derive cancelled trips for routes under trip_replacement_period:
 * scheduled trips whose start falls inside the window and are absent from the feed.
 */
export function deriveAbsenceCancellations(options: {
  feedId: string;
  periods: TripReplacementPeriodDecoded[];
  presentTripIds: Set<string>;
  staticDataset: StaticDataset;
  /** Feed header timestamp — used when period.start is open */
  feedTimestampSec: number;
}): NormalizedTripUpdate[] {
  const {
    feedId,
    periods,
    presentTripIds,
    staticDataset,
    feedTimestampSec,
  } = options;
  const firstDep = firstDepartureByTrip(staticDataset.stopTimes);
  const derived: NormalizedTripUpdate[] = [];
  const emitted = new Set<string>();

  for (const period of periods) {
    if (!period.routeId || period.end == null) continue;
    const windowStart = period.start ?? 0;
    const windowEnd = period.end;
    if (windowEnd <= windowStart && period.start != null) continue;

    // Candidate service dates: calendar days touched by the window, plus prior day
    // for ≥24:00 GTFS times that land inside the window.
    const startDay = yyyymmddFromUnix(
      windowStart > 0 ? windowStart : Math.max(0, feedTimestampSec - 6 * 3600),
    );
    const endDay = yyyymmddFromUnix(windowEnd);
    const serviceDates: string[] = [];
    // Include day before start for post-midnight (24:xx) trips
    let cursor = addDaysYyyymmdd(startDay, -1);
    const last = addDaysYyyymmdd(endDay, 1);
    while (cursor <= last) {
      serviceDates.push(cursor);
      cursor = addDaysYyyymmdd(cursor, 1);
    }

    const routeTrips = staticDataset.trips.filter(
      (t) => t.routeId === period.routeId,
    );

    for (const serviceDate of serviceDates) {
      for (const trip of routeTrips) {
        if (
          !serviceActiveOnDate(
            staticDataset.calendar,
            staticDataset.calendarDates ?? [],
            trip.serviceId,
            serviceDate,
          )
        ) {
          continue;
        }
        const dep = firstDep.get(trip.tripId);
        if (!dep) continue;
        const startUnix = tripStartUnix(serviceDate, dep);
        if (startUnix == null) continue;
        if (startUnix < windowStart || startUnix >= windowEnd) continue;
        if (presentTripIds.has(trip.tripId)) continue;
        const key = `${trip.tripId}|${serviceDate}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        derived.push({
          tripId: trip.tripId,
          routeId: trip.routeId,
          startDate: serviceDate,
          startTime: dep,
          scheduleRelationship: "canceled",
          stopTimeUpdates: [],
          feedId,
          derivedFromReplacementPeriod: true,
        });
      }
    }
  }

  return derived;
}

function entityToUpdates(
  ent: DecodedEntity,
  options: NormalizeOptions,
  quarantined: QuarantinedEntity[],
): {
  tripUpdates: NormalizedTripUpdate[];
  alerts: ServiceAlert[];
  vehicles: number;
  parseErrors: number;
} {
  const feedId = options.feedId;
  const tripUpdates: NormalizedTripUpdate[] = [];
  const alerts: ServiceAlert[] = [];
  let vehicles = 0;
  let parseErrors = 0;
  const entityId = ent.id ?? "";

  if (ent.vehicle) vehicles += 1;

  if (ent.tripUpdate) {
    const trip = ent.tripUpdate.trip;
    const tripId = trip?.tripId;
    if (!tripId) {
      quarantined.push({
        kind: "trip_update",
        entityId,
        reason: "missing_trip_id",
        feedId,
      });
      parseErrors += 1;
    } else if (
      options.knownTripIds !== undefined &&
      !options.knownTripIds.has(tripId)
    ) {
      quarantined.push({
        kind: "trip_update",
        entityId,
        reason: "unknown_trip_id",
        feedId,
      });
    } else {
      const stopTimeUpdates: StopTimeUpdate[] = (
        ent.tripUpdate.stopTimeUpdate ?? []
      ).map((stu) => ({
        stopId: stu.stopId ?? "",
        stopSequence: stu.stopSequence,
        arrivalDelaySeconds: stu.arrival?.delay ?? null,
        departureDelaySeconds: stu.departure?.delay ?? null,
        arrivalTime: stu.arrival?.time ?? null,
        departureTime: stu.departure?.time ?? null,
        scheduleRelationship: normStopRel(stu.scheduleRelationship),
        scheduledTrack: stu.scheduledTrack,
        actualTrack: stu.actualTrack,
      }));

      tripUpdates.push({
        tripId,
        routeId: trip?.routeId,
        startDate: trip?.startDate,
        startTime: trip?.startTime,
        scheduleRelationship: normScheduleRel(trip?.scheduleRelationship),
        stopTimeUpdates,
        feedId,
        trainId: trip?.trainId,
        direction: trip?.direction,
        isAssigned: trip?.isAssigned,
      });
    }
  }

  if (ent.alert) {
    const header = translateText(ent.alert.headerText) || "Service alert";
    const description =
      translateText(ent.alert.descriptionText) || undefined;
    const affectedLineIds: string[] = [];
    const affectedTripIds: string[] = [];
    const affectedStopIds: string[] = [];

    for (const ie of ent.alert.informedEntity ?? []) {
      if (ie.routeId) {
        const lid = options.lineMapping
          ? resolveLineId(ie.routeId, options.lineMapping)
          : ie.routeId;
        if (lid) affectedLineIds.push(lid);
        else {
          quarantined.push({
            kind: "alert",
            entityId,
            reason: `unknown_alert_route:${ie.routeId}`,
            feedId,
          });
        }
      }
      if (ie.trip?.tripId) affectedTripIds.push(ie.trip.tripId);
      if (ie.stopId) affectedStopIds.push(ie.stopId);
    }

    alerts.push({
      alertId: entityId || `alert_${alerts.length}`,
      header,
      description,
      severity: severityFrom(ent.alert.severityLevel),
      affectedLineIds: affectedLineIds.length
        ? [...new Set(affectedLineIds)]
        : undefined,
      affectedTripIds: affectedTripIds.length ? affectedTripIds : undefined,
      affectedStopIds: affectedStopIds.length ? affectedStopIds : undefined,
      feedId,
    });
  }

  if (!ent.tripUpdate && !ent.alert && !ent.vehicle) {
    quarantined.push({
      kind: "unknown",
      entityId,
      reason: "empty_entity",
      feedId,
    });
    parseErrors += 1;
  }

  return { tripUpdates, alerts, vehicles, parseErrors };
}

/**
 * Normalize a decoded protobuf feed into ParsedRealtimeFeed (ingest-compatible).
 */
export function normalizeDecodedFeed(
  decoded: DecodedFeedMessage,
  options: NormalizeOptions,
): ParsedRealtimeFeed {
  const feedId = options.feedId;
  const quarantined: QuarantinedEntity[] = [];
  const tripUpdates: NormalizedTripUpdate[] = [];
  const alerts: ServiceAlert[] = [];
  let vehicleCount = 0;
  let parseErrors = 0;

  const presentTripIds = new Set<string>();
  const hasWireEntities = !isHollowDecodedFeed(decoded);

  for (const ent of decoded.entity) {
    try {
      const part = entityToUpdates(ent, options, quarantined);
      for (const tu of part.tripUpdates) {
        tripUpdates.push(tu);
        presentTripIds.add(tu.tripId);
      }
      alerts.push(...part.alerts);
      vehicleCount += part.vehicles;
      parseErrors += part.parseErrors;
    } catch {
      parseErrors += 1;
      quarantined.push({
        kind: "unknown",
        entityId: ent.id ?? "",
        reason: "parse_exception",
        feedId,
      });
    }
  }

  const periods = decoded.header.nyct?.tripReplacementPeriods ?? [];
  // Absence-as-cancellation only merges into a usable snapshot when the wire
  // message had real entities. Hollow + TRP alone must not invent cancels that
  // look like live payload (see hollow LKG / mass-cancel remediations).
  if (periods.length > 0 && options.staticDataset && hasWireEntities) {
    const derived = deriveAbsenceCancellations({
      feedId,
      periods,
      presentTripIds,
      staticDataset: options.staticDataset,
      feedTimestampSec: decoded.header.timestamp,
    });
    tripUpdates.push(...derived);
  }

  const feedTimestampIso = new Date(
    decoded.header.timestamp * 1000,
  ).toISOString();

  return {
    feedId,
    feedTimestampIso,
    tripUpdates,
    alerts,
    quarantined,
    parseErrors,
    vehicleCount,
    simulatedFailure: null,
    hasWireEntities,
  };
}

/** Re-export for tests that need trip helpers without static. */
export type { GtfsTrip };
