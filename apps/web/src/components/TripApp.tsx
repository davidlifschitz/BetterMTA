"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import type {
  ApiErrorBody,
  Itinerary,
  Line,
  Place,
  PlaceRef,
  RouteSearchResponse,
  Timing,
} from "@/lib/contracts";
import { track } from "@/lib/analytics";
import {
  detectViewport,
  displayItineraries,
  summarizeSelectedLines,
} from "@/lib/format";
import { LinePicker } from "@/components/LinePicker";
import { DataModeBanner } from "@/components/DataModeBanner";
import { PartialSatisfactionBanner, RouteCard } from "@/components/RouteCard";
import { LoadingState, StateMessage } from "@/components/StateMessage";
import { RouteDetail } from "@/components/RouteDetail";
import { PlaceSuggest } from "@/components/PlaceSuggest";
import { SearchFeedback } from "@/components/SearchFeedback";

type UiPhase =
  | "search"
  | "loading"
  | "results"
  | "detail"
  | "empty"
  | "invalid"
  | "error"
  | "no_route"
  | "unavailable";

type PlaceField = {
  query: string;
  selected: Place | null;
};

type LocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

const DEMO_ORIGINS: Place[] = [
  {
    placeId: "pl_carroll_st",
    label: "Carroll St",
    kind: "station",
    stationId: "st_carroll",
    borough: "Brooklyn",
  },
  {
    placeId: "pl_union_sq",
    label: "Union Square",
    kind: "station",
    stationId: "st_union_sq",
    borough: "Manhattan",
  },
  {
    placeId: "pl_nopath",
    label: "No Path Demo",
    kind: "poi",
  },
  {
    placeId: "pl_unavailable",
    label: "Unavailable Demo",
    kind: "poi",
  },
];

const DEMO_DESTS: Place[] = [
  {
    placeId: "pl_bryant_park",
    label: "Bryant Park",
    kind: "station",
    stationId: "st_bryant",
    borough: "Manhattan",
  },
  {
    placeId: "pl_union_st_bk",
    label: "Union St",
    kind: "station",
    stationId: "st_union_st",
    borough: "Brooklyn",
  },
];

const IS_FIXTURE_MODE =
  (process.env.NEXT_PUBLIC_API_MODE ?? "fixture") !== "live";

function toPlaceRef(place: Place): PlaceRef {
  if (
    (place.kind === "coordinate" || place.kind === "current_location") &&
    typeof place.lat === "number" &&
    typeof place.lon === "number" &&
    !IS_FIXTURE_MODE
  ) {
    return {
      coordinate: { lat: place.lat, lon: place.lon },
      label: place.label,
    };
  }
  return { placeId: place.placeId };
}

