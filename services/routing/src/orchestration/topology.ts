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
 * Seeded citywide transfer hubs for via hints and sensibility checks.
 * Public station centroids (approx). Incomplete by design — lines with
 * zero seeded hubs fail closed to "sensible" inside the NYC service area
 * so ADR-0023 does not silently disable coverage exhaustion outside Midtown.
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
  {
    stationId: "st_columbus_circle",
    label: "59 St-Columbus Circle",
    lat: 40.7681,
    lon: -73.9819,
    lineIds: ["1", "A", "B", "C", "D"],
  },
  {
    stationId: "st_court_sq",
    label: "Court Sq",
    lat: 40.7472,
    lon: -73.9451,
    lineIds: ["7", "E", "G", "M"],
  },
  {
    stationId: "st_jackson_hts",
    label: "Jackson Hts-Roosevelt Av",
    lat: 40.7466,
    lon: -73.8913,
    lineIds: ["7", "E", "F", "M", "R"],
  },
  {
    stationId: "st_forest_hills",
    label: "Forest Hills-71 Av",
    lat: 40.7216,
    lon: -73.8448,
    lineIds: ["E", "F", "M", "R"],
  },
  {
    stationId: "st_astoria_ditmars",
    label: "Astoria-Ditmars Blvd",
    lat: 40.775,
    lon: -73.912,
    lineIds: ["N", "W"],
  },
  {
    stationId: "st_queensboro_plaza",
    label: "Queensboro Plaza",
    lat: 40.7506,
    lon: -73.9402,
    lineIds: ["7", "N", "W"],
  },
  {
    stationId: "st_149_grand_concourse",
    label: "149 St-Grand Concourse",
    lat: 40.8183,
    lon: -73.9271,
    lineIds: ["2", "4", "5"],
  },
  {
    stationId: "st_yankee_stadium",
    label: "161 St-Yankee Stadium",
    lat: 40.8279,
    lon: -73.9258,
    lineIds: ["4", "B", "D"],
  },
  {
    stationId: "st_jamaica_center",
    label: "Jamaica Center-Parsons/Archer",
    lat: 40.7021,
    lon: -73.8011,
    lineIds: ["E", "J", "Z"],
  },
  {
    stationId: "st_coney_stillwell",
    label: "Coney Island-Stillwell Av",
    lat: 40.5773,
    lon: -73.9812,
    lineIds: ["D", "F", "N", "Q"],
  },
  {
    stationId: "st_broadway_junction",
    label: "Broadway Junction",
    lat: 40.6789,
    lon: -73.9046,
    lineIds: ["A", "C", "J", "L", "Z"],
  },
  {
    stationId: "st_bedford_nostrand",
    label: "Bedford-Nostrand Avs",
    lat: 40.6896,
    lon: -73.9538,
    lineIds: ["G"],
  },
  {
    stationId: "st_st_george",
    label: "St George",
    lat: 40.6437,
    lon: -74.0734,
    lineIds: ["SI"],
  },
  {
    stationId: "st_broad_channel",
    label: "Broad Channel",
    lat: 40.6084,
    lon: -73.816,
    lineIds: ["A", "H"],
  },
  {
    stationId: "st_franklin_av",
    label: "Franklin Av",
    lat: 40.6707,
    lon: -73.9581,
    lineIds: ["FS", "2", "3", "4", "5"],
  },
];

/** Rough NYC subway service bbox (includes SI / Rockaways margins). */
const NYC_SERVICE_BBOX = {
  minLat: 40.49,
  maxLat: 40.92,
  minLon: -74.26,
  maxLon: -73.68,
};

export function withinNycServiceArea(point: LatLon): boolean {
  return (
    point.lat >= NYC_SERVICE_BBOX.minLat &&
    point.lat <= NYC_SERVICE_BBOX.maxLat &&
    point.lon >= NYC_SERVICE_BBOX.minLon &&
    point.lon <= NYC_SERVICE_BBOX.maxLon
  );
}

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
 * True when preferred lines could reasonably cover this OD under seeded topology.
 *
 * Rules (ADR-0023 fail-closed):
 * 1. Hub near origin, destination, or OD corridor → sensible.
 * 2. Preferred line has **zero** seeded hubs (incomplete seed) and OD is in the
 *    NYC service area → treat as sensible so coverage exhaustion still fires
 *    outside Midtown instead of silent 0-of-N.
 * 3. Preferred line has hubs but none near OD (e.g. SI for Midtown→Penn) → not sensible.
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

  const odInService =
    withinNycServiceArea(input.origin) &&
    withinNycServiceArea(input.destination);
  const known = new Set(KNOWN_SUBWAY_LINE_IDS);

  let incompleteKnownLine = false;
  for (const lineId of input.preferredLineIds) {
    const hubs = topology.stationsForLine(lineId);
    if (hubs.length === 0) {
      if (known.has(lineId)) incompleteKnownLine = true;
      continue;
    }
    for (const hub of hubs) {
      if (haversineMeters(input.origin, hub) <= radius) return true;
      if (haversineMeters(input.destination, hub) <= radius) return true;
      if (onCorridor(input.origin, input.destination, hub, radius)) return true;
    }
  }

  // Incomplete seed for a known subway preference: fail closed inside NYC.
  return incompleteKnownLine && odInService;
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
 * Prefer hubs serving more requested lines, then smaller OD detour, then station id.
 */
export function selectViaStations(input: {
  preferredLineIds: readonly string[];
  origin: LatLon;
  destination: LatLon;
  maxVias: number;
  topology?: PreferredLineTopology;
}): TopologyStation[] {
  const topology = input.topology ?? DEFAULT_TOPOLOGY;
  const scored: Array<{
    hub: TopologyStation;
    score: number;
    preferredCoverage: number;
  }> = [];
  const preferred = new Set(input.preferredLineIds);
  const seenCandidates = new Set<string>();

  const lines = [...input.preferredLineIds].sort((a, b) => a.localeCompare(b));
  for (const lineId of lines) {
    for (const hub of topology.stationsForLine(lineId)) {
      if (seenCandidates.has(hub.stationId)) continue;
      seenCandidates.add(hub.stationId);
      const detour =
        haversineMeters(input.origin, hub) +
        haversineMeters(hub, input.destination) -
        haversineMeters(input.origin, input.destination);
      const preferredCoverage = hub.lineIds.filter((id) => preferred.has(id)).length;
      scored.push({ hub, score: detour, preferredCoverage });
    }
  }

  scored.sort((a, b) => {
    if (a.preferredCoverage !== b.preferredCoverage) {
      return b.preferredCoverage - a.preferredCoverage;
    }
    if (a.score !== b.score) return a.score - b.score;
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
