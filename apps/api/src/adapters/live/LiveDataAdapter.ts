import { CONTRACT_VERSION } from "../../constants.js";
import type { Logger } from "../../logging/logger.js";
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
import { DataUnavailableError } from "./errors.js";
import { SwrTtlCache } from "./swrCache.js";

export interface InternalStatusBody {
  staticVersionId: string | null;
  activeSince: string | null;
  realtime: {
    snapshotId: string;
    dataMode: string;
    ageSeconds: number | null;
    perFeed?: Record<string, unknown>;
  } | null;
  ready: boolean;
}

export interface InternalCatalogLine {
  lineId: string;
  label: string;
  displayName: string;
  color: string;
  textColor: string;
  gtfsRouteIds: string[];
  isShuttle: boolean;
}

export interface InternalCatalogStation {
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  lineIds: string[];
  complexId?: string;
}

export interface LiveDataAdapterOptions {
  baseUrl: string;
  token?: string | null;
  statusTtlMs: number;
  catalogTtlMs: number;
  permitDegradedReady: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Logger;
}

type LinesCatalogPayload = {
  staticVersionId: string;
  lines: InternalCatalogLine[];
};

type StationsCatalogPayload = {
  staticVersionId: string;
  stations: InternalCatalogStation[];
};

export class LiveDataAdapter implements DataAdapter {
  private readonly baseUrl: string;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly permitDegradedReady: boolean;
  private readonly logger?: Logger;
  private readonly statusCache: SwrTtlCache<InternalStatusBody>;
  private readonly linesCache: SwrTtlCache<LinesCatalogPayload>;
  private readonly stationsCache: SwrTtlCache<StationsCatalogPayload>;
  /** True once catalogs have loaded successfully at least once. */
  private catalogsLoaded = false;
  private unreachable = false;

  constructor(opts: LiveDataAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token ?? null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.permitDegradedReady = opts.permitDegradedReady;
    this.logger = opts.logger;
    this.statusCache = new SwrTtlCache(opts.statusTtlMs, this.now);
    this.linesCache = new SwrTtlCache(opts.catalogTtlMs, this.now);
    this.stationsCache = new SwrTtlCache(opts.catalogTtlMs, this.now);
  }

  /** Test helper: inspect TTL cache without network. */
  getStatusCache(): SwrTtlCache<InternalStatusBody> {
    return this.statusCache;
  }

  getLinesCache(): SwrTtlCache<LinesCatalogPayload> {
    return this.linesCache;
  }

  getStationsCache(): SwrTtlCache<StationsCatalogPayload> {
    return this.stationsCache;
  }

  async getSnapshotHandle(): Promise<RoutingSnapshotHandle> {
    try {
      const status = await this.fetchStatus();
      return snapshotFromStatus(status);
    } catch {
      this.unreachable = true;
      return {
        staticDatasetVersion: "",
        realtimeSnapshotId: null,
        dataMode: "unavailable",
        realtimeAgeSeconds: null,
        staticActivatedAt: null,
      };
    }
  }

  async listLines(): Promise<LinesResponse> {
    const catalog = await this.requireLinesCatalog();
    return {
      contractVersion: CONTRACT_VERSION,
      staticDatasetVersion: catalog.staticVersionId,
      lines: catalog.lines.map((l) => ({
        lineId: l.lineId,
        label: l.label,
        displayName: l.displayName,
        color: l.color,
        textColor: l.textColor,
        isActive: true,
        gtfsRouteIds: l.gtfsRouteIds,
      })),
    };
  }

  async searchPlaces(input: {
    query: string;
    limit: number;
    proximityLat?: number;
    proximityLon?: number;
  }): Promise<PlaceSearchResponse> {
    const catalog = await this.requireStationsCatalog();
    const places = searchStations(catalog.stations, input);
    return {
      contractVersion: CONTRACT_VERSION,
      query: input.query,
      places,
    };
  }

  async getStatus(): Promise<StatusResponse> {
    try {
      const status = await this.fetchStatus();
      this.unreachable = false;
      return statusResponseFromInternal(status);
    } catch {
      this.unreachable = true;
      return {
        contractVersion: CONTRACT_VERSION,
        dataMode: "unavailable",
        staticDatasetVersion: "",
        realtimeSnapshotId: null,
        realtimeAgeSeconds: null,
        degraded: true,
        messages: ["Data service unreachable."],
      };
    }
  }

