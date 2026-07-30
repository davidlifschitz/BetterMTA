"use client";

import type { Itinerary, Line } from "@/lib/contracts";
import {
  formatClock,
  formatDuration,
  formatMinutes,
  lineById,
} from "@/lib/format";

type RouteDetailProps = {
  itinerary: Itinerary;
  lines: Line[];
  onBack: () => void;
};

export function RouteDetail({ itinerary, lines, onBack }: RouteDetailProps) {
  const sat = itinerary.satisfaction;
  const reliability =
    itinerary.reliability && itinerary.reliability.displayEligible
      ? itinerary.reliability
      : null;

  return (
    <section className="detail" data-testid="route-detail">
      <button type="button" className="text-btn" onClick={onBack}>
        ← Back to results
      </button>

      <h2>
        {formatDuration(itinerary.durationSeconds)} · Arrive{" "}
        {formatClock(itinerary.arrivalTime)}
      </h2>

      {sat.requestedCount > 0 ? (
        <p data-testid="detail-coverage">
          Selected-line coverage: {sat.satisfiedLineIds.join(", ") || "none"}
          {sat.omittedLineIds.length > 0
            ? ` (omits ${sat.omittedLineIds.join(", ")})`
            : ""}
        </p>
      ) : null}

      <ol className="leg-list">
        {itinerary.legs.map((leg) => {
          if (leg.kind === "walk") {
            return (
              <li key={leg.legId} className="leg leg--walk">
                <strong>Walk</strong>
                <span>{formatMinutes(leg.durationSeconds)}</span>
                {leg.instruction ? <span>{leg.instruction}</span> : null}
                {leg.outOfSystem ? (
                  <span className="hint">Out-of-system walk</span>
                ) : (
                  <span className="hint">In-station transfer walk</span>
                )}
              </li>
            );
          }
          const line = lineById(lines, leg.lineId);
          return (
            <li key={leg.legId} className="leg leg--transit">
              <span
                className="seq-badge"
                style={{
                  background: line?.color ?? "#333",
                  color: line?.textColor ?? "#fff",
                }}
              >
                {line?.label ?? leg.lineId}
              </span>
              <div>
                <strong>
                  {leg.from.name} → {leg.to.name}
                </strong>
                <span>
                  {formatClock(leg.departTime)} – {formatClock(leg.arriveTime)}
                </span>
                {leg.headsign ? <span>Toward {leg.headsign}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <dl className="meta-row">
        <div>
          <dt>Walk</dt>
          <dd>{formatMinutes(itinerary.walkingSeconds)}</dd>
        </div>
        <div>
          <dt>Wait</dt>
          <dd>{formatMinutes(itinerary.waitingSeconds)}</dd>
        </div>
        <div>
          <dt>Transfers</dt>
          <dd>{itinerary.transferCount}</dd>
        </div>
      </dl>

      {itinerary.alerts.map((a) => (
        <p key={a.alertId} className="alerts">
          <strong>{a.header}</strong>
          {a.description ? ` — ${a.description}` : ""}
        </p>
      ))}

      {reliability ? (
        <p>Reliability: {reliability.level}</p>
      ) : null}

      <div className="explanation is-open">
        <p>{itinerary.explanation.summary}</p>
        <ul>
          {itinerary.explanation.facts.map((f, i) => (
            <li key={`${f.type}-${i}`}>{f.message}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
