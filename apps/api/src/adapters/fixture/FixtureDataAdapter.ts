import type { AdapterReadyMode } from "../../config.js";
import { CONTRACT_VERSION } from "../../constants.js";
import type {
  AdapterReadiness,
  DataMode,
  LinesResponse,
  Place,
  PlaceSearchResponse,
  RoutingSnapshotHandle,
  StatusResponse,
} from "../../types.js";
import type { DataAdapter } from "../types.js";
import { readJsonFixture } from "./readJson.js";

/** Extra resolvable places referenced by route fixtures / sentinels (not all in place-search fixture). */
const EXTRA_PLACES: Place[] = [
  {
    placeId: "pl_carroll_st",
    label: "Carroll St",
    kind: "station",
    stationId: "st_carroll",
    borough: "Brooklyn",
  },
  {
    placeId: "pl_bryant_park",
    label: "42 St-Bryant Park",
    kind: "station",
    stationId: "st_bryant",
    borough: "Manhattan",
  },
  {
    placeId: "pl_union_sq",
    label: "Union Square",
    kind: "station",
    stationId: "st_union_sq",
    borough: "Manhattan",
  },
  {
    placeId: "pl_union_st_bk",
    label: "Union St",
    kind: "station",
    stationId: "st_union_st",
    borough: "Brooklyn",
  },
  {
    placeId: "pl_unreachable",
    label: "Unreachable Place",
    kind: "poi",
  },
  {
    placeId: "pl_coverage_fail",
    label: "Coverage Fail Place",
    kind: "poi",
  },
  {
    placeId: "pl_data_unavailable",
    label: "Data Unavailable Place",
    kind: "poi",
  },
  {
    placeId: "pl_timeout",
    label: "Timeout Place",
    kind: "poi",
  },
];

export class FixtureDataAdapter implements DataAdapter {
  constructor(
    private readonly fixturesRoot: string,
    private readonly readyMode: AdapterReadyMode,
    private readonly permitDegradedReady: boolean,
  ) {}

  async getSnapshotHandle(): Promise<RoutingSnapshotHandle> {
    if (this.readyMode === "not_ready_static") {
      return {
        staticDatasetVersion: "",
        realtimeSnapshotId: null,
        dataMode: "unavailable",
        realtimeAgeSeconds: null,
        staticActivatedAt: null,
      };
    }
    if (this.readyMode === "degraded" || this.readyMode === "not_ready_realtime") {
      const status = readJsonFixture<StatusResponse>(
        this.fixturesRoot,
        "status/degraded.json",
      );
      return {
        staticDatasetVersion: status.staticDatasetVersion,
        realtimeSnapshotId: status.realtimeSnapshotId ?? null,
        dataMode: status.dataMode,
        realtimeAgeSeconds: status.realtimeAgeSeconds ?? null,
        staticActivatedAt: "2026-07-29T06:00:00.000Z",
      };
    }
    const status = readJsonFixture<StatusResponse>(
      this.fixturesRoot,
      "status/healthy.json",
    );
    return {
      staticDatasetVersion: status.staticDatasetVersion,
      realtimeSnapshotId: status.realtimeSnapshotId ?? null,
      dataMode: status.dataMode,
      realtimeAgeSeconds: status.realtimeAgeSeconds ?? null,
      staticActivatedAt: "2026-07-29T06:00:00.000Z",
    };
  }

  async listLines(): Promise<LinesResponse> {
    return readJsonFixture<LinesResponse>(
      this.fixturesRoot,
      "lines/subway-lines.json",
    );
  }

  async searchPlaces(input: {
    query: string;
    limit: number;
    proximityLat?: number;
    proximityLon?: number;
  }): Promise<PlaceSearchResponse> {
    // proximity is bias-only; intentionally unused in fixture mode (and never logged).
    void input.proximityLat;
    void input.proximityLon;

    const fixture = readJsonFixture<PlaceSearchResponse>(
      this.fixturesRoot,
      "places/place-search.json",
    );
    const catalog = this.buildCatalog(fixture.places);
    const q = input.query.trim().toLowerCase();
    const matched = catalog
      .filter((p) => p.label.toLowerCase().includes(q) || p.placeId.toLowerCase().includes(q))
      .slice(0, input.limit);

    return {
      contractVersion: CONTRACT_VERSION,
      query: input.query,
      places: matched.map((p) => stripPreciseCoordsForOptionalPrivacy(p)),
    };
  }

  async getStatus(): Promise<StatusResponse> {
    if (this.readyMode === "degraded" || this.readyMode === "not_ready_realtime") {
      return readJsonFixture<StatusResponse>(
        this.fixturesRoot,
        "status/degraded.json",
      );
    }
    if (this.readyMode === "not_ready_static") {
      return {
        contractVersion: CONTRACT_VERSION,
        dataMode: "unavailable",
        staticDatasetVersion: "",
        realtimeSnapshotId: null,
        realtimeAgeSeconds: null,
        degraded: true,
        messages: ["Static dataset missing."],
      };
    }
    return readJsonFixture<StatusResponse>(
      this.fixturesRoot,
      "status/healthy.json",
    );
  }

  async getReadiness(): Promise<AdapterReadiness> {
    if (this.readyMode === "not_ready_static") {
      return {
        staticOk: false,
        realtimeOk: false,
        degradedPermitted: this.permitDegradedReady,
        reasons: ["static_dataset_missing"],
        dataMode: "unavailable",
      };
    }
    if (this.readyMode === "not_ready_realtime") {
      return {
        staticOk: true,
        realtimeOk: false,
        degradedPermitted: false,
        reasons: ["realtime_unavailable"],
        dataMode: "stale",
      };
    }
    if (this.readyMode === "degraded") {
      return {
        staticOk: true,
        realtimeOk: false,
        degradedPermitted: this.permitDegradedReady,
        reasons: this.permitDegradedReady ? [] : ["realtime_stale"],
        dataMode: "stale",
      };
    }
    return {
      staticOk: true,
      realtimeOk: true,
      degradedPermitted: this.permitDegradedReady,
      reasons: [],
      dataMode: "synthetic",
    };
  }

  async resolvePlace(ref: {
    placeId?: string;
    stationId?: string;
  }): Promise<Place | null> {
    const fixture = readJsonFixture<PlaceSearchResponse>(
      this.fixturesRoot,
      "places/place-search.json",
    );
    const catalog = this.buildCatalog(fixture.places);
    if (ref.placeId) {
      return catalog.find((p) => p.placeId === ref.placeId) ?? null;
    }
    if (ref.stationId) {
      return catalog.find((p) => p.stationId === ref.stationId) ?? null;
    }
    return null;
  }

  async knownLineIds(): Promise<Set<string>> {
    const lines = await this.listLines();
    return new Set(lines.lines.map((l) => l.lineId));
  }

  private buildCatalog(fixturePlaces: Place[]): Place[] {
    const byId = new Map<string, Place>();
    for (const p of [...EXTRA_PLACES, ...fixturePlaces]) {
      byId.set(p.placeId, p);
    }
    return [...byId.values()];
  }
}

function stripPreciseCoordsForOptionalPrivacy(place: Place): Place {
  // Fixture place-search includes coords; public response may keep them for map pins.
  // Logging layer redacts; we leave response coords as in fixture catalog.
  return place;
}

export function dataModeFromReady(mode: AdapterReadyMode): DataMode {
  switch (mode) {
    case "degraded":
    case "not_ready_realtime":
      return "stale";
    case "not_ready_static":
      return "unavailable";
    default:
      return "synthetic";
  }
}
