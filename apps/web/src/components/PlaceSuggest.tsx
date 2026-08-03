"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { Place } from "@/lib/contracts";
import {
  placeKindLabel,
  placeOptionAriaLabel,
  placeOptionSecondary,
  placeSourceLabel,
} from "@/lib/place-display";

type PlaceSuggestProps = {
  label: string;
  placeholder: string;
  value: string;
  suggestions: Place[];
  listLabel: string;
  /** Response-level or aggregated geocode attribution (ADR-0022). */
  attribution?: string | null;
  onQueryChange: (query: string) => void;
  onSelect: (place: Place) => void;
  onCloseSuggestions: () => void;
};

/**
 * Combobox-style place field with listbox keyboard navigation.
 * Shows kind/source labels for additive place fields when present.
 * Never renders providerPlaceId or vendor hostnames.
 */
export function PlaceSuggest({
  label,
  placeholder,
  value,
  suggestions,
  listLabel,
  attribution,
  onQueryChange,
  onSelect,
  onCloseSuggestions,
}: PlaceSuggestProps) {
  const listId = useId();
  const inputId = useId();
  const statusId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);

  const open = suggestions.length > 0;
  const activeId =
    open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  function selectIndex(index: number) {
    const place = suggestions[index];
    if (!place) return;
    onSelect(place);
    setActiveIndex(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "Escape") {
        onCloseSuggestions();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectIndex(activeIndex);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setActiveIndex(-1);
      onCloseSuggestions();
    }
  }

  return (
    <label className="field field--suggest" htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        type="text"
        role="combobox"
        value={value}
        onChange={(e) => {
          setActiveIndex(-1);
          onQueryChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId}
        aria-describedby={statusId}
        placeholder={placeholder}
      />
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {open
          ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} available. Use up and down arrows to navigate.`
          : "No suggestions open."}
      </span>
      {open ? (
        <ul
          id={listId}
          className="suggest"
          role="listbox"
          aria-label={listLabel}
        >
          {suggestions.map((p, index) => {
            const optionId = `${listId}-option-${index}`;
            const active = index === activeIndex;
            const secondary = placeOptionSecondary(p);
            const source = placeSourceLabel(p.provider);
            const kind = placeKindLabel(p.kind);
            return (
              <li key={p.placeId} role="presentation">
                <button
                  type="button"
                  id={optionId}
                  role="option"
                  tabIndex={-1}
                  aria-selected={active}
                  aria-label={placeOptionAriaLabel(p)}
                  className={active ? "is-active" : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectIndex(index)}
                >
                  <span className="suggest__primary">{p.label}</span>
                  <span className="suggest__meta">
                    <span className="suggest__kind">{kind}</span>
                    {source && source !== kind ? (
                      <span className="suggest__source"> · {source}</span>
                    ) : null}
                    {secondary ? (
                      <span className="suggest__secondary"> · {secondary}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          {attribution ? (
            <li className="suggest__attribution" role="note">
              {attribution}
            </li>
          ) : null}
        </ul>
      ) : null}
    </label>
  );
}
