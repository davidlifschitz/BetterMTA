"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { Place } from "@/lib/contracts";

type PlaceSuggestProps = {
  label: string;
  placeholder: string;
  value: string;
  suggestions: Place[];
  listLabel: string;
  onQueryChange: (query: string) => void;
  onSelect: (place: Place) => void;
  onCloseSuggestions: () => void;
};

/**
 * Combobox-style place field with listbox keyboard navigation.
 */
export function PlaceSuggest({
  label,
  placeholder,
  value,
  suggestions,
  listLabel,
  onQueryChange,
  onSelect,
  onCloseSuggestions,
}: PlaceSuggestProps) {
  const listId = useId();
  const inputId = useId();
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
    if (!open) return;

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
    <label className="field" htmlFor={inputId}>
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
        placeholder={placeholder}
      />
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
            return (
              <li key={p.placeId} role="presentation">
                <button
                  type="button"
                  id={optionId}
                  role="option"
                  aria-selected={active}
                  className={active ? "is-active" : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectIndex(index)}
                >
                  {p.label}
                  {p.borough ? ` · ${p.borough}` : ""}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </label>
  );
}
