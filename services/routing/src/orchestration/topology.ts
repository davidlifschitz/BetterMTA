/**
 * Preferred-line topology hints for via/seed orchestration (ADR-0023).
 * Public NYC transfer hubs only — no private operator history.
 */

import { TOPOLOGY_PROXIMITY_METERS } from "./budgets.ts";

export interface TopologyStation {
  /** Stable BetterMTA-style station id (fixture / PlaceRef friendly). */
  stationId: string;
  label: string;
  lat: number;
  lon: number;
  /** Internal lineIds served at this hub (GS stays GS). */
  lineIds: readonly string[];
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PreferredLineTopology {
  /** Stations that serve the given preferred lineId. */
  stationsForLine(lineId: string): readonly TopologyStation[];
  /** All seeded hubs (deterministic order). */
  allStations(): readonly TopologyStation[];
}

/** Well-known subway lineIds used when building unpreferred route lists. */
export const KNOWN_SUBWAY_LINE_IDS: readonly string[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "R",
  "W",
  "Z",
  "GS",
  "FS",
  "H",
  "SI",
];

/**
 * Seeded Midtown / core-transfer hubs for via hints and sensibility checks.
 * Coordinates are public station centroids (approx).
 */
export const SEEDED_TRANSFER_HUBS: readonly TopologyStation[] = [
  {
    stationId: "st_grand_central_42",
    label: "Grand Central-42 St",
    lat: 40.7527,
    lon: -73.9772,
    lineIds: ["4", "5", "6", "7", "GS"],
  },
  {
    stationId: "st_times_sq_42",
    label: "Times Sq-42 St",
    lat: 40.7553,
    lon: -73.9874,
    lineIds: ["1", "2", "3", "7", "N", "Q", "R", "W", "GS"],
  },
  {
    stationId: "st_penn_34",
    label: "34 St-Penn Station",
    lat: 40.7506,
    lon: -73.9935,
    lineIds: ["1", "2", "3", "A", "C", "E"],
  },
  {
    stationId: "st_bryant_42",
    label: "42 St-Bryant Park",
    lat: 40.7542,
    lon: -73.9846,
    lineIds: ["B", "D", "F", "M", "7"],
  },
  {
    stationId: "st_herald_sq",
    label: "34 St-Herald Sq",
    lat: 40.7496,
    lon: -73.9879,
    lineIds: ["B", "D", "F", "M", "N", "Q", "R", "W"],
  },
  {
    stationId: "st_union_sq",
    label: "14 St-Union Sq",
    lat: 40.7357,
    lon: -73.9906,
    lineIds: ["4", "5", "6", "L", "N", "Q", "R", "W"],
  },
  {
    stationId: "st_fulton",
    label: "Fulton St",
    lat: 40.7094,
    lon: -74.0083,
    lineIds: ["2", "3", "4", "5", "A", "C", "J", "Z"],
  },
  {
    stationId: "st_atl_barclays",
    label: "Atlantic Av-Barclays Ctr",
    lat: 40.6844,
    lon: -73.9778,
    lineIds: ["2", "3", "4", "5", "B", "D", "N", "Q", "R"],
  },
];

export function createSeededTopology(
  hubs: readonly TopologyStation[] = SEEDED_TRANSFER_HUBS,
): PreferredLineTopology {
  const byLine = new Map<string, TopologyStation[]>();
  for (const hub of hubs) {
    for (const lineId of hub.lineIds) {
      const list = byLine.get(lineId) ?? [];
      list.push(hub);
      byLine.set(lineId, list);
    }
  }
  return {
    stationsForLine(lineId: string) {
      return byLine.get(lineId) ?? [];
    },
    allStations() {
      return hubs;
    },
  };
}

const DEFAULT_TOPOLOGY = createSeededTopology();

export function defaultPreferredLineTopology(): PreferredLineTopology {
  return DEFAULT_TOPOLOGY;
}

/** Haversine distance in meters. */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when at least one preferred line has a seeded hub near origin, destination,
 * or the OD corridor — topology would allow preference-covering candidates.
 */
export function isTopologicallySensible(input: {
  preferredLineIds: readonly string[];
  origin: LatLon;
  destination: LatLon;
  topology?: PreferredLineTopology;
  proximityMeters?: number;
}): boolean {
  const topology = input.topology ?? DEFAULT_TOPOLOGY;
  const radius = input.proximityMeters ?? TOPOLOGY_PROXIMITY_METERS;
  if (input.preferredLineIds.length === 0) return false;

  for (const lineId of input.preferredLineIds) {
    for (const hub of topology.stationsForLine(lineId)) {
      if (haversineMeters(input.origin, hub) <= radius) return true;
      if (haversineMeters(input.destination, hub) <= radius) return true;
      if (onCorridor(input.origin, input.destination, hub, radius)) return true;
    }
  }
  return false;
}

function onCorridor(
  origin: LatLon,
  destination: LatLon,
  hub: LatLon,
  slackMeters: number,
): boolean {
  const od = haversineMeters(origin, destination);
  if (od < 1) return false;
  const via = haversineMeters(origin, hub) + haversineMeters(hub, destination);
  return via <= od + slackMeters;
}

/**
 * Pick deterministic via hubs for preferred lines near the OD corridor.
 * Stable sort: lineId asc, then stationId asc; unique by stationId.
 */
export function selectViaStations(input: {
  preferredLineIds: readonly string[];
  origin: LatLon;
  destination: LatLon;
  maxVias: number;
  topology?: PreferredLineTopology;
}): TopologyStation[] {
  const topology = input.topology ?? DEFAULT_TOPOLOGY;
  const scored: Array<{ hub: TopologyStation; score: number; lineId: string }> =
    [];

  const lines = [...input.preferredLineIds].sort((a, b) => a.localeCompare(b));
  for (const lineId of lines) {
    for (const hub of topology.stationsForLine(lineId)) {
      const detour =
        haversineMeters(input.origin, hub) +
        haversineMeters(hub, input.destination) -
        haversineMeters(input.origin, input.destination);
      scored.push({ hub, score: detour, lineId });
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.lineId !== b.lineId) return a.lineId.localeCompare(b.lineId);
    return a.hub.stationId.localeCompare(b.hub.stationId);
  });

