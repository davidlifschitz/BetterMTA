import type { Leg, RawCandidateDraft, TransitLeg, WalkingLeg } from "../types.ts";
import type {
  OtpItinerary,
  OtpLeg,
  OtpLegTime,
  OtpPlace,
  OtpRejectReason,
} from "./types.ts";

export interface MapItinerariesContext {
  queryId: string;
  graphVersion: string;
  routeIdToLineId: (gtfsRouteId: string) => string | null;
  candidateFamily?: RawCandidateDraft["candidateFamily"];
}

export interface MapItinerariesResult {
  drafts: RawCandidateDraft[];
  rejectionCounts: Record<OtpRejectReason, number>;
}

function bump(
  counts: Record<OtpRejectReason, number>,
  reason: OtpRejectReason,
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/**
 * Parse OTP time values to an absolute ISO UTC instant.
 * Accepts epoch millis (number or numeric string) or OffsetDateTime / ISO strings.
 * Never applies local-timezone arithmetic.
 */
export function otpTimeToIsoUtc(
  value: number | string | OtpLegTime | null | undefined,
): string | null {
  if (value == null) return null;

  if (typeof value === "object") {
    const estimated = value.estimated?.time;
    if (estimated != null) {
      const fromEstimated = otpTimeToIsoUtc(estimated);
      if (fromEstimated) return fromEstimated;
    }
    return otpTimeToIsoUtc(value.scheduledTime ?? null);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Date(value).toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function itineraryStart(it: OtpItinerary): string | null {
  return otpTimeToIsoUtc(it.startTime ?? it.start);
}

function itineraryEnd(it: OtpItinerary): string | null {
  return otpTimeToIsoUtc(it.endTime ?? it.end);
}

function legStart(leg: OtpLeg): string | null {
  return otpTimeToIsoUtc(leg.startTime ?? leg.start);
}

function legEnd(leg: OtpLeg): string | null {
  return otpTimeToIsoUtc(leg.endTime ?? leg.end);
}

function isWalkMode(mode: string | undefined): boolean {
  if (!mode) return false;
  const m = mode.toUpperCase();
  return m === "WALK" || m === "FOOT";
}

function isTransitMode(mode: string | undefined): boolean {
  if (!mode) return false;
  const m = mode.toUpperCase();
  return m !== "WALK" && m !== "FOOT" && m !== "BICYCLE" && m !== "CAR";
}

function stopRef(place: OtpPlace | undefined): {
  name: string;
  stationId?: string;
  stopId?: string;
} {
  const name = place?.stop?.name ?? place?.name ?? "Unknown";
  const gtfsId = place?.stop?.gtfsId;
  if (gtfsId) {
    return { name, stopId: gtfsId, stationId: gtfsId };
  }
  return { name };
}

function sourceEngineIds(args: {
  graphVersion: string;
  queryId: string;
  itineraryIndex: number;
  otpTripIds: string[];
}): Record<string, string> {
  return {
    engine: "otp",
    graphVersion: args.graphVersion,
    queryId: args.queryId,
    itineraryIndex: String(args.itineraryIndex),
    otpTripIds: JSON.stringify(args.otpTripIds),
  };
}

function mapWalkLeg(
  leg: OtpLeg,
  legId: string,
): WalkingLeg {
  const durationSeconds = Math.max(0, Math.round(leg.duration ?? 0));
  const hasStops = Boolean(leg.from?.stop?.gtfsId || leg.to?.stop?.gtfsId);
  return {
    legId,
    kind: "walk",
    durationSeconds,
    outOfSystem: !hasStops,
  };
}

function mapTransitLeg(
  leg: OtpLeg,
  legId: string,
  lineId: string,
  identity: Record<string, string>,
  departTime: string,
  arriveTime: string,
): TransitLeg {
  const durationSeconds = Math.max(
    0,
    Math.round(
      leg.duration ??
        Math.max(0, (Date.parse(arriveTime) - Date.parse(departTime)) / 1000),
    ),
  );
  const tripId = leg.trip?.gtfsId ?? null;
  return {
    legId,
    kind: "transit",
    lineId,
    tripId,
    from: stopRef(leg.from),
    to: stopRef(leg.to),
    departTime,
    arriveTime,
    durationSeconds,
    sourceEngineIds: identity,
  };
}

function legsChronological(legs: Leg[]): boolean {
  let prevArrive: number | null = null;
  for (const leg of legs) {
    if (leg.kind !== "transit") continue;
    const depart = Date.parse(leg.departTime);
    const arrive = Date.parse(leg.arriveTime);
    if (!Number.isFinite(depart) || !Number.isFinite(arrive)) return false;
    if (depart > arrive) return false;
    if (prevArrive !== null && depart < prevArrive) return false;
    prevArrive = arrive;
  }
  return true;
}

/**
 * Map a single OTP itinerary → RawCandidateDraft, or return a reject reason.
 */
export function mapOneItinerary(
  it: OtpItinerary,
  itineraryIndex: number,
  ctx: MapItinerariesContext,
): { draft: RawCandidateDraft } | { reject: OtpRejectReason } {
  const rawLegs = it.legs;
  if (!rawLegs || rawLegs.length === 0) {
    return { reject: "empty_legs" };
  }

  const otpTripIds: string[] = [];
  for (const leg of rawLegs) {
    if (leg.trip?.gtfsId) otpTripIds.push(leg.trip.gtfsId);
  }

  const identity = sourceEngineIds({
    graphVersion: ctx.graphVersion,
    queryId: ctx.queryId,
    itineraryIndex,
    otpTripIds,
  });

  const legs: Leg[] = [];
  let walkingSeconds = 0;

  for (let i = 0; i < rawLegs.length; i++) {
    const leg = rawLegs[i]!;
    const legId = `otp_${ctx.queryId}_${itineraryIndex}_${i}`;

    if (isWalkMode(leg.mode)) {
      const walk = mapWalkLeg(leg, legId);
      walkingSeconds += walk.durationSeconds;
      legs.push(walk);
      continue;
    }

    if (!isTransitMode(leg.mode)) {
      // Treat unknown non-walk modes as walk-like access if duration present.
      const walk = mapWalkLeg(leg, legId);
      walkingSeconds += walk.durationSeconds;
      legs.push(walk);
      continue;
    }

    const gtfsRouteId = leg.route?.gtfsId;
    if (!gtfsRouteId) {
      return { reject: "unmappable_route" };
    }
    const lineId = ctx.routeIdToLineId(gtfsRouteId);
    if (!lineId) {
      return { reject: "unmappable_route" };
    }

    const departTime = legStart(leg);
    const arriveTime = legEnd(leg);
    if (!departTime || !arriveTime) {
      return { reject: "missing_times" };
    }

    const durationSeconds = Math.round(
      leg.duration ??
        (Date.parse(arriveTime) - Date.parse(departTime)) / 1000,
    );
    if (!(durationSeconds > 0)) {
      return { reject: "zero_duration_transit" };
    }

    legs.push(
      mapTransitLeg(leg, legId, lineId, identity, departTime, arriveTime),
    );
  }

  if (legs.length === 0) {
    return { reject: "empty_legs" };
  }

  if (!legsChronological(legs)) {
    return { reject: "non_chronological" };
  }

  const arrivalTime = itineraryEnd(it) ?? (() => {
    for (let i = legs.length - 1; i >= 0; i--) {
      const leg = legs[i]!;
      if (leg.kind === "transit") return leg.arriveTime;
    }
    return null;
  })();

  if (!arrivalTime) {
    return { reject: "missing_times" };
  }

  const durationSeconds = Math.max(
    0,
    Math.round(it.duration ?? 0) ||
      (() => {
        const start = itineraryStart(it);
        if (!start) return 0;
        return Math.max(0, (Date.parse(arrivalTime) - Date.parse(start)) / 1000);
      })(),
  );

  const transitSeconds = legs
    .filter((l): l is TransitLeg => l.kind === "transit")
    .reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0);

  const waitingSeconds = Math.max(
    0,
    durationSeconds - walkingSeconds - transitSeconds,
  );

  const transferCount = Math.max(
    0,
    it.numberOfTransfers ??
      Math.max(0, legs.filter((l) => l.kind === "transit").length - 1),
  );

  const draft: RawCandidateDraft = {
    itineraryId: `otp_${ctx.queryId}_${itineraryIndex}`,
    durationSeconds,
    arrivalTime,
    walkingSeconds,
    waitingSeconds,
    transferCount,
    legs,
    realtimeConfidence: "none",
    candidateFamily: ctx.candidateFamily ?? "baseline",
  };

  return { draft };
}

export function mapOtpItineraries(
  itineraries: readonly OtpItinerary[],
  ctx: MapItinerariesContext,
): MapItinerariesResult {
  const rejectionCounts: Record<OtpRejectReason, number> = {
    empty_legs: 0,
    non_chronological: 0,
    zero_duration_transit: 0,
    unmappable_route: 0,
    missing_times: 0,
  };
  const drafts: RawCandidateDraft[] = [];

  for (let i = 0; i < itineraries.length; i++) {
    const result = mapOneItinerary(itineraries[i]!, i, ctx);
    if ("reject" in result) {
      bump(rejectionCounts, result.reject);
      continue;
    }
    drafts.push(result.draft);
  }

  return { drafts, rejectionCounts };
}