  async getReadiness(): Promise<AdapterReadiness> {
    try {
      const status = await this.fetchStatus();
      this.unreachable = false;
      // Ensure catalogs are warm for readiness = ready AND catalogs loaded.
      try {
        await Promise.all([
          this.requireLinesCatalog(),
          this.requireStationsCatalog(),
        ]);
      } catch {
        return {
          staticOk: false,
          realtimeOk: false,
          degradedPermitted: this.permitDegradedReady,
          reasons: ["catalog_unavailable"],
          dataMode: "unavailable",
        };
      }

      const staticOk = Boolean(status.ready && status.staticVersionId);
      const dataMode = coerceDataMode(
        status.realtime?.dataMode,
        staticOk,
      );
      const realtimeOk =
        dataMode === "live" || dataMode === "synthetic";
      const reasons: string[] = [];
      if (!staticOk) reasons.push("static_dataset_missing");
      if (!realtimeOk) {
        if (dataMode === "stale") reasons.push("realtime_stale");
        else if (dataMode === "schedule_only")
          reasons.push("realtime_schedule_only");
        else if (dataMode === "unavailable")
          reasons.push("realtime_unavailable");
      }
      if (!this.catalogsLoaded) reasons.push("catalog_unavailable");

      return {
        staticOk: staticOk && this.catalogsLoaded,
        realtimeOk,
        degradedPermitted: this.permitDegradedReady,
        reasons,
        dataMode,
      };
    } catch {
      this.unreachable = true;
      return {
        staticOk: false,
        realtimeOk: false,
        degradedPermitted: this.permitDegradedReady,
        reasons: ["data_service_unreachable"],
        dataMode: "unavailable",
      };
    }
  }

