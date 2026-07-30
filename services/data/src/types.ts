/** Internal data-platform types. Public snapshot handle matches conductor contract. */

export type DataMode =
  | "live"
  | "schedule_only"
  | "stale"
  | "synthetic"
  | "unavailable";

export type StaticDatasetStatus =
  | "active"
  | "pending"
  | "failed"
  | "rolled_back";

export interface RoutingSnapshotHandle {
  staticDatasetVersion: string;
  realtimeSnapshotId?: string | null;
  dataMode: DataMode;
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
}

export interface GtfsStop {
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLon: number;
  locationType: number;
  parentStation: string | null;
}

export interface GtfsRoute {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  routeTextColor: string;
}

export interface GtfsTrip {
  tripId: string;
  routeId: string;
  serviceId: string;
  tripHeadsign: string;
  directionId: number;
}

export interface GtfsStopTime {
  tripId: string;
  arrivalTime: string;
  departureTime: string;
  stopId: string;
  stopSequence: number;
}

export interface GtfsTransfer {
  fromStopId: string;
  toStopId: string;
  transferType: number;
  minTransferTime: number | null;
}

export interface GtfsCalendar {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string;
  endDate: string;
}

export interface LineMappingEntry {
  gtfsRouteId: string;
  lineId: string;
  label: string;
  displayName: string;
  color: string;
  textColor: string;
  isShuttle: boolean;
}

export interface QuarantinedRoute {
  gtfsRouteId: string;
  reason: string;
}

export interface StaticDataset {
  staticDatasetVersion: string;
  source: string;
  checksum: string;
  status: StaticDatasetStatus;
  importedAt: string;
  activatedAt: string | null;
  stops: GtfsStop[];
  routes: GtfsRoute[];
  trips: GtfsTrip[];
  stopTimes: GtfsStopTime[];
  transfers: GtfsTransfer[];
  calendar: GtfsCalendar[];
  lineMapping: LineMappingEntry[];
  quarantinedRoutes: QuarantinedRoute[];
  serviceWindow: { startDate: string; endDate: string } | null;
}

export interface StopTimeUpdate {
  stopId: string;
  stopSequence?: number;
  arrivalDelaySeconds?: number | null;
  departureDelaySeconds?: number | null;
  arrivalTime?: number | null;
  departureTime?: number | null;
  /** GTFS-RT schedule_relationship for this stop */
  scheduleRelationship?: "scheduled" | "skipped" | "no_data" | "unscheduled";
}

export interface NormalizedTripUpdate {
  tripId: string;
  routeId?: string;
  startDate?: string;
  startTime?: string;
  scheduleRelationship:
    | "scheduled"
    | "canceled"
    | "unscheduled"
    | "added"
    | "replaced"
    | "duplicated"
    | "deleted";
  stopTimeUpdates: StopTimeUpdate[];
  feedId: string;
}

export interface ServiceAlert {
  alertId: string;
  header: string;
  description?: string;
  severity?: "info" | "warning" | "severe" | "unknown";
  affectedLineIds?: string[];
  affectedTripIds?: string[];
  affectedStopIds?: string[];
  feedId: string;
}

export interface QuarantinedEntity {
  kind: "trip_update" | "alert" | "vehicle" | "unknown";
  entityId: string;
  reason: string;
  feedId?: string;
}

export interface RealtimeSnapshot {
  snapshotId: string;
  staticDatasetVersion: string | null;
  ingestedAt: string;
  feedTimestamps: Record<string, string>;
  entityCounts: {
    tripUpdates: number;
    alerts: number;
    vehicles: number;
    quarantined: number;
  };
  ageSeconds: number;
  dataMode: DataMode;
  tripUpdates: NormalizedTripUpdate[];
  cancellations: NormalizedTripUpdate[];
  skippedStops: Array<{ tripId: string; stopId: string; feedId: string }>;
  alerts: ServiceAlert[];
  quarantined: QuarantinedEntity[];
  /** True when this snapshot came from fixtures / mock path — never production live. */
  synthetic: boolean;
  partialFeeds: string[];
  failedFeeds: Array<{ feedId: string; reason: string }>;
}

export interface FreshnessPolicy {
  liveMaxAgeSeconds: number;
  staleMaxAgeSeconds: number;
  lastKnownGoodRetentionSeconds: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  liveMaxAgeSeconds: 90,
  staleMaxAgeSeconds: 15 * 60,
  lastKnownGoodRetentionSeconds: 30 * 60,
};

export interface FreshnessWarning {
  code: string;
  message: string;
}

export interface Freshness {
  realtimeAgeSeconds?: number | null;
  staticActivatedAt?: string | null;
  warnings: FreshnessWarning[];
}
