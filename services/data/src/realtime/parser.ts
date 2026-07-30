/**
 * GTFS-Realtime JSON fixture parser.
 *
 * Production ingestion uses GTFS-RT protobuf (nyct subway feeds).
 * Tests and local fixtures use a JSON representation of FeedMessage entities
 * so the suite stays offline and deterministic. Field names mirror the
 * protobuf schema closely enough for normalization.
 */

import type {
  NormalizedTripUpdate,
  QuarantinedEntity,
  ServiceAlert,
  StopTimeUpdate,
} from "../types.js";
import { resolveLineId } from "../line-mapping.js";
import type { LineMappingEntry } from "../types.js";

export interface GtfsRtFeedJson {
  header?: {
    gtfsRealtimeVersion?: string;
    timestamp?: number | string;
    incrementality?: string;
  };
  entity?: GtfsRtEntityJson[];
  /** Fixture metadata — not part of wire format */
  _fixtureMeta?: {
    feedId?: string;
    simulatedError?: "timeout" | "fetch_failure" | "malformed";
    feedTimestampIso?: string;
  };
}

export interface GtfsRtEntityJson {
  id?: string;
  isDeleted?: boolean;
  tripUpdate?: {
    trip?: {
      tripId?: string;
      routeId?: string;
      startDate?: string;
      startTime?: string;
      scheduleRelationship?: string;
    };
    stopTimeUpdate?: Array<{
      stopId?: string;
      stopSequence?: number;
      arrival?: { delay?: number; time?: number };
      departure?: { delay?: number; time?: number };
      scheduleRelationship?: string;
    }>;
  };
  alert?: {
    headerText?: { translation?: Array<{ text?: string }> };
    descriptionText?: { translation?: Array<{ text?: string }> };
    informedEntity?: Array<{
      routeId?: string;
      trip?: { tripId?: string };
      stopId?: string;
    }>;
    severityLevel?: string;
  };
  vehicle?: unknown;
}

export interface ParsedRealtimeFeed {
  feedId: string;
  feedTimestampIso: string | null;
  tripUpdates: NormalizedTripUpdate[];
  alerts: ServiceAlert[];
  quarantined: QuarantinedEntity[];
  parseErrors: number;
  vehicleCount: number;
  simulatedFailure: { feedId: string; reason: string } | null;
}

