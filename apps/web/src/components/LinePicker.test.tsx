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
  {
    lineId: "GS",
    label: "GS",
    displayName: "42 St Shuttle",
    color: "#808183",
    textColor: "#FFFFFF",
    isActive: true,
    gtfsRouteIds: ["GS"],
  },
];

describe("LinePicker", () => {
  it("shows preferred-line summary and S alias for GS", () => {
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

    expect(screen.getByRole("heading", { name: /Preferred lines/i })).toBeInTheDocument();
    expect(screen.getByTestId("line-summary")).toHaveTextContent(
      "Preferring the A and L",
    );
    expect(
      screen.getByRole("button", { name: /A train, selected/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /G train, not selected/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /S train.*not selected/i }),
    ).toHaveAttribute("data-line-id", "GS");
  });

  it("filters GS via rider-facing S alias", async () => {
    const user = userEvent.setup();
    render(
      <LinePicker
        open
        lines={lines}
        selectedLineIds={[]}
        onChange={() => undefined}
        onClose={() => undefined}
        onApply={() => undefined}
      />,
    );
    await user.type(screen.getByTestId("line-filter"), "S");
    expect(
      screen.getByRole("button", { name: /S train/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /A train/i }),
    ).toBeNull();
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

  it("traps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <LinePicker
        open
        lines={lines}
        selectedLineIds={[]}
        onChange={() => undefined}
        onClose={() => undefined}
        onApply={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });
});