  async resolvePlace(ref: {
    placeId?: string;
    stationId?: string;
  }): Promise<Place | null> {
    try {
      const catalog = await this.requireStationsCatalog();
      const stations = catalog.stations;
      if (ref.stationId) {
        const st = stations.find((s) => s.stationId === ref.stationId);
        return st ? stationToPlace(st) : null;
      }
      if (ref.placeId) {
        const byStation = stations.find((s) => s.stationId === ref.placeId);
        if (byStation) return stationToPlace(byStation);
        const byPlaceId = stations.find(
          (s) => placeIdForStation(s.stationId) === ref.placeId,
        );
        return byPlaceId ? stationToPlace(byPlaceId) : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async knownLineIds(): Promise<Set<string>> {
    const catalog = await this.requireLinesCatalog();
    return new Set(catalog.lines.map((l) => l.lineId));
  }

  /** gtfsRouteId → BetterMTA lineId for OTP candidate provider. */
  async buildRouteIdToLineId(): Promise<
    (gtfsRouteId: string) => string | null
  > {
    const catalog = await this.requireLinesCatalog();
    const map = new Map<string, string>();
    for (const line of catalog.lines) {
      for (const routeId of line.gtfsRouteIds) {
        map.set(routeId, line.lineId);
      }
    }
    return (gtfsRouteId: string) => map.get(gtfsRouteId) ?? null;
  }

  isUnreachable(): boolean {
    return this.unreachable;
  }

  private async requireLinesCatalog(): Promise<LinesCatalogPayload> {
    try {
      const catalog = await this.linesCache.get(() =>
        this.getJson<LinesCatalogPayload>("/internal/catalog/lines"),
      );
      this.catalogsLoaded = true;
      this.unreachable = false;
      return catalog;
    } catch (err) {
      this.unreachable = true;
      throw new DataUnavailableError(
        err instanceof Error
          ? `Line catalog unavailable: ${err.message}`
          : "Line catalog unavailable.",
      );
    }
  }

  private async requireStationsCatalog(): Promise<StationsCatalogPayload> {
    try {
      const catalog = await this.stationsCache.get(() =>
        this.getJson<StationsCatalogPayload>("/internal/catalog/stations"),
      );
      this.catalogsLoaded = true;
      this.unreachable = false;
      return catalog;
    } catch (err) {
      this.unreachable = true;
      throw new DataUnavailableError(
        err instanceof Error
          ? `Station catalog unavailable: ${err.message}`
          : "Station catalog unavailable.",
      );
    }
  }

  private async fetchStatus(): Promise<InternalStatusBody> {
    return this.statusCache.get(() =>
      this.getJson<InternalStatusBody>("/internal/status"),
    );
  }

  private async getJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers,
      });
    } catch (err) {
      this.logger?.warn("data_internal_fetch_failed", {
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    if (!res.ok) {
      throw new Error(`GET ${path} → ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

function coerceDataMode(
  raw: string | undefined,
  staticOk: boolean,
): DataMode {
  if (!staticOk) return "unavailable";
  switch (raw) {
    case "live":
    case "schedule_only":
    case "stale":
    case "synthetic":
    case "unavailable":
      return raw;
    default:
      return raw ? "schedule_only" : "schedule_only";
  }
}

function snapshotFromStatus(status: InternalStatusBody): RoutingSnapshotHandle {
  const staticOk = Boolean(status.ready && status.staticVersionId);
  const dataMode = coerceDataMode(status.realtime?.dataMode, staticOk);
  return {
    staticDatasetVersion: status.staticVersionId ?? "",
    realtimeSnapshotId: status.realtime?.snapshotId ?? null,
    dataMode: staticOk ? dataMode : "unavailable",
    realtimeAgeSeconds: status.realtime?.ageSeconds ?? null,
    staticActivatedAt: status.activeSince,
  };
}

function statusResponseFromInternal(status: InternalStatusBody): StatusResponse {
  const staticOk = Boolean(status.ready && status.staticVersionId);
  const dataMode = coerceDataMode(status.realtime?.dataMode, staticOk);
  const degraded =
    !staticOk ||
    dataMode === "stale" ||
    dataMode === "schedule_only" ||
    dataMode === "unavailable";
  const messages: string[] = [];
  if (!staticOk) messages.push("Static dataset not active.");
  if (dataMode === "stale") messages.push("Realtime feeds are stale.");
  if (dataMode === "schedule_only")
    messages.push("Serving schedule-only estimates.");
  if (dataMode === "unavailable") messages.push("Transit data unavailable.");
  return {
    contractVersion: CONTRACT_VERSION,
    dataMode: staticOk ? dataMode : "unavailable",
    staticDatasetVersion: status.staticVersionId ?? "",
    realtimeSnapshotId: status.realtime?.snapshotId ?? null,
    realtimeAgeSeconds: status.realtime?.ageSeconds ?? null,
    degraded,
    messages,
  };
}

export function placeIdForStation(stationId: string): string {
  return `st:${stationId}`;
}

export function stationToPlace(st: InternalCatalogStation): Place {
  return {
    placeId: placeIdForStation(st.stationId),
    label: st.name,
    kind: "station",
    stationId: st.stationId,
    lat: st.lat,
    lon: st.lon,
  };
}

/** Diacritic-fold + lowercase for place search. */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

type MatchRank = 0 | 1 | 2;

/**
 * Rank: prefix (0) > word-boundary (1) > substring (2).
 * Then alphabetic by label. Optional proximity as tertiary bias.
 */
export function searchStations(
  stations: InternalCatalogStation[],
  input: {
    query: string;
    limit: number;
    proximityLat?: number;
    proximityLon?: number;
  },
): Place[] {
  const q = normalizeSearchText(input.query);
  if (!q) return [];

  type Scored = {
    place: Place;
    rank: MatchRank;
    labelNorm: string;
    dist: number;
  };

  const scored: Scored[] = [];
  for (const st of stations) {
    const labelNorm = normalizeSearchText(st.name);
    const idNorm = normalizeSearchText(st.stationId);
    const rank = bestMatchRank(q, labelNorm, idNorm);
    if (rank === null) continue;
    const dist =
      input.proximityLat !== undefined && input.proximityLon !== undefined
        ? haversineMeters(
            input.proximityLat,
            input.proximityLon,
            st.lat,
            st.lon,
          )
        : Number.POSITIVE_INFINITY;
    scored.push({
      place: stationToPlace(st),
      rank,
      labelNorm,
      dist,
    });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (
      input.proximityLat !== undefined &&
      Number.isFinite(a.dist) &&
      Number.isFinite(b.dist) &&
      a.dist !== b.dist
    ) {
      return a.dist - b.dist;
    }
    return a.labelNorm.localeCompare(b.labelNorm);
  });

  return scored.slice(0, input.limit).map((s) => s.place);
}

function bestMatchRank(
  q: string,
  labelNorm: string,
  idNorm: string,
): MatchRank | null {
  const candidates = [labelNorm, idNorm];
  let best: MatchRank | null = null;
  for (const text of candidates) {
    if (!text.includes(q)) continue;
    let rank: MatchRank;
    if (text.startsWith(q)) rank = 0;
    else if (wordBoundaryMatch(text, q)) rank = 1;
    else rank = 2;
    if (best === null || rank < best) best = rank;
  }
  return best;
}

function wordBoundaryMatch(text: string, q: string): boolean {
  // Match at start of a whitespace/punct-delimited token.
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}`,
    "u",
  );
  return re.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
