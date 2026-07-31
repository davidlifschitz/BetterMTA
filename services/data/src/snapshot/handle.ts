import { buildFreshness, computeDataMode } from "../freshness.js";
import type {
  DataMode,
  Freshness,
  FreshnessPolicy,
  RealtimeSnapshot,
  RoutingSnapshotHandle,
  StaticDataset,
} from "../types.js";
import { DEFAULT_FRESHNESS_POLICY } from "../types.js";

/**
 * Build the immutable RoutingSnapshotHandle passed to routing
 * (DATA_CONTRACT §7 / data-snapshot.schema.json).
 */
export function buildRoutingSnapshotHandle(options: {
  staticDataset: StaticDataset | null;
  realtime: RealtimeSnapshot | null;
  nowMs: number;
  policy?: FreshnessPolicy;
  /** Force unavailable when static is missing */
  forceUnavailable?: boolean;
}): { handle: RoutingSnapshotHandle; freshness: Freshness } {
  const policy = options.policy ?? DEFAULT_FRESHNESS_POLICY;
  const staticDataset = options.staticDataset;

  if (!staticDataset || staticDataset.status !== "active") {
    const handle: RoutingSnapshotHandle = {
      staticDatasetVersion: staticDataset?.staticDatasetVersion ?? "none",
      realtimeSnapshotId: null,
      dataMode: "unavailable",
      realtimeAgeSeconds: null,
      staticActivatedAt: staticDataset?.activatedAt ?? null,
    };
    return {
      handle,
      freshness: {
        realtimeAgeSeconds: null,
        staticActivatedAt: staticDataset?.activatedAt ?? null,
        warnings: [
          {
            code: "data_unavailable",
            message: "Static schedule data is not available.",
          },
        ],
      },
    };
  }

  const freshness = buildFreshness(
    options.realtime,
    staticDataset.activatedAt,
    options.nowMs,
    policy,
  );

  let dataMode: DataMode;
  if (options.forceUnavailable) {
    dataMode = "unavailable";
  } else if (!options.realtime) {
    dataMode = "schedule_only";
  } else if (options.realtime.synthetic) {
    dataMode = "synthetic";
  } else {
    dataMode = computeDataMode(freshness.realtimeAgeSeconds ?? null, {
      hasRealtimePayload: true,
      synthetic: false,
      policy,
    });
  }

  const handle: RoutingSnapshotHandle = {
    staticDatasetVersion: staticDataset.staticDatasetVersion,
    realtimeSnapshotId: options.realtime?.snapshotId ?? null,
    dataMode,
    realtimeAgeSeconds: freshness.realtimeAgeSeconds ?? null,
    staticActivatedAt: staticDataset.activatedAt,
  };

  return { handle, freshness };
}
