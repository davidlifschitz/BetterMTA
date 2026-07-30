/**
 * GTFS-Realtime protobuf decode with NYCT subway extensions.
 *
 * Dependency choice: protobufjs (runtime .proto load), not gtfs-realtime-bindings.
 * Justification: we must decode NYCT extensions (NyctFeedHeader /
 * trip_replacement_period, NyctTripDescriptor, NyctStopTimeUpdate). The
 * MobilityData gtfs-realtime-bindings package only covers the base GTFS-RT
 * schema. Vendoring the official + NYCT protos and loading them at runtime
 * keeps the extension definitions as the source of truth.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Max clock skew allowed for header.timestamp into the future. */
export const MAX_HEADER_FUTURE_SKEW_SECONDS = 5 * 60;

export class ProtoDecodeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_protobuf"
      | "missing_version"
      | "bad_timestamp"
      | "decode_failed",
  ) {
    super(message);
    this.name = "ProtoDecodeError";
  }
}

export interface TripReplacementPeriodDecoded {
  routeId: string;
  /** POSIX seconds; 0 / omitted means open start */
  start: number | null;
  /** POSIX seconds; required for a usable window */
  end: number | null;
}

export interface NyctFeedHeaderDecoded {
  nyctSubwayVersion?: string;
  tripReplacementPeriods: TripReplacementPeriodDecoded[];
}

export interface DecodedStopTimeUpdate {
  stopId?: string;
  stopSequence?: number;
  arrival?: { delay?: number; time?: number };
  departure?: { delay?: number; time?: number };
  scheduleRelationship?: string;
  scheduledTrack?: string;
  actualTrack?: string;
}

export interface DecodedTripUpdate {
  trip?: {
    tripId?: string;
    routeId?: string;
    startDate?: string;
    startTime?: string;
    scheduleRelationship?: string;
    trainId?: string;
    direction?: string;
    isAssigned?: boolean;
  };
  stopTimeUpdate?: DecodedStopTimeUpdate[];
}

export interface DecodedAlert {
  headerText?: { translation?: Array<{ text?: string }> };
  descriptionText?: { translation?: Array<{ text?: string }> };
  informedEntity?: Array<{
    routeId?: string;
    trip?: { tripId?: string };
    stopId?: string;
  }>;
  severityLevel?: string;
}

export interface DecodedEntity {
  id?: string;
  isDeleted?: boolean;
  tripUpdate?: DecodedTripUpdate;
  alert?: DecodedAlert;
  vehicle?: unknown;
}

export interface DecodedFeedMessage {
  header: {
    gtfsRealtimeVersion: string;
    timestamp: number;
    incrementality?: string | number;
    nyct?: NyctFeedHeaderDecoded;
  };
  entity: DecodedEntity[];
  /** Raw protobufjs object for advanced inspection / tests */
  raw: unknown;
}

let rootPromise: Promise<protobuf.Root> | null = null;

function resolveProtoDir(): string {
  const candidates = [
    join(__dirname, "..", "..", "proto"),
    join(__dirname, "..", "..", "..", "proto"),
    join(process.cwd(), "proto"),
    join(process.cwd(), "services", "data", "proto"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "gtfs-realtime.proto"))) return c;
  }
  throw new Error(
    `GTFS-RT proto directory not found (looked in ${candidates.join(", ")})`,
  );
}

