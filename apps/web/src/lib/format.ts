import type {
  DataMode,
  Itinerary,
  Line,
  RealtimeConfidence,
} from "@/lib/contracts";
import { riderLineLabel } from "@/lib/line-display";

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** UX_SPEC tone: baseline difference vs fastest unconstrained option. */
export function formatBaselineDelta(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null) return null;
  const mins = Math.round(Math.abs(seconds) / 60);
  if (seconds === 0) return "Same arrival as fastest baseline";
  if (seconds > 0) {
    return `~${mins} min slower than fastest baseline`;
  }
  return `~${mins} min faster than fastest baseline`;
}

/** Per-card freshness/staleness from itinerary realtimeConfidence. */
export function formatCardFreshness(
  confidence: RealtimeConfidence | null | undefined,
): string | null {
  switch (confidence) {
    case "medium":
      return "Mixed live and schedule times";
    case "low":
      return "Live times uncertain for this route";
    case "none":
      return "Schedule times — no live updates on this route";
    case "high":
    default:
      return null;
  }
}

export function detectViewport(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "mobile";
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 767px)").matches
      ? "mobile"
      : "desktop";
  }
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function lineById(lines: Line[], id: string): Line | undefined {
  return lines.find((l) => l.lineId === id);
}

export function summarizeSelectedLines(
  lines: Line[],
  selectedIds: string[],
): string {
  if (selectedIds.length === 0) return "Any preferred lines";
  const labels = selectedIds.map((id) =>
    riderLineLabel(id, lineById(lines, id)),
  );
  if (labels.length === 1) return `Preferring the ${labels[0]}`;
  if (labels.length === 2) {
    return `Preferring the ${labels[0]} and ${labels[1]}`;
  }
  const last = labels[labels.length - 1];
  return `Preferring the ${labels.slice(0, -1).join(", ")}, and ${last}`;
}

export type DataModeNotice = {
  tone: "info" | "warning" | "demo";
  title: string;
  message: string;
};

export function dataModeNotice(mode: DataMode): DataModeNotice | null {
  switch (mode) {
    case "synthetic":
      return {
        tone: "demo",
        title: "Demo data",
        message:
          "These results use synthetic fixture data for development — not live train times.",
      };
    case "stale":
      return {
        tone: "warning",
        title: "Live times may be outdated",
        message:
          "Realtime updates are delayed. Treat arrival times as approximate.",
      };
    case "schedule_only":
      return {
        tone: "info",
        title: "Schedule only",
        message:
          "Showing schedule-based times. Live train updates are unavailable.",
      };
    case "unavailable":
      return {
        tone: "warning",
        title: "Service data unavailable",
        message: "Transit data is currently unavailable.",
      };
    case "live":
    default:
      return null;
  }
}

export function displayItineraries(
  response: {
    baseline: { itineraries: Itinerary[] };
    constrained: { itineraries: Itinerary[] };
  },
): { itineraries: Itinerary[]; source: "constrained" | "baseline" } {
  if (response.constrained.itineraries.length > 0) {
    return {
      itineraries: response.constrained.itineraries.slice(0, 3),
      source: "constrained",
    };
  }
  return {
    itineraries: response.baseline.itineraries.slice(0, 3),
    source: "baseline",
  };
}
