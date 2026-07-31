import { describe, expect, it } from "vitest";
import {
  formatLineIdList,
  GS_FALLBACK_LINE,
  lineMatchesQuery,
  presentLines,
  riderLineDisplayName,
  riderLineLabel,
  withShuttleLine,
} from "@/lib/line-display";
import type { Line } from "@/lib/contracts";

const f: Line = {
  lineId: "F",
  label: "F",
  displayName: "F train",
  color: "#FF6319",
  textColor: "#fff",
  isActive: true,
  gtfsRouteIds: ["F"],
};

describe("line-display GS → S", () => {
  it("maps internal GS to rider-facing S", () => {
    expect(riderLineLabel("GS")).toBe("S");
    expect(riderLineDisplayName("GS")).toMatch(/S train/i);
    expect(riderLineLabel("F", f)).toBe("F");
  });

  it("presents catalog labels without renaming lineId", () => {
    const presented = presentLines([GS_FALLBACK_LINE]);
    expect(presented[0].lineId).toBe("GS");
    expect(presented[0].label).toBe("S");
  });

  it("matches S / shuttle aliases to GS", () => {
    expect(lineMatchesQuery(GS_FALLBACK_LINE, "S")).toBe(true);
    expect(lineMatchesQuery(GS_FALLBACK_LINE, "shuttle")).toBe(true);
    expect(lineMatchesQuery(GS_FALLBACK_LINE, "42")).toBe(true);
    expect(lineMatchesQuery(f, "S")).toBe(false);
  });

  it("formats coverage lists with S for GS", () => {
    expect(formatLineIdList(["2", "GS", "7"], [GS_FALLBACK_LINE])).toBe(
      "2, S, 7",
    );
  });

  it("injects shuttle when catalog omits GS", () => {
    const lines = withShuttleLine([f]);
    expect(lines.some((l) => l.lineId === "GS")).toBe(true);
    expect(lines.find((l) => l.lineId === "GS")?.label).toBe("S");
  });
});
