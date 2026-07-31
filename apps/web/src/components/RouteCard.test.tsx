import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouteCard, PartialSatisfactionBanner } from "@/components/RouteCard";
import { DataModeBanner } from "@/components/DataModeBanner";
import type { Itinerary, Line, RouteSearchResponse } from "@/lib/contracts";
import partialMatch from "../../../../contracts/fixtures/routes/partial-match.json";
import degradedRealtime from "../../../../contracts/fixtures/routes/degraded-realtime.json";
import baselineOnly from "../../../../contracts/fixtures/routes/baseline-only.json";
import completeMatch from "../../../../contracts/fixtures/routes/complete-match.json";
import linesFixture from "../../../../contracts/fixtures/lines/subway-lines.json";

afterEach(() => {
  cleanup();
});

const lines = linesFixture.lines as Line[];

describe("satisfaction and omission rendering", () => {
  it("names used and omitted lines for partial itineraries", () => {
    const itin = (partialMatch as RouteSearchResponse).constrained
      .itineraries[0] as Itinerary;

    render(
      <RouteCard
        itinerary={itin}
        lines={lines}
        requestId="req_test"
        explanationVariant="detailed"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByTestId("satisfaction-pill")).toHaveTextContent(
      "2 of 3 preferences",
    );
    expect(screen.getByTestId("coverage-text")).toHaveTextContent("Uses A, L");
    expect(screen.getByTestId("coverage-text")).toHaveTextContent("Omits G");
  });

  it("shows partial preferred-line banner copy", () => {
    render(
      <PartialSatisfactionBanner
        summary={(partialMatch as RouteSearchResponse).constrained.satisfactionSummary}
      />,
    );
    expect(screen.getByTestId("partial-banner")).toHaveTextContent(
      /Couldn’t use all preferences/i,
    );
    expect(screen.getByTestId("partial-banner")).toHaveTextContent(
      /all 3 preferred lines/i,
    );
  });

  it("shows complete preferred-line banner copy", () => {
    render(
      <PartialSatisfactionBanner
        summary={(completeMatch as RouteSearchResponse).constrained.satisfactionSummary}
      />,
    );
    expect(screen.getByTestId("complete-banner")).toHaveTextContent(
      /Using your preferred lines/i,
    );
  });

  it("surfaces connector_filled explanation note", () => {
    const itin = (completeMatch as RouteSearchResponse).constrained
      .itineraries[0] as Itinerary;
    const withConnector: Itinerary = {
      ...itin,
      explanation: {
        ...itin.explanation,
        facts: [
          ...itin.explanation.facts,
          {
            type: "connector_filled",
            message: "Filled gap with an unselected connector.",
            lineId: "D",
          },
        ],
      },
    };
    render(
      <RouteCard
        itinerary={withConnector}
        lines={lines}
        requestId="req_test"
        explanationVariant="detailed"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByTestId("connector-note")).toHaveTextContent(
      /connecting lines/i,
    );
    expect(screen.getByText(/Filled gap with an unselected connector/)).toBeInTheDocument();
  });

  it("hides reliability when displayEligible is absent/false", () => {
    const itin = (completeMatch as RouteSearchResponse).constrained
      .itineraries[0] as Itinerary;
    const withIneligible: Itinerary = {
      ...itin,
      reliability: {
        level: "high",
        basis: "should stay hidden",
        displayEligible: false,
      },
    };

    render(
      <RouteCard
        itinerary={withIneligible}
        lines={lines}
        requestId="req_test"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Reliability/i)).toBeNull();
  });

  it("renders baseline delta and per-card freshness when provided", () => {
    const itin = (completeMatch as RouteSearchResponse).constrained
      .itineraries[0] as Itinerary;

    render(
      <RouteCard
        itinerary={itin}
        lines={lines}
        requestId="req_test"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("baseline-delta")).toHaveTextContent(
      "~4 min slower than fastest baseline",
    );
    expect(screen.getByTestId("card-freshness")).toHaveTextContent(
      /Mixed live and schedule times/i,
    );
  });
});

describe("dataMode labeling", () => {
  it("labels synthetic demo data", () => {
    render(
      <DataModeBanner
        dataMode={(completeMatch as RouteSearchResponse).dataMode}
        freshness={(completeMatch as RouteSearchResponse).freshness}
      />,
    );
    const banner = screen.getByTestId("data-mode-banner");
    expect(banner).toHaveAttribute("data-mode", "synthetic");
    expect(banner).toHaveTextContent(/Demo data/i);
  });

  it("labels stale realtime with warning", () => {
    render(
      <DataModeBanner
        dataMode={(degradedRealtime as RouteSearchResponse).dataMode}
        freshness={(degradedRealtime as RouteSearchResponse).freshness}
      />,
    );
    const banner = screen.getByTestId("data-mode-banner");
    expect(banner).toHaveAttribute("data-mode", "stale");
    expect(banner).toHaveTextContent(/outdated/i);
  });

  it("labels schedule_only", () => {
    render(
      <DataModeBanner
        dataMode={(baselineOnly as RouteSearchResponse).dataMode}
        freshness={(baselineOnly as RouteSearchResponse).freshness}
      />,
    );
    const banner = screen.getByTestId("data-mode-banner");
    expect(banner).toHaveAttribute("data-mode", "schedule_only");
    expect(banner).toHaveTextContent(/Schedule only/i);
  });
});
