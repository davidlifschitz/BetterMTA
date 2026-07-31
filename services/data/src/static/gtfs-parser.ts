import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsRoute,
  GtfsStop,
  GtfsStopTime,
  GtfsTransfer,
  GtfsTrip,
} from "../types.js";

export interface ParsedGtfs {
  stops: GtfsStop[];
  routes: GtfsRoute[];
  trips: GtfsTrip[];
  stopTimes: GtfsStopTime[];
  transfers: GtfsTransfer[];
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  rawFiles: Record<string, string>;
}

const REQUIRED_FILES = [
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
  "transfers.txt",
  "calendar.txt",
] as const;

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

/** Minimal CSV splitter supporting quoted fields. */
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

function bool01(v: string): boolean {
  return v === "1" || v.toLowerCase() === "true";
}

function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function checksumContents(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name]!);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function loadGtfsDirectory(dir: string): ParsedGtfs {
  if (!existsSync(dir)) {
    throw new Error(`GTFS directory not found: ${dir}`);
  }
  const rawFiles: Record<string, string> = {};
  for (const file of REQUIRED_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      throw new Error(`Missing required GTFS file: ${file}`);
    }
    rawFiles[file] = readFileSync(path, "utf8");
  }
  // Optional extras present in directory are included in checksum only if loaded
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".txt") && !(entry in rawFiles)) {
      rawFiles[entry] = readFileSync(join(dir, entry), "utf8");
    }
  }
  return parseGtfsFiles(rawFiles);
}

export function parseGtfsFiles(rawFiles: Record<string, string>): ParsedGtfs {
  for (const file of REQUIRED_FILES) {
    if (!(file in rawFiles)) {
      throw new Error(`Missing required GTFS file: ${file}`);
    }
  }

  const stops: GtfsStop[] = parseCsv(rawFiles["stops.txt"]!).map((r) => ({
    stopId: r["stop_id"] ?? "",
    stopName: r["stop_name"] ?? "",
    stopLat: num(r["stop_lat"] ?? ""),
    stopLon: num(r["stop_lon"] ?? ""),
    locationType: num(r["location_type"] ?? "0"),
    parentStation: r["parent_station"] ? r["parent_station"] : null,
  }));

  const routes: GtfsRoute[] = parseCsv(rawFiles["routes.txt"]!).map((r) => ({
    routeId: r["route_id"] ?? "",
    routeShortName: r["route_short_name"] ?? "",
    routeLongName: r["route_long_name"] ?? "",
    routeColor: r["route_color"] ?? "",
    routeTextColor: r["route_text_color"] ?? "",
  }));

  const trips: GtfsTrip[] = parseCsv(rawFiles["trips.txt"]!).map((r) => ({
    tripId: r["trip_id"] ?? "",
    routeId: r["route_id"] ?? "",
    serviceId: r["service_id"] ?? "",
    tripHeadsign: r["trip_headsign"] ?? "",
    directionId: num(r["direction_id"] ?? "0"),
  }));

  const stopTimes: GtfsStopTime[] = parseCsv(
    rawFiles["stop_times.txt"]!,
  ).map((r) => ({
    tripId: r["trip_id"] ?? "",
    arrivalTime: r["arrival_time"] ?? "",
    departureTime: r["departure_time"] ?? "",
    stopId: r["stop_id"] ?? "",
    stopSequence: num(r["stop_sequence"] ?? "0"),
  }));

  const transfers: GtfsTransfer[] = parseCsv(
    rawFiles["transfers.txt"]!,
  ).map((r) => ({
    fromStopId: r["from_stop_id"] ?? "",
    toStopId: r["to_stop_id"] ?? "",
    transferType: num(r["transfer_type"] ?? "0"),
    minTransferTime: r["min_transfer_time"]
      ? num(r["min_transfer_time"])
      : null,
  }));

  const calendar: GtfsCalendar[] = parseCsv(
    rawFiles["calendar.txt"]!,
  ).map((r) => ({
    serviceId: r["service_id"] ?? "",
    monday: bool01(r["monday"] ?? "0"),
    tuesday: bool01(r["tuesday"] ?? "0"),
    wednesday: bool01(r["wednesday"] ?? "0"),
    thursday: bool01(r["thursday"] ?? "0"),
    friday: bool01(r["friday"] ?? "0"),
    saturday: bool01(r["saturday"] ?? "0"),
    sunday: bool01(r["sunday"] ?? "0"),
    startDate: r["start_date"] ?? "",
    endDate: r["end_date"] ?? "",
  }));

  // Optional: zip stub path may ship calendar_dates-only (empty calendar.txt stub).
  const calendarDates: GtfsCalendarDate[] = rawFiles["calendar_dates.txt"]
    ? parseCsv(rawFiles["calendar_dates.txt"]).map((r) => ({
        serviceId: r["service_id"] ?? "",
        date: r["date"] ?? "",
        exceptionType: Number(r["exception_type"]) === 2 ? 2 : 1,
      }))
    : [];

  return {
    stops,
    routes,
    trips,
    stopTimes,
    transfers,
    calendar,
    calendarDates,
    rawFiles,
  };
}

export { REQUIRED_FILES };
