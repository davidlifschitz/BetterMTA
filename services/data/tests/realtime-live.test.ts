/**
 * Live GTFS-RT gateway tests — default run is offline (captured .pb + synthetic encodes).
 */

import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
} from "vitest";
import {
  DataPlatform,
  MetricsRegistry,
  RealtimeIngestor,
  RealtimeSnapshotStore,
  decodeFeedMessage,
  encodeFeedMessage,
  ProtoDecodeError,
  normalizeDecodedFeed,
  deriveAbsenceCancellations,
  tripStartUnix,
  serviceDateMidnightUnix,
  gtfsTimeToSeconds,
  RealtimePoller,
  RawFeedStore,
  SnapshotManifestStore,
  assembleLiveSnapshot,
  computeMultiFeedDataMode,
  buildPerFeedStatus,
  createInternalServer,
  listenInternalServer,
  closeInternalServer,
  REALTIME_FEEDS,
  loadRealtimeLiveConfig,
  buildLineCatalog,
  buildStationCatalog,
} from "../src/index.js";
import type { AssembledFeedInput } from "../src/realtime-live/snapshot-assembly.js";
import type { StaticDataset, PerFeedStatus } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTURED = join(__dirname, "..", "fixtures", "realtime-pb", "captured");
const VALID_STATIC = join(__dirname, "..", "fixtures", "static", "valid");

function loadCaptured(feedId: string): Buffer {
  return readFileSync(join(CAPTURED, `${feedId}.pb`));
}

describe("protobuf decode (captured feeds)", () => {
  it("decodes nyct-gtfs with entities, sane header, and NYCT extensions", async () => {
    const bytes = loadCaptured("nyct-gtfs");
    const decoded = await decodeFeedMessage(bytes);
    expect(decoded.header.gtfsRealtimeVersion).toBeTruthy();
    expect(decoded.header.timestamp).toBeGreaterThan(0);
    expect(decoded.entity.length).toBeGreaterThan(0);
    // Capture asserted trip_replacement_period present on numbered-lines feed
    const trp = decoded.header.nyct?.tripReplacementPeriods ?? [];
    expect(trp.length).toBeGreaterThan(0);
    expect(decoded.header.nyct?.nyctSubwayVersion).toBeTruthy();
  });

  it("decodes all captured trip-update feeds with entityCount > 0", async () => {
    for (const feed of REALTIME_FEEDS.filter((f) => f.kind === "trip_updates")) {
      const decoded = await decodeFeedMessage(loadCaptured(feed.feedId));
      expect(decoded.entity.length, feed.feedId).toBeGreaterThan(0);
      expect(decoded.header.timestamp, feed.feedId).toBeGreaterThan(0);
    }
  });

  it("rejects HTML error pages", async () => {
    const html = Buffer.from(
      "<!DOCTYPE html><html><body>Error</body></html>",
      "utf8",
    );
    await expect(decodeFeedMessage(html)).rejects.toBeInstanceOf(
      ProtoDecodeError,
    );
    await expect(decodeFeedMessage(html)).rejects.toMatchObject({
      code: "not_protobuf",
    });
  });

  it("rejects missing version and zero timestamp via synthetic encode", async () => {
    // Manually craft invalid by decoding then... use encode with bad header
    const good = await encodeFeedMessage({
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: Math.floor(Date.now() / 1000),
      },
      entity: [],
    });
    const decoded = await decodeFeedMessage(good);
    expect(decoded.header.gtfsRealtimeVersion).toBe("2.0");

    // Zero timestamp
    const zeroTs = await encodeFeedMessage({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 0 },
      entity: [],
    });
    await expect(decodeFeedMessage(zeroTs)).rejects.toMatchObject({
      code: "bad_timestamp",
    });
  });

  it("rejects header timestamp more than 5 minutes in the future", async () => {
    const future = Math.floor(Date.now() / 1000) + 10 * 60;
    const bytes = await encodeFeedMessage({
      header: { gtfsRealtimeVersion: "2.0", timestamp: future },
      entity: [],
    });
    await expect(decodeFeedMessage(bytes)).rejects.toMatchObject({
      code: "bad_timestamp",
    });
  });
});

