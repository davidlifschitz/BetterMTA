/**
 * P1 matrix #14 — GS displayed as rider-facing S.
 *
 * Catalog/presentLines may supply label "S" for lineId GS; badge disc shows S
 * while toggles keep internal lineId GS.
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

describe("P1 #14 GS displayed as S", () => {
  it("renders badge disc as S while keeping lineId GS for toggles", () => {
    const onToggle = (lineId: string) => {
      expect(lineId).toBe("GS");
    };

    render(
      <LineBadge line={gsAsS} selected={false} onToggle={onToggle} />,
    );

    const btn = screen.getByRole("button", {
      name: /S train \(42 St Shuttle\), not selected/i,
    });
    expect(btn.getAttribute("data-line-id")).toBe("GS");
    expect(btn.textContent).toMatch(/S/);
    // Disc text must be rider-facing S, not GS
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.queryByText("GS")).toBeNull();
    btn.click();
  });
});
