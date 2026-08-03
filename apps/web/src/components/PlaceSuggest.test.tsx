import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceSuggest } from "@/components/PlaceSuggest";
import type { Place } from "@/lib/contracts";

afterEach(() => {
  cleanup();
});

const places: Place[] = [
  {
    placeId: "pl_union_sq",
    label: "Union Square",
    kind: "station",
    provider: "station_index",
    borough: "Manhattan",
  },
  {
    placeId: "pl_geo_277_park_ave",
    label: "277 Park Avenue",
    kind: "address",
    provider: "geocoder",
    providerPlaceId: "secret-vendor-id",
    formattedAddress: "277 Park Avenue, New York, NY 10017",
    attribution: "Address results via BetterMTA geocoder adapter",
  },
];

describe("PlaceSuggest", () => {
  it("renders kind/source labels and never exposes providerPlaceId", () => {
    render(
      <PlaceSuggest
        label="From"
        placeholder="Station, address, or place"
        value="Park"
        suggestions={places}
        listLabel="Origin suggestions"
        attribution="Address results via BetterMTA geocoder adapter"
        onQueryChange={() => undefined}
        onSelect={() => undefined}
        onCloseSuggestions={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Station")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText(/277 Park Avenue, New York/)).toBeInTheDocument();
    expect(screen.queryByText(/secret-vendor-id/)).toBeNull();
    expect(
      screen.getByText(/Address results via BetterMTA geocoder adapter/),
    ).toBeInTheDocument();
  });

  it("supports keyboard listbox selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PlaceSuggest
        label="From"
        placeholder="Starting station"
        value="Un"
        suggestions={[places[0]]}
        listLabel="Origin suggestions"
        onQueryChange={() => undefined}
        onSelect={onSelect}
        onCloseSuggestions={() => undefined}
      />,
    );

    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(places[0]);
  });

  it("keeps listbox options out of the page Tab order", () => {
    render(
      <PlaceSuggest
        label="From"
        placeholder="Station, address, or place"
        value="Park"
        suggestions={places}
        listLabel="Origin suggestions"
        onQueryChange={() => undefined}
        onSelect={() => undefined}
        onCloseSuggestions={() => undefined}
      />,
    );

    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
  });
});