export async function loadGtfsRtRoot(): Promise<protobuf.Root> {
  if (!rootPromise) {
    rootPromise = (async () => {
      const protoDir = resolveProtoDir();
      const root = new protobuf.Root();
      root.resolvePath = (_origin, target) => {
        const base = target.replace(/^.*\//, "");
        return join(protoDir, base);
      };
      await root.load(["gtfs-realtime.proto", "nyct-subway.proto"], {
        keepCase: true,
      });
      root.resolveAll();
      return root;
    })();
  }
  return rootPromise;
}

/** Reset cached root (tests). */
export function resetProtoRootCache(): void {
  rootPromise = null;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "low" in v) {
    const low = (v as { low: number }).low;
    const high = (v as { high?: number }).high ?? 0;
    // uint32 / uint64 via Long — for POSIX timestamps high should be 0
    return high === 0 ? low >>> 0 : Number(v);
  }
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function looksLikeHtmlOrText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  // Skip leading protobuf-friendly whitespace only for HTML/XML detection.
  // NOTE: do NOT treat '{' as JSON — FeedMessage often begins `\n{` because
  // field 1 length-delimiter 0x7b ('{') is a common header length (~123).
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x20)) {
    i++;
  }
  if (i >= bytes.length) return true;
  const first = bytes[i]!;
  // HTML / XML error pages
  if (first === 0x3c /* < */) {
    const head = Buffer.from(bytes.subarray(i, Math.min(i + 64, bytes.length)))
      .toString("latin1")
      .toLowerCase();
    if (
      head.startsWith("<!doctype") ||
      head.startsWith("<html") ||
      head.startsWith("<?xml") ||
      head.startsWith("<error") ||
      head.startsWith("<html") ||
      head.startsWith("<head") ||
      head.startsWith("<body")
    ) {
      return true;
    }
  }
  // Small JSON / plain-text error bodies only
  if (bytes.length < 2048 && (first === 0x7b /* { */ || first === 0x5b /* [ */)) {
    const asStr = Buffer.from(bytes).toString("utf8").trim();
    if (asStr.startsWith("{") || asStr.startsWith("[")) {
      try {
        JSON.parse(asStr);
        return true;
      } catch {
        // not JSON — may still be protobuf that happens to be small
      }
    }
  }
  const textHead = Buffer.from(bytes.subarray(0, Math.min(32, bytes.length)))
    .toString("utf8")
    .toLowerCase();
  if (
    textHead.startsWith("http/") ||
    textHead.startsWith("access denied") ||
    textHead.startsWith("unauthorized")
  ) {
    return true;
  }
  return false;
}

function enumName(
  type: protobuf.Enum | null | undefined,
  value: unknown,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && type) {
    return type.valuesById[value] ?? String(value);
  }
  return String(value);
}

function extractNyctHeader(
  headerObj: Record<string, unknown>,
): NyctFeedHeaderDecoded | undefined {
  const ext =
    headerObj[".transit_realtime.nyct_feed_header"] ??
    headerObj["nyct_feed_header"] ??
    (headerObj as { nyctFeedHeader?: unknown }).nyctFeedHeader;
  if (!ext || typeof ext !== "object") return undefined;
  const e = ext as Record<string, unknown>;
  const periodsRaw =
    (e.trip_replacement_period as unknown[]) ??
    (e.tripReplacementPeriod as unknown[]) ??
    [];
  const tripReplacementPeriods: TripReplacementPeriodDecoded[] = [];
  for (const p of periodsRaw) {
    if (!p || typeof p !== "object") continue;
    const pr = p as Record<string, unknown>;
    const routeId = String(pr.route_id ?? pr.routeId ?? "");
    const rp = (pr.replacement_period ?? pr.replacementPeriod) as
      | Record<string, unknown>
      | undefined;
    const start = asNumber(rp?.start);
    const end = asNumber(rp?.end);
    tripReplacementPeriods.push({
      routeId,
      start: start && start > 0 ? start : null,
      end: end && end > 0 ? end : null,
    });
  }
  return {
    nyctSubwayVersion: String(
      e.nyct_subway_version ?? e.nyctSubwayVersion ?? "",
    ),
    tripReplacementPeriods,
  };
}

function extractNyctTrip(
  tripObj: Record<string, unknown> | undefined,
): {
  trainId?: string;
  direction?: string;
  isAssigned?: boolean;
} {
  if (!tripObj) return {};
  const ext =
    tripObj[".transit_realtime.nyct_trip_descriptor"] ??
    tripObj["nyct_trip_descriptor"];
  if (!ext || typeof ext !== "object") return {};
  const e = ext as Record<string, unknown>;
  const directionRaw = e.direction;
  let direction: string | undefined;
  if (typeof directionRaw === "string") direction = directionRaw;
  else if (typeof directionRaw === "number") {
    const map: Record<number, string> = {
      1: "NORTH",
      2: "EAST",
      3: "SOUTH",
      4: "WEST",
    };
    direction = map[directionRaw] ?? String(directionRaw);
  }
  return {
    trainId: e.train_id != null ? String(e.train_id) : undefined,
    direction,
    isAssigned:
      typeof e.is_assigned === "boolean" ? e.is_assigned : undefined,
  };
}

