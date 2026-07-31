import { describe, expect, it } from "vitest";
import { createFixtureApiClient } from "@/lib/api/fixture-client";
import { ApiClientError } from "@/lib/api/types";

describe("fixture API client", () => {
  const api = createFixtureApiClient();

  it("returns schedule_only baseline when no lines selected", async () => {
    const res = await api.searchRoutes({
      origin: { placeId: "pl_a" },
      destination: { placeId: "pl_b" },
      timing: { type: "depart_now" },
    });
    expect(res.dataMode).toBe("schedule_only");
    expect(res.baseline.itineraries.length).toBeGreaterThan(0);
  });

  it("returns partial match for A+G+L", async () => {
    const res = await api.searchRoutes({
      origin: { placeId: "pl_a" },
      destination: { placeId: "pl_b" },
      timing: { type: "depart_now" },
      selectedLineIds: ["A", "G", "L"],
    });
    expect(res.constrained.satisfactionSummary.completeMatchFound).toBe(false);
  });

  it("returns stale fixture for the 7", async () => {
    const res = await api.searchRoutes({
      origin: { placeId: "pl_a" },
      destination: { placeId: "pl_b" },
      timing: { type: "depart_now" },
      selectedLineIds: ["7"],
    });
    expect(res.dataMode).toBe("stale");
  });

  it("throws no_transit_path for nopath places", async () => {
    await expect(
      api.searchRoutes({
        origin: { placeId: "pl_nopath" },
        destination: { placeId: "pl_b" },
        timing: { type: "depart_now" },
      }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it("throws insufficient_candidate_coverage for 2+7+GS", async () => {
    try {
      await api.searchRoutes({
        origin: { placeId: "pl_a" },
        destination: { placeId: "pl_b" },
        timing: { type: "depart_now" },
        selectedLineIds: ["2", "7", "GS"],
      });
      throw new Error("expected coverage failure");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).body.error.code).toBe(
        "insufficient_candidate_coverage",
      );
    }
  });

  it("returns address/POI places for park queries and includes GS in lines", async () => {
    const lines = await api.getLines();
    expect(lines.lines.some((l) => l.lineId === "GS")).toBe(true);
    const places = await api.searchPlaces("277 Park");
    expect(places.places.some((p) => p.kind === "address")).toBe(true);
    expect(places.attribution).toMatch(/geocoder adapter/i);
    expect(
      places.places.every((p) => !("host" in p) && p.provider !== "mapbox.com"),
    ).toBe(true);
  });

  it("adds connector_filled fact on complete-match demos", async () => {
    const res = await api.searchRoutes({
      origin: { placeId: "pl_a" },
      destination: { placeId: "pl_b" },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
    });
    expect(
      res.constrained.itineraries[0].explanation.facts.some(
        (f) => f.type === "connector_filled",
      ),
    ).toBe(true);
  });
});
