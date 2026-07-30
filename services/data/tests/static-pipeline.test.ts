/**
 * Production static GTFS pipeline tests.
 * Uses in-process HTTP server + adm-zip constructed feeds. No live network.
 */
import { createServer, type Server } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DataPlatform,
  MetricsRegistry,
  RecordingGraphBuildTrigger,
  StaticDatasetStore,
  StaticImporter,
  downloadStaticGtfsZip,
  extractGtfsZip,
  isStaticReady,
  loadActiveStaticFromDisk,
  loadStaticPipelineConfig,
  readActivePointer,
  rollbackStaticVersion,
  runStaticRefresh,
  sha256Buffer,
  staticStorePaths,
  validateExtractedGtfs,
  versionIdFromSha256,
  type AtomicWriteFn,
  type StaticPipelineConfig,
} from "../src/index.js";

const CLOCK = () => new Date("2026-07-30T16:00:00.000Z"); // Thu afternoon ET

function minimalGtfsFiles(overrides?: {
  calendarEnd?: string;
  calendarStart?: string;
  badTripRoute?: boolean;
  omitTransfers?: boolean;
  omitAgency?: boolean;
  omitStops?: boolean;
  routesExtra?: string;
}): Record<string, string> {
  const start = overrides?.calendarStart ?? "20260101";
  const end = overrides?.calendarEnd ?? "20261231";
  const files: Record<string, string> = {
    "agency.txt":
      "agency_id,agency_name,agency_url,agency_timezone,agency_lang\n" +
      "MTA,MTA NYCT,http://www.mta.info,America/New_York,en\n",
    "routes.txt":
      "route_id,route_short_name,route_long_name,route_color,route_text_color\n" +
      "A,A,Eighth Avenue Express,0039A6,FFFFFF\n" +
      "D,D,Sixth Avenue Express,FF6319,FFFFFF\n" +
      "GS,GS,42 St Shuttle,6D6E71,FFFFFF\n" +
      "FS,FS,Franklin Ave Shuttle,6D6E71,FFFFFF\n" +
      "H,H,Rockaway Park Shuttle,6D6E71,FFFFFF\n" +
      "SI,SI,Staten Island Railway,0039A6,FFFFFF\n" +
      (overrides?.routesExtra ?? ""),
    "stops.txt":
      "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n" +
      "A41,Test Stop,40.67,-73.95,1,\n" +
      "A41N,Test Stop N,40.67,-73.95,0,A41\n",
    "trips.txt":
      "route_id,trip_id,service_id,trip_headsign,direction_id\n" +
      `${overrides?.badTripRoute ? "ZZZ" : "A"},T1,WEEKDAY,Test,0\n`,
    "stop_times.txt":
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
      "T1,08:00:00,08:00:00,A41N,1\n",
    "calendar.txt":
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n" +
      `WEEKDAY,1,1,1,1,1,1,1,${start},${end}\n`,
    "transfers.txt":
      "from_stop_id,to_stop_id,transfer_type,min_transfer_time\n" +
      "A41N,A41N,2,0\n",
  };
  if (overrides?.omitAgency) delete files["agency.txt"];
  if (overrides?.omitStops) delete files["stops.txt"];
  if (overrides?.omitTransfers) delete files["transfers.txt"];
  return files;
}

/** Build a zip archive from GTFS text tables. */
function buildZip(
  files: Record<string, string>,
  outPath: string,
): void {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  zip.writeZip(outPath);
}

