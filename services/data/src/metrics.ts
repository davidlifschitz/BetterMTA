/**
 * In-memory observability registry.
 * Infrastructure can later scrape/export these counters and gauges.
 */

export type MetricKind = "counter" | "gauge" | "histogram";

export interface MetricSample {
  name: string;
  kind: MetricKind;
  value: number;
  labels?: Record<string, string>;
  updatedAt: string;
}

export interface DataMetricsSnapshot {
  staticImportStatus: string;
  staticDatasetVersion: string | null;
  realtimeAgeSeconds: number | null;
  pollDurationMs: number | null;
  parseErrors: number;
  entityCounts: {
    tripUpdates: number;
    alerts: number;
    vehicles: number;
  };
  brokenReferences: number;
  quarantinedRoutes: number;
  staleDurationSeconds: number | null;
  lastSuccessfulUpdate: string | null;
  samples: MetricSample[];
}

type Internal = {
  counters: Map<string, number>;
  gauges: Map<string, { value: number; labels?: Record<string, string> }>;
  lastUpdated: Map<string, string>;
};

function key(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
  return `${name}{${parts}}`;
}

export class MetricsRegistry {
  private readonly state: Internal = {
    counters: new Map(),
    gauges: new Map(),
    lastUpdated: new Map(),
  };

  private touch(name: string, now?: string): void {
    this.state.lastUpdated.set(name, now ?? new Date().toISOString());
  }

  incr(name: string, by = 1, labels?: Record<string, string>): void {
    const k = key(name, labels);
    this.state.counters.set(k, (this.state.counters.get(k) ?? 0) + by);
    this.touch(k);
  }

  setGauge(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const k = key(name, labels);
    this.state.gauges.set(k, { value, labels });
    this.touch(k);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.state.counters.get(key(name, labels)) ?? 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number | null {
    const g = this.state.gauges.get(key(name, labels));
    return g ? g.value : null;
  }

  /** Contract-level observability surface for infra wiring. */
  snapshot(): DataMetricsSnapshot {
    const samples: MetricSample[] = [];
    for (const [name, value] of this.state.counters) {
      samples.push({
        name,
        kind: "counter",
        value,
        updatedAt: this.state.lastUpdated.get(name) ?? "",
      });
    }
    for (const [name, g] of this.state.gauges) {
      samples.push({
        name,
        kind: "gauge",
        value: g.value,
        labels: g.labels,
        updatedAt: this.state.lastUpdated.get(name) ?? "",
      });
    }

    const statusCode = this.getGauge("bettermta_static_import_status_code");
    const status =
      statusCode === 1
        ? "active"
        : statusCode === 2
          ? "pending"
          : statusCode === 3
            ? "failed"
            : statusCode === 4
              ? "rolled_back"
              : "unknown";

    let staticDatasetVersion: string | null = null;
    for (const g of this.state.gauges.values()) {
      if (g.labels?.version) {
        staticDatasetVersion = g.labels.version;
        break;
      }
    }

    let lastSuccessfulUpdate: string | null = null;
    for (const [name, g] of this.state.gauges) {
      if (
        name.startsWith("bettermta_last_successful_update") &&
        g.labels?.timestamp
      ) {
        lastSuccessfulUpdate = g.labels.timestamp;
        break;
      }
    }

    return {
      staticImportStatus: status,
      staticDatasetVersion,
      realtimeAgeSeconds: this.getGauge("bettermta_realtime_age_seconds"),
      pollDurationMs: this.getGauge("bettermta_realtime_poll_duration_ms"),
      parseErrors: this.getCounter("bettermta_parse_errors_total"),
      entityCounts: {
        tripUpdates: this.getCounter("bettermta_trip_updates_total"),
        alerts: this.getCounter("bettermta_alerts_total"),
        vehicles: this.getCounter("bettermta_vehicles_total"),
      },
      brokenReferences: this.getCounter(
        "bettermta_broken_references_total",
      ),
      quarantinedRoutes: this.getCounter(
        "bettermta_quarantined_routes_total",
      ),
      staleDurationSeconds: this.getGauge(
        "bettermta_stale_duration_seconds",
      ),
      lastSuccessfulUpdate,
      samples,
    };
  }

  setStaticStatus(
    status: "active" | "pending" | "failed" | "rolled_back",
    version: string | null,
  ): void {
    const code =
      status === "active"
        ? 1
        : status === "pending"
          ? 2
          : status === "failed"
            ? 3
            : 4;
    this.setGauge("bettermta_static_import_status_code", code);
    this.setGauge("bettermta_static_import_status_enum", code, { status });
    if (version) {
      this.setGauge("bettermta_static_dataset_version_present", 1, {
        version,
      });
    }
  }

  markLastSuccessfulUpdate(iso: string): void {
    this.setGauge("bettermta_last_successful_update", Date.parse(iso), {
      timestamp: iso,
    });
  }
}

export const globalMetrics = new MetricsRegistry();
