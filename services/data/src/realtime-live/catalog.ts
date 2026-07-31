/**
 * Station / line catalogs derived from the active static dataset.
 */

import { resolveLineId } from "../line-mapping.js";
import type { LineMappingEntry, StaticDataset } from "../types.js";

export interface CatalogLine {
  lineId: string;
  label: string;
  displayName: string;
  color: string;
  textColor: string;
  gtfsRouteIds: string[];
  isShuttle: boolean;
}

export interface CatalogStation {
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  lineIds: string[];
  complexId?: string;
}

/**
 * Map active static line mapping to BetterMTA lineIds.
 * Includes GS / FS / H / SI→SIR via line-mapping overrides.
 */
export function buildLineCatalog(dataset: StaticDataset): CatalogLine[] {
  const byLine = new Map<string, CatalogLine>();
  for (const m of dataset.lineMapping) {
    const existing = byLine.get(m.lineId);
    if (existing) {
      if (!existing.gtfsRouteIds.includes(m.gtfsRouteId)) {
        existing.gtfsRouteIds.push(m.gtfsRouteId);
      }
      continue;
    }
    byLine.set(m.lineId, {
      lineId: m.lineId,
      label: m.label,
      displayName: m.displayName,
      color: m.color,
      textColor: m.textColor,
      gtfsRouteIds: [m.gtfsRouteId],
      isShuttle: m.isShuttle,
    });
  }
  return [...byLine.values()].sort((a, b) =>
    a.lineId.localeCompare(b.lineId),
  );
}

/**
 * Station/complex catalog for place search.
 * Parent stations (location_type=1) are preferred; otherwise standalone stops.
 * Line membership inferred from stop_times → trips → routes → lineIds.
 * complexId: parent_station id when present, else transfer-connected component.
 */
export function buildStationCatalog(dataset: StaticDataset): CatalogStation[] {
  const mapping = dataset.lineMapping;
  const tripRoute = new Map(
    dataset.trips.map((t) => [t.tripId, t.routeId] as const),
  );
  const stopLineIds = new Map<string, Set<string>>();

  for (const st of dataset.stopTimes) {
    const routeId = tripRoute.get(st.tripId);
    if (!routeId) continue;
    const lineId = resolveLineId(routeId, mapping) ?? routeId;
    let set = stopLineIds.get(st.stopId);
    if (!set) {
      set = new Set();
      stopLineIds.set(st.stopId, set);
    }
    set.add(lineId);
  }

  // Propagate child stop lines up to parents
  for (const stop of dataset.stops) {
    if (stop.parentStation) {
      const childLines = stopLineIds.get(stop.stopId);
      if (!childLines) continue;
      let parentSet = stopLineIds.get(stop.parentStation);
      if (!parentSet) {
        parentSet = new Set();
        stopLineIds.set(stop.parentStation, parentSet);
      }
      for (const l of childLines) parentSet.add(l);
    }
  }

  // Transfer-based complex grouping (union-find lite)
  const parentOf = new Map<string, string>();
  const find = (id: string): string => {
    let cur = id;
    while (parentOf.get(cur) && parentOf.get(cur) !== cur) {
      cur = parentOf.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parentOf.set(ra, rb);
  };
  for (const stop of dataset.stops) {
    const id = stop.parentStation || stop.stopId;
    if (!parentOf.has(id)) parentOf.set(id, id);
  }
  for (const t of dataset.transfers) {
    const a =
      dataset.stops.find((s) => s.stopId === t.fromStopId)?.parentStation ||
      t.fromStopId;
    const b =
      dataset.stops.find((s) => s.stopId === t.toStopId)?.parentStation ||
      t.toStopId;
    union(a, b);
  }

  const stations: CatalogStation[] = [];
  const parents = dataset.stops.filter((s) => s.locationType === 1);
  const useStops =
    parents.length > 0
      ? parents
      : dataset.stops.filter((s) => !s.parentStation);

  for (const stop of useStops) {
    const lines = [...(stopLineIds.get(stop.stopId) ?? [])].sort();
    const complexRoot = find(stop.stopId);
    stations.push({
      stationId: stop.stopId,
      name: stop.stopName,
      lat: stop.stopLat,
      lon: stop.stopLon,
      lineIds: lines,
      complexId: complexRoot !== stop.stopId ? complexRoot : stop.stopId,
    });
  }

  return stations.sort((a, b) => a.stationId.localeCompare(b.stationId));
}

export type { LineMappingEntry };