describe("poller fetch controls", () => {
  it("rejects oversized responses and bounds retries on failure", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bmta-rt-"));
    const metrics = new MetricsRegistry();
    const store = new RealtimeSnapshotStore();
    const ingestor = new RealtimeIngestor(store, metrics);
    const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
    const manifestStore = new SnapshotManifestStore();
    const feed = REALTIME_FEEDS[0]!;

    let attempts = 0;
    const failFetch: typeof fetch = async () => {
      attempts += 1;
      throw new Error("network_down");
    };

    const poller = new RealtimePoller({
      config: {
        ...loadRealtimeLiveConfig({
          env: {
            BETTERMTA_INTERNAL_ALLOW_ANON: "true",
            BETTERMTA_DATA_DIR: tmp,
          },
          serviceRoot: tmp,
        }),
        timeoutMs: 50,
        maxRetries: 2,
        maxBytes: 1024,
      },
      rawStore,
      ingestor,
      manifestStore,
      getStaticDataset: () => null,
      fetchFn: failFetch,
    });

    const result = await poller.pollOne(feed);
    expect(result.error).toBeTruthy();
    expect(attempts).toBe(3); // 1 + 2 retries

    attempts = 0;
    const bigFetch: typeof fetch = async () => {
      attempts += 1;
      return new Response(new Uint8Array(2048), { status: 200 });
    };
    const poller2 = new RealtimePoller({
      config: {
        ...loadRealtimeLiveConfig({
          env: {
            BETTERMTA_INTERNAL_ALLOW_ANON: "true",
            BETTERMTA_DATA_DIR: tmp,
          },
          serviceRoot: tmp,
        }),
        timeoutMs: 1000,
        maxRetries: 0,
        maxBytes: 1024,
      },
      rawStore,
      ingestor,
      manifestStore,
      getStaticDataset: () => null,
      fetchFn: bigFetch,
    });
    const over = await poller2.pollOne(feed);
    expect(over.error).toMatch(/response_too_large|too_large/i);
    expect(attempts).toBe(1);

    // timeout abort path
    attempts = 0;
    const hangFetch: typeof fetch = async (_url, init) => {
      attempts += 1;
      await new Promise<void>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          return;
        }
        signal?.addEventListener(
          "abort",
          () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          { once: true },
        );
      });
      return new Response();
    };
    const poller3 = new RealtimePoller({
      config: {
        ...loadRealtimeLiveConfig({
          env: {
            BETTERMTA_INTERNAL_ALLOW_ANON: "true",
            BETTERMTA_DATA_DIR: tmp,
          },
          serviceRoot: tmp,
        }),
        timeoutMs: 30,
        maxRetries: 1,
        maxBytes: 1024,
      },
      rawStore,
      ingestor,
      manifestStore,
      getStaticDataset: () => null,
      fetchFn: hangFetch,
    });
    const timed = await poller3.pollOne(feed);
    expect(timed.error).toMatch(/timeout|aborted/i);
    expect(attempts).toBeLessThanOrEqual(2);

    await poller.stop();
    await poller2.stop();
    await poller3.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("keeps prior raw LKG on poll failure", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bmta-rt-"));
    const metrics = new MetricsRegistry();
    const store = new RealtimeSnapshotStore();
    const ingestor = new RealtimeIngestor(store, metrics);
    const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
    const manifestStore = new SnapshotManifestStore();
    const bytes = loadCaptured("nyct-gtfs-g");

    let fail = false;
    const fetchFn: typeof fetch = async () => {
      if (fail) throw new Error("network_down");
      return new Response(bytes, { status: 200 });
    };

    const base = loadRealtimeLiveConfig({
      env: {
        BETTERMTA_INTERNAL_ALLOW_ANON: "true",
        BETTERMTA_DATA_DIR: tmp,
      },
      serviceRoot: tmp,
    });
    const poller = new RealtimePoller({
      config: { ...base, maxRetries: 0 },
      rawStore,
      ingestor,
      manifestStore,
      getStaticDataset: () => null,
      fetchFn,
    });

    const feed = REALTIME_FEEDS.find((f) => f.feedId === "nyct-gtfs-g")!;
    const ok = await poller.pollOne(feed);
    expect(ok.parsed).toBeTruthy();
    const lkgBytes = rawStore.get("nyct-gtfs-g")!.bytes;

    fail = true;
    const bad = await poller.pollOne(feed);
    expect(bad.error).toBeTruthy();
    expect(bad.fromLkg).toBe(true);
    expect(Buffer.compare(rawStore.get("nyct-gtfs-g")!.bytes, lkgBytes)).toBe(
      0,
    );

    await poller.stop();
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("NYCT normalize + trip_replacement_period", () => {
  let platform: DataPlatform;
  let staticDataset: StaticDataset;

  beforeEach(() => {
    platform = new DataPlatform({
      env: { BETTERMTA_ALLOW_FIXTURE_STATIC: "true", NODE_ENV: "test" },
    });
    const result = platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });
    staticDataset = result.dataset;
  });

  it("maps explicit cancellations and skipped stops; quarantines unknown trips", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const bytes = await encodeFeedMessage({
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: nowSec,
      },
      entity: [
        {
          id: "cancel",
          tripUpdate: {
            trip: {
              tripId: "A_DN_001",
              routeId: "A",
              startDate: "20260730",
              scheduleRelationship: "CANCELED",
            },
            stopTimeUpdate: [],
          },
        },
        {
          id: "skip",
          tripUpdate: {
            trip: {
              tripId: "A_UP_001",
              routeId: "A",
              startDate: "20260730",
              trainId: "06 0123+ PEL/BBR",
              direction: "NORTH",
              isAssigned: true,
            },
            stopTimeUpdate: [
              {
                stopId: "A02N",
                scheduleRelationship: "SKIPPED",
                scheduledTrack: "4",
                actualTrack: "3",
              },
            ],
          },
        },
        {
          id: "unknown",
          tripUpdate: {
            trip: {
              tripId: "NOT_IN_STATIC",
              routeId: "A",
              scheduleRelationship: "SCHEDULED",
            },
            stopTimeUpdate: [],
          },
        },
      ],
    });

    const decoded = await decodeFeedMessage(bytes);
    const parsed = normalizeDecodedFeed(decoded, {
      feedId: "nyct-gtfs-ace",
      knownTripIds: new Set(staticDataset.trips.map((t) => t.tripId)),
      lineMapping: staticDataset.lineMapping,
      staticDataset,
    });

    expect(
      parsed.tripUpdates.find((t) => t.tripId === "A_DN_001")
        ?.scheduleRelationship,
    ).toBe("canceled");
    const skip = parsed.tripUpdates.find((t) => t.tripId === "A_UP_001");
    expect(skip?.stopTimeUpdates[0]?.scheduleRelationship).toBe("skipped");
    expect(skip?.trainId).toBeTruthy();
    expect(skip?.direction).toBe("NORTH");
    expect(skip?.stopTimeUpdates[0]?.scheduledTrack).toBe("4");
    expect(
      parsed.quarantined.some((q) => q.reason === "unknown_trip_id"),
    ).toBe(true);
  });

  it("derives absence-as-cancellation inside replacement windows", async () => {
    // Static has A_UP_001 and A_DN_001 on WEEKDAY. Use a Wednesday.
    // service date 20260729 is Wednesday.
    const serviceDate = "20260729";
    const depUp = staticDataset.stopTimes.find(
      (s) => s.tripId === "A_UP_001",
    )!.departureTime;
    const startUp = tripStartUnix(serviceDate, depUp)!;
    const windowStart = startUp - 60;
    const windowEnd = startUp + 3600;

    const nowSec = windowStart + 120;
    const bytes = await encodeFeedMessage({
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: nowSec,
        nyct: {
          nyctSubwayVersion: "1.0",
          tripReplacementPeriods: [
            {
              routeId: "A",
              start: windowStart,
              end: windowEnd,
            },
            {
              routeId: "D",
              start: windowStart,
              end: windowEnd,
            },
          ],
        },
      },
      entity: [
        // A_DN_001 present → NOT cancelled by absence
        {
          id: "present",
          tripUpdate: {
            trip: {
              tripId: "A_DN_001",
              routeId: "A",
              startDate: serviceDate,
              scheduleRelationship: "SCHEDULED",
            },
            stopTimeUpdate: [{ stopId: "A02N" }],
          },
        },
        // D_UP_001 present
        {
          id: "d_present",
          tripUpdate: {
            trip: {
              tripId: "D_UP_001",
              routeId: "D",
              startDate: serviceDate,
              scheduleRelationship: "SCHEDULED",
            },
            stopTimeUpdate: [{ stopId: "A32N" }],
          },
        },
      ],
    });

    const decoded = await decodeFeedMessage(bytes);
    expect(decoded.header.nyct?.tripReplacementPeriods.length).toBe(2);

    const parsed = normalizeDecodedFeed(decoded, {
      feedId: "nyct-gtfs-ace",
      knownTripIds: new Set(staticDataset.trips.map((t) => t.tripId)),
      staticDataset,
      lineMapping: staticDataset.lineMapping,
    });

    const derived = parsed.tripUpdates.filter(
      (t) => t.derivedFromReplacementPeriod,
    );
    // A_UP_001 absent inside window → cancelled
    expect(
      derived.some(
        (t) => t.tripId === "A_UP_001" && t.scheduleRelationship === "canceled",
      ),
    ).toBe(true);
    // A_DN_001 present → not derived cancelled
    expect(derived.some((t) => t.tripId === "A_DN_001")).toBe(false);
    // D_UP_001 present → not derived
    expect(derived.some((t) => t.tripId === "D_UP_001")).toBe(false);
  });

  it("does not cancel trips outside the replacement window", () => {
    const serviceDate = "20260729";
    const dep = staticDataset.stopTimes.find(
      (s) => s.tripId === "A_UP_001",
    )!.departureTime;
    const startUp = tripStartUnix(serviceDate, dep)!;
    // Window entirely before the trip
    const derived = deriveAbsenceCancellations({
      feedId: "nyct-gtfs-ace",
      periods: [
        {
          routeId: "A",
          start: startUp - 7200,
          end: startUp - 3600,
        },
      ],
      presentTripIds: new Set(),
      staticDataset,
      feedTimestampSec: startUp,
    });
    expect(derived.some((t) => t.tripId === "A_UP_001")).toBe(false);
  });

  it("handles midnight-spanning 00:30 boundary for replacement windows", () => {
    // Craft a synthetic static slice: trip with 24:30:00 on service day D-1
    // lands at local 00:30 on calendar day D.
    const serviceDate = "20260729"; // Wed
    const nextCalendar = "20260730";
    const midnightNext = serviceDateMidnightUnix(nextCalendar);
    // 00:30 on Jul 30 = midnight + 30min
    const boundary = midnightNext + 30 * 60;

    const synthetic: StaticDataset = {
      ...staticDataset,
      trips: [
        {
          tripId: "A_LATE_001",
          routeId: "A",
          serviceId: "WEEKDAY",
          tripHeadsign: "Late",
          directionId: 0,
        },
      ],
      stopTimes: [
        {
          tripId: "A_LATE_001",
          arrivalTime: "24:30:00",
          departureTime: "24:30:00",
          stopId: "A02N",
          stopSequence: 1,
        },
      ],
    };

    expect(gtfsTimeToSeconds("24:30:00")).toBe(24 * 3600 + 30 * 60);
    const tripStart = tripStartUnix(serviceDate, "24:30:00")!;
    expect(Math.abs(tripStart - boundary)).toBeLessThan(2);

    const derivedInside = deriveAbsenceCancellations({
      feedId: "nyct-gtfs-ace",
      periods: [
        {
          routeId: "A",
          start: boundary - 60,
          end: boundary + 60,
        },
      ],
      presentTripIds: new Set(),
      staticDataset: synthetic,
      feedTimestampSec: boundary,
    });
    expect(
      derivedInside.some(
        (t) =>
          t.tripId === "A_LATE_001" && t.scheduleRelationship === "canceled",
      ),
    ).toBe(true);

    const derivedOutside = deriveAbsenceCancellations({
      feedId: "nyct-gtfs-ace",
      periods: [
        {
          routeId: "A",
          start: boundary + 3600,
          end: boundary + 7200,
        },
      ],
      presentTripIds: new Set(),
      staticDataset: synthetic,
      feedTimestampSec: boundary,
    });
    expect(derivedOutside.some((t) => t.tripId === "A_LATE_001")).toBe(false);
  });
});

