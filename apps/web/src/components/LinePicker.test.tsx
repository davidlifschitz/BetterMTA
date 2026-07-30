import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinePicker } from "@/components/LinePicker";
import type { Line } from "@/lib/contracts";

afterEach(() => {
  cleanup();
});

const lines: Line[] = [
  {
    lineId: "A",
    label: "A",
    displayName: "A train",
    color: "#0039A6",
    textColor: "#FFFFFF",
    isActive: true,
    gtfsRouteIds: ["A"],
  },
  {
    lineId: "G",
    label: "G",
    displayName: "G train",
    color: "#6CBE45",
    textColor: "#FFFFFF",
    isActive: true,
    gtfsRouteIds: ["G"],
  },
  {
    lineId: "L",
    label: "L",
    displayName: "L train",
    color: "#A7A9AC",
    textColor: "#000000",
    isActive: true,
    gtfsRouteIds: ["L"],
  },
];

describe("LinePicker", () => {
  it("shows accounting summary for selected lines", () => {
    render(
      <LinePicker
        open
        lines={lines}
        selectedLineIds={["A", "L"]}
        onChange={() => undefined}
        onClose={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(screen.getByTestId("line-summary")).toHaveTextContent(
      "Using the A and L",
    );
    expect(
      screen.getByRole("button", { name: /A train, selected/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /G train, not selected/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("supports keyboard toggle and Escape close", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();

    render(
      <LinePicker
        open
        lines={lines}
        selectedLineIds={[]}
        onChange={onChange}
        onClose={onClose}
        onApply={() => undefined}
      />,
    );

    const first = screen.getByRole("button", { name: /A train, not selected/i });
    expect(first).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["A"]);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
