"use client";

import type { CSSProperties } from "react";
import type { Line } from "@/lib/contracts";

type LineBadgeProps = {
  line: Line;
  selected: boolean;
  onToggle: (lineId: string) => void;
  disabled?: boolean;
};

export function LineBadge({
  line,
  selected,
  onToggle,
  disabled = false,
}: LineBadgeProps) {
  const label = selected
    ? `${line.displayName}, selected`
    : `${line.displayName}, not selected`;

  return (
    <button
      type="button"
      className={`line-badge${selected ? " is-selected" : ""}`}
      style={
        {
          "--line-color": line.color,
          "--line-text": line.textColor,
        } as CSSProperties
      }
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(line.lineId)}
    >
      <span className="line-badge__disc" aria-hidden="true">
        {line.label}
      </span>
      <span className="line-badge__state" aria-hidden="true">
        {selected ? "Selected" : "Add"}
      </span>
    </button>
  );
}