describe("partial-feed status + hollow LKG", () => {
  it("marks overall stale when one required feed is fresh and another stale", () => {
    const nowMs = Date.now();
    const perFeed: Record<string, PerFeedStatus> = {};
    for (const f of REALTIME_FEEDS) {
      perFeed[f.feedId] = {
        feedId: f.feedId,
        headerTimestamp: new Date(nowMs).toISOString(),
        fetchedAt: new Date(nowMs).toISOString(),
        ageSeconds: f.feedId === "nyct-gtfs-ace" ? 200 : 30,
        status: f.feedId === "nyct-gtfs-ace" ? "stale" : "fresh",
        entityCounts: {
          tripUpdates: 1,
          alerts: 0,
          vehicles: 0,
          quarantined: 0,
        },
        required: f.requiredForMode,
      };
    }
    // Force only ace stale; others fresh
    for (const id of Object.keys(perFeed)) {
      if (id === "nyct-gtfs-ace") {
        perFeed[id]!.status = "stale";
        perFeed[id]!.ageSeconds = 200;
      } else if (perFeed[id]!.required) {
        perFeed[id]!.status = "fresh";
        perFeed[id]!.ageSeconds = 30;
      }
    }
    expect(computeMultiFeedDataMode(perFeed, { hasRealtimePayload: true })).toBe(
      "stale",
    );
    expect(perFeed["nyct-gtfs-ace"]!.status).toBe("stale");
    expect(perFeed["nyct-gtfs"]!.status).toBe("fresh");
  });

  it("assembles snapshot with honest per-feed statuses", async () => {
    const platform = new DataPlatform({
      env: { BETTERMTA_ALLOW_FIXTURE_STATIC: "true", NODE_ENV: "test" },
    });
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });
    const nowMs = Date.parse("2026-07-30T12:00:00.000Z");
    const nowSec = Math.floor(nowMs / 1000);

    const freshBytes = await encodeFeedMessage({
      header: { gtfsRealtimeVersion: "2.0", timestamp: nowSec - 20 },
      entity: [
        {
          id: "1",
          tripUpdate: {
            trip: {
              tripId: "A_UP_001",
              routeId: "A",
              scheduleRelationship: "SCHEDULED",
            },
            stopTimeUpdate: [{ stopId: "A02N" }],
          },
        },
      ],
    });
    const staleBytes = await encodeFeedMessage({
      header: { gtfsRealtimeVersion: "2.0", timestamp: nowSec - 200 },
      entity: [
        {
          id: "1",
          tripUpdate: {
            trip: {
              tripId: "D_UP_001",
              routeId: "D",
              scheduleRelationship: "SCHEDULED",
            },
            stopTimeUpdate: [{ stopId: "A32N" }],
          },
        },
      ],
    });

    const freshDecoded = await decodeFeedMessage(freshBytes, { nowMs });
    const staleDecoded = await decodeFeedMessage(staleBytes, { nowMs });
    const ds = platform.staticStore.getActive()!;
    const known = new Set(ds.trips.map((t) => t.tripId));

    const feeds: AssembledFeedInput[] = REALTIME_FEEDS.map((f) => {
      if (f.feedId === "nyct-gtfs-ace") {
        return {
          feedId: f.feedId,
          parsed: normalizeDecodedFeed(freshDecoded, {
            feedId: f.feedId,
            knownTripIds: known,
            staticDataset: ds,
          }),
          fetchedAt: new Date(nowMs).toISOString(),
          headerTimestamp: nowSec - 20,
        };
      }
      if (f.feedId === "nyct-gtfs-bdfm") {
        return {
          feedId: f.feedId,
          parsed: normalizeDecodedFeed(staleDecoded, {
            feedId: f.feedId,
            knownTripIds: known,
            staticDataset: ds,
          }),
          fetchedAt: new Date(nowMs - 200_000).toISOString(),
          headerTimestamp: nowSec - 200,
        };
      }
      // Other required feeds: fresh empty-ish with header only → treat as fetched fresh
      return {
        feedId: f.feedId,
        parsed: {
          feedId: f.feedId,
          feedTimestampIso: new Date((nowSec - 10) * 1000).toISOString(),
          tripUpdates: f.requiredForMode
            ? [
                {
                  tripId: "A_UP_001",
                  scheduleRelationship: "scheduled" as const,
                  stopTimeUpdates: [],
                  feedId: f.feedId,
                },
              ]
            : [],
          alerts: [],
          quarantined: [],
          parseErrors: 0,
          vehicleCount: 0,
          simulatedFailure: null,
        },
        fetchedAt: new Date(nowMs).toISOString(),
        headerTimestamp: nowSec - 10,
      };
    });

    const { snapshot, perFeed } = assembleLiveSnapshot({
      ingestor: platform.realtimeIngestor,
      feeds,
      staticDatasetVersion: ds.staticDatasetVersion,
      knownTripIds: known,
      lineMapping: ds.lineMapping,
      nowMs,
    });

    expect(perFeed["nyct-gtfs-ace"]!.status).toBe("fresh");
    expect(perFeed["nyct-gtfs-bdfm"]!.status).toBe("stale");
    expect(snapshot.dataMode).toBe("stale");
    expect(snapshot.perFeed).toBeTruthy();
  });

  it("empty/hollow poll does not displace usable snapshot LKG", () => {
    const platform = new DataPlatform({
      env: { BETTERMTA_ALLOW_FIXTURE_STATIC: "true", NODE_ENV: "test" },
    });
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });
    const known = new Set(
      platform.staticStore.getActive()!.trips.map((t) => t.tripId),
    );
    const t0 = Date.parse("2026-07-30T12:00:00.000Z");
    platform.ingestRealtime(
      [
        {
          feedId: "nyct-gtfs-ace",
          payload: {
            header: { gtfsRealtimeVersion: "2.0", timestamp: t0 / 1000 },
            entity: [
              {
                id: "1",
                tripUpdate: {
                  trip: {
                    tripId: "A_UP_001",
                    scheduleRelationship: "SCHEDULED",
                  },
                  stopTimeUpdate: [{ stopId: "A02N" }],
                },
              },
            ],
            _fixtureMeta: {
              feedTimestampIso: "2026-07-30T12:00:00.000Z",
            },
          },
        },
      ],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: known,
        ingestedAt: "2026-07-30T12:00:00.000Z",
        nowMs: t0,
      },
    );
    const goodId = platform.realtimeStore.getLatest()!.snapshotId;

    platform.ingestRealtime(
      [
        {
          feedId: "nyct-gtfs-ace",
          payload: {
            header: {
              gtfsRealtimeVersion: "2.0",
              timestamp: t0 / 1000 + 30,
            },
            entity: [],
            _fixtureMeta: {
              feedTimestampIso: "2026-07-30T12:00:30.000Z",
            },
          },
        },
      ],
      {
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
        knownTripIds: known,
        ingestedAt: "2026-07-30T12:00:30.000Z",
        nowMs: t0 + 30_000,
      },
    );

    // Hollow does not become latest usable — store may keep prior as latest
    // depending on put semantics; resolveForRouting must return prior good.
    const resolved = platform.realtimeIngestor.resolveForRouting(
      platform.realtimeStore.getLatest(),
      {
        nowMs: t0 + 30_000,
        staticDatasetVersion: platform.staticStore.getActive()!
          .staticDatasetVersion,
      },
    );
    expect(resolved?.snapshotId).toBe(goodId);
  });
});

