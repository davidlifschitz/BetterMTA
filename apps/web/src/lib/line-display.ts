import type { Line } from "@/lib/contracts";

/**
 * Rider-facing presentation for internal lineIds (ADR-0023).
 * Internal id `GS` stays `GS` in requests; UI shows **S**.
 */

const RIDER_OVERRIDES: Record<
  string,
  { label: string; displayName: string; aliases: string[] }
> = {
  GS: {
    label: "S",
    displayName: "S train (42 St Shuttle)",
    aliases: ["s", "shuttle", "42", "42st", "42 st", "grand central shuttle"],
  },
};

/** Canonical MTA gray for the 42 St Shuttle when catalog omits GS. */
export const GS_FALLBACK_LINE: Line = {
  lineId: "GS",
  label: "GS",
  displayName: "42 St Shuttle",
  color: "#808183",
  textColor: "#FFFFFF",
  isActive: true,
  gtfsRouteIds: ["GS"],
};

export function riderLineLabel(lineId: string, line?: Line | null): string {
  const override = RIDER_OVERRIDES[lineId.toUpperCase()];
  if (override) return override.label;
  return line?.label ?? lineId;
}

export function riderLineDisplayName(
  lineId: string,
  line?: Line | null,
): string {
  const override = RIDER_OVERRIDES[lineId.toUpperCase()];
  if (override) return override.displayName;
  return line?.displayName ?? lineId;
}

/** Present catalog lines with rider-facing labels (GS → S). */
export function presentLines(lines: Line[]): Line[] {
  return lines.map((line) => {
    const id = line.lineId.toUpperCase();
    const override = RIDER_OVERRIDES[id];
    if (!override) return line;
    return {
      ...line,
      label: override.label,
      displayName: override.displayName,
    };
  });
}

/** Ensure GS is available for picker demos when the catalog omits it. */
export function withShuttleLine(lines: Line[]): Line[] {
  if (lines.some((l) => l.lineId.toUpperCase() === "GS")) {
    return presentLines(lines);
  }
  return presentLines([...lines, GS_FALLBACK_LINE]);
}

export function formatLineIdList(
  ids: string[],
  lines: Line[],
  empty = "none",
): string {
  if (ids.length === 0) return empty;
  return ids
    .map((id) =>
      riderLineLabel(
        id,
        lines.find((l) => l.lineId === id),
      ),
    )
    .join(", ");
}

/** True when query matches a line id, label, display name, or GS alias "S". */
export function lineMatchesQuery(line: Line, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const id = line.lineId.toUpperCase();
  const override = RIDER_OVERRIDES[id];
  const tokens = [
    line.lineId.toLowerCase(),
    line.label.toLowerCase(),
    ...(override
      ? [override.label.toLowerCase(), ...override.aliases.map((a) => a.toLowerCase())]
      : []),
  ];
  if (tokens.some((t) => t === q || t.startsWith(q) || (t.length >= 2 && q.startsWith(t)))) {
    return true;
  }
  // Longer queries may match display names ("shuttle", "42 st").
  if (q.length >= 3) {
    const names = [line.displayName.toLowerCase()];
    if (override) names.push(override.displayName.toLowerCase());
    return names.some((n) => n.includes(q));
  }
  return false;
}
