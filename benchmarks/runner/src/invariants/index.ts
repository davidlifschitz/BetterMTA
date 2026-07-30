import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import path from "node:path";
import {
  CONTRACTS_ROOT,
  ITINERARY_SCHEMA_PATH,
  loadJson,
} from "../paths.js";
import type {
  AssertionResult,
  BenchmarkCase,
  InvariantId,
  Itinerary,
  Leg,
  RouteSearchRequest,
  RouteSearchResponse,
  TransitLeg,
} from "../types.js";

type InvariantFn = (
  ctx: InvariantContext
) => AssertionResult | Promise<AssertionResult>;

export interface InvariantContext {
  benchmarkCase: BenchmarkCase;
  request: RouteSearchRequest;
  response: RouteSearchResponse;
  /** Second identical search for determinism checks. */
  repeatResponse?: RouteSearchResponse;
}

const CONFIDENCE_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function pass(id: InvariantId, message: string): AssertionResult {
  return { invariantId: id, status: "pass", message };
}

function fail(id: InvariantId, message: string): AssertionResult {
  return { invariantId: id, status: "fail", message };
}

function skip(id: InvariantId, message: string): AssertionResult {
  return { invariantId: id, status: "skip", message };
}

function allItineraries(response: RouteSearchResponse): Itinerary[] {
  return [
    ...response.baseline.itineraries,
    ...response.constrained.itineraries,
  ];
}

function constrained(response: RouteSearchResponse): Itinerary[] {
  return response.constrained.itineraries;
}

function isTransit(leg: Leg): leg is TransitLeg {
  return leg.kind === "transit";
}

function setEq(a: string[], b: string[]): boolean {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function setDiff(a: string[], b: string[]): string[] {
  const sb = new Set(b);
  return [...new Set(a)].filter((x) => !sb.has(x)).sort();
}

let itineraryValidate:
  | ((data: unknown) => boolean)
  | null = null;
let itineraryAjv: Ajv2020 | null = null;

async function getItineraryValidator() {
  if (itineraryValidate && itineraryAjv) {
    return { validate: itineraryValidate, ajv: itineraryAjv };
  }
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);

  // Load referenced schemas so $ref resolution works.
  const satisfaction = await loadJson<object>(
    path.join(CONTRACTS_ROOT, "schemas", "satisfaction.schema.json")
  );
  ajv.addSchema(satisfaction);
  const itinerarySchema = await loadJson<object>(ITINERARY_SCHEMA_PATH);
  itineraryValidate = ajv.compile(itinerarySchema);
  itineraryAjv = ajv;
  return { validate: itineraryValidate, ajv };
}