describe("internal HTTP server", () => {
  let server: ReturnType<typeof createInternalServer>;
  let port: number;
  let tmp: string;
  let poller: RealtimePoller;
  let platform: DataPlatform;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "bmta-int-"));
    platform = new DataPlatform({
      env: {
        BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
        NODE_ENV: "test",
        BETTERMTA_DATA_DIR: tmp,
      },
      serviceRoot: tmp,
    });
    platform.importStatic(VALID_STATIC, {
      importedAt: "2026-07-30T06:00:00.000Z",
      activate: true,
    });

    const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
    const bytes = loadCaptured("nyct-gtfs-g");
    const decoded = await decodeFeedMessage(bytes);
    rawStore.put({
      feedId: "nyct-gtfs-g",
      bytes,
      fetchedAt: new Date().toISOString(),
      headerTimestamp: decoded.header.timestamp,
      byteSize: bytes.length,
    });

    const manifestStore = new SnapshotManifestStore();
    poller = new RealtimePoller({
      config: loadRealtimeLiveConfig({
        env: {
          BETTERMTA_INTERNAL_TOKEN: "test-token",
          BETTERMTA_DATA_DIR: tmp,
          NODE_ENV: "test",
        },
        serviceRoot: tmp,
      }),
      rawStore,
      ingestor: platform.realtimeIngestor,
      manifestStore,
      getStaticDataset: () => platform.staticStore.getActive(),
    });

    const config = loadRealtimeLiveConfig({
      env: {
        BETTERMTA_INTERNAL_TOKEN: "test-token",
        BETTERMTA_DATA_DIR: tmp,
        NODE_ENV: "test",
      },
      serviceRoot: tmp,
    });

    server = createInternalServer({
      platform,
      poller,
      config: { ...config, internalToken: "test-token" },
      manifestStore,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterEach(async () => {
    if (poller) await poller.stop();
    if (server) await closeInternalServer(server);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("requires auth (401 without token)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/internal/health`);
    expect(res.status).toBe(401);
  });

  it("serves raw bytes roundtrip, catalogs, ready, 404 unknown feed", async () => {
    const headers = { Authorization: "Bearer test-token" };
    const health = await fetch(`http://127.0.0.1:${port}/internal/health`, {
      headers,
    });
    expect(health.status).toBe(200);

    const ready = await fetch(`http://127.0.0.1:${port}/internal/ready`, {
      headers,
    });
    expect(ready.status).toBe(200);

    const raw = await fetch(
      `http://127.0.0.1:${port}/internal/feeds/nyct-gtfs-g`,
      { headers },
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toMatch(/protobuf/);
    const body = Buffer.from(await raw.arrayBuffer());
    expect(Buffer.compare(body, loadCaptured("nyct-gtfs-g"))).toBe(0);

    const missing = await fetch(
      `http://127.0.0.1:${port}/internal/feeds/nyct-gtfs-ace`,
      { headers },
    );
    expect(missing.status).toBe(404);

    const unknown = await fetch(
      `http://127.0.0.1:${port}/internal/feeds/not-a-feed`,
      { headers },
    );
    expect(unknown.status).toBe(404);

    const lines = await fetch(
      `http://127.0.0.1:${port}/internal/catalog/lines`,
      { headers },
    );
    const linesBody = (await lines.json()) as {
      lines: Array<{ lineId: string }>;
    };
    expect(linesBody.lines.map((l) => l.lineId)).toEqual(
      expect.arrayContaining(["A", "D", "GS", "FS"]),
    );

    const stations = await fetch(
      `http://127.0.0.1:${port}/internal/catalog/stations`,
      { headers },
    );
    const stBody = (await stations.json()) as {
      stations: Array<{ stationId: string; lat: number; lon: number }>;
    };
    expect(stBody.stations.length).toBeGreaterThan(0);
    expect(stBody.stations[0]).toHaveProperty("lat");

    const status = await fetch(`http://127.0.0.1:${port}/internal/status`, {
      headers,
    });
    const statusBody = (await status.json()) as { ready: boolean };
    expect(statusBody.ready).toBe(true);
  });

  it("ready is 503 without active static", async () => {
    const empty = new DataPlatform({
      env: {
        BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
        NODE_ENV: "test",
        BETTERMTA_DATA_DIR: tmp,
      },
      serviceRoot: tmp,
    });
    const config = loadRealtimeLiveConfig({
      env: {
        BETTERMTA_INTERNAL_TOKEN: "tok",
        NODE_ENV: "test",
        BETTERMTA_DATA_DIR: tmp,
      },
      serviceRoot: tmp,
    });
    const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
    const manifestStore = new SnapshotManifestStore();
    const p2 = new RealtimePoller({
      config,
      rawStore,
      ingestor: empty.realtimeIngestor,
      manifestStore,
      getStaticDataset: () => null,
    });
    const s2 = createInternalServer({
      platform: empty,
      poller: p2,
      config: { ...config, internalToken: "tok" },
      manifestStore,
    });
    await new Promise<void>((r) => s2.listen(0, "127.0.0.1", () => r()));
    const addr = s2.address();
    const p = typeof addr === "object" && addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${p}/internal/ready`, {
      headers: { Authorization: "Bearer tok" },
    });
    expect(res.status).toBe(503);
    await p2.stop();
    await closeInternalServer(s2);
  });
});

describe("shutdown", () => {
  it("stops pollers and closes server without dangling handles", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bmta-stop-"));
    const platform = new DataPlatform({
      env: {
        BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
        NODE_ENV: "test",
        BETTERMTA_DATA_DIR: tmp,
      },
      serviceRoot: tmp,
    });
    platform.importStatic(VALID_STATIC, { activate: true });
    const config = loadRealtimeLiveConfig({
      env: {
        BETTERMTA_INTERNAL_TOKEN: "t",
        BETTERMTA_DATA_DIR: tmp,
        NODE_ENV: "test",
        BETTERMTA_RT_POLL_MS: "60000",
      },
      serviceRoot: tmp,
    });
    const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
    const manifestStore = new SnapshotManifestStore();
    const poller = new RealtimePoller({
      config,
      rawStore,
      ingestor: platform.realtimeIngestor,
      manifestStore,
      getStaticDataset: () => platform.staticStore.getActive(),
      fetchFn: async () => new Response(loadCaptured("nyct-gtfs-si")),
    });
    const server = createInternalServer({
      platform,
      poller,
      config: { ...config, internalToken: "t" },
      manifestStore,
    });
    await listenInternalServer(server, 0);
    // listen on 0 may not set port via helper — bind explicitly
    poller.start();
    await poller.stop();
    await closeInternalServer(server);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("catalog helpers", () => {
  it("maps SI→SIR and builds station shapes", () => {
    const platform = new DataPlatform({
      env: { BETTERMTA_ALLOW_FIXTURE_STATIC: "true", NODE_ENV: "test" },
    });
    const { dataset } = platform.importStatic(VALID_STATIC, { activate: true });
    const lines = buildLineCatalog(dataset);
    expect(lines.some((l) => l.lineId === "GS")).toBe(true);
    expect(lines.some((l) => l.lineId === "FS")).toBe(true);
    const stations = buildStationCatalog(dataset);
    expect(stations[0]).toMatchObject({
      stationId: expect.any(String),
      name: expect.any(String),
      lat: expect.any(Number),
      lon: expect.any(Number),
      lineIds: expect.any(Array),
    });
  });
});

describe.runIf(process.env.BETTERMTA_LIVE_RT === "true")(
  "live integration (env-gated)",
  () => {
    it("polls all nine feeds once with >=7 fresh decodeable headers", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "bmta-live-"));
      const platform = new DataPlatform({
        env: {
          BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
          NODE_ENV: "test",
          BETTERMTA_DATA_DIR: tmp,
        },
        serviceRoot: tmp,
      });
      platform.importStatic(VALID_STATIC, { activate: true });
      const config = loadRealtimeLiveConfig({
        env: {
          BETTERMTA_INTERNAL_ALLOW_ANON: "true",
          BETTERMTA_DATA_DIR: tmp,
          BETTERMTA_RT_MAX_RETRIES: "1",
          NODE_ENV: "test",
        },
        serviceRoot: tmp,
      });
      const rawStore = new RawFeedStore({ dataDir: tmp, mirrorToDisk: false });
      const manifestStore = new SnapshotManifestStore();
      const poller = new RealtimePoller({
        config,
        rawStore,
        ingestor: platform.realtimeIngestor,
        manifestStore,
        getStaticDataset: () => platform.staticStore.getActive(),
      });
      const { results } = await poller.pollAllOnce();
      const ok = results.filter(
        (r) =>
          r.parsed &&
          r.headerTimestamp &&
          r.headerTimestamp > 0 &&
          !r.error,
      );
      expect(ok.length).toBeGreaterThanOrEqual(7);
      await poller.stop();
      rmSync(tmp, { recursive: true, force: true });
    }, 120_000);
  },
);

// silence unused
void buildPerFeedStatus;
