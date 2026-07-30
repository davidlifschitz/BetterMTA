import { mapRoutesToLineIds } from "../line-mapping.js";
import { MetricsRegistry } from "../metrics.js";
import type { StaticDataset } from "../types.js";
import {
  checksumContents,
  loadGtfsDirectory,
  parseGtfsFiles,
  type ParsedGtfs,
} from "./gtfs-parser.js";
import { validateGtfs } from "./validator.js";
import { StaticDatasetStore } from "./store.js";

export interface ImportOptions {
  source?: string;
  versionPrefix?: string;
  importedAt?: string;
  activate?: boolean;
  /** When true, treat as synthetic fixture path — still validates. */
  synthetic?: boolean;
  /**
   * Explicit dataset version id (production pipeline binding).
   * When set, overrides versionPrefix-based version construction.
   */
  version?: string;
  /** Explicit checksum (e.g. sha256 of the source zip). */
  checksum?: string;
}

export interface ImportResult {
  dataset: StaticDataset;
  activated: boolean;
  validationOk: boolean;
  issues: ReturnType<typeof validateGtfs>["issues"];
}

function serviceWindow(
  calendar: ParsedGtfs["calendar"],
): { startDate: string; endDate: string } | null {
  if (calendar.length === 0) return null;
  let start = calendar[0]!.startDate;
  let end = calendar[0]!.endDate;
  for (const c of calendar) {
    if (c.startDate < start) start = c.startDate;
    if (c.endDate > end) end = c.endDate;
  }
  return { startDate: start, endDate: end };
}

function buildVersion(
  prefix: string,
  checksum: string,
  importedAt: string,
): string {
  const day = importedAt.slice(0, 10).replace(/-/g, "");
  const short = checksum.replace("sha256:", "").slice(0, 8);
  return `${prefix}_${day}_${short}`;
}

export class StaticImporter {
  constructor(
    private readonly store: StaticDatasetStore,
    private readonly metrics: MetricsRegistry,
  ) {}

  importFromDirectory(dir: string, options: ImportOptions = {}): ImportResult {
    const parsed = loadGtfsDirectory(dir);
    return this.importParsed(parsed, options);
  }

  importFromFiles(
    files: Record<string, string>,
    options: ImportOptions = {},
  ): ImportResult {
    const parsed = parseGtfsFiles(files);
    return this.importParsed(parsed, options);
  }

  private importParsed(
    parsed: ParsedGtfs,
    options: ImportOptions,
  ): ImportResult {
    const source = options.source ?? "mta-subway-gtfs";
    const importedAt = options.importedAt ?? new Date().toISOString();
    const checksum =
      options.checksum ?? checksumContents(parsed.rawFiles);
    const version =
      options.version ??
      buildVersion(options.versionPrefix ?? "gtfs", checksum, importedAt);

    this.metrics.setStaticStatus("pending", version);

    const validation = validateGtfs(parsed);
    const { mappings, quarantined } = mapRoutesToLineIds(parsed.routes);

    if (quarantined.length > 0) {
      this.metrics.incr(
        "bettermta_quarantined_routes_total",
        quarantined.length,
      );
    }
    const errorCount = validation.issues.filter(
      (i) => i.severity === "error",
    ).length;
    if (errorCount > 0) {
      this.metrics.incr("bettermta_broken_references_total", errorCount);
    }

    if (!validation.ok) {
      const failed: StaticDataset = {
        staticDatasetVersion: version,
        source,
        checksum,
        status: "failed",
        importedAt,
        activatedAt: null,
        stops: parsed.stops,
        routes: parsed.routes,
        trips: parsed.trips,
        stopTimes: parsed.stopTimes,
        transfers: parsed.transfers,
        calendar: parsed.calendar,
        lineMapping: mappings,
        quarantinedRoutes: quarantined,
        serviceWindow: serviceWindow(parsed.calendar),
      };
      this.store.recordFailed(failed);
      this.metrics.setStaticStatus("failed", version);
      this.metrics.incr("bettermta_static_import_failures_total");
      return {
        dataset: failed,
        activated: false,
        validationOk: false,
        issues: validation.issues,
      };
    }

    const pending: StaticDataset = {
      staticDatasetVersion: version,
      source,
      checksum,
      status: "pending",
      importedAt,
      activatedAt: null,
      stops: parsed.stops,
      routes: parsed.routes,
      trips: parsed.trips,
      stopTimes: parsed.stopTimes,
      transfers: parsed.transfers,
      calendar: parsed.calendar,
      lineMapping: mappings,
      quarantinedRoutes: quarantined,
      serviceWindow: serviceWindow(parsed.calendar),
    };

    this.store.putPending(pending);

    const shouldActivate = options.activate !== false;
    if (shouldActivate) {
      const activated = this.store.activate(version, importedAt);
      this.metrics.setStaticStatus("active", version);
      this.metrics.markLastSuccessfulUpdate(importedAt);
      this.metrics.incr("bettermta_static_import_success_total");
      return {
        dataset: activated,
        activated: true,
        validationOk: true,
        issues: validation.issues,
      };
    }

    this.metrics.setStaticStatus("pending", version);
    return {
      dataset: pending,
      activated: false,
      validationOk: true,
      issues: validation.issues,
    };
  }
}
