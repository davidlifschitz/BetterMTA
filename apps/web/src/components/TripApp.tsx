"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import type {
  ApiErrorBody,
  Itinerary,
  Line,
  Place,
  RouteSearchResponse,
  Timing,
} from "@/lib/contracts";
import { track } from "@/lib/analytics";
import {
  detectViewport,
  displayItineraries,
  summarizeSelectedLines,
} from "@/lib/format";
import {
  errorUiForCode,
  NETWORK_UNAVAILABLE_UI,
  type ErrorUiPhase,
} from "@/lib/api-error-ui";
import {
  placeFromGeolocation,
  toPlaceRef,
} from "@/lib/geolocation-place";
import {
  isFixtureMode,
  shouldOfferArriveBy,
  shouldShowFeedback,
} from "@/lib/mode";
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
  | "unavailable"
  | "timeout"
  | "rate_limited";

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
  | "timeout"
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

const PLACE_DEBOUNCE_MS = 250;

function initialOrigin(): PlaceField {
  if (isFixtureMode()) {
    return { query: "Carroll St", selected: DEMO_ORIGINS[0] };
  }
  return { query: "", selected: null };
}

function initialDestination(): PlaceField {
  if (isFixtureMode()) {
    return { query: "Bryant Park", selected: DEMO_DESTS[0] };
  }
  return { query: "", selected: null };
}

