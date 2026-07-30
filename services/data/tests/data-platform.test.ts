import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it, beforeEach } from "vitest";
import {
  DataPlatform,
  StaticDatasetStore,
  StaticImporter,
  MetricsRegistry,
  RealtimeIngestor,
  RealtimeSnapshotStore,
  computeDataMode,
  buildRoutingSnapshotHandle,
  DEFAULT_FRESHNESS_POLICY,
  mapRoutesToLineIds,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "fixtures");
const VALID_STATIC = join(FIXTURES, "static", "valid");
const INVALID_STATIC = join(FIXTURES, "static", "invalid-refs");
const RT = join(FIXTURES, "realtime");

const require = createRequire(import.meta.url);
const Ajv2020 = require(
  join(
    __dirname,
    "..",
    "..",
    "..",
    "contracts",
    "node_modules",
    "ajv",
    "dist",
    "2020.js",
  ),
).default;
const addFormats = require(
  join(
    __dirname,
    "..",
    "..",
    "..",
    "contracts",
    "node_modules",
    "ajv-formats",
  ),
).default;

function loadRt(name: string): unknown {
  return JSON.parse(readFileSync(join(RT, name), "utf8"));
}

function schemaValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "contracts",
        "schemas",
        "data-snapshot.schema.json",
      ),
      "utf8",
    ),
  );
  return ajv.compile(schema);
}

describe("static GTFS import", () => {
  let metrics: MetricsRegistry;
  let store: StaticDatasetStore;
  let importer: StaticImporter;

  beforeEach(() => {
    metrics = new MetricsRegistry();
    store = new StaticDatasetStore();
    importer = new StaticImporter(store, metrics);
  });

  it("imports valid fixture, checksums, maps lines, quarantines unknown routes", () => {
    const result = importer.importFromDirectory(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });
    expect(result.validationOk).toBe(true);
    expect(result.activated).toBe(true);
    expect(result.dataset.status).toBe("active");
    expect(result.dataset.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.dataset.staticDatasetVersion).toMatch(/^gtfs_/);
    expect(result.dataset.lineMapping.map((m) => m.lineId).sort()).toEqual([
      "A",
      "D",
      "FS",
      "GS",
      "H",
      "SIR",
    ]);
    expect(result.dataset.quarantinedRoutes).toEqual([
      { gtfsRouteId: "XXZ", reason: "unknown_route_id" },
    ]);
    expect(result.dataset.calendarDates).toEqual([]);
    expect(metrics.getCounter("bettermta_quarantined_routes_total")).toBe(1);
    expect(store.getActive()?.staticDatasetVersion).toBe(
      result.dataset.staticDatasetVersion,
    );
  });

  it("retains calendar_dates exceptions through import", () => {
    const files: Record<string, string> = {
      "stops.txt":
        "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nA02N,Test,40.7,-74.0,0,\n",
      "routes.txt":
        "route_id,route_short_name,route_long_name,route_color,route_text_color\nA,A,Eighth Ave,0039A6,FFFFFF\n",
      "trips.txt":
        "route_id,service_id,trip_id,trip_headsign,direction_id\nA,WEEKDAY,A_UP_001,North,0\n",
      "stop_times.txt":
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nA_UP_001,08:00:00,08:00:00,A02N,1\n",
      "transfers.txt":
        "from_stop_id,to_stop_id,transfer_type,min_transfer_time\n",
      "calendar.txt":
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n",
      "calendar_dates.txt":
        "service_id,date,exception_type\nWEEKDAY,20260704,2\nHOLIDAY,20260704,1\n",
    };
    const result = importer.importFromFiles(files, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });
    expect(result.validationOk).toBe(true);
    expect(result.dataset.calendarDates).toEqual([
      { serviceId: "WEEKDAY", date: "20260704", exceptionType: 2 },
      { serviceId: "HOLIDAY", date: "20260704", exceptionType: 1 },
    ]);
  });

  it("never activates a failed import; keeps previous active", () => {
    const good = importer.importFromDirectory(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    const prevVersion = good.dataset.staticDatasetVersion;

    const bad = importer.importFromDirectory(INVALID_STATIC, {
      importedAt: "2026-07-30T07:00:00.000Z",
      versionPrefix: "gtfs_bad",
    });
    expect(bad.validationOk).toBe(false);
    expect(bad.activated).toBe(false);
    expect(bad.dataset.status).toBe("failed");
    expect(store.getActive()?.staticDatasetVersion).toBe(prevVersion);
    expect(store.listFailed().length).toBe(1);
    expect(() => store.activate(bad.dataset.staticDatasetVersion, "x")).toThrow(
      /failed/,
    );
  });

  it("keeps previous version for rollback", () => {
    const v1 = importer.importFromDirectory(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      versionPrefix: "gtfs_v1",
    });
    // Force a second distinct version by tweaking activate time prefix
    const v2 = importer.importFromDirectory(VALID_STATIC, {
      importedAt: "2026-07-31T06:00:00.000Z",
      versionPrefix: "gtfs_v2",
    });
    expect(store.getActive()?.staticDatasetVersion).toBe(
      v2.dataset.staticDatasetVersion,
    );
    expect(store.getPrevious()?.staticDatasetVersion).toBe(
      v1.dataset.staticDatasetVersion,
    );
    expect(store.getPrevious()?.status).toBe("rolled_back");

    const restored = store.rollback("2026-07-31T08:00:00.000Z");
    expect(restored.staticDatasetVersion).toBe(v1.dataset.staticDatasetVersion);
    expect(restored.status).toBe("active");
  });
});

