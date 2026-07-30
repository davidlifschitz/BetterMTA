"use client";

import { useEffect, useId, useRef } from "react";
import type { Line } from "@/lib/contracts";
import { LineBadge } from "@/components/LineBadge";
import { MAX_SELECTED_LINES } from "@/lib/contracts";
import { summarizeSelectedLines } from "@/lib/format";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedLineIds);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first =
      panelRef.current?.querySelector<HTMLButtonElement>("button.line-badge");
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  function toggle(lineId: string) {
    if (selected.has(lineId)) {
      onChange(selectedLineIds.filter((id) => id !== lineId));
      return;
    }
    if (selectedLineIds.length >= MAX_SELECTED_LINES) return;
    onChange([...selectedLineIds, lineId]);
  }

  const activeLines = lines.filter((l) => l.isActive);
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
          <h2 id={titleId}>Lines to use</h2>
          <button
            type="button"
            className="text-btn"
            onClick={onClose}
            aria-label="Close line picker"
          >
            Close
          </button>
        </div>

        <p id={summaryId} className="sheet__summary" data-testid="line-summary">
          {summary}
          {atMax ? ` (max ${MAX_SELECTED_LINES})` : ""}
        </p>

        <div
          className="line-grid"
          role="group"
          aria-label="Subway lines"
        >
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
