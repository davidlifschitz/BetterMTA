import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadGtfsDirectory,
  parseGtfsFiles,
  type ParsedGtfs,
} from "../static/gtfs-parser.js";
import { validateGtfs, type ValidationResult } from "../static/validator.js";
import type { GtfsCalendar } from "../types.js";

export interface GtfsCalendarDate {
  serviceId: string;
  date: string;
  exceptionType: 1 | 2;
}

export interface PipelineValidationOptions {
  /** Injected "now" for deterministic service-coverage checks. */
  now?: Date;
  /** Inclusive days from today (today..today+N). Default 7. */
  serviceCoverageDays?: number;
  minStops?: number;
  minRoutes?: number;
}

export interface PipelineValidationResult extends ValidationResult {
  parsed: ParsedGtfs;
  calendarDates: GtfsCalendarDate[];
  serviceDateRange: { startDate: string; endDate: string } | null;
  tableCounts: Record<string, number>;
  routeIds: string[];
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCalendarDates(content: string): GtfsCalendarDate[] {
  return parseCsv(content).map((r) => ({
    serviceId: r["service_id"] ?? "",
    date: r["date"] ?? "",
    exceptionType: Number(r["exception_type"]) === 2 ? 2 : 1,
  }));
}

/**
 * Convert a Date to America/New_York YYYYMMDD for service-day checks.
 */
export function nycYyyymmdd(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}${m}${day}`;
}

function nycWeekday(d: Date): number {
  // Return 0=Sun..6=Sat in America/New_York
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const wd = fmt.format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? d.getUTCDay();
}

function calendarActiveOnDay(
  calendar: GtfsCalendar,
  dateStr: string,
  weekday: number,
): boolean {
  if (dateStr < calendar.startDate || dateStr > calendar.endDate) return false;
  switch (weekday) {
    case 0:
      return calendar.sunday;
    case 1:
      return calendar.monday;
    case 2:
      return calendar.tuesday;
    case 3:
      return calendar.wednesday;
    case 4:
      return calendar.thursday;
    case 5:
      return calendar.friday;
    case 6:
      return calendar.saturday;
    default:
      return false;
  }
}

export function isServiceActiveOnDate(
  dateStr: string,
  weekday: number,
  calendar: GtfsCalendar[],
  calendarDates: GtfsCalendarDate[],
): boolean {
  const active = new Set<string>();
  for (const c of calendar) {
    if (calendarActiveOnDay(c, dateStr, weekday)) {
      active.add(c.serviceId);
    }
  }
  for (const ex of calendarDates) {
    if (ex.date !== dateStr || !ex.serviceId) continue;
    if (ex.exceptionType === 1) active.add(ex.serviceId);
    else active.delete(ex.serviceId);
  }
  return active.size > 0;
}

export function computeServiceDateRange(
  calendar: GtfsCalendar[],
  calendarDates: GtfsCalendarDate[],
): { startDate: string; endDate: string } | null {
  const dates: string[] = [];
  for (const c of calendar) {
    if (/^\d{8}$/.test(c.startDate)) dates.push(c.startDate);
    if (/^\d{8}$/.test(c.endDate)) dates.push(c.endDate);
  }
  for (const d of calendarDates) {
    if (/^\d{8}$/.test(d.date)) dates.push(d.date);
  }
  if (dates.length === 0) return null;
  dates.sort();
  return { startDate: dates[0]!, endDate: dates[dates.length - 1]! };
}

/**
 * Validate extracted GTFS using the existing validator plus pipeline checks:
 * service-date coverage and row-count sanity.
 */
export function validateExtractedGtfs(
  extractDir: string,
  options: PipelineValidationOptions = {},
): PipelineValidationResult {
  const issues: ValidationResult["issues"] = [];

  // agency.txt must be present and parseable (pipeline requirement)
  const agencyPath = join(extractDir, "agency.txt");
  if (!existsSync(agencyPath)) {
    issues.push({
      code: "missing_agency",
      message: "agency.txt missing",
      severity: "error",
    });
  } else {
    const agencyRows = parseCsv(readFileSync(agencyPath, "utf8"));
    if (agencyRows.length === 0) {
      issues.push({
        code: "empty_agency",
        message: "agency.txt has no data rows",
        severity: "error",
      });
    }
  }

  let calendarDates: GtfsCalendarDate[] = [];
  const cdPath = join(extractDir, "calendar_dates.txt");
  if (existsSync(cdPath)) {
    calendarDates = parseCalendarDates(readFileSync(cdPath, "utf8"));
  }

  // Load via existing parser (requires transfers + calendar — zip layer stubs them)
  let parsed: ParsedGtfs;
  try {
    parsed = loadGtfsDirectory(extractDir);
  } catch (err) {
    return {
      ok: false,
      issues: [
        ...issues,
        {
          code: "parse_error",
          message: err instanceof Error ? err.message : String(err),
          severity: "error",
        },
      ],
      parsed: parseGtfsFiles({
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n",
        "routes.txt": "route_id,route_short_name,route_long_name,route_color,route_text_color\n",
        "trips.txt": "route_id,trip_id,service_id,trip_headsign,direction_id\n",
        "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n",
        "transfers.txt": "from_stop_id,to_stop_id,transfer_type,min_transfer_time\n",
        "calendar.txt":
          "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n",
      }),
      calendarDates,
      serviceDateRange: null,
      tableCounts: {},
      routeIds: [],
    };
  }

  // Extend service ID set for calendar_dates-only services before referential check
  const baseValidation = validateGtfs(parsed);
  issues.push(...baseValidation.issues);

  // If trips reference services only in calendar_dates, existing validator may flag them.
  // Reconcile: services present in calendar_dates are valid.
  const cdServices = new Set(
    calendarDates.map((d) => d.serviceId).filter(Boolean),
  );
  const filteredIssues = issues.filter((issue) => {
    if (issue.code !== "broken_trip_service") return true;
    const m = /unknown service (.+)$/.exec(issue.message);
    if (m && cdServices.has(m[1]!)) return false;
    return true;
  });

  // Row-count sanity
  const minStops = options.minStops ?? 400;
  const minRoutes = options.minRoutes ?? 20;
  if (parsed.stops.length < minStops) {
    filteredIssues.push({
      code: "insufficient_stops",
      message: `stops count ${parsed.stops.length} < minimum ${minStops}`,
      severity: "error",
    });
  }
  if (parsed.routes.length < minRoutes) {
    filteredIssues.push({
      code: "insufficient_routes",
      message: `routes count ${parsed.routes.length} < minimum ${minRoutes}`,
      severity: "error",
    });
  }

  // Service-date coverage: today through today+N
  const now = options.now ?? new Date();
  const coverageDays = options.serviceCoverageDays ?? 7;
  for (let i = 0; i <= coverageDays; i++) {
    // Step by calendar days in America/New_York by advancing UTC noon anchors
    const probe = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = nycYyyymmdd(probe);
    const weekday = nycWeekday(probe);
    if (
      !isServiceActiveOnDate(
        dateStr,
        weekday,
        parsed.calendar,
        calendarDates,
      )
    ) {
      filteredIssues.push({
        code: "insufficient_service_coverage",
        message: `No active service on ${dateStr} (need coverage through today+${coverageDays})`,
        severity: "error",
      });
      break;
    }
  }

  const tableCounts: Record<string, number> = {
    agency: existsSync(agencyPath)
      ? parseCsv(readFileSync(agencyPath, "utf8")).length
      : 0,
    stops: parsed.stops.length,
    routes: parsed.routes.length,
    trips: parsed.trips.length,
    stop_times: parsed.stopTimes.length,
    transfers: parsed.transfers.length,
    calendar: parsed.calendar.length,
    calendar_dates: calendarDates.length,
  };

  // Also count any other .txt files
  for (const entry of readdirSync(extractDir)) {
    if (entry.endsWith(".txt") && !(entry.replace(/\.txt$/, "").replace(/s$/, "") in tableCounts)) {
      const key = entry.replace(/\.txt$/, "");
      if (!(key in tableCounts)) {
        tableCounts[key] = parseCsv(
          readFileSync(join(extractDir, entry), "utf8"),
        ).length;
      }
    }
  }

  const serviceDateRange = computeServiceDateRange(
    parsed.calendar,
    calendarDates,
  );
  const ok = !filteredIssues.some((i) => i.severity === "error");

  return {
    ok,
    issues: filteredIssues,
    parsed,
    calendarDates,
    serviceDateRange,
    tableCounts,
    routeIds: parsed.routes.map((r) => r.routeId).sort(),
  };
}