export function TripApp() {
  const [lines, setLines] = useState<Line[]>([]);
  const [origin, setOrigin] = useState<PlaceField>({
    query: "Carroll St",
    selected: DEMO_ORIGINS[0],
  });
  const [destination, setDestination] = useState<PlaceField>({
    query: "Bryant Park",
    selected: DEMO_DESTS[0],
  });
  const [timing, setTiming] = useState<Timing>({ type: "depart_now" });
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<UiPhase>("search");
  const [response, setResponse] = useState<RouteSearchResponse | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(
    null,
  );
  const [invalidMessage, setInvalidMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [originSuggestions, setOriginSuggestions] = useState<Place[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Place[]>([]);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    api.getLines().then((res) => {
      if (!cancelled) setLines(res.lines);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lineSummary = useMemo(
    () => summarizeSelectedLines(lines, selectedLineIds),
    [lines, selectedLineIds],
  );

  const runSearch = useCallback(
    async (opts?: { fromLineEdit?: boolean }) => {
      if (!origin.selected || !destination.selected) {
        setPhase("invalid");
        setInvalidMessage("Enter both a starting point and a destination.");
        track("error_viewed", { code: "invalid_input" });
        return;
      }
      if (origin.selected.placeId === destination.selected.placeId) {
        setPhase("invalid");
        setInvalidMessage("Origin and destination must be different.");
        track("error_viewed", { code: "invalid_input" });
        return;
      }

      setPhase("loading");
      setError(null);
      setSelectedItinerary(null);

      const viewport = detectViewport();

      if (opts?.fromLineEdit && hasSearched) {
        track("lines_updated_rerun", {
          selectedLineCount: selectedLineIds.length,
          preservedOd: true,
        });
      } else {
        track("search_started", {
          hasSelectedLines: selectedLineIds.length > 0,
          selectedLineCount: selectedLineIds.length,
          timingType: timing.type,
          viewport,
        });
      }

      try {
        const res = await api.searchRoutes({
          origin: toPlaceRef(origin.selected),
          destination: toPlaceRef(destination.selected),
          timing,
          selectedLineIds:
            selectedLineIds.length > 0 ? selectedLineIds : undefined,
          clientContext: { viewport },
        });

        setResponse(res);
        setHasSearched(true);

        const shown = displayItineraries(res);
        track("results_viewed", {
          requestId: res.requestId,
          dataMode: res.dataMode,
          resultCount: shown.itineraries.length,
          completeMatchFound:
            res.constrained.satisfactionSummary.completeMatchFound,
          bestSatisfactionCount:
            res.constrained.satisfactionSummary.bestSatisfactionCount,
          requestedCount: res.constrained.satisfactionSummary.requestedCount,
        });

        if (shown.itineraries.length === 0) {
          setPhase("empty");
        } else {
          setPhase("results");
        }
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.body);
          track("error_viewed", {
            code: err.body.error.code,
            requestId: err.body.error.requestId,
          });
          if (err.body.error.code === "no_transit_path") {
            setPhase("no_route");
          } else if (err.body.error.code === "data_unavailable") {
            setPhase("unavailable");
          } else {
            setPhase("error");
          }
        } else {
          setError({
            error: {
              code: "internal_error",
              message: "Something went wrong. Please try again.",
              requestId: "client",
            },
          });
          setPhase("error");
          track("error_viewed", { code: "internal_error" });
        }
      }
    },
    [
      origin.selected,
      destination.selected,
      timing,
      selectedLineIds,
      hasSearched,
    ],
  );

  async function onPlaceQuery(
    field: "origin" | "destination",
    query: string,
  ) {
    if (field === "origin") {
      setOrigin({ query, selected: null });
    } else {
      setDestination({ query, selected: null });
    }
    if (query.trim().length < 2) {
      if (field === "origin") setOriginSuggestions([]);
      else setDestSuggestions([]);
      return;
    }
    const local =
      field === "origin"
        ? DEMO_ORIGINS.filter((p) =>
            p.label.toLowerCase().includes(query.toLowerCase()),
          )
        : DEMO_DESTS.filter((p) =>
            p.label.toLowerCase().includes(query.toLowerCase()),
          );
    try {
      const remote = await api.searchPlaces(query);
      const merged = [...local, ...remote.places].filter(
        (p, i, arr) => arr.findIndex((x) => x.placeId === p.placeId) === i,
      );
      if (field === "origin") setOriginSuggestions(merged);
      else setDestSuggestions(merged);
    } catch {
      if (field === "origin") setOriginSuggestions(local);
      else setDestSuggestions(local);
    }
  }

  function selectPlace(field: "origin" | "destination", place: Place) {
    if (field === "origin") {
      setOrigin({ query: place.label, selected: place });
      setOriginSuggestions([]);
    } else {
      setDestination({ query: place.label, selected: place });
      setDestSuggestions([]);
    }
    track("place_selected", {
      field,
      placeKind: place.kind,
      placeId: place.placeId,
    });
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("unsupported");
      track("location_permission", {
        outcome: "unsupported",
        mappedToFixtureOrigin: false,
      });
      return;
    }

    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (IS_FIXTURE_MODE) {
          const mapped: Place = {
            ...DEMO_ORIGINS[0],
            kind: "current_location",
            label: "Near you (demo — mapped to Carroll St)",
            lat,
            lon,
          };
          setOrigin({ query: mapped.label, selected: mapped });
          setOriginSuggestions([]);
          setLocationStatus("granted");
          track("location_permission", {
            outcome: "granted",
            mappedToFixtureOrigin: true,
          });
          track("place_selected", {
            field: "origin",
            placeKind: "current_location",
            placeId: mapped.placeId,
          });
          return;
        }

        const livePlace: Place = {
          placeId: `coord_${lat.toFixed(5)}_${lon.toFixed(5)}`,
          label: "Current location",
          kind: "current_location",
          lat,
          lon,
        };
        setOrigin({ query: livePlace.label, selected: livePlace });
        setOriginSuggestions([]);
        setLocationStatus("granted");
        track("location_permission", {
          outcome: "granted",
          mappedToFixtureOrigin: false,
        });
        track("place_selected", {
          field: "origin",
          placeKind: "current_location",
          placeId: livePlace.placeId,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus("denied");
          track("location_permission", {
            outcome: "denied",
            mappedToFixtureOrigin: false,
          });
        } else {
          setLocationStatus("error");
          track("location_permission", {
            outcome: "error",
            mappedToFixtureOrigin: false,
          });
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function openPicker() {
    setPickerOpen(true);
    track("line_picker_opened", {
      selectedLineCount: selectedLineIds.length,
      context: hasSearched ? "after_search" : "before_search",
    });
  }

  function onLinesChange(next: string[]) {
    const prev = new Set(selectedLineIds);
    for (const id of next) {
      if (!prev.has(id)) {
        track("line_toggled", {
          lineId: id,
          selected: true,
          selectedLineCount: next.length,
        });
      }
    }
    for (const id of selectedLineIds) {
      if (!next.includes(id)) {
        track("line_toggled", {
          lineId: id,
          selected: false,
          selectedLineCount: next.length,
        });
      }
    }
    setSelectedLineIds(next);
  }

  function applyLines() {
    setPickerOpen(false);
    if (hasSearched) {
      void runSearch({ fromLineEdit: true });
    }
  }

  const shown = response ? displayItineraries(response) : null;

  const locationMessage = (() => {
    switch (locationStatus) {
      case "requesting":
        return "Requesting location permission…";
      case "granted":
        return IS_FIXTURE_MODE
          ? "Location granted — origin set to a fixture station near you (demo mapping)."
          : "Location granted — origin set to your current coordinates.";
      case "denied":
        return "Location permission denied. Enter a starting station instead.";
      case "unsupported":
        return "Location is not supported in this browser.";
      case "error":
        return "Couldn’t read your location. Enter a starting station instead.";
      default:
        return null;
    }
  })();

  return (
    <div className="app-shell">
      <header className="topbar">
        <p className="wordmark">BetterMTA</p>
        <p className="tagline">Routes that listen to your lines</p>
      </header>

      <section className="search-panel" aria-label="Trip search">
        <PlaceSuggest
          label="From"
          placeholder="Starting station"
          value={origin.query}
          suggestions={originSuggestions}
          listLabel="Origin suggestions"
          onQueryChange={(q) => void onPlaceQuery("origin", q)}
          onSelect={(p) => selectPlace("origin", p)}
          onCloseSuggestions={() => setOriginSuggestions([])}
        />

        <div className="location-row">
          <button
            type="button"
            className="text-btn"
            onClick={useMyLocation}
            data-testid="use-my-location"
          >
            Use my location
          </button>
          {locationMessage ? (
            <p
              className="hint"
              role="status"
              data-testid="location-status"
            >
              {locationMessage}
            </p>
          ) : null}
        </div>

        <PlaceSuggest
          label="To"
          placeholder="Destination station"
          value={destination.query}
          suggestions={destSuggestions}
          listLabel="Destination suggestions"
          onQueryChange={(q) => void onPlaceQuery("destination", q)}
          onSelect={(p) => selectPlace("destination", p)}
          onCloseSuggestions={() => setDestSuggestions([])}
        />

        <label className="field">
          <span>When</span>
          <select
            value={timing.type}
            onChange={(e) => {
              const type = e.target.value as Timing["type"];
              const next: Timing =
                type === "depart_now"
                  ? { type }
                  : { type, time: new Date().toISOString() };
              setTiming(next);
              track("timing_changed", { timingType: type });
            }}
          >
            <option value="depart_now">Leave now</option>
            <option value="depart_at">Depart at…</option>
            <option value="arrive_by">Arrive by…</option>
          </select>
        </label>

        <p className="mode-row" aria-label="Transit mode">
          <span className="pill pill--ok">Subway</span>
        </p>

        <button
          type="button"
          className="lines-row"
          onClick={openPicker}
          aria-haspopup="dialog"
        >
          <span className="lines-row__label">Lines to use</span>
          <span className="lines-row__value">{lineSummary}</span>
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void runSearch()}
        >
          Find routes
        </button>
      </section>

      <main className="results" aria-live="polite">
        {phase === "loading" ? <LoadingState /> : null}

        {phase === "invalid" ? (
          <StateMessage
            title="Check your trip"
            body={invalidMessage}
            testId="invalid-state"
            actionLabel="Back to search"
            onAction={() => setPhase("search")}
          />
        ) : null}

        {phase === "no_route" ? (
          <StateMessage
            title="No subway path found"
            body={
              error?.error.message ??
              "No subway path was found between these places."
            }
            testId="no-route-state"
            actionLabel="Edit trip"
            onAction={() => setPhase("search")}
          />
        ) : null}

        {phase === "unavailable" ? (
          <StateMessage
            title="Service unavailable"
            body={
              error?.error.message ??
              "Routing is temporarily unavailable. Please try again later."
            }
            testId="unavailable-state"
            actionLabel="Try again"
            onAction={() => void runSearch()}
          />
        ) : null}

        {phase === "error" ? (
          <StateMessage
            title="Couldn’t find routes"
            body={error?.error.message ?? "Please try again."}
            testId="error-state"
            actionLabel="Try again"
            onAction={() => void runSearch()}
          />
        ) : null}

        {phase === "empty" && response ? (
          <>
            <DataModeBanner
              dataMode={response.dataMode}
              freshness={response.freshness}
            />
            <StateMessage
              title="No routes to show"
              body="Try different stations or clear some selected lines."
              testId="empty-state"
            />
            <SearchFeedback requestId={response.requestId} />
          </>
        ) : null}

        {(phase === "results" || phase === "detail") && response && shown ? (
          <>
            <DataModeBanner
              dataMode={response.dataMode}
              freshness={response.freshness}
            />
            <PartialSatisfactionBanner
              summary={response.constrained.satisfactionSummary}
            />

            <div className="results-header">
              <h2>
                {shown.source === "baseline"
                  ? "Suggested routes"
                  : "Routes using your lines"}
              </h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={openPicker}
              >
                Customize lines
              </button>
            </div>

            {phase === "detail" && selectedItinerary ? (
              <RouteDetail
                itinerary={selectedItinerary}
                lines={lines}
                onBack={() => setPhase("results")}
              />
            ) : (
              <div className="card-list">
                {shown.itineraries.map((itin) => (
                  <RouteCard
                    key={itin.itineraryId}
                    itinerary={itin}
                    lines={lines}
                    requestId={response.requestId}
                    explanationVariant={
                      response.experiment?.explanationVariant ?? "concise"
                    }
                    isBaseline={shown.source === "baseline"}
                    onSelect={(it) => {
                      setSelectedItinerary(it);
                      setPhase("detail");
                    }}
                  />
                ))}
              </div>
            )}

            <SearchFeedback requestId={response.requestId} />
          </>
        ) : null}

        {phase === "search" ? (
          <p className="hint-block">
            Tip: pick F + B for a complete match demo, A + G + L for partial, or
            only the 7 for a stale-data warning. Fixture mode is active.
          </p>
        ) : null}
      </main>

      <footer className="footer">
        <p>
          Schedule data © MTA. BetterMTA is an independent project and is not
          affiliated with the MTA.
        </p>
      </footer>

      <LinePicker
        open={pickerOpen}
        lines={lines}
        selectedLineIds={selectedLineIds}
        onChange={onLinesChange}
        onClose={() => setPickerOpen(false)}
        onApply={applyLines}
        applyLabel={hasSearched ? "Update routes" : "Save lines"}
      />
    </div>
  );
}
