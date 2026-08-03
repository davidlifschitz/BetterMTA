import { createHash } from "node:crypto";
import type { Leg, TransitLeg } from "./types.ts";
import { transitLegsOf } from "./satisfaction.ts";

function transitKey(leg: TransitLeg): string {
  return [
    "t",
    leg.lineId,
    leg.tripId ?? "",
    leg.from.stationId ?? leg.from.stopId ?? leg.from.name,
    leg.to.stationId ?? leg.to.stopId ?? leg.to.name,
    leg.departTime,
    leg.arriveTime,
  ].join("|");
}

function walkKey(leg: Extract<Leg, { kind: "walk" }>): string {
  const parts = [
    "w",
    String(leg.durationSeconds),
    leg.outOfSystem ? "1" : "0",
  ];
  if (typeof leg.distanceMeters === "number") {
    parts.push(`d${leg.distanceMeters}`);
  }
  return parts.join("|");
}

/**
 * Stable fingerprint derived from itinerary content (legs + arrival + transfers + walking).
 * Independent of itineraryId and explanation text.
 * Always recompute from content — never trust provider-supplied fingerprints.
 */
export function fingerprintItinerary(input: {
  legs: readonly Leg[];
  arrivalTime: string;
  transferCount: number;
  walkingSeconds: number;
  durationSeconds: number;
}): string {
  const legKeys = input.legs.map((leg) =>
    leg.kind === "transit" ? transitKey(leg) : walkKey(leg),
  );
  const material = [
    input.arrivalTime,
    String(input.durationSeconds),
    String(input.transferCount),
    String(input.walkingSeconds),
    ...legKeys,
    ...transitLegsOf(input.legs).map((l) => l.lineId),
  ].join("\n");

  const digest = createHash("sha256").update(material, "utf8").digest("hex").slice(0, 24);
  return `fp_${digest}`;
}
