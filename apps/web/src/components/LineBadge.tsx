"use client";

import type { CSSProperties } from "react";
import type { Line } from "@/lib/contracts";
import { riderLineDisplayName, riderLineLabel } from "@/lib/line-display";

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
  const face = riderLineLabel(line.lineId, line);
  const name = riderLineDisplayName(line.lineId, line);
  const label = selected ? `${name}, selected` : `${name}, not selected`;

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
      data-line-id={line.lineId}
      disabled={disabled}
      onClick={() => onToggle(line.lineId)}
    >
      <span className="line-badge__disc" aria-hidden="true">
        {face}
      </span>
      <span className="line-badge__state" aria-hidden="true">
        {selected ? "Selected" : "Add"}
      </span>
    </button>
  );
}
