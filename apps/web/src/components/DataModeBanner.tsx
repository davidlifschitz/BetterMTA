"use client";

import type { DataMode, Freshness } from "@/lib/contracts";
import { dataModeNotice } from "@/lib/format";

type DataModeBannerProps = {
  dataMode: DataMode;
  freshness?: Freshness;
};

export function DataModeBanner({ dataMode, freshness }: DataModeBannerProps) {
  const notice = dataModeNotice(dataMode);
  const warnings = freshness?.warnings ?? [];

  if (!notice && warnings.length === 0) return null;

  return (
    <div
      className={`banner banner--${notice?.tone ?? "info"}`}
      role="status"
      data-testid="data-mode-banner"
      data-mode={dataMode}
    >
      {notice ? (
        <>
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
        </>
      ) : null}
      {warnings.map((w) => (
        <span key={w.code}>{w.message}</span>
      ))}
    </div>
  );
}
