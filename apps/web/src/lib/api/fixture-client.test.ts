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
});
