import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripApp } from "@/components/TripApp";
import { ApiClientError } from "@/lib/api/types";
import { setAnalyticsDispatcher } from "@/lib/analytics";
import completeMatch from "../../../../contracts/fixtures/routes/complete-match.json";
import partialMatch from "../../../../contracts/fixtures/routes/partial-match.json";
import degradedRealtime from "../../../../contracts/fixtures/routes/degraded-realtime.json";
import baselineOnly from "../../../../contracts/fixtures/routes/baseline-only.json";
import noTransitPath from "../../../../contracts/fixtures/errors/no-transit-path.json";
import unknownLine from "../../../../contracts/fixtures/errors/unknown-line.json";
import insufficientCoverage from "../../../../contracts/fixtures/errors/insufficient-candidate-coverage.json";
import addressPlaces from "../../../../contracts/fixtures/places/place-search-address.json";
import linesFixture from "../../../../contracts/fixtures/lines/subway-lines.json";
import type {
  ApiErrorBody,
  LinesResponse,
  PlaceSearchResponse,
  RouteSearchResponse,
  StatusResponse,
} from "@/lib/contracts";

const { searchRoutes, getLines, searchPlaces, getStatus } = vi.hoisted(() => ({
  searchRoutes: vi.fn(),
  getLines: vi.fn(),
  searchPlaces: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/types")>(
    "@/lib/api/types",
  );
  return {
    api: {
      searchRoutes: (...args: unknown[]) => searchRoutes(...args),
      getLines: (...args: unknown[]) => getLines(...args),
      searchPlaces: (...args: unknown[]) => searchPlaces(...args),
      getStatus: (...args: unknown[]) => getStatus(...args),
    },
    ApiClientError: actual.ApiClientError,
    isApiErrorBody: actual.isApiErrorBody,
  };
});

afterEach(() => {
  cleanup();
  setAnalyticsDispatcher(() => undefined);
  vi.unstubAllEnvs();
});