function startZipServer(zipPath: string): Promise<{
  server: Server;
  url: string;
  fetchCount: () => number;
}> {
  let fetches = 0;
  const server = createServer((req, res) => {
    fetches += 1;
    if (req.url === "/hang") {
      // never respond — for timeout tests
      return;
    }
    if (req.url === "/huge") {
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-length": String(200 * 1024 * 1024),
      });
      // Send a small body; client should abort on Content-Length vs maxBytes.
      res.end(Buffer.alloc(1024, 1));
      return;
    }
    if (req.url === "/huge-stream") {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
      });
      const chunk = Buffer.alloc(64 * 1024, 1);
      let sent = 0;
      const target = 3 * 1024 * 1024;
      const push = () => {
        while (sent < target) {
          const ok = res.write(chunk);
          sent += chunk.byteLength;
          if (!ok) {
            res.once("drain", push);
            return;
          }
        }
        res.end();
      };
      push();
      return;
    }
    const body = readFileSync(zipPath);
    res.writeHead(200, {
      "content-type": "application/zip",
      "content-length": body.byteLength,
    });
    res.end(body);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}/gtfs.zip`,
        fetchCount: () => fetches,
      });
    });
  });
}

function baseConfig(
  dataDir: string,
  url: string,
  overrides?: Partial<StaticPipelineConfig>,
): StaticPipelineConfig {
  return {
    staticGtfsUrl: url,
    dataDir,
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 5_000,
    refreshIntervalMs: 86_400_000,
    retainVersions: 3,
    minStops: 1,
    minRoutes: 1,
    serviceCoverageDays: 7,
    graphBuildWebhook: null,
    allowFixtureStatic: true,
    nodeEnv: "test",
    ...overrides,
  };
}

describe("production static pipeline", () => {
  let dataDir: string;
  let zipPath: string;
  let server: Server | null = null;
  let fetchCount = () => 0;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "bettermta-static-"));
    zipPath = join(dataDir, "feed.zip");
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function serve(files: Record<string, string>) {
    buildZip(files, zipPath);
    const s = await startZipServer(zipPath);
    server = s.server;
    fetchCount = s.fetchCount;
    return s.url;
  }

  it("successful refresh end-to-end activates and fires trigger once", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();
    const config = baseConfig(dataDir, url);

    const result = await runStaticRefresh({
      config,
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });

    expect(result.status).toBe("activated");
    if (result.status !== "activated") return;
    expect(result.versionId).toMatch(/^mta-subway-[a-f0-9]{12}$/);
    expect(trigger.requests).toHaveLength(1);
    expect(trigger.requests[0]!.versionId).toBe(result.versionId);
    expect(isStaticReady(store)).toBe(true);
    expect(store.getActive()?.staticDatasetVersion).toBe(result.versionId);

    const active = readActivePointer(dataDir);
    expect(active?.versionId).toBe(result.versionId);
    const metaPath = join(
      staticStorePaths(dataDir).versionsDir,
      result.versionId,
      "metadata.json",
    );
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    expect(meta.sha256).toBe(result.sha256);
    expect(meta.attribution).toContain("Metropolitan Transportation Authority");
    expect(existsSync(staticStorePaths(dataDir).graphBuildRequestPath)).toBe(
      false,
    ); // Recording trigger does not write — use default for that
    expect(metrics.getCounter("bettermta_static_refresh_success_total")).toBe(1);
    expect(metrics.getCounter("bettermta_graph_build_triggers_total")).toBe(1);
  });

  it("writes graph-build-request.json with default trigger", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const result = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      clock: CLOCK,
    });
    expect(result.status).toBe("activated");
    const req = JSON.parse(
      readFileSync(staticStorePaths(dataDir).graphBuildRequestPath, "utf8"),
    );
    expect(req.versionId).toMatch(/^mta-subway-/);
    expect(req.sha256).toHaveLength(64);
    expect(req.requestedAt).toBeTruthy();
  });

  it("unchanged checksum => no re-activation, no trigger", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();
    const deps = {
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    };

    const first = await runStaticRefresh(deps);
    expect(first.status).toBe("activated");
    const version = first.status === "activated" ? first.versionId : "";

    const second = await runStaticRefresh(deps);
    expect(second.status).toBe("unchanged");
    expect(trigger.requests).toHaveLength(1);
    expect(store.getActive()?.staticDatasetVersion).toBe(version);
    expect(metrics.getCounter("bettermta_static_refresh_unchanged_total")).toBe(
      1,
    );
  });

  it("truncated ZIP => failure, active version untouched", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();

    const first = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(first.status).toBe("activated");
    const activeVersion =
      first.status === "activated" ? first.versionId : "";

    // Replace server zip with truncated bytes
    const good = readFileSync(zipPath);
    writeFileSync(zipPath, good.subarray(0, Math.min(64, good.byteLength)));

    const second = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(second.status).toBe("failed");
    expect(store.getActive()?.staticDatasetVersion).toBe(activeVersion);
    expect(readActivePointer(dataDir)?.versionId).toBe(activeVersion);
    expect(trigger.requests).toHaveLength(1);
  });

  it("missing required file => failure, not activated", async () => {
    const files = minimalGtfsFiles({ omitStops: true });
    const url = await serve(files);
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();

    const result = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.code).toMatch(/MISSING|missing/i);
    }
    expect(store.getActive()).toBeNull();
    expect(readActivePointer(dataDir)).toBeNull();
    expect(trigger.requests).toHaveLength(0);
  });

  it("invalid references => failure, not activated", async () => {
    const url = await serve(minimalGtfsFiles({ badTripRoute: true }));
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();

    const result = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(result.status).toBe("failed");
    expect(store.getActive()).toBeNull();
    expect(trigger.requests).toHaveLength(0);
  });

  it("expired/insufficient service-date coverage => failure, not activated", async () => {
    const url = await serve(
      minimalGtfsFiles({
        calendarStart: "20200101",
        calendarEnd: "20200131",
      }),
    );
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();

    const result = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.code).toBe("insufficient_service_coverage");
    }
    expect(store.getActive()).toBeNull();
    expect(trigger.requests).toHaveLength(0);
  });

  it("failed activation (rename error) => previous active still valid", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();

    const first = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(first.status).toBe("activated");
    const prev = first.status === "activated" ? first.versionId : "";

    // Change zip content so checksum differs
    const files2 = minimalGtfsFiles({
      routesExtra: "B,B,Sixth Ave,FF6319,FFFFFF\n",
    });
    buildZip(files2, zipPath);

    const failWrite: AtomicWriteFn = (targetPath, contents) => {
      if (targetPath.endsWith("active.json")) {
        throw new Error("simulated rename failure");
      }
      writeFileSync(targetPath, contents);
    };

    const second = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
      atomicWrite: failWrite,
    });
    expect(second.status).toBe("failed");
    expect(readActivePointer(dataDir)?.versionId).toBe(prev);
    expect(store.getActive()?.staticDatasetVersion).toBe(prev);
    expect(trigger.requests).toHaveLength(1);
  });

  it("rollback to previous version works and readiness stays true", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics = new MetricsRegistry();
    const store = new StaticDatasetStore();
    const importer = new StaticImporter(store, metrics);
    const trigger = new RecordingGraphBuildTrigger();
    const config = baseConfig(dataDir, url);

    const v1 = await runStaticRefresh({
      config,
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: CLOCK,
    });
    expect(v1.status).toBe("activated");
    const firstId = v1.status === "activated" ? v1.versionId : "";

    buildZip(
      minimalGtfsFiles({ routesExtra: "B,B,Sixth Ave,FF6319,FFFFFF\n" }),
      zipPath,
    );
    const v2 = await runStaticRefresh({
      config,
      metrics,
      staticStore: store,
      staticImporter: importer,
      trigger,
      clock: () => new Date("2026-07-30T17:00:00.000Z"),
    });
    expect(v2.status).toBe("activated");
    const secondId = v2.status === "activated" ? v2.versionId : "";
    expect(secondId).not.toBe(firstId);

    const rolled = rollbackStaticVersion(
      {
        config,
        metrics,
        staticStore: store,
        staticImporter: importer,
        clock: () => new Date("2026-07-30T18:00:00.000Z"),
      },
      firstId,
    );
    expect(rolled.versionId).toBe(firstId);
    expect(isStaticReady(store)).toBe(true);
    expect(store.getActive()?.staticDatasetVersion).toBe(firstId);
    expect(readActivePointer(dataDir)?.versionId).toBe(firstId);
  });

  it("restart with existing active version loads from disk with zero network", async () => {
    const url = await serve(minimalGtfsFiles());
    const metrics1 = new MetricsRegistry();
    const store1 = new StaticDatasetStore();
    const importer1 = new StaticImporter(store1, metrics1);
    const first = await runStaticRefresh({
      config: baseConfig(dataDir, url),
      metrics: metrics1,
      staticStore: store1,
      staticImporter: importer1,
      trigger: new RecordingGraphBuildTrigger(),
      clock: CLOCK,
    });
    expect(first.status).toBe("activated");
    const versionId = first.status === "activated" ? first.versionId : "";
    const fetchesBefore = fetchCount();

    // New process simulation
    const metrics2 = new MetricsRegistry();
    const store2 = new StaticDatasetStore();
    const importer2 = new StaticImporter(store2, metrics2);
    const loaded = loadActiveStaticFromDisk({
      config: baseConfig(dataDir, url),
      metrics: metrics2,
      staticStore: store2,
      staticImporter: importer2,
    });
    expect(loaded.ready).toBe(true);
    expect(loaded.loadedFromDisk).toBe(true);
    expect(loaded.networkCalls).toBe(0);
    expect(loaded.versionId).toBe(versionId);
    expect(fetchCount()).toBe(fetchesBefore); // no new fetches
    expect(isStaticReady(store2)).toBe(true);
  });

  it("size-cap abort", async () => {
    buildZip(minimalGtfsFiles(), zipPath);
    const s = await startZipServer(zipPath);
    server = s.server;
    const hugeUrl = s.url.replace(/\/gtfs\.zip$/, "/huge");
    const tmp = join(dataDir, "tmp");
    await expect(
      downloadStaticGtfsZip({
        url: hugeUrl,
        tempDir: tmp,
        maxBytes: 1024 * 1024, // 1MB
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ code: "SIZE_CAP" });
  });

  it("timeout abort", async () => {
    buildZip(minimalGtfsFiles(), zipPath);
    const s = await startZipServer(zipPath);
    server = s.server;
    const hangUrl = s.url.replace(/\/gtfs\.zip$/, "/hang");
    const tmp = join(dataDir, "tmp");
    await expect(
      downloadStaticGtfsZip({
        url: hangUrl,
        tempDir: tmp,
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("production mode refuses fixture static loading", () => {
    const platform = new DataPlatform({
      pipelineConfig: baseConfig(dataDir, "http://127.0.0.1/unused", {
        nodeEnv: "production",
        allowFixtureStatic: true,
      }),
    });
    expect(() =>
      platform.importStatic(join(dataDir, "nope")),
    ).toThrow(/production/i);
  });

  it("non-production without flag refuses fixture static loading", () => {
    const platform = new DataPlatform({
      pipelineConfig: baseConfig(dataDir, "http://127.0.0.1/unused", {
        nodeEnv: "development",
        allowFixtureStatic: false,
      }),
    });
    expect(() =>
      platform.importStatic(join(dataDir, "nope")),
    ).toThrow(/BETTERMTA_ALLOW_FIXTURE_STATIC/);
  });

  it("config loader validates defaults and env overrides", () => {
    const cfg = loadStaticPipelineConfig({
      env: {
        BETTERMTA_DATA_DIR: dataDir,
        BETTERMTA_STATIC_MAX_BYTES: "2048",
        BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
      },
      serviceRoot: dataDir,
    });
    expect(cfg.staticGtfsUrl).toContain("gtfs_subway.zip");
    expect(cfg.maxBytes).toBe(2048);
    expect(cfg.dataDir).toBe(dataDir);
    expect(cfg.retainVersions).toBe(3);
  });

  it("version id convention is mta-subway- + 12 hex", () => {
    const sha = sha256Buffer(Buffer.from("hello"));
    expect(versionIdFromSha256(sha)).toBe(`mta-subway-${sha.slice(0, 12)}`);
  });
});

describe.skipIf(!process.env.BETTERMTA_REAL_GTFS_ZIP)(
  "real MTA GTFS zip integration",
  () => {
    it("validates and versions the real subway feed", async () => {
      const realZip = process.env.BETTERMTA_REAL_GTFS_ZIP!;
      expect(existsSync(realZip)).toBe(true);

      const dataDir = mkdtempSync(join(tmpdir(), "bettermta-real-"));
      const extractDir = join(dataDir, "extract");
      try {
        await extractGtfsZip(realZip, extractDir);
        const validation = validateExtractedGtfs(extractDir, {
          now: CLOCK(),
          serviceCoverageDays: 7,
          minStops: 400,
          minRoutes: 20,
        });

        const zipBytes = readFileSync(realZip);
        const sha256 = sha256Buffer(zipBytes);
        const versionId = versionIdFromSha256(sha256);

        console.log(
          JSON.stringify(
            {
              validationOk: validation.ok,
              issues: validation.issues.filter((i) => i.severity === "error"),
              versionId,
              sha256,
              tableCounts: validation.tableCounts,
              serviceDateRange: validation.serviceDateRange,
              routeIds: validation.routeIds,
              hasGS: validation.routeIds.includes("GS"),
              hasFS: validation.routeIds.includes("FS"),
              hasH: validation.routeIds.includes("H"),
              hasSI: validation.routeIds.includes("SI"),
            },
            null,
            2,
          ),
        );

        expect(validation.ok).toBe(true);
        expect(validation.tableCounts.stops!).toBeGreaterThan(400);
        expect(validation.tableCounts.routes!).toBeGreaterThan(20);
        expect(validation.routeIds).toEqual(
          expect.arrayContaining(["GS", "FS", "H", "SI"]),
        );

        // Full refresh via file path source
        const metrics = new MetricsRegistry();
        const store = new StaticDatasetStore();
        const importer = new StaticImporter(store, metrics);
        const trigger = new RecordingGraphBuildTrigger();
        const result = await runStaticRefresh({
          config: baseConfig(dataDir, realZip, {
            minStops: 400,
            minRoutes: 20,
            maxBytes: 100 * 1024 * 1024,
          }),
          metrics,
          staticStore: store,
          staticImporter: importer,
          trigger,
          clock: CLOCK,
        });
        expect(result.status).toBe("activated");
        if (result.status === "activated") {
          expect(result.versionId).toBe(versionId);
        }
        expect(trigger.requests).toHaveLength(1);
        expect(isStaticReady(store)).toBe(true);
      } finally {
        rmSync(dataDir, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
