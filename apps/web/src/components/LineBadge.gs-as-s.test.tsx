/**
 * P1 matrix #14 — GS displayed as rider-facing S.
 *
 * SKIP / TODO until Wave 1 frontend (or lines catalog) ships
 * `lineId: "GS"` with `label: "S"` / displayName referencing the 42 St Shuttle.
 * Internal GTFS lineId must remain GS; only the badge label changes.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { LineBadge } from "@/components/LineBadge";
import type { Line } from "@/lib/contracts";

afterEach(() => {
  cleanup();
});

const gsAsS: Line = {
  lineId: "GS",
  label: "S",
  displayName: "42 St Shuttle",
  color: "#808183",
  textColor: "#FFFFFF",
  isActive: true,
  gtfsRouteIds: ["GS"],
};

describe.skip("P1 #14 GS displayed as S (pending Wave 1 FE / catalog)", () => {
  it("renders badge disc as S while keeping lineId GS for toggles", () => {
    const onToggle = (lineId: string) => {
      expect(lineId).toBe("GS");
    };

    render(
      <LineBadge line={gsAsS} selected={false} onToggle={onToggle} />,
    );

    expect(screen.getByRole("button").textContent).toMatch(/S/);
    expect(
      screen.getByRole("button", { name: /42 St Shuttle, not selected/i }),
    ).toBeTruthy();
    // Disc text must be rider-facing S, not GS
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.queryByText("GS")).toBeNull();
  });
});