function translateText(
  field?: { translation?: Array<{ text?: string }> },
): string {
  return field?.translation?.[0]?.text ?? "";
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

function severityFrom(
  level?: string,
): ServiceAlert["severity"] {
  const x = (level ?? "").toUpperCase();
  if (x === "INFO" || x === "INFORMATION") return "info";
  if (x === "WARNING") return "warning";
  if (x === "SEVERE") return "severe";
  return "unknown";
}

function headerTimestampToIso(
  ts: number | string | undefined,
  fallbackIso?: string,
): string | null {
  if (fallbackIso) return fallbackIso;
  if (ts === undefined || ts === null || ts === "") return null;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return null;
  // GTFS-RT header.timestamp is POSIX seconds
  return new Date(n * 1000).toISOString();
}

export function parseRealtimeFeedJson(
  payload: unknown,
  options: {
    feedId: string;
    lineMapping?: LineMappingEntry[];
    knownTripIds?: Set<string>;
  },
): ParsedRealtimeFeed {
  const feedId = options.feedId;
  const quarantined: QuarantinedEntity[] = [];
  let parseErrors = 0;

  if (payload === null || payload === undefined) {
    return {
      feedId,
      feedTimestampIso: null,
      tripUpdates: [],
      alerts: [],
      quarantined: [
        {
          kind: "unknown",
          entityId: "",
          reason: "empty_payload",
          feedId,
        },
      ],
      parseErrors: 1,
      vehicleCount: 0,
      simulatedFailure: null,
    };
  }

  if (typeof payload !== "object") {
    return {
      feedId,
      feedTimestampIso: null,
      tripUpdates: [],
      alerts: [],
      quarantined: [
        {
          kind: "unknown",
          entityId: "",
          reason: "malformed_payload",
          feedId,
        },
      ],
      parseErrors: 1,
      vehicleCount: 0,
      simulatedFailure: null,
    };
  }

  const feed = payload as GtfsRtFeedJson;
  const meta = feed._fixtureMeta;
  const effectiveFeedId = meta?.feedId ?? feedId;

  if (meta?.simulatedError === "timeout") {
    return {
      feedId: effectiveFeedId,
      feedTimestampIso: null,
      tripUpdates: [],
      alerts: [],
      quarantined: [],
      parseErrors: 0,
      vehicleCount: 0,
      simulatedFailure: {
        feedId: effectiveFeedId,
        reason: "timeout",
      },
    };
  }
  if (meta?.simulatedError === "fetch_failure") {
    return {
      feedId: effectiveFeedId,
      feedTimestampIso: null,
      tripUpdates: [],
      alerts: [],
      quarantined: [],
      parseErrors: 0,
      vehicleCount: 0,
      simulatedFailure: {
        feedId: effectiveFeedId,
        reason: "fetch_failure",
      },
    };
  }
  if (meta?.simulatedError === "malformed") {
    return {
      feedId: effectiveFeedId,
      feedTimestampIso: null,
      tripUpdates: [],
      alerts: [],
      quarantined: [
        {
          kind: "unknown",
          entityId: "",
          reason: "malformed_payload",
          feedId: effectiveFeedId,
        },
      ],
      parseErrors: 1,
      vehicleCount: 0,
      simulatedFailure: null,
    };
  }

  const feedTimestampIso = headerTimestampToIso(
    feed.header?.timestamp,
    meta?.feedTimestampIso,
  );

  const entities = Array.isArray(feed.entity) ? feed.entity : [];
  // Empty entity array is valid (empty feed)
  const tripUpdates: NormalizedTripUpdate[] = [];
  const alerts: ServiceAlert[] = [];
  let vehicleCount = 0;

  for (const ent of entities) {
    const entityId = ent.id ?? "";
    try {
      if (ent.vehicle) {
        // Vehicle positions optional for MVP — count but do not fabricate
        vehicleCount += 1;
      }

      if (ent.tripUpdate) {
        const trip = ent.tripUpdate.trip;
        const tripId = trip?.tripId;
        if (!tripId) {
          quarantined.push({
            kind: "trip_update",
            entityId,
            reason: "missing_trip_id",
            feedId: effectiveFeedId,
          });
          parseErrors += 1;
          continue;
        }

        // Fail closed: when a known-trip set is provided (including empty),
        // quarantine any trip not in the set. An empty set quarantines all.
        if (
          options.knownTripIds !== undefined &&
          !options.knownTripIds.has(tripId)
        ) {
          quarantined.push({
            kind: "trip_update",
            entityId,
            reason: "unknown_trip_id",
            feedId: effectiveFeedId,
          });
          // Never silently accept mismatched identifiers
          continue;
        }

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
        }));

        tripUpdates.push({
          tripId,
          routeId: trip?.routeId,
          startDate: trip?.startDate,
          startTime: trip?.startTime,
          scheduleRelationship: normScheduleRel(trip?.scheduleRelationship),
          stopTimeUpdates,
          feedId: effectiveFeedId,
        });
      }

      if (ent.alert) {
        const header = translateText(ent.alert.headerText) || "Service alert";
        const description = translateText(ent.alert.descriptionText) || undefined;
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
                feedId: effectiveFeedId,
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
          affectedTripIds: affectedTripIds.length
            ? affectedTripIds
            : undefined,
          affectedStopIds: affectedStopIds.length
            ? affectedStopIds
            : undefined,
          feedId: effectiveFeedId,
        });
      }

      if (!ent.tripUpdate && !ent.alert && !ent.vehicle) {
        quarantined.push({
          kind: "unknown",
          entityId,
          reason: "empty_entity",
          feedId: effectiveFeedId,
        });
        parseErrors += 1;
      }
    } catch {
      parseErrors += 1;
      quarantined.push({
        kind: "unknown",
        entityId,
        reason: "parse_exception",
        feedId: effectiveFeedId,
      });
    }
  }

  return {
    feedId: effectiveFeedId,
    feedTimestampIso,
    tripUpdates,
    alerts,
    quarantined,
    parseErrors,
    vehicleCount,
    simulatedFailure: null,
  };
}