function extractNyctStop(
  stu: Record<string, unknown>,
): { scheduledTrack?: string; actualTrack?: string } {
  const ext =
    stu[".transit_realtime.nyct_stop_time_update"] ??
    stu["nyct_stop_time_update"];
  if (!ext || typeof ext !== "object") return {};
  const e = ext as Record<string, unknown>;
  return {
    scheduledTrack:
      e.scheduled_track != null ? String(e.scheduled_track) : undefined,
    actualTrack: e.actual_track != null ? String(e.actual_track) : undefined,
  };
}

/**
 * Decode and validate a GTFS-RT FeedMessage buffer.
 * Rejects HTML/text error pages, missing version, and insane timestamps.
 */
export async function decodeFeedMessage(
  bytes: Uint8Array,
  options?: { nowMs?: number },
): Promise<DecodedFeedMessage> {
  if (looksLikeHtmlOrText(bytes)) {
    throw new ProtoDecodeError(
      "Body is not a GTFS-Realtime protobuf message (looks like HTML/text)",
      "not_protobuf",
    );
  }

  const root = await loadGtfsRtRoot();
  const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
  const ScheduleRelationship = root.lookupEnum(
    "transit_realtime.TripDescriptor.ScheduleRelationship",
  );
  const StopScheduleRelationship = root.lookupEnum(
    "transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship",
  );
  const Incrementality = root.lookupEnum(
    "transit_realtime.FeedHeader.Incrementality",
  );
  const SeverityLevel = root.lookupEnum(
    "transit_realtime.Alert.SeverityLevel",
  );

  let message: protobuf.Message;
  try {
    message = FeedMessage.decode(bytes);
  } catch (err) {
    throw new ProtoDecodeError(
      `Protobuf decode failed: ${err instanceof Error ? err.message : String(err)}`,
      "decode_failed",
    );
  }

  const obj = FeedMessage.toObject(message, {
    longs: Number,
    enums: Number,
    bytes: String,
    defaults: false,
  }) as Record<string, unknown>;

  const header = (obj.header ?? {}) as Record<string, unknown>;
  const version = String(
    header.gtfs_realtime_version ?? header.gtfsRealtimeVersion ?? "",
  ).trim();
  if (!version) {
    throw new ProtoDecodeError(
      "FeedHeader.gtfs_realtime_version is required",
      "missing_version",
    );
  }

  const timestamp = asNumber(header.timestamp);
  if (timestamp == null || timestamp === 0) {
    throw new ProtoDecodeError(
      "FeedHeader.timestamp must be a non-zero POSIX timestamp",
      "bad_timestamp",
    );
  }

  const nowMs = options?.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  if (timestamp > nowSec + MAX_HEADER_FUTURE_SKEW_SECONDS) {
    throw new ProtoDecodeError(
      `FeedHeader.timestamp ${timestamp} is more than ${MAX_HEADER_FUTURE_SKEW_SECONDS}s in the future`,
      "bad_timestamp",
    );
  }

  const nyct = extractNyctHeader(header);
  const entitiesIn = Array.isArray(obj.entity) ? obj.entity : [];
  const entity: DecodedEntity[] = [];

  for (const ent of entitiesIn) {
    if (!ent || typeof ent !== "object") continue;
    const e = ent as Record<string, unknown>;
    const decoded: DecodedEntity = {
      id: e.id != null ? String(e.id) : undefined,
      isDeleted: Boolean(e.is_deleted ?? e.isDeleted),
    };

    if (e.vehicle) decoded.vehicle = e.vehicle;

    if (e.trip_update || e.tripUpdate) {
      const tu = (e.trip_update ?? e.tripUpdate) as Record<string, unknown>;
      const tripRaw = (tu.trip ?? {}) as Record<string, unknown>;
      const nyctTrip = extractNyctTrip(tripRaw);
      const stusIn = (tu.stop_time_update ??
        tu.stopTimeUpdate ??
        []) as Record<string, unknown>[];
      decoded.tripUpdate = {
        trip: {
          tripId: tripRaw.trip_id != null ? String(tripRaw.trip_id) : undefined,
          routeId:
            tripRaw.route_id != null ? String(tripRaw.route_id) : undefined,
          startDate:
            tripRaw.start_date != null
              ? String(tripRaw.start_date)
              : undefined,
          startTime:
            tripRaw.start_time != null
              ? String(tripRaw.start_time)
              : undefined,
          scheduleRelationship: enumName(
            ScheduleRelationship,
            tripRaw.schedule_relationship ?? tripRaw.scheduleRelationship,
          ),
          ...nyctTrip,
        },
        stopTimeUpdate: stusIn.map((stu) => {
          const nyctStop = extractNyctStop(stu);
          const arrival = (stu.arrival ?? {}) as Record<string, unknown>;
          const departure = (stu.departure ?? {}) as Record<string, unknown>;
          return {
            stopId: stu.stop_id != null ? String(stu.stop_id) : undefined,
            stopSequence: asNumber(stu.stop_sequence ?? stu.stopSequence) ?? undefined,
            arrival: {
              delay: asNumber(arrival.delay) ?? undefined,
              time: asNumber(arrival.time) ?? undefined,
            },
            departure: {
              delay: asNumber(departure.delay) ?? undefined,
              time: asNumber(departure.time) ?? undefined,
            },
            scheduleRelationship: enumName(
              StopScheduleRelationship,
              stu.schedule_relationship ?? stu.scheduleRelationship,
            ),
            ...nyctStop,
          };
        }),
      };
    }

    if (e.alert) {
      const alert = e.alert as Record<string, unknown>;
      decoded.alert = {
        headerText: alert.header_text ?? alert.headerText,
        descriptionText: alert.description_text ?? alert.descriptionText,
        informedEntity: (
          (alert.informed_entity ?? alert.informedEntity ?? []) as Record<
            string,
            unknown
          >[]
        ).map((ie) => ({
          routeId: ie.route_id != null ? String(ie.route_id) : undefined,
          stopId: ie.stop_id != null ? String(ie.stop_id) : undefined,
          trip: ie.trip
            ? {
                tripId: String(
                  (ie.trip as Record<string, unknown>).trip_id ??
                    (ie.trip as Record<string, unknown>).tripId ??
                    "",
                ),
              }
            : undefined,
        })),
        severityLevel: enumName(
          SeverityLevel,
          alert.severity_level ?? alert.severityLevel,
        ),
      } as DecodedAlert;
    }

    entity.push(decoded);
  }

  return {
    header: {
      gtfsRealtimeVersion: version,
      timestamp,
      incrementality: enumName(
        Incrementality,
        header.incrementality,
      ),
      nyct,
    },
    entity,
    raw: obj,
  };
}

