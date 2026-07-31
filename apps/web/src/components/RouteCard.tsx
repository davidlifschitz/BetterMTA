"use client";

import { useState } from "react";
import type { Itinerary, Line, RouteSearchResponse } from "@/lib/contracts";
import {
  formatBaselineDelta,
  formatCardFreshness,
  formatClock,
  formatDuration,
  formatMinutes,
  lineById,
} from "@/lib/format";
import { formatLineIdList, riderLineLabel } from "@/lib/line-display";
import {
  completePreferenceBannerText,
  CONNECTOR_FILLED_BANNER,
  hasConnectorFilled,
  partialPreferenceBannerText,
  satisfactionPillText,
} from "@/lib/preference-copy";
import { track } from "@/lib/analytics";

type RouteCardProps = {
  itinerary: Itinerary;
  lines: Line[];
  requestId: string;
  explanationVariant?: "concise" | "detailed";
  isBaseline?: boolean;
  onSelect: (itinerary: Itinerary) => void;
};

export function RouteCard({
  itinerary,
  lines,
  requestId,
  explanationVariant = "concise",
  isBaseline = false,
  onSelect,
}: RouteCardProps) {
  const [open, setOpen] = useState(false);
  const sat = itinerary.satisfaction;
  const reliability =
    itinerary.reliability && itinerary.reliability.displayEligible
      ? itinerary.reliability
      : null;
  const baselineDelta = formatBaselineDelta(
    itinerary.explanation.baselineDeltaSeconds,
  );
  const cardFreshness = formatCardFreshness(itinerary.realtimeConfidence);
  const connectorNote = hasConnectorFilled(itinerary.explanation.facts);
  const pill = satisfactionPillText({
    isComplete: sat.isComplete,
    satisfactionCount: sat.satisfactionCount,
    requestedCount: sat.requestedCount,
  });

  return (
    <article className="route-card" data-testid="route-card">
      <button
        type="button"
        className="route-card__main"
        onClick={() => {
          track("route_selected", {
            requestId,
            itineraryId: itinerary.itineraryId,
            satisfactionCount: sat.satisfactionCount,
            requestedCount: sat.requestedCount,
            isComplete: sat.isComplete,
          });
          onSelect(itinerary);
        }}
      >
        <div className="route-card__top">
          <div>
            <p className="route-card__duration">
              {formatDuration(itinerary.durationSeconds)}
            </p>
            <p className="route-card__arrival">
              Arrive {formatClock(itinerary.arrivalTime)}
            </p>
          </div>
          {isBaseline ? (
            <span className="pill">Baseline</span>
          ) : pill ? (
            <span
              className={`pill${sat.isComplete ? " pill--ok" : " pill--partial"}`}
              data-testid="satisfaction-pill"
            >
              {pill}
            </span>
          ) : null}
        </div>

        <ol className="line-sequence" aria-label="Line sequence">
          {itinerary.lineSequence.map((id) => {
            const line = lineById(lines, id);
            const face = riderLineLabel(id, line);
            return (
              <li key={`${itinerary.itineraryId}-${id}`}>
                <span
                  className="seq-badge"
                  style={{
                    background: line?.color ?? "#333",
                    color: line?.textColor ?? "#fff",
                  }}
                >
                  {face}
                </span>
                <span className="sr-only">
                  {line?.displayName ?? face}
                </span>
              </li>
            );
          })}
        </ol>

        {sat.requestedCount > 0 ? (
          <p className="coverage" data-testid="coverage-text">
            Uses {formatLineIdList(sat.satisfiedLineIds, lines)}
            {sat.omittedLineIds.length > 0
              ? ` · Omits ${formatLineIdList(sat.omittedLineIds, lines)}`
              : ""}
          </p>
        ) : null}

        {connectorNote ? (
          <p className="connector-note" data-testid="connector-note">
            {CONNECTOR_FILLED_BANNER}
          </p>
        ) : null}

        {baselineDelta ? (
          <p className="baseline-delta" data-testid="baseline-delta">
            {baselineDelta}
          </p>
        ) : null}

        {cardFreshness ? (
          <p className="card-freshness" data-testid="card-freshness">
            {cardFreshness}
          </p>
        ) : null}

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

        {itinerary.alerts.length > 0 ? (
          <ul className="alerts" aria-label="Service alerts">
            {itinerary.alerts.map((a) => (
              <li key={a.alertId}>
                <strong>{a.header}</strong>
                {a.description ? ` — ${a.description}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        {reliability ? (
          <p className="reliability">
            Reliability: {reliability.level} ({reliability.basis})
          </p>
        ) : null}
      </button>

      <details
        className="explanation"
        open={open}
        onToggle={(e) => {
          const next = (e.target as HTMLDetailsElement).open;
          setOpen(next);
          if (next) {
            track("explanation_expanded", {
              itineraryId: itinerary.itineraryId,
              variant: explanationVariant,
            });
          }
        }}
      >
        <summary>Why this route</summary>
        <p>{itinerary.explanation.summary}</p>
        {explanationVariant === "detailed" ? (
          <ul>
            {itinerary.explanation.facts.map((f, i) => (
              <li
                key={`${f.type}-${i}`}
                data-fact-type={f.type}
                className={
                  f.type === "connector_filled" ? "fact--connector" : undefined
                }
              >
                {f.message}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </article>
  );
}

type PreferenceBannerProps = {
  summary: RouteSearchResponse["constrained"]["satisfactionSummary"];
  showConnectorHint?: boolean;
};

export function PreferenceStateBanner({
  summary,
  showConnectorHint = false,
}: PreferenceBannerProps) {
  if (summary.requestedCount === 0) return null;

  if (summary.completeMatchFound) {
    const copy = completePreferenceBannerText(summary.requestedCount);
    return (
      <div
        className="banner banner--ok"
        role="status"
        data-testid="complete-banner"
      >
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        {showConnectorHint ? (
          <span data-testid="connector-banner">{CONNECTOR_FILLED_BANNER}</span>
        ) : null}
      </div>
    );
  }

  const copy = partialPreferenceBannerText(summary.requestedCount);
  return (
    <div
      className="banner banner--partial"
      role="status"
      data-testid="partial-banner"
    >
      <strong>{copy.title}</strong>
      <span>{copy.body}</span>
      {showConnectorHint ? (
        <span data-testid="connector-banner">{CONNECTOR_FILLED_BANNER}</span>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer PreferenceStateBanner — kept as alias for tests. */
export function PartialSatisfactionBanner(props: PreferenceBannerProps) {
  return <PreferenceStateBanner {...props} />;
}
