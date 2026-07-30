import type { LineMappingEntry, QuarantinedRoute } from "./types.js";

/**
 * Stable product lineId catalog for NYC subway.
 * Mapping is versioned with the static dataset (DATA_CONTRACT §6).
 *
 * Shuttle handling:
 * - GS (42nd Street Shuttle) → lineId "GS"
 * - FS (Franklin Ave Shuttle) → lineId "FS"
 * - H (Rockaway Park Shuttle) → lineId "H"
 * - SI / SIR → lineId "SIR"
 *
 * Unknown route_ids are quarantined — never crash ingestion.
 */

export const CANONICAL_LINE_COLORS: Record<
  string,
  { color: string; textColor: string; displayName: string }
> = {
  "1": { color: "#EE352E", textColor: "#FFFFFF", displayName: "1 train" },
  "2": { color: "#EE352E", textColor: "#FFFFFF", displayName: "2 train" },
  "3": { color: "#EE352E", textColor: "#FFFFFF", displayName: "3 train" },
  "4": { color: "#00933C", textColor: "#FFFFFF", displayName: "4 train" },
  "5": { color: "#00933C", textColor: "#FFFFFF", displayName: "5 train" },
  "6": { color: "#00933C", textColor: "#FFFFFF", displayName: "6 train" },
  "7": { color: "#B933AD", textColor: "#FFFFFF", displayName: "7 train" },
  A: { color: "#0039A6", textColor: "#FFFFFF", displayName: "A train" },
  B: { color: "#FF6319", textColor: "#FFFFFF", displayName: "B train" },
  C: { color: "#0039A6", textColor: "#FFFFFF", displayName: "C train" },
  D: { color: "#FF6319", textColor: "#FFFFFF", displayName: "D train" },
  E: { color: "#0039A6", textColor: "#FFFFFF", displayName: "E train" },
  F: { color: "#FF6319", textColor: "#FFFFFF", displayName: "F train" },
  G: { color: "#6CBE45", textColor: "#FFFFFF", displayName: "G train" },
  J: { color: "#996633", textColor: "#FFFFFF", displayName: "J train" },
  L: { color: "#A7A9AC", textColor: "#000000", displayName: "L train" },
  M: { color: "#FF6319", textColor: "#FFFFFF", displayName: "M train" },
  N: { color: "#FCCC0A", textColor: "#000000", displayName: "N train" },
  Q: { color: "#FCCC0A", textColor: "#000000", displayName: "Q train" },
  R: { color: "#FCCC0A", textColor: "#000000", displayName: "R train" },
  W: { color: "#FCCC0A", textColor: "#000000", displayName: "W train" },
  Z: { color: "#996633", textColor: "#FFFFFF", displayName: "Z train" },
  GS: {
    color: "#6D6E71",
    textColor: "#FFFFFF",
    displayName: "42nd Street Shuttle",
  },
  FS: {
    color: "#6D6E71",
    textColor: "#FFFFFF",
    displayName: "Franklin Avenue Shuttle",
  },
  H: {
    color: "#6D6E71",
    textColor: "#FFFFFF",
    displayName: "Rockaway Park Shuttle",
  },
  SIR: {
    color: "#0039A6",
    textColor: "#FFFFFF",
    displayName: "Staten Island Railway",
  },
};

/** Explicit GTFS route_id → lineId overrides (shuttles + aliases). */
const ROUTE_ID_OVERRIDES: Record<string, string> = {
  GS: "GS",
  FS: "FS",
  H: "H",
  SI: "SIR",
  SIR: "SIR",
  // Occasional MTA variants seen historically
  "6X": "6",
  "7X": "7",
  FX: "F",
};

const KNOWN_LINE_IDS = new Set(Object.keys(CANONICAL_LINE_COLORS));

export interface LineMappingResult {
  mappings: LineMappingEntry[];
  quarantined: QuarantinedRoute[];
}

/**
 * Map GTFS routes to stable product lineIds.
 * Quarantines unknowns instead of throwing.
 */
export function mapRoutesToLineIds(
  routes: Array<{
    routeId: string;
    routeShortName: string;
    routeLongName: string;
    routeColor: string;
    routeTextColor: string;
  }>,
): LineMappingResult {
  const mappings: LineMappingEntry[] = [];
  const quarantined: QuarantinedRoute[] = [];

  for (const route of routes) {
    const lineId =
      ROUTE_ID_OVERRIDES[route.routeId] ??
      (KNOWN_LINE_IDS.has(route.routeId)
        ? route.routeId
        : KNOWN_LINE_IDS.has(route.routeShortName)
          ? route.routeShortName
          : null);

    if (!lineId) {
      quarantined.push({
        gtfsRouteId: route.routeId,
        reason: "unknown_route_id",
      });
      continue;
    }

    const canonical = CANONICAL_LINE_COLORS[lineId];
    const isShuttle = lineId === "GS" || lineId === "FS" || lineId === "H";

    mappings.push({
      gtfsRouteId: route.routeId,
      lineId,
      label: lineId === "SIR" ? "SIR" : lineId,
      displayName: canonical?.displayName ?? (route.routeLongName || lineId),
      color: canonical?.color ?? `#${route.routeColor || "000000"}`,
      textColor: canonical?.textColor ?? `#${route.routeTextColor || "FFFFFF"}`,
      isShuttle,
    });
  }

  return { mappings, quarantined };
}

export function resolveLineId(
  gtfsRouteId: string,
  mapping: LineMappingEntry[],
): string | null {
  const hit = mapping.find((m) => m.gtfsRouteId === gtfsRouteId);
  return hit?.lineId ?? null;
}
