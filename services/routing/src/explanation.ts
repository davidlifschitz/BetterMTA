import type {
  Explanation,
  ExplanationFact,
  RealtimeConfidence,
  SatisfactionResult,
} from "./types.ts";

export function buildExplanation(input: {
  satisfaction: SatisfactionResult;
  transferCount: number;
  walkingSeconds: number;
  waitingSeconds: number;
  realtimeConfidence: RealtimeConfidence;
  baselineDeltaSeconds?: number | null;
  alertCount?: number;
}): Explanation {
  const facts: ExplanationFact[] = [];

  for (const lineId of input.satisfaction.satisfiedLineIds) {
    facts.push({
      type: "line_used",
      message: `Uses the ${lineId} train.`,
      lineId,
    });
  }
  for (const lineId of input.satisfaction.omittedLineIds) {
    facts.push({
      type: "line_omitted",
      message: `Could not include the ${lineId} train.`,
      lineId,
    });
  }

  if (input.transferCount > 0) {
    facts.push({
      type: "transfer",
      message:
        input.transferCount === 1
          ? "One transfer."
          : `${input.transferCount} transfers.`,
    });
  }

  if (input.walkingSeconds > 0) {
    const minutes = Math.round(input.walkingSeconds / 60);
    facts.push({
      type: "walk",
      message: `Includes ${minutes} minute${minutes === 1 ? "" : "s"} of walking.`,
      seconds: input.walkingSeconds,
    });
  }

  if (input.waitingSeconds > 0) {
    facts.push({
      type: "wait",
      message: "Includes waiting time.",
      seconds: input.waitingSeconds,
    });
  }

  if (input.realtimeConfidence === "none") {
    facts.push({
      type: "realtime",
      message: "Realtime feeds unavailable or unused; schedule used.",
    });
  } else if (input.realtimeConfidence === "low") {
    facts.push({
      type: "realtime",
      message: "Realtime confidence is low for this itinerary.",
    });
  }

  const delta = input.baselineDeltaSeconds ?? null;
  if (delta !== null && delta !== undefined) {
    facts.push({
      type: "baseline_delta",
      message:
        delta === 0
          ? "Arrives at the same time as the baseline."
          : delta > 0
            ? `Arrives ${Math.round(delta / 60)} minutes later than the baseline.`
            : `Arrives ${Math.round(Math.abs(delta) / 60)} minutes earlier than the baseline.`,
      seconds: delta,
    });
  }

  if ((input.alertCount ?? 0) > 0) {
    facts.push({
      type: "alert",
      message: `${input.alertCount} service alert${input.alertCount === 1 ? "" : "s"} may affect this trip.`,
    });
  }

  return {
    summary: summaryFromSatisfaction(input.satisfaction, input.transferCount),
    facts,
    baselineDeltaSeconds: delta,
  };
}

function summaryFromSatisfaction(
  satisfaction: SatisfactionResult,
  transferCount: number,
): string {
  if (satisfaction.feasibility === "not_applicable") {
    return "Baseline itinerary without selected-line constraints.";
  }
  if (satisfaction.feasibility === "complete") {
    const lines = satisfaction.satisfiedLineIds.join(" and ");
    return transferCount > 0
      ? `Uses all selected lines (${lines}) with ${transferCount} transfer${transferCount === 1 ? "" : "s"}.`
      : `Uses all selected lines (${lines}).`;
  }
  if (satisfaction.feasibility === "partial") {
    const used = satisfaction.satisfiedLineIds.join(", ") || "none";
    const omitted = satisfaction.omittedLineIds.join(", ");
    return `Partial match: uses ${used}; omits ${omitted}.`;
  }
  return "No selected lines appear on this itinerary.";
}