describe("realtime ingestion", () => {
  let platform: DataPlatform;
  let knownTrips: Set<string>;

  beforeEach(() => {
    platform = new DataPlatform();
    const imp = platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    knownTrips = new Set(imp.dataset.trips.map((t) => t.tripId));
  });

  it("parses valid realtime into normalized trip updates and alerts", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:10.000Z",
        nowMs: Date.parse("2026-07-30T12:00:10.000Z"),
        synthetic: true,
      },
    );
    expect(snapshot.entityCounts.tripUpdates).toBe(1);
    expect(snapshot.entityCounts.alerts).toBe(1);
    expect(snapshot.alerts[0]?.header).toBe("A train delays");
    expect(snapshot.tripUpdates[0]?.tripId).toBe("A_UP_001");
    expect(snapshot.feedTimestamps["nyct-ace"]).toBe(
      "2026-07-30T12:00:00.000Z",
    );
    expect(snapshot.dataMode).toBe("synthetic");
  });

  it("handles empty payload without crashing", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("empty.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.entityCounts.tripUpdates).toBe(0);
    expect(snapshot.entityCounts.alerts).toBe(0);
    // Header-only / empty entity list is not usable realtime
    expect(snapshot.dataMode).toBe("schedule_only");
    expect(platform.realtimeStore.getLatest()).toBeNull();
  });

  it("retains prior LKG when a later empty poll arrives", () => {
    const good = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(good.snapshot.dataMode).toBe("live");
    const goodId = good.snapshot.snapshotId;

    const empty = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("empty.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:30.000Z",
        nowMs: Date.parse("2026-07-30T12:00:30.000Z"),
      },
    );
    expect(empty.snapshot.dataMode).toBe("schedule_only");
    expect(empty.snapshot.entityCounts.tripUpdates).toBe(0);
    // Empty poll must not replace latest usable snapshot
    expect(platform.realtimeStore.getLatest()?.snapshotId).toBe(goodId);

    const resolved = platform.realtimeIngestor.resolveForRouting(
      platform.realtimeStore.getLatest(),
      {
        nowMs: Date.parse("2026-07-30T12:00:30.000Z"),
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
      },
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.snapshotId).toBe(goodId);
    expect(resolved!.dataMode).toBe("live");
    expect(resolved!.tripUpdates.length).toBeGreaterThan(0);
    // Never a "live" empty snapshot
    expect(resolved!.entityCounts.tripUpdates + resolved!.entityCounts.alerts).toBeGreaterThan(
      0,
    );

    // Age into stale window: still LKG, never empty-as-live
    const staleResolved = platform.realtimeIngestor.resolveForRouting(
      empty.snapshot,
      {
        nowMs: Date.parse("2026-07-30T12:02:00.000Z"),
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
      },
    );
    expect(staleResolved!.snapshotId).toBe(goodId);
    expect(staleResolved!.dataMode).toBe("stale");
  });

  it("quarantines malformed payload and increments parse errors", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("malformed.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.quarantined.some((q) => q.reason === "malformed_payload")).toBe(
      true,
    );
    expect(platform.metrics.getCounter("bettermta_parse_errors_total")).toBeGreaterThan(
      0,
    );
  });

  it("records cancellations", () => {
    // Explicit scheduleRelationship=CANCELED only — does not cover NYCT
    // trip_replacement_period absence-as-cancellation is implemented in
    // realtime-live/normalize.ts (see tests/realtime-live.test.ts).
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("cancelled-trip.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.cancellations).toHaveLength(1);
    expect(snapshot.cancellations[0]?.tripId).toBe("A_DN_001");
  });

  it("fail-closed: empty knownTripIds quarantines all trip updates", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: new Set(),
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.tripUpdates).toHaveLength(0);
    expect(
      snapshot.quarantined.some((q) => q.reason === "unknown_trip_id"),
    ).toBe(true);
  });

  it("fail-closed: pinned static without knownTripIds throws", () => {
    const store = new RealtimeSnapshotStore();
    const ingest = new RealtimeIngestor(store, new MetricsRegistry());
    expect(() =>
      ingest.ingest([{ feedId: "nyct-ace", payload: loadRt("valid.json") }], {
        staticDatasetVersion: "gtfs_pinned",
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      }),
    ).toThrow(/knownTripIds/);
  });

  it("records reroutes via skipped stops", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-bdfm", payload: loadRt("rerouted-trip.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.skippedStops).toEqual([
      { tripId: "D_UP_001", stopId: "A32N", feedId: "nyct-bdfm" },
    ]);
  });

  it("never silently accepts identifier mismatches — quarantines + counts", () => {
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("identifier-mismatch.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.tripUpdates.map((t) => t.tripId)).toEqual(["A_UP_001"]);
    expect(
      snapshot.quarantined.some(
        (q) =>
          q.reason === "unknown_trip_id" && q.entityId === "tu_unknown",
      ),
    ).toBe(true);
    expect(
      platform.metrics.getCounter("bettermta_broken_references_total"),
    ).toBeGreaterThan(0);
  });

  it("handles partial feed availability", () => {
    const bundle = loadRt("partial-feeds.json") as {
      feeds: Array<{ feedId: string; payload: unknown }>;
    };
    const { snapshot } = platform.ingestRealtime(bundle.feeds, {
      staticDatasetVersion: "gtfs_test",
      knownTripIds: knownTrips,
      ingestedAt: "2026-07-30T12:00:00.000Z",
      nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    });
    expect(snapshot.entityCounts.tripUpdates).toBe(1);
    expect(snapshot.failedFeeds).toEqual([
      { feedId: "nyct-bdfm", reason: "timeout" },
    ]);
  });

  it("simulates timeout / fetch failure", () => {
    const timeout = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("timeout-failure.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(timeout.snapshot.failedFeeds[0]?.reason).toBe("timeout");
    expect(timeout.snapshot.dataMode).toBe("schedule_only");

    const fetchFail = platform.ingestRealtime(
      [{ feedId: "nyct-nqrw", payload: loadRt("fetch-failure.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(fetchFail.snapshot.failedFeeds[0]?.reason).toBe("fetch_failure");
  });

  it("documents midnight service-day boundary (ingest-only; resolution deferred)", () => {
    // Full service-day clock math is deferred to routing; we only assert ingest
    // preserves startDate/startTime (not a complete midnight policy).
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("midnight-boundary.json") }],
      {
        staticDatasetVersion: "gtfs_test",
        knownTripIds: knownTrips,
        ingestedAt: "2026-07-30T23:59:30.000Z",
        nowMs: Date.parse("2026-07-30T23:59:30.000Z"),
        synthetic: true,
      },
    );
    expect(snapshot.tripUpdates[0]?.startDate).toBe("20260730");
    expect(snapshot.tripUpdates[0]?.startTime).toBe("23:50:00");
  });
});

describe("line mapping shuttles", () => {
  it("maps FS→FS, H→H, SI→SIR", () => {
    const { mappings, quarantined } = mapRoutesToLineIds([
      {
        routeId: "FS",
        routeShortName: "FS",
        routeLongName: "Franklin Avenue Shuttle",
        routeColor: "6D6E71",
        routeTextColor: "FFFFFF",
      },
      {
        routeId: "H",
        routeShortName: "H",
        routeLongName: "Rockaway Park Shuttle",
        routeColor: "6D6E71",
        routeTextColor: "FFFFFF",
      },
      {
        routeId: "SI",
        routeShortName: "SIR",
        routeLongName: "Staten Island Railway",
        routeColor: "0039A6",
        routeTextColor: "FFFFFF",
      },
    ]);
    expect(quarantined).toEqual([]);
    expect(mappings.map((m) => [m.gtfsRouteId, m.lineId])).toEqual([
      ["FS", "FS"],
      ["H", "H"],
      ["SI", "SIR"],
    ]);
  });
});

describe("freshness / dataMode transitions", () => {
  it("maps age thresholds per DATA_CONTRACT §4", () => {
    expect(
      computeDataMode(0, { hasRealtimePayload: true }),
    ).toBe("live");
    expect(
      computeDataMode(90, { hasRealtimePayload: true }),
    ).toBe("live");
    expect(
      computeDataMode(91, { hasRealtimePayload: true }),
    ).toBe("stale");
    expect(
      computeDataMode(15 * 60, { hasRealtimePayload: true }),
    ).toBe("stale");
    expect(
      computeDataMode(15 * 60 + 1, { hasRealtimePayload: true }),
    ).toBe("schedule_only");
    expect(
      computeDataMode(null, { hasRealtimePayload: false }),
    ).toBe("schedule_only");
    expect(
      computeDataMode(10, { hasRealtimePayload: true, synthetic: true }),
    ).toBe("synthetic");
  });

  it("stale fixture yields stale mode when observed late", () => {
    const platform = new DataPlatform();
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    const { snapshot } = platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("stale.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: new Set(
          platform.staticStore.getActive()!.trips.map((t) => t.tripId),
        ),
        // feed timestamp 11:30Z; observe at 11:32Z → 120s → stale
        ingestedAt: "2026-07-30T11:32:00.000Z",
        nowMs: Date.parse("2026-07-30T11:32:00.000Z"),
      },
    );
    expect(snapshot.dataMode).toBe("stale");
    expect(snapshot.ageSeconds).toBe(120);
  });

  it("retains last-known-good for ≥ 30 minutes then drops", () => {
    const metrics = new MetricsRegistry();
    const store = new RealtimeSnapshotStore();
    const ingest = new RealtimeIngestor(store, metrics);
    const { snapshot } = ingest.ingest(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: "gtfs_x",
        knownTripIds: new Set(["A_UP_001"]),
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    expect(snapshot.snapshotId).toBeTruthy();

    const at29min = Date.parse("2026-07-30T12:29:00.000Z");
    expect(store.getLastKnownGood(at29min)).not.toBeNull();

    const at31min = Date.parse("2026-07-30T12:31:00.000Z");
    // prune on put with later time
    store.put(
      {
        ...snapshot,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        snapshotId: "old",
      },
      at31min,
      DEFAULT_FRESHNESS_POLICY,
    );
    expect(store.getLastKnownGood(at31min)).toBeNull();
  });
});