export const invariantLibrary: Record<InvariantId, InvariantFn> = {
  async valid_itinerary_structure(ctx) {
    const id: InvariantId = "valid_itinerary_structure";
    const { validate, ajv } = await getItineraryValidator();
    const failures: string[] = [];
    for (const listName of ["baseline", "constrained"] as const) {
      const list = ctx.response[listName].itineraries;
      const ids = list.map((i) => i.itineraryId);
      if (new Set(ids).size !== ids.length) {
        failures.push(`${listName}: duplicate itineraryId values`);
      }
    }
    for (const itin of allItineraries(ctx.response)) {
      if (!validate(itin)) {
        failures.push(
          `${itin.itineraryId}: ${ajv.errorsText(validate.errors, { separator: "; " })}`
        );
      }
    }
    if (failures.length) {
      return fail(id, failures.join(" | "));
    }
    return pass(id, `Validated ${allItineraries(ctx.response).length} itinerary(ies) against itinerary.schema.json`);
  },

  origin_destination_consistency(ctx) {
    const id: InvariantId = "origin_destination_consistency";
    const itins = allItineraries(ctx.response);
    if (itins.length === 0) {
      // Empty lists are OK for baseline-only / none cases; OD N/A.
      if (
        ctx.benchmarkCase.expectedFeasibility === "none" ||
        ctx.benchmarkCase.expectedFeasibility === "not_applicable"
      ) {
        return pass(id, "No itineraries; OD consistency N/A for empty result");
      }
      return fail(id, "Expected itineraries for OD consistency check but list was empty");
    }

    const problems: string[] = [];
    for (const itin of itins) {
      if (!itin.legs?.length) {
        problems.push(`${itin.itineraryId}: missing legs`);
        continue;
      }
      const transit = itin.legs.filter(isTransit);
      if (transit.length === 0) {
        problems.push(`${itin.itineraryId}: no transit legs`);
        continue;
      }
      const originStation = ctx.benchmarkCase.expectedOriginStationId;
      const destStation = ctx.benchmarkCase.expectedDestinationStationId;
      if (originStation) {
        const first = transit[0];
        if (first.from.stationId && first.from.stationId !== originStation) {
          // Allow walk-to-station; check first transit board is the expected board station.
          problems.push(
            `${itin.itineraryId}: first transit from ${first.from.stationId} != expected ${originStation}`
          );
        }
      }
      if (destStation) {
        const last = transit[transit.length - 1];
        if (last.to.stationId && last.to.stationId !== destStation) {
          problems.push(
            `${itin.itineraryId}: last transit to ${last.to.stationId} != expected ${destStation}`
          );
        }
      }
      // Structural OD: each transit leg has named from/to.
      for (const leg of transit) {
        if (!leg.from?.name || !leg.to?.name) {
          problems.push(`${itin.itineraryId}/${leg.legId}: missing from/to name`);
        }
      }
    }

    if (problems.length) return fail(id, problems.join(" | "));
    return pass(id, "Itinerary OD endpoints and transit stop refs are consistent");
  },

  chronological_legs(ctx) {
    const id: InvariantId = "chronological_legs";
    const problems: string[] = [];
    for (const itin of allItineraries(ctx.response)) {
      let prevArrive: number | null = null;
      for (const leg of itin.legs) {
        if (isTransit(leg)) {
          const dep = Date.parse(leg.departTime);
          const arr = Date.parse(leg.arriveTime);
          if (Number.isNaN(dep) || Number.isNaN(arr)) {
            problems.push(`${itin.itineraryId}/${leg.legId}: invalid timestamps`);
            continue;
          }
          if (arr < dep) {
            problems.push(
              `${itin.itineraryId}/${leg.legId}: arriveTime before departTime`
            );
          }
          if (prevArrive !== null && dep < prevArrive) {
            problems.push(
              `${itin.itineraryId}/${leg.legId}: departs before previous transit arrival`
            );
          }
          prevArrive = arr;
        }
      }
      const arrival = Date.parse(itin.arrivalTime);
      if (!Number.isNaN(arrival) && prevArrive !== null && arrival < prevArrive) {
        problems.push(
          `${itin.itineraryId}: itinerary.arrivalTime before last transit arrival`
        );
      }
    }
    if (problems.length) return fail(id, problems.join(" | "));
    return pass(id, "Transit legs are chronological with nonnegative spans");
  },

  nonnegative_durations(ctx) {
    const id: InvariantId = "nonnegative_durations";
    const problems: string[] = [];
    for (const itin of allItineraries(ctx.response)) {
      for (const field of [
        "durationSeconds",
        "walkingSeconds",
        "waitingSeconds",
        "transferCount",
      ] as const) {
        if (typeof itin[field] !== "number" || itin[field] < 0) {
          problems.push(`${itin.itineraryId}.${field} invalid`);
        }
      }
      for (const leg of itin.legs) {
        if (leg.kind === "walk" && leg.durationSeconds < 0) {
          problems.push(`${itin.itineraryId}/${leg.legId}: negative walk duration`);
        }
        if (
          isTransit(leg) &&
          leg.durationSeconds !== undefined &&
          leg.durationSeconds < 0
        ) {
          problems.push(`${itin.itineraryId}/${leg.legId}: negative transit duration`);
        }
      }
    }
    if (problems.length) return fail(id, problems.join(" | "));
    return pass(id, "All durations and counts are nonnegative");
  },

  satisfaction_accounting(ctx) {
    const id: InvariantId = "satisfaction_accounting";
    const problems: string[] = [];
    const requestedRaw = ctx.request.selectedLineIds ?? [];
    const requestedNorm = [...new Set(requestedRaw)];

    for (const itin of constrained(ctx.response)) {
      const s = itin.satisfaction;
      const transitLines = new Set(
        itin.legs.filter(isTransit).map((l) => l.lineId)
      );

      // Bind response requestedLineIds to the actual (deduped) request BEFORE omitted/completeness.
      if (!setEq(s.requestedLineIds, requestedNorm)) {
        problems.push(
          `${itin.itineraryId}: requestedLineIds [${s.requestedLineIds}] != request selectedLineIds (deduped) [${requestedNorm}]`
        );
      }
      if (s.requestedCount !== requestedNorm.length) {
        problems.push(
          `${itin.itineraryId}: requestedCount ${s.requestedCount} != unique(request).length ${requestedNorm.length}`
        );
      }

      // satisfied ⊆ requested (normalized)
      for (const line of s.satisfiedLineIds) {
        if (!requestedNorm.includes(line) && requestedNorm.length > 0) {
          // Baseline itineraries may have empty requested; constrained should echo request.
          problems.push(
            `${itin.itineraryId}: satisfied ${line} not in requested ${requestedNorm.join(",")}`
          );
        }
        if (!transitLines.has(line)) {
          problems.push(
            `${itin.itineraryId}: satisfied ${line} does not appear on any transit leg`
          );
        }
      }

      // no double counting
      if (new Set(s.satisfiedLineIds).size !== s.satisfiedLineIds.length) {
        problems.push(`${itin.itineraryId}: duplicate satisfiedLineIds`);
      }
      if (new Set(s.omittedLineIds).size !== s.omittedLineIds.length) {
        problems.push(`${itin.itineraryId}: duplicate omittedLineIds`);
      }

      // counts match
      if (s.satisfactionCount !== s.satisfiedLineIds.length) {
        problems.push(
          `${itin.itineraryId}: satisfactionCount ${s.satisfactionCount} != satisfiedLineIds.length ${s.satisfiedLineIds.length}`
        );
      }
      if (s.requestedCount !== s.requestedLineIds.length) {
        problems.push(
          `${itin.itineraryId}: requestedCount ${s.requestedCount} != requestedLineIds.length`
        );
      }

      // omitted = requested − satisfied (set semantics)
      const expectedOmitted = setDiff(s.requestedLineIds, s.satisfiedLineIds);
      if (!setEq(expectedOmitted, s.omittedLineIds)) {
        problems.push(
          `${itin.itineraryId}: omittedLineIds [${s.omittedLineIds}] != requested−satisfied [${expectedOmitted}]`
        );
      }

      // isComplete / feasibility coherence with counts
      if (s.requestedCount === 0) {
        if (!s.isComplete || s.feasibility !== "not_applicable") {
          problems.push(
            `${itin.itineraryId}: empty request should be isComplete + not_applicable`
          );
        }
      } else {
        const complete = s.satisfactionCount === s.requestedCount;
        if (s.isComplete !== complete) {
          problems.push(
            `${itin.itineraryId}: isComplete ${s.isComplete} inconsistent with counts`
          );
        }
        // Derive expected feasibility from counts and assert match.
        let expectedFeasibility: string;
        if (s.satisfactionCount === s.requestedCount && s.requestedCount > 0) {
          expectedFeasibility = "complete";
        } else if (s.satisfactionCount === 0) {
          expectedFeasibility = "none";
        } else {
          expectedFeasibility = "partial";
        }
        if (s.feasibility !== expectedFeasibility) {
          problems.push(
            `${itin.itineraryId}: feasibility ${s.feasibility} != derived ${expectedFeasibility} from counts`
          );
        }
      }
    }

    // Also check baseline itineraries' internal accounting coherence
    for (const itin of ctx.response.baseline.itineraries) {
      const s = itin.satisfaction;
      if (s.satisfactionCount !== s.satisfiedLineIds.length) {
        problems.push(`${itin.itineraryId}: baseline satisfactionCount mismatch`);
      }
      const expectedOmitted = setDiff(s.requestedLineIds, s.satisfiedLineIds);
      if (!setEq(expectedOmitted, s.omittedLineIds)) {
        problems.push(`${itin.itineraryId}: baseline omitted mismatch`);
      }
    }

    if (problems.length) return fail(id, problems.join(" | "));
    return pass(id, "Satisfaction accounting invariants hold");
  },

  complete_beats_partial(ctx) {
    const id: InvariantId = "complete_beats_partial";
    const list = constrained(ctx.response);
    if (list.length < 2) {
      return skip(id, "Fewer than 2 constrained itineraries; ordering not exercisable");
    }
    let sawPartial = false;
    for (const itin of list) {
      const complete =
        itin.satisfaction.isComplete &&
        itin.satisfaction.feasibility === "complete";
      if (complete && sawPartial) {
        return fail(
          id,
          `Complete itinerary ${itin.itineraryId} appears after a partial`
        );
      }
      if (!complete && itin.satisfaction.feasibility === "partial") {
        sawPartial = true;
      }
      if (!complete && itin.satisfaction.feasibility === "none") {
        sawPartial = true;
      }
    }
    return pass(id, "No complete itinerary appears after a partial");
  },

  max_satisfaction_before_time(ctx) {
    const id: InvariantId = "max_satisfaction_before_time";
    const list = constrained(ctx.response);
    if (list.length < 2) {
      return skip(id, "Fewer than 2 constrained itineraries; ordering not exercisable");
    }
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const ps = prev.satisfaction.satisfactionCount;
      const cs = curr.satisfaction.satisfactionCount;
      if (cs > ps) {
        return fail(
          id,
          `Itinerary ${curr.itineraryId} has higher satisfactionCount (${cs}) than earlier ${prev.itineraryId} (${ps})`
        );
      }
      if (cs === ps) {
        const pa = Date.parse(prev.arrivalTime);
        const ca = Date.parse(curr.arrivalTime);
        if (!Number.isNaN(pa) && !Number.isNaN(ca) && ca < pa) {
          return fail(
            id,
            `At equal satisfaction ${cs}, ${curr.itineraryId} arrives earlier than prior ${prev.itineraryId}`
          );
        }
        if (!Number.isNaN(pa) && !Number.isNaN(ca) && ca === pa) {
          if (curr.transferCount < prev.transferCount) {
            return fail(
              id,
              `At equal satisfaction/arrival, ${curr.itineraryId} has fewer transfers than prior`
            );
          }
          if (
            curr.transferCount === prev.transferCount &&
            curr.walkingSeconds < prev.walkingSeconds
          ) {
            return fail(
              id,
              `At equal satisfaction/arrival/transfers, ${curr.itineraryId} walks less than prior`
            );
          }
          if (
            curr.transferCount === prev.transferCount &&
            curr.walkingSeconds === prev.walkingSeconds
          ) {
            const pc = CONFIDENCE_RANK[prev.realtimeConfidence] ?? 0;
            const cc = CONFIDENCE_RANK[curr.realtimeConfidence] ?? 0;
            if (cc > pc) {
              return fail(
                id,
                `At equal prior keys, ${curr.itineraryId} has higher realtimeConfidence than prior`
              );
            }
            if (cc === pc && curr.fingerprint < prev.fingerprint) {
              return fail(
                id,
                `At equal prior keys, ${curr.itineraryId} fingerprint sorts before prior`
              );
            }
          }
        }
      }
    }
    return pass(id, "Constrained list obeys max-satisfaction-then-time ranking");
  },

  deterministic_order(ctx) {
    const id: InvariantId = "deterministic_order";
    if (!ctx.repeatResponse) {
      return skip(id, "No repeat response provided");
    }
    const a = constrained(ctx.response).map((i) => i.fingerprint);
    const b = constrained(ctx.repeatResponse).map((i) => i.fingerprint);
    const ba = ctx.response.baseline.itineraries.map((i) => i.fingerprint);
    const bb = ctx.repeatResponse.baseline.itineraries.map((i) => i.fingerprint);
    if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(ba) !== JSON.stringify(bb)) {
      return fail(
        id,
        `Non-deterministic order: run1 constrained=${a.join(",")} run2=${b.join(",")}`
      );
    }
    return pass(id, "Repeat search returned identical itinerary fingerprints in order");
  },

  max_three_itineraries(ctx) {
    const id: InvariantId = "max_three_itineraries";
    const b = ctx.response.baseline.itineraries.length;
    const c = ctx.response.constrained.itineraries.length;
    if (b > 3 || c > 3) {
      return fail(id, `List lengths exceed 3 (baseline=${b}, constrained=${c})`);
    }
    return pass(id, `baseline=${b}, constrained=${c} (≤3)`);
  },

  honest_data_mode(ctx) {
    const id: InvariantId = "honest_data_mode";
    const mode = ctx.response.dataMode;
    if (!mode) {
      return fail(id, "dataMode missing");
    }
    const allowed = ["live", "schedule_only", "stale", "synthetic", "unavailable"];
    if (!allowed.includes(mode)) {
      return fail(id, `Unknown dataMode ${mode}`);
    }
    // Synthetic / authored fixture cases must not claim live.
    // recorded_response and live SUT kinds may honestly return live|stale|schedule_only.
    const authoredFixtureKind =
      ctx.benchmarkCase.sut.kind === "conductor_fixture" ||
      ctx.benchmarkCase.sut.kind === "qa_fixture";
    if (
      (ctx.benchmarkCase.classification === "synthetic_contract_fixture" ||
        authoredFixtureKind) &&
      mode === "live"
    ) {
      // Allow only if explicitly tagged as testing live labeling against a live-shaped fixture.
      if (!ctx.benchmarkCase.tags?.includes("allows_live_data_mode")) {
        return fail(
          id,
          "Fixture-backed case returned dataMode=live; synthetic/fixture responses must not claim live"
        );
      }
    }
    if (mode === "stale" || mode === "schedule_only") {
      const warnings = ctx.response.freshness?.warnings ?? [];
      if (warnings.length === 0) {
        return fail(id, `${mode} responses should include freshness warnings`);
      }
    }
    return pass(id, `dataMode=${mode} present and honestly labeled for this case class`);
  },

  impossible_constraint_explanation(ctx) {
    const id: InvariantId = "impossible_constraint_explanation";
    const feas = ctx.benchmarkCase.expectedFeasibility;
    if (feas !== "partial" && feas !== "none") {
      return skip(id, `expectedFeasibility=${feas}; explanation check N/A`);
    }
    const list = constrained(ctx.response);
    if (list.length === 0 && feas === "none") {
      // Still require satisfactionSummary or response-level explanation — check summary fields.
      const summary = ctx.response.constrained.satisfactionSummary;
      if (summary.completeMatchFound) {
        return fail(id, "feasibility none but completeMatchFound=true");
      }
      return pass(
        id,
        "Empty constrained list with completeMatchFound=false for feasibility none"
      );
    }
    if (list.length === 0) {
      return fail(id, "Partial feasibility requires at least one explained itinerary");
    }
    const problems: string[] = [];
    for (const itin of list) {
      const s = itin.satisfaction;
      if (s.omittedLineIds.length === 0 && feas === "partial") {
        problems.push(`${itin.itineraryId}: partial but omittedLineIds empty`);
      }
      const hasOmitFact = itin.explanation.facts.some(
        (f) => f.type === "line_omitted" || f.type === "line_used"
      );
      const summaryOk =
        typeof itin.explanation.summary === "string" &&
        itin.explanation.summary.length > 0;
      if (!summaryOk) {
        problems.push(`${itin.itineraryId}: missing explanation.summary`);
      }
      if (!hasOmitFact && s.omittedLineIds.length > 0) {
        problems.push(
          `${itin.itineraryId}: omitted lines present but no line_omitted/line_used explanation facts`
        );
      }
    }
    if (problems.length) return fail(id, problems.join(" | "));
    return pass(id, "Partial/none cases include structured omission explanations");
  },

  expected_feasibility(ctx) {
    const id: InvariantId = "expected_feasibility";
    const expected = ctx.benchmarkCase.expectedFeasibility;
    const list = constrained(ctx.response);

    if (expected === "not_applicable") {
      const summary = ctx.response.constrained.satisfactionSummary;
      if (summary.requestedCount !== 0) {
        return fail(
          id,
          `not_applicable expects requestedCount=0, got ${summary.requestedCount}`
        );
      }
      return pass(id, "Baseline-only / not_applicable feasibility matches");
    }

    if (expected === "none") {
      if (list.length === 0) {
        return pass(id, "No constrained itineraries for feasibility none");
      }
      const best = list[0];
      if (best.satisfaction.feasibility !== "none") {
        return fail(
          id,
          `Expected feasibility none, best was ${best.satisfaction.feasibility}`
        );
      }
      return pass(id, "Best constrained feasibility is none");
    }

    if (list.length === 0) {
      return fail(id, `Expected feasibility ${expected} but constrained list empty`);
    }
    const best = list[0];
    if (best.satisfaction.feasibility !== expected) {
      return fail(
        id,
        `Expected feasibility ${expected}, got ${best.satisfaction.feasibility}`
      );
    }
    return pass(id, `Best constrained feasibility is ${expected}`);
  },

  minimum_satisfaction(ctx) {
    const id: InvariantId = "minimum_satisfaction";
    const min = ctx.benchmarkCase.minimumSatisfactionCount;
    const expected = ctx.benchmarkCase.expectedFeasibility;
    if (expected === "not_applicable" || expected === "none") {
      if (min === 0) return pass(id, "minimumSatisfactionCount=0 for none/n/a");
      return fail(id, "none/not_applicable cases should set minimumSatisfactionCount=0");
    }
    const list = constrained(ctx.response);
    if (list.length === 0) {
      return fail(id, "No constrained itineraries to check minimum satisfaction");
    }
    const best = list[0].satisfaction.satisfactionCount;
    if (best < min) {
      return fail(id, `Best satisfactionCount ${best} < minimum ${min}`);
    }
    return pass(id, `Best satisfactionCount ${best} ≥ ${min}`);
  },
};

export async function runInvariants(
  ids: InvariantId[],
  ctx: InvariantContext
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const inv of ids) {
    const fn = invariantLibrary[inv];
    if (!fn) {
      results.push(fail(inv, `Unknown invariant ${inv}`));
      continue;
    }
    results.push(await fn(ctx));
  }
  return results;
}
