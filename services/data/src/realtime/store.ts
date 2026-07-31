import { isWithinRetention } from "../freshness.js";
import type { FreshnessPolicy, RealtimeSnapshot } from "../types.js";
import { DEFAULT_FRESHNESS_POLICY } from "../types.js";

/**
 * Retains last-known-good realtime snapshots for ≥ 30 minutes (contract §4).
 */
export class RealtimeSnapshotStore {
  private latest: RealtimeSnapshot | null = null;
  private readonly history: RealtimeSnapshot[] = [];

  put(
    snapshot: RealtimeSnapshot,
    nowMs: number,
    policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
  ): void {
    this.latest = snapshot;
    this.history.push(snapshot);
    this.prune(nowMs, policy);
  }

  getLatest(): RealtimeSnapshot | null {
    return this.latest;
  }

  getById(snapshotId: string): RealtimeSnapshot | null {
    return this.history.find((s) => s.snapshotId === snapshotId) ?? null;
  }

  getLastKnownGood(
    nowMs: number,
    policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
  ): RealtimeSnapshot | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const s = this.history[i]!;
      if (
        isWithinRetention(s, nowMs, policy) &&
        (s.entityCounts.tripUpdates > 0 || s.entityCounts.alerts > 0)
      ) {
        return s;
      }
    }
    return null;
  }

  private prune(nowMs: number, policy: FreshnessPolicy): void {
    // Keep anything within retention window
    const kept = this.history.filter((s) =>
      isWithinRetention(s, nowMs, policy),
    );
    this.history.length = 0;
    this.history.push(...kept);
    if (this.latest && !isWithinRetention(this.latest, nowMs, policy)) {
      this.latest = kept[kept.length - 1] ?? null;
    }
  }
}
