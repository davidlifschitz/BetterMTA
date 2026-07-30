# Data platform runbook

**Scope:** `services/data` operators / on-call.  
**Never** present stale or synthetic data as live.

## Stale realtime

**Symptoms:** `dataMode: stale` on snapshot handles; `bettermta_realtime_age_seconds` > 90; UI warning `stale_realtime`.

**Actions:**

1. Check feed poll metrics (`bettermta_realtime_poll_duration_ms`, parse errors, failed feeds).
2. If age ≤ 15 minutes: last-known-good remains usable — keep serving with labeled `stale`.
3. If age > 15 minutes: platform emits `schedule_only`; confirm UI labels schedule-only. Note: `realtimeSnapshotId` may still be non-null until 30-minute retention expires — routing must honor `dataMode`.
4. If age > 30 minutes: last-known-good retention expires; routing should pin schedule-only / null realtime snapshot id.
5. Escalate to infra if multiple trunk feeds fail simultaneously.

## Empty / header-only polls

**Symptoms:** Feed returns a valid header and empty `entity[]`; previously good LKG suddenly disappears or mode flips incorrectly.

**Expected behavior (post-fix):** Empty-header polls are **not** stored as latest usable realtime and are **not** labeled `live`. Routing keeps the prior LKG within retention, else `schedule_only`.

## NYCT `trip_replacement_period` (blocker before live poller)

**Risk:** Within an NYCT `trip_replacement_period` window, scheduled trips **absent from the feed are cancelled**. Explicit `CANCELED` entities alone are incomplete.

**Required before enabling live pollers:**

1. Parse NYCT GTFS-RT extension `trip_replacement_period`.
2. Diff the pinned static trip set against feed entities for the window.
3. Emit absence-as-cancellation into the snapshot cancellation list.
4. Add fixtures covering replacement-window absence (do not treat `cancelled-trip.json` as complete coverage).

Until implemented, treat cancellation coverage as **partial** (explicit scheduleRelationship only).

## Failed static import

**Symptoms:** `status: failed` dataset recorded; `bettermta_static_import_failures_total` increments; active version unchanged.

**Actions:**

1. Do **not** force-activate a failed dataset (store refuses).
2. Inspect validation issues (broken references, missing files, empty core tables).
3. Re-run import from a known-good GTFS zip / fixture after fixing source.
4. Confirm previous `active` dataset still serves traffic.

## Rollback

**When:** Newly activated static dataset causes routing topology failures or bad `lineId` maps.

**Actions:**

1. Call `StaticDatasetStore.rollback(nowIso)` (or ops wrapper once infra wires it).
2. Confirm restored dataset `status: active` and prior version `rolled_back`.
3. Notify routing/API to pin searches to the restored `staticDatasetVersion`.
4. File a data defect with checksum + version IDs.

## Partial feed failure

Some trunks may fail while others succeed. Snapshot `failedFeeds` lists them; freshness may add `partial_realtime` warning. Do not mark the whole system `unavailable` solely for one trunk unless static is also missing.