/** Encode a plain object FeedMessage (for synthetic tests). */
export async function encodeFeedMessage(
  plain: Record<string, unknown>,
): Promise<Uint8Array> {
  const root = await loadGtfsRtRoot();
  const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
  // Accept both snake_case and a convenience shape; convert nyct helpers.
  const prepared = prepareForEncode(plain, root);
  const errMsg = FeedMessage.verify(prepared);
  if (errMsg) {
    // verify can be strict about optionals — still try create/encode
  }
  const message = FeedMessage.create(prepared);
  return FeedMessage.encode(message).finish();
}

function prepareForEncode(
  plain: Record<string, unknown>,
  root: protobuf.Root,
): Record<string, unknown> {
  const headerIn = { ...((plain.header as Record<string, unknown>) ?? {}) };
  const nyct = headerIn.nyct as NyctFeedHeaderDecoded | undefined;
  if (nyct) {
    delete headerIn.nyct;
    headerIn[".transit_realtime.nyct_feed_header"] = {
      nyct_subway_version: nyct.nyctSubwayVersion ?? "1.0",
      trip_replacement_period: (nyct.tripReplacementPeriods ?? []).map(
        (p) => ({
          route_id: p.routeId,
          replacement_period: {
            start: p.start ?? 0,
            end: p.end ?? 0,
          },
        }),
      ),
    };
  }
  const entities = Array.isArray(plain.entity) ? plain.entity : [];
  const entity = entities.map((ent) => {
    const e = { ...(ent as Record<string, unknown>) };
    if (e.tripUpdate && !e.trip_update) {
      const tu = { ...(e.tripUpdate as Record<string, unknown>) };
      delete e.tripUpdate;
      if (tu.trip) {
        const trip = { ...(tu.trip as Record<string, unknown>) };
        const nyctTrip: Record<string, unknown> = {};
        if (trip.trainId != null) {
          nyctTrip.train_id = trip.trainId;
          delete trip.trainId;
        }
        if (trip.direction != null) {
          const dirMap: Record<string, number> = {
            NORTH: 1,
            EAST: 2,
            SOUTH: 3,
            WEST: 4,
          };
          nyctTrip.direction =
            typeof trip.direction === "string"
              ? (dirMap[trip.direction] ?? trip.direction)
              : trip.direction;
          delete trip.direction;
        }
        if (trip.isAssigned != null) {
          nyctTrip.is_assigned = trip.isAssigned;
          delete trip.isAssigned;
        }
        if (Object.keys(nyctTrip).length) {
          trip[".transit_realtime.nyct_trip_descriptor"] = nyctTrip;
        }
        // camel → snake for trip fields
        const tripOut: Record<string, unknown> = {};
        if (trip.tripId != null) tripOut.trip_id = trip.tripId;
        if (trip.routeId != null) tripOut.route_id = trip.routeId;
        if (trip.startDate != null) tripOut.start_date = trip.startDate;
        if (trip.startTime != null) tripOut.start_time = trip.startTime;
        if (trip.scheduleRelationship != null) {
          const ScheduleRelationship = root.lookupEnum(
            "transit_realtime.TripDescriptor.ScheduleRelationship",
          );
          const v = trip.scheduleRelationship;
          tripOut.schedule_relationship =
            typeof v === "string"
              ? (ScheduleRelationship.values[v] ?? v)
              : v;
        }
        for (const [k, v] of Object.entries(trip)) {
          if (k.startsWith(".")) tripOut[k] = v;
        }
        tu.trip = tripOut;
      }
      if (tu.stopTimeUpdate) {
        const StopRel = root.lookupEnum(
          "transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship",
        );
        tu.stop_time_update = (
          tu.stopTimeUpdate as Record<string, unknown>[]
        ).map((stu) => {
          const s = { ...stu };
          const out: Record<string, unknown> = {};
          if (s.stopId != null) out.stop_id = s.stopId;
          if (s.stopSequence != null) out.stop_sequence = s.stopSequence;
          if (s.arrival) out.arrival = s.arrival;
          if (s.departure) out.departure = s.departure;
          if (s.scheduleRelationship != null) {
            const v = s.scheduleRelationship;
            out.schedule_relationship =
              typeof v === "string" ? (StopRel.values[v] ?? v) : v;
          }
          const nyctStop: Record<string, unknown> = {};
          if (s.scheduledTrack != null)
            nyctStop.scheduled_track = s.scheduledTrack;
          if (s.actualTrack != null) nyctStop.actual_track = s.actualTrack;
          if (Object.keys(nyctStop).length) {
            out[".transit_realtime.nyct_stop_time_update"] = nyctStop;
          }
          return out;
        });
        delete tu.stopTimeUpdate;
      }
      e.trip_update = tu;
    }
    if (e.alert && typeof e.alert === "object") {
      // leave alert in snake or camel; protobufjs create is flexible enough
    }
    return e;
  });

  return {
    header: {
      gtfs_realtime_version:
        headerIn.gtfsRealtimeVersion ??
        headerIn.gtfs_realtime_version ??
        "2.0",
      timestamp: headerIn.timestamp ?? 0,
      incrementality: headerIn.incrementality ?? 0,
      ".transit_realtime.nyct_feed_header":
        headerIn[".transit_realtime.nyct_feed_header"],
    },
    entity,
  };
}
