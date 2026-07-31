import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripApp } from "@/components/TripApp";
import { ApiClientError } from "@/lib/api/types";
import { setAnalyticsDispatcher } from "@/lib/analytics";
import completeMatch from "../../../../contracts/fixtures/routes/complete-match.json";
import linesFixture from "../../../../contracts/fixtures/lines/subway-lines.json";
import type {
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

describe("TripApp live-mode gating", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_FLAG_FEEDBACK", "false");
    setAnalyticsDispatcher(() => undefined);
    searchRoutes.mockReset();
    getLines.mockReset();
    searchPlaces.mockReset();
    getStatus.mockReset();
    getLines.mockResolvedValue(linesFixture as LinesResponse);
    searchPlaces.mockResolvedValue({
      contractVersion: "2026-07-30",
      query: "",
      places: [
        {
          placeId: "pl_carroll_st",
          label: "Carroll St",
          kind: "station",
          stationId: "st_carroll",
          borough: "Brooklyn",
        },
      ],
    } satisfies PlaceSearchResponse);
    getStatus.mockResolvedValue({
      contractVersion: "2026-07-30",
      dataMode: "live",
      staticDatasetVersion: "gtfs_v1",
      realtimeSnapshotId: "rt_1",
      realtimeAgeSeconds: 10,
      degraded: false,
      messages: [],
    } satisfies StatusResponse);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    setAnalyticsDispatcher(() => undefined);
  });

  it("hides arrive-by option in live mode", () => {
    render(<TripApp />);
    expect(
      screen.queryByRole("option", { name: /Arrive by/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Leave now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Depart at/i }),
    ).toBeInTheDocument();
  });

  it("does not render feedback or fixture hint when flag off", async () => {
    const user = userEvent.setup();
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);

    render(<TripApp />);
    expect(screen.queryByTestId("fixture-hint")).not.toBeInTheDocument();

    const from = screen.getByPlaceholderText(/Starting station/i);
    await user.type(from, "Ca");
    await waitFor(
      () => {
        expect(
          screen.getByRole("listbox", { name: /Origin suggestions/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /Carroll St/i }));

    searchPlaces.mockResolvedValue({
      contractVersion: "2026-07-30",
      query: "Br",
      places: [
        {
          placeId: "pl_bryant_park",
          label: "Bryant Park",
          kind: "station",
          stationId: "st_bryant",
          borough: "Manhattan",
        },
      ],
    });
    const to = screen.getByPlaceholderText(/Destination station/i);
    await user.type(to, "Br");
    await waitFor(
      () => {
        expect(
          screen.getByRole("listbox", { name: /Destination suggestions/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /Bryant Park/i }));

    await user.click(screen.getByTestId("find-routes"));
    await waitFor(() => {
      expect(screen.getAllByTestId("route-card").length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId("search-feedback")).not.toBeInTheDocument();
  });

  it("uses coordinate PlaceRef on geolocation grant (no demo mapping)", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
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
    });
    Object.defineProperty(global.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<TripApp />);
    await user.click(screen.getByTestId("use-my-location"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Starting station/i)).toHaveValue(
        "Current location",
      );
    });
    expect(screen.getByTestId("location-status")).toHaveTextContent(
      /current coordinates/i,
    );

    searchPlaces.mockResolvedValue({
      contractVersion: "2026-07-30",
      query: "Br",
      places: [
        {
          placeId: "pl_bryant_park",
          label: "Bryant Park",
          kind: "station",
          stationId: "st_bryant",
          borough: "Manhattan",
        },
      ],
    });
    const to = screen.getByPlaceholderText(/Destination station/i);
    await user.type(to, "Br");
    await waitFor(
      () => {
        expect(
          screen.getByRole("option", { name: /Bryant Park/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /Bryant Park/i }));
    searchRoutes.mockResolvedValue(completeMatch as RouteSearchResponse);
    await user.click(screen.getByTestId("find-routes"));
    await waitFor(() => expect(searchRoutes).toHaveBeenCalled());
    const req = searchRoutes.mock.calls[0][0];
    expect(req.origin).toEqual({
      coordinate: { lat: 40.679, lon: -73.995 },
      label: "Current location",
    });
    expect(req.origin).not.toHaveProperty("placeId");
  });

  it("renders distinct timeout and rate_limited states", async () => {
    const user = userEvent.setup();
    Object.defineProperty(global.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 40.68,
              longitude: -73.99,
              accuracy: 5,
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
      },
    });
    render(<TripApp />);
    await user.click(screen.getByTestId("use-my-location"));
    searchPlaces.mockResolvedValue({
      contractVersion: "2026-07-30",
      query: "Br",
      places: [
        {
          placeId: "pl_bryant_park",
          label: "Bryant Park",
          kind: "station",
          borough: "Manhattan",
        },
      ],
    });
    await user.type(screen.getByPlaceholderText(/Destination station/i), "Br");
    await waitFor(
      () =>
        expect(
          screen.getByRole("option", { name: /Bryant Park/i }),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /Bryant Park/i }));

    searchRoutes.mockRejectedValue(
      new ApiClientError(504, {
        error: {
          code: "timeout",
          message: "Upstream routing timed out.",
          requestId: "req_to",
        },
      }),
    );
    await user.click(screen.getByTestId("find-routes"));
    await waitFor(() => {
      expect(screen.getByTestId("timeout-state")).toBeInTheDocument();
    });

    searchRoutes.mockRejectedValue(
      new ApiClientError(429, {
        error: {
          code: "rate_limited",
          message: "Slow down.",
          requestId: "req_rl",
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => {
      expect(screen.getByTestId("rate-limited-state")).toBeInTheDocument();
    });
  });
});
