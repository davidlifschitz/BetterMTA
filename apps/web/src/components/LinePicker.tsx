"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Line } from "@/lib/contracts";
import { LineBadge } from "@/components/LineBadge";
import { MAX_SELECTED_LINES } from "@/lib/contracts";
import { summarizeSelectedLines } from "@/lib/format";
import { lineMatchesQuery } from "@/lib/line-display";
import {
  PREFERRED_LINES_HINT,
  PREFERRED_LINES_PICKER_TITLE,
} from "@/lib/preference-copy";

type LinePickerProps = {
  open: boolean;
  lines: Line[];
  selectedLineIds: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  onApply: () => void;
  applyLabel?: string;
};

export function LinePicker({
  open,
  lines,
  selectedLineIds,
  onChange,
  onClose,
  onApply,
  applyLabel = "Update routes",
}: LinePickerProps) {
  const titleId = useId();
  const summaryId = useId();
  const filterId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedLineIds);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setFilter("");
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstBadge =
      panel?.querySelector<HTMLButtonElement>("button.line-badge");
    firstBadge?.focus();

    function focusableInPanel(): HTMLElement[] {
      if (!panelRef.current) return [];
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      return Array.from(nodes).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusableInPanel();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const activeLines = useMemo(() => {
    const base = lines.filter((l) => l.isActive);
    return base.filter((l) => lineMatchesQuery(l, filter));
  }, [lines, filter]);

  if (!open) return null;

  function toggle(lineId: string) {
    if (selected.has(lineId)) {
      onChange(selectedLineIds.filter((id) => id !== lineId));
      return;
    }
    if (selectedLineIds.length >= MAX_SELECTED_LINES) return;
    onChange([...selectedLineIds, lineId]);
  }

  const summary = summarizeSelectedLines(lines, selectedLineIds);
  const atMax = selectedLineIds.length >= MAX_SELECTED_LINES;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__header">
          <h2 id={titleId}>{PREFERRED_LINES_PICKER_TITLE}</h2>
          <button
            type="button"
            className="text-btn"
            onClick={onClose}
            aria-label="Close preferred lines picker"
          >
            Close
          </button>
        </div>

        <p id={summaryId} className="sheet__summary" data-testid="line-summary">
          {summary}
          {atMax ? ` (max ${MAX_SELECTED_LINES})` : ""}
        </p>

        <label className="field field--compact" htmlFor={filterId}>
          <span className="sr-only">Filter preferred lines</span>
          <input
            id={filterId}
            type="search"
            value={filter}
            placeholder="Filter lines (try S for shuttle)"
            onChange={(e) => setFilter(e.target.value)}
            autoComplete="off"
            data-testid="line-filter"
          />
        </label>

        <div className="line-grid" role="group" aria-label="Preferred subway lines">
          {activeLines.map((line) => (
            <span key={line.lineId} className="line-grid__item">
              <LineBadge
                line={line}
                selected={selected.has(line.lineId)}
                onToggle={toggle}
                disabled={!selected.has(line.lineId) && atMax}
              />
            </span>
          ))}
        </div>

        {activeLines.length === 0 ? (
          <p className="hint" role="status">
            No lines match that filter.
          </p>
        ) : null}

        <p className="hint">{PREFERRED_LINES_HINT}</p>
        <p className="hint">
          Selected lines keep their color. A ring and “Selected” label mark
          selection — not color alone.
        </p>

        <button type="button" className="btn-primary" onClick={onApply}>
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