describe("RoutingSnapshotHandle schema", () => {
  const validate = schemaValidator();

  it("emits handles matching data-snapshot.schema.json", () => {
    const platform = new DataPlatform();
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: new Set(
          platform.staticStore.getActive()!.trips.map((t) => t.tripId),
        ),
        ingestedAt: "2026-07-30T12:00:10.000Z",
        nowMs: Date.parse("2026-07-30T12:00:10.000Z"),
      },
    );

    const { handle } = platform.getRoutingHandle(
      Date.parse("2026-07-30T12:00:20.000Z"),
    );
    expect(validate(handle)).toBe(true);
    expect(handle.dataMode).toBe("live");
    expect(handle.realtimeSnapshotId).toBeTruthy();
  });

  it("schedule_only when no realtime", () => {
    const platform = new DataPlatform();
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    const { handle } = buildRoutingSnapshotHandle({
      staticDataset: platform.staticStore.getActive(),
      realtime: null,
      nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    });
    expect(validate(handle)).toBe(true);
    expect(handle.dataMode).toBe("schedule_only");
    expect(handle.realtimeSnapshotId).toBeNull();
  });

  it("unavailable without active static", () => {
    const { handle } = buildRoutingSnapshotHandle({
      staticDataset: null,
      realtime: null,
      nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    });
    expect(validate(handle)).toBe(true);
    expect(handle.dataMode).toBe("unavailable");
  });
});

describe("observability registry", () => {
  it("exposes contract-level metrics surface", () => {
    const platform = new DataPlatform();
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
    });
    platform.ingestRealtime(
      [{ feedId: "nyct-ace", payload: loadRt("valid.json") }],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: new Set(["A_UP_001"]),
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    );
    const snap = platform.metrics.snapshot();
    expect(snap.staticImportStatus).toBe("active");
    expect(snap.staticDatasetVersion).toBeTruthy();
    expect(snap.realtimeAgeSeconds).not.toBeNull();
    expect(snap.pollDurationMs).not.toBeNull();
    expect(snap.lastSuccessfulUpdate).toBeTruthy();
    expect(snap.samples.length).toBeGreaterThan(0);
  });
});