  const out: TopologyStation[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (seen.has(row.hub.stationId)) continue;
    // Skip vias essentially at origin/destination (±80m).
    if (haversineMeters(input.origin, row.hub) < 80) continue;
    if (haversineMeters(input.destination, row.hub) < 80) continue;
    seen.add(row.hub.stationId);
    out.push(row.hub);
    if (out.length >= input.maxVias) break;
  }
  return out;
}

/** Default MTA subway feed-scoped route id for a BetterMTA lineId. */
export function defaultLineIdToGtfsRouteIds(lineId: string): string[] {
  return [`MTASBWY:${lineId}`];
}

/**
 * GTFS route ids to mark unpreferred: all known subway lines except preferred.
 * Connectors stay available (soft penalty only).
 */
export function unpreferredGtfsRouteIds(input: {
  preferredLineIds: readonly string[];
  lineIdToGtfsRouteIds?: (lineId: string) => string[];
  knownLineIds?: readonly string[];
}): string[] {
  const map = input.lineIdToGtfsRouteIds ?? defaultLineIdToGtfsRouteIds;
  const known = input.knownLineIds ?? KNOWN_SUBWAY_LINE_IDS;
  const preferred = new Set(input.preferredLineIds);
  const routes: string[] = [];
  const seen = new Set<string>();
  for (const lineId of known) {
    if (preferred.has(lineId)) continue;
    for (const routeId of map(lineId)) {
      if (seen.has(routeId)) continue;
      seen.add(routeId);
      routes.push(routeId);
    }
  }
  routes.sort((a, b) => a.localeCompare(b));
  return routes;
}