describe("TripApp states", () => {
  beforeEach(() => {
    setAnalyticsDispatcher(() => undefined);
    searchRoutes.mockReset();
    getLines.mockReset();
    searchPlaces.mockReset();
    getStatus.mockReset();
    getLines.mockResolvedValue(linesFixture as LinesResponse);
    searchPlaces.mockResolvedValue({
      contractVersion: "2026-07-30",
      query: "",
      places: [],
    } satisfies PlaceSearchResponse);
    getStatus.mockResolvedValue({
      contractVersion: "2026-07-30",
      dataMode: "synthetic",
      staticDatasetVersion: "gtfs_fixture_v1",
      realtimeSnapshotId: null,
      realtimeAgeSeconds: 0,
      degraded: false,
      messages: [],
    } satisfies StatusResponse);
  });

  it("renders complete synthetic results", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    render(<TripApp />);

    await user.click(screen.getByRole("button", { name: /Preferred lines/i }));
    await user.click(screen.getByRole("button", { name: /F train, not selected/i }));
    await user.click(screen.getByRole("button", { name: /B train, not selected/i }));
    await user.click(screen.getByRole("button", { name: /Save lines/i }));
    await user.click(screen.getByRole("button", { name: /Find routes/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-mode-banner")).toHaveAttribute(
        "data-mode",
        "synthetic",
      );
    });
    expect(screen.getAllByTestId("route-card").length).toBeGreaterThan(0);
    expect(screen.getByTestId("complete-banner")).toHaveTextContent(
      /Using your preferred lines/i,
    );
  });

  it("renders partial preferred-line messaging", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(partialMatch as RouteSearchResponse);
    render(<TripApp />);

    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("partial-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("partial-banner")).toHaveTextContent(
      /Couldn’t use all preferences/i,
    );
  });

  it("renders stale warning", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(degradedRealtime as RouteSearchResponse);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("data-mode-banner")).toHaveAttribute(
        "data-mode",
        "stale",
      );
    });
  });

  it("renders schedule_only baseline results", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(baselineOnly as RouteSearchResponse);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("data-mode-banner")).toHaveAttribute(
        "data-mode",
        "schedule_only",
      );
    });
    expect(screen.getByText(/Suggested routes/i)).toBeInTheDocument();
  });

  it("renders no_transit_path state", async () => {
    const user = userEvent.setup();
    searchRoutes.mockRejectedValue(
      new ApiClientError(404, noTransitPath as ApiErrorBody),
    );
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("no-route-state")).toBeInTheDocument();
    });
  });

  it("renders unavailable state", async () => {
    const user = userEvent.setup();
    searchRoutes.mockRejectedValue(
      new ApiClientError(503, {
        error: {
          code: "data_unavailable",
          message: "Routing is temporarily unavailable. Please try again later.",
          requestId: "req_x",
        },
      }),
    );
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("unavailable-state")).toBeInTheDocument();
    });
  });

  it("renders unknown_line error UI", async () => {
    const user = userEvent.setup();
    searchRoutes.mockRejectedValue(
      new ApiClientError(400, unknownLine as ApiErrorBody),
    );
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("error-state")).toHaveTextContent(
      /not recognized/i,
    );
  });

  it("renders loading state while search is in flight", async () => {
    const user = userEvent.setup();
    let resolveSearch!: (value: RouteSearchResponse) => void;
    searchRoutes.mockImplementation(
      () =>
        new Promise<RouteSearchResponse>((resolve) => {
          resolveSearch = resolve;
        }),
    );
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    expect(screen.getByTestId("loading-state")).toBeInTheDocument();
    resolveSearch(completeMatch as RouteSearchResponse);
    await waitFor(() => {
      expect(screen.queryByTestId("loading-state")).not.toBeInTheDocument();
    });
  });

  it("renders empty results state from empty itinerary response", async () => {
    const user = userEvent.setup();
    const empty: RouteSearchResponse = {
      ...(completeMatch as RouteSearchResponse),
      baseline: { itineraries: [] },
      constrained: {
        itineraries: [],
        satisfactionSummary: {
          bestSatisfactionCount: 0,
          requestedCount: 0,
          completeMatchFound: false,
        },
      },
    };
    searchRoutes.mockResolvedValue(empty);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("opens route detail from a route card", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getAllByTestId("route-card").length).toBeGreaterThan(0);
    });
    const cards = screen.getAllByTestId("route-card");
    const main = cards[0].querySelector("button.route-card__main");
    expect(main).toBeTruthy();
    await user.click(main!);
    expect(screen.getByTestId("route-detail")).toBeInTheDocument();
    expect(screen.getByText(/Back to results/i)).toBeInTheDocument();
  });

  it("renders invalid input when OD cleared", async () => {
    const user = userEvent.setup();
    render(<TripApp />);
    const from = screen.getByPlaceholderText(/Starting station/i);
    await user.clear(from);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    expect(screen.getByTestId("invalid-state")).toBeInTheDocument();
  });

  it("re-runs search after line edit without clearing OD", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    render(<TripApp />);

    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => expect(searchRoutes).toHaveBeenCalledTimes(1));

    await user.click(
      screen.getByRole("button", { name: /Customize preferred lines/i }),
    );
    await user.click(screen.getByRole("button", { name: /7 train, not selected/i }));
    await user.click(screen.getByRole("button", { name: /Update routes/i }));

    await waitFor(() => expect(searchRoutes).toHaveBeenCalledTimes(2));
    const second = searchRoutes.mock.calls[1][0];
    expect(second.origin).toEqual({ placeId: "pl_carroll_st" });
    expect(second.destination).toEqual({ placeId: "pl_bryant_park" });
    expect(second.selectedLineIds).toContain("7");
  });

  it("requests geolocation and fills origin on grant (fixture mapping)", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.679,
            longitude: -73.995,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return {};
            },
          },
          timestamp: Date.now(),
          toJSON() {
            return {};
          },
        } as GeolocationPosition);
      },
    );
    Object.defineProperty(global.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<TripApp />);
    await user.click(screen.getByTestId("use-my-location"));
    expect(getCurrentPosition).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Starting station/i)).toHaveValue(
        "Near you (demo — mapped to Carroll St)",
      );
    });
    expect(screen.getByTestId("location-status")).toHaveTextContent(
      /fixture station/i,
    );
  });

  it("handles geolocation denial gracefully", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        } as GeolocationPositionError);
      },
    );
    Object.defineProperty(global.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<TripApp />);
    await user.click(screen.getByTestId("use-my-location"));
    await waitFor(() => {
      expect(screen.getByTestId("location-status")).toHaveTextContent(
        /permission denied/i,
      );
    });
  });

  it("submits anonymous feedback tied to requestId", async () => {
    const user = userEvent.setup();
    const events: Array<{ name: string; properties: Record<string, unknown> }> =
      [];
    setAnalyticsDispatcher((event) => {
      events.push({
        name: event.name,
        properties: event.properties as Record<string, unknown>,
      });
    });
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("search-feedback")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Thumbs up/i }));
    await user.type(
      screen.getByPlaceholderText(/Short note/i),
      "Clear results",
    );
    await user.click(screen.getByRole("button", { name: /Send feedback/i }));
    await waitFor(() => {
      expect(screen.getByTestId("feedback-thanks")).toBeInTheDocument();
    });
    const feedback = events.find((e) => e.name === "feedback_submitted");
    expect(feedback).toBeTruthy();
    expect(feedback?.properties.requestId).toBe("req_fixture_complete");
    expect(feedback?.properties.rating).toBe("up");
    expect(feedback?.properties.hasComment).toBe(true);
    expect(feedback?.properties).not.toHaveProperty("lat");
    expect(feedback?.properties).not.toHaveProperty("lon");
  });

  it("supports autocomplete keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<TripApp />);
    const from = screen.getByPlaceholderText(/Starting station/i);
    await user.clear(from);
    await user.type(from, "Ca");
    await waitFor(
      () => {
        expect(
          screen.getByRole("listbox", { name: /Origin suggestions/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    await user.keyboard("{ArrowDown}");
    const option = screen.getByRole("option", { name: /Carroll St/i });
    expect(option).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(from).toHaveValue("Carroll St");
    });
    expect(
      screen.queryByRole("listbox", { name: /Origin suggestions/i }),
    ).not.toBeInTheDocument();
  });

  it("renders insufficient_candidate_coverage failure UI", async () => {
    const user = userEvent.setup();
    searchRoutes.mockRejectedValue(
      new ApiClientError(503, insufficientCoverage as ApiErrorBody),
    );
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => {
      expect(screen.getByTestId("coverage-failure-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("coverage-failure-details")).toHaveTextContent(
      /Preferred lines: 2, 7, S/,
    );
  });

  it("keeps station-first suggestions when address/POI flag is off", async () => {
    const user = userEvent.setup();
    searchPlaces.mockResolvedValue(addressPlaces as PlaceSearchResponse);
    render(<TripApp />);
    const from = screen.getByPlaceholderText(/Starting station/i);
    await user.clear(from);
    await user.type(from, "277");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalled());
    expect(
      screen.queryByRole("option", { name: /277 Park/i }),
    ).toBeNull();
  });

  it("shows address/POI suggestions when flag is on", async () => {
    const user = userEvent.setup();
    vi.stubEnv("NEXT_PUBLIC_FLAG_ADDRESS_POI", "true");
    searchPlaces.mockResolvedValue(addressPlaces as PlaceSearchResponse);
    render(<TripApp />);
    const from = screen.getByPlaceholderText(/From — Station, address, or place/i);
    await user.clear(from);
    await user.type(from, "277");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /277 Park/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/prov_opaque/)).toBeNull();
  });

  it("derives viewport from matchMedia for search analytics", async () => {
    const user = userEvent.setup();
    const events: Array<{ name: string; properties: Record<string, unknown> }> =
      [];
    setAnalyticsDispatcher((event) => {
      events.push({
        name: event.name,
        properties: event.properties as Record<string, unknown>,
      });
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px") ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    render(<TripApp />);
    await user.click(screen.getByRole("button", { name: /Find routes/i }));
    await waitFor(() => expect(searchRoutes).toHaveBeenCalled());
    const started = events.find((e) => e.name === "search_started");
    expect(started?.properties.viewport).toBe("desktop");
    expect(searchRoutes.mock.calls[0][0].clientContext.viewport).toBe(
      "desktop",
    );
  });
});
