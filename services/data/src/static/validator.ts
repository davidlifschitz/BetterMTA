import type { ParsedGtfs } from "./gtfs-parser.js";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Schema + referential-integrity checks before activation.
 * Failed validation ⇒ import status failed; never activate.
 */
export function validateGtfs(parsed: ParsedGtfs): ValidationResult {
  const issues: ValidationIssue[] = [];

  const stopIds = new Set<string>();
  for (const s of parsed.stops) {
    if (!s.stopId) {
      issues.push({
        code: "missing_stop_id",
        message: "Stop missing stop_id",
        severity: "error",
      });
      continue;
    }
    if (stopIds.has(s.stopId)) {
      issues.push({
        code: "duplicate_stop_id",
        message: `Duplicate stop_id ${s.stopId}`,
        severity: "error",
      });
    }
    stopIds.add(s.stopId);
  }

  for (const s of parsed.stops) {
    if (s.parentStation && !stopIds.has(s.parentStation)) {
      issues.push({
        code: "broken_parent_station",
        message: `Stop ${s.stopId} parent_station ${s.parentStation} not found`,
        severity: "error",
      });
    }
  }

  const routeIds = new Set<string>();
  for (const r of parsed.routes) {
    if (!r.routeId) {
      issues.push({
        code: "missing_route_id",
        message: "Route missing route_id",
        severity: "error",
      });
      continue;
    }
    routeIds.add(r.routeId);
  }

  const serviceIds = new Set(parsed.calendar.map((c) => c.serviceId));
  for (const c of parsed.calendar) {
    if (!c.serviceId || !/^\d{8}$/.test(c.startDate) || !/^\d{8}$/.test(c.endDate)) {
      issues.push({
        code: "invalid_calendar",
        message: `Invalid calendar row for service ${c.serviceId}`,
        severity: "error",
      });
    }
  }

  const tripIds = new Set<string>();
  for (const t of parsed.trips) {
    if (!t.tripId) {
      issues.push({
        code: "missing_trip_id",
        message: "Trip missing trip_id",
        severity: "error",
      });
      continue;
    }
    if (!routeIds.has(t.routeId)) {
      issues.push({
        code: "broken_trip_route",
        message: `Trip ${t.tripId} references unknown route ${t.routeId}`,
        severity: "error",
      });
    }
    if (!serviceIds.has(t.serviceId)) {
      issues.push({
        code: "broken_trip_service",
        message: `Trip ${t.tripId} references unknown service ${t.serviceId}`,
        severity: "error",
      });
    }
    tripIds.add(t.tripId);
  }

  for (const st of parsed.stopTimes) {
    if (!tripIds.has(st.tripId)) {
      issues.push({
        code: "broken_stop_time_trip",
        message: `stop_times trip_id ${st.tripId} not in trips.txt`,
        severity: "error",
      });
    }
    if (!stopIds.has(st.stopId)) {
      issues.push({
        code: "broken_stop_time_stop",
        message: `stop_times stop_id ${st.stopId} not in stops.txt`,
        severity: "error",
      });
    }
    if (!isGtfsTime(st.arrivalTime) || !isGtfsTime(st.departureTime)) {
      issues.push({
        code: "invalid_stop_time",
        message: `Invalid time on trip ${st.tripId} stop ${st.stopId}`,
        severity: "error",
      });
    }
  }

  for (const tr of parsed.transfers) {
    if (!stopIds.has(tr.fromStopId) || !stopIds.has(tr.toStopId)) {
      issues.push({
        code: "broken_transfer",
        message: `Transfer ${tr.fromStopId}→${tr.toStopId} references missing stop`,
        severity: "error",
      });
    }
  }

  if (parsed.stops.length === 0 || parsed.routes.length === 0) {
    issues.push({
      code: "empty_core_tables",
      message: "stops.txt or routes.txt is empty",
      severity: "error",
    });
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

/** GTFS allows hours ≥ 24 for service-day overflow (e.g. 25:10:00). */
function isGtfsTime(t: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(t);
}
