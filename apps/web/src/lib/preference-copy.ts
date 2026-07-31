import type { ExplanationFact, Itinerary } from "@/lib/contracts";

/** Preferred-line product copy (ADR-0023) — not “required lines”. */

export const PREFERRED_LINES_ROW_LABEL = "Preferred lines";

export const PREFERRED_LINES_PICKER_TITLE = "Preferred lines";

export const PREFERRED_LINES_HINT =
  "We’ll maximize these preferences and add connecting lines when needed to complete the trip.";

export function completePreferenceBannerText(requestedCount: number): {
  title: string;
  body: string;
} {
  return {
    title: "Using your preferred lines",
    body:
      requestedCount === 1
        ? "This trip uses your preferred line."
        : `These options use all ${requestedCount} of your preferred lines.`,
  };
}

export function partialPreferenceBannerText(requestedCount: number): {
  title: string;
  body: string;
} {
  return {
    title: `Couldn’t use all preferences; best feasible.`,
    body:
      requestedCount > 0
        ? `No sensible route uses all ${requestedCount} preferred lines. These options use the most preferences while keeping the trip practical.`
        : "These options use the most preferences while keeping the trip practical.",
  };
}

export function hasConnectorFilled(
  facts: ExplanationFact[] | undefined,
): boolean {
  return Boolean(facts?.some((f) => f.type === "connector_filled"));
}

export function itineraryHasConnectorFilled(itinerary: Itinerary): boolean {
  return hasConnectorFilled(itinerary.explanation?.facts);
}

export function anyConnectorFilled(itineraries: Itinerary[]): boolean {
  return itineraries.some(itineraryHasConnectorFilled);
}

export const CONNECTOR_FILLED_BANNER =
  "Added connecting lines you didn’t select to complete the trip.";

export function satisfactionPillText(opts: {
  isComplete: boolean;
  satisfactionCount: number;
  requestedCount: number;
}): string {
  const { isComplete, satisfactionCount, requestedCount } = opts;
  if (requestedCount <= 0) return "";
  if (isComplete) {
    return requestedCount === 1
      ? "Uses your preference"
      : `Uses all ${requestedCount} preferences`;
  }
  return `${satisfactionCount} of ${requestedCount} preferences`;
}