export function TripApp() {
  const fixture = isFixtureMode();
  const showFeedback = shouldShowFeedback();
  const offerArriveBy = shouldOfferArriveBy();

  const [lines, setLines] = useState<Line[]>([]);
  const [origin, setOrigin] = useState<PlaceField>(initialOrigin);
  const [destination, setDestination] = useState<PlaceField>(initialDestination);
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
  const originDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const originTimer = originDebounce;
    const destTimer = destDebounce;
    api.getLines().then((res) => {
      if (!cancelled) setLines(res.lines);
    });
    return () => {
      cancelled = true;
      if (originTimer.current) clearTimeout(originTimer.current);
      if (destTimer.current) clearTimeout(destTimer.current);
    };
  }, []);

  const lineSummary = useMemo(
    () => summarizeSelectedLines(lines, selectedLineIds),
    [lines, selectedLineIds],
  );

  const applyApiError = useCallback((body: ApiErrorBody) => {
    setError(body);
    const ui = errorUiForCode(body.error.code);
    setPhase(ui.phase as UiPhase);
    if (ui.phase === "invalid") {
      setInvalidMessage(body.error.message || ui.defaultBody);
    }
    track("error_viewed", {
      code: body.error.code,
      requestId: body.error.requestId,
    });
  }, []);

  const runSearch = useCallback(
    async (opts?: { fromLineEdit?: boolean }) => {
      if (!origin.selected || !destination.selected) {
        setPhase("invalid");
        setInvalidMessage("Enter both a starting point and a destination.");
        track("error_viewed", { code: "invalid_input" });
        return;
      }
      if (
        origin.selected.placeId &&
        destination.selected.placeId &&
        origin.selected.placeId === destination.selected.placeId &&
        !(
          origin.selected.kind === "current_location" ||
          destination.selected.kind === "current_location"
        )
      ) {
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
          origin: toPlaceRef(origin.selected, { fixtureMode: fixture }),
          destination: toPlaceRef(destination.selected, {
            fixtureMode: fixture,
          }),
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
          applyApiError(err.body);
        } else {
          setError({
            error: {
              code: "data_unavailable",
              message: NETWORK_UNAVAILABLE_UI.defaultBody,
              requestId: "client",
            },
          });
          setPhase(NETWORK_UNAVAILABLE_UI.phase as ErrorUiPhase);
          track("error_viewed", { code: "data_unavailable" });
        }
      }
    },
    [
      origin.selected,
      destination.selected,
      timing,
      selectedLineIds,
      hasSearched,
      applyApiError,
      fixture,
    ],
  );

  function onPlaceQuery(field: "origin" | "destination", query: string) {
    if (field === "origin") {
      setOrigin({ query, selected: null });
    } else {
      setDestination({ query, selected: null });
    }

    const debounceRef = field === "origin" ? originDebounce : destDebounce;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      if (field === "origin") setOriginSuggestions([]);
      else setDestSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchPlaceSuggestions(field, query);
    }, PLACE_DEBOUNCE_MS);
  }

  async function fetchPlaceSuggestions(
    field: "origin" | "destination",
    query: string,
  ) {
    const local = isFixtureMode()
      ? (field === "origin" ? DEMO_ORIGINS : DEMO_DESTS).filter((p) =>
          p.label.toLowerCase().includes(query.toLowerCase()),
        )
      : [];

    try {
      const remote = await api.searchPlaces(query);
      // Live: API only. Fixture: merge local demos for presets.
      const merged = isFixtureMode()
        ? [...local, ...remote.places].filter(
            (p, i, arr) => arr.findIndex((x) => x.placeId === p.placeId) === i,
          )
        : remote.places;
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
        const mapped = placeFromGeolocation(lat, lon, {
          fixtureMode: isFixtureMode(),
          demoOrigin: DEMO_ORIGINS[0],
        });
        setOrigin({ query: mapped.label, selected: mapped });
        setOriginSuggestions([]);
        setLocationStatus("granted");
        track("location_permission", {
          outcome: "granted",
          mappedToFixtureOrigin: isFixtureMode(),
        });
        track("place_selected", {
          field: "origin",
          placeKind: "current_location",
          placeId: mapped.placeId,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus("denied");
          track("location_permission", {
            outcome: "denied",
            mappedToFixtureOrigin: false,
          });
        } else if (err.code === err.TIMEOUT) {
          setLocationStatus("timeout");
          track("location_permission", {
            outcome: "timeout",
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
        return fixture
          ? "Location granted — origin set to a fixture station near you (demo mapping)."
          : "Location granted — origin set to your current coordinates.";
      case "denied":
        return "Location permission denied. Enter a starting station instead.";
      case "unsupported":
        return "Location is not supported in this browser.";
      case "timeout":
        return "Location request timed out. Enter a starting station instead.";
      case "error":
        return "Couldn’t read your location. Enter a starting station instead.";
      default:
        return null;
    }
  })();

  function errorBody(fallback: string): string {
    return error?.error.message ?? fallback;
  }

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
          onQueryChange={(q) => onPlaceQuery("origin", q)}
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
          onQueryChange={(q) => onPlaceQuery("destination", q)}
          onSelect={(p) => selectPlace("destination", p)}
          onCloseSuggestions={() => setDestSuggestions([])}
        />

        <label className="field">
          <span>When</span>
          <select
            value={timing.type}
            data-testid="timing-select"
            onChange={(e) => {
              const type = e.target.value as Timing["type"];
              if (type === "arrive_by" && !offerArriveBy) return;
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
            {offerArriveBy ? (
              <option value="arrive_by">Arrive by…</option>
            ) : null}
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
          data-testid="open-line-picker"
        >
          <span className="lines-row__label">Lines to use</span>
          <span className="lines-row__value">{lineSummary}</span>
        </button>

        <button
          type="button"
          className="btn-primary"
          data-testid="find-routes"
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
            body={invalidMessage || errorBody("Adjust your search and try again.")}
            testId="invalid-state"
            actionLabel="Back to search"
            onAction={() => setPhase("search")}
          />
        ) : null}

        {phase === "no_route" ? (
          <StateMessage
            title="No subway path found"
            body={errorBody("No subway path was found between these places.")}
            testId="no-route-state"
            actionLabel="Edit trip"
            onAction={() => setPhase("search")}
          />
        ) : null}

        {phase === "unavailable" ? (
          <StateMessage
            title={
              error?.error.message?.includes("Could not reach")
                ? "API unavailable"
                : "Service unavailable"
            }
            body={errorBody(
              "Routing is temporarily unavailable. Please try again later.",
            )}
            testId="unavailable-state"
            actionLabel="Try again"
            onAction={() => void runSearch()}
          />
        ) : null}

        {phase === "timeout" ? (
          <StateMessage
            title="Request timed out"
            body={errorBody(
              "The routing service took too long to respond. Please try again.",
            )}
            testId="timeout-state"
            actionLabel="Try again"
            onAction={() => void runSearch()}
          />
        ) : null}

        {phase === "rate_limited" ? (
          <StateMessage
            title="Too many requests"
            body={errorBody(
              "You’ve hit a temporary rate limit. Wait a moment and try again.",
            )}
            testId="rate-limited-state"
            actionLabel="Try again"
            onAction={() => void runSearch()}
          />
        ) : null}

        {phase === "error" ? (
          <StateMessage
            title="Couldn’t find routes"
            body={errorBody("Please try again.")}
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
            {showFeedback ? (
              <SearchFeedback requestId={response.requestId} />
            ) : null}
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
              <div className="card-list" data-testid="results-list">
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

            {showFeedback ? (
              <SearchFeedback requestId={response.requestId} />
            ) : null}
          </>
        ) : null}

        {phase === "search" && fixture ? (
          <p className="hint-block" data-testid="fixture-hint">
            Tip: pick F + B for a complete match demo, A + G + L for partial, or
            only the 7 for a stale-data warning. Fixture mode is active.
          </p>
        ) : null}
      </main>

      <footer className="footer">
        <p data-testid="attribution">
          Subway schedule and realtime data provided by the Metropolitan
          Transportation Authority (MTA). BetterMTA is not affiliated with or
          endorsed by the MTA.
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
