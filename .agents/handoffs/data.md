# Data workstream handoff

**Branch:** `agent/data`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-data`  
**Contract version consumed:** `2026-07-30`

## 1. What was implemented

- Authoritative `docs/DATA_SPEC.md` (source inventory, licensing/attribution, refresh cadences, contract mapping, consumer notes, deferred risks).
- TypeScript data platform `@bettermta/data` under `services/data/`:
  - Static GTFS import (parse, checksum, schema/referential validation, versioning, activate/rollback; failed never activates).
  - `lineId` mapping with shuttle handling (`GS`/`FS`/`H`/`SIR`); unknown routes quarantined + counted.
  - GTFS-Realtime JSON fixture ingestion → normalized trip updates, cancellations, skipped stops, `ServiceAlert`s, `RealtimeSnapshot`.
  - Freshness policy per DATA_CONTRACT §4 and `RoutingSnapshotHandle` matching `data-snapshot.schema.json`.
  - Empty/header-only polls do **not** overwrite last-known-good; usable realtime = trip updates and/or alerts.
  - Fail-closed known-trip checks when a static version is pinned (empty set quarantines all).
  - In-memory `MetricsRegistry` for contract observability fields.
- Recorded fixtures for required scenarios (cancellation coverage is explicit-entity only).
- Offline deterministic Vitest suite.
- Ops runbook `services/data/RUNBOOK.md` (includes `trip_replacement_period` blocker before live poller).

**Implemented:** static pipeline, realtime normalize/freshness, fixtures, metrics, schema-validated handles, tests.  
**Tested:** scenarios in §7; alerts exercised only via `valid.json`; midnight fixture is ingest-only (no service-day clock policy).  
**Mocked:** production protobuf poller (JSON fixtures stand in); live MTA HTTP not used.  
**Deferred:** NYCT `trip_replacement_period` absence-as-cancellation (required before live poller); midnight service-day resolution for routing; live network poller; Mercury alert extensions; elevator/accessibility feeds; shapes.txt / calendar_dates full use; persistence beyond in-memory stores.  
**Blocked:** none for this workstream slice (live poller blocked on `trip_replacement_period` work — see RUNBOOK).

## 2. Files changed

Owned paths only:

- `docs/DATA_SPEC.md`
- `services/data/**` (package, src, fixtures, tests, RUNBOOK, lockfile)
- `.agents/handoffs/data.md` (this file)

No conductor-owned contract files modified.

## 3. Public interfaces and schemas

- Package export: `@bettermta/data` → `services/data/src/index.ts`
- Primary façade: `DataPlatform` (`importStatic`, `ingestRealtime`, `getRoutingHandle`)
- Types: `StaticDataset`, `RealtimeSnapshot`, `RoutingSnapshotHandle`, `ServiceAlert`, `MetricsRegistry`
- Consumes (read-only): `contracts/schemas/data-snapshot.schema.json`, `docs/DATA_CONTRACT.md`

## 4. Assumptions

- Production GTFS-RT is protobuf; fixtures use JSON entity shapes with `_fixtureMeta` for simulated failures.
- Freshness age prefers max feed-header age across trunks (conservative).
- Vehicle positions counted but unused for MVP routing.
- In-memory stores are sufficient until infra wires durable snapshot storage.
- MTA attribution copy in DATA_SPEC is suggested; legal confirmation before public beta.
- MTA GTFS-RT feeds allow anonymous access (no `x-api-key` required as of 2026).

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-data/services/data && npm install && npm test
cd /Users/thebiglipper/Developer/bettermta-data && npm --prefix contracts install && npm --prefix contracts run validate
```

## 6. Validation results

| Command | Result |
|---|---|
| `services/data` `npm test` | See latest remediation run |
| `npm --prefix contracts run validate` | Must pass unchanged |

## 7. Fixture or sample-data instructions

Static: `services/data/fixtures/static/valid/` and `.../invalid-refs/`.  
Realtime JSON under `services/data/fixtures/realtime/`:

| Fixture | Purpose |
|---|---|
| `valid.json` | Happy-path trip update + alert (alerts only exercised here) |
| `empty.json` | Empty entity list (schedule_only; does not overwrite LKG) |
| `malformed.json` | Simulated malformed |
| `stale.json` | Old feed timestamp |
| `cancelled-trip.json` | Explicit `CANCELED` trip only — **not** full replacement-period coverage |
| `rerouted-trip.json` | SKIPPED stop |
| `identifier-mismatch.json` | Unknown trip quarantined |
| `partial-feeds.json` | One OK + one timeout |
| `timeout-failure.json` / `fetch-failure.json` | Simulated poll failures |
| `midnight-boundary.json` | Service-day boundary note (ingest-only; resolution deferred) |

All fixtures are synthetic/recorded — never present as live.

## 8. Known defects

- **Found and fixed (remediation):** Empty realtime feed with fresh header was labeled `dataMode: live` and overwrote last-known-good. Usable realtime is now `(tripUpdates + alerts) > 0`; empty polls are not stored as latest; `resolveForRouting` falls back to retained LKG.
- Vitest dependency tree reports npm audit vulnerabilities (dev-only); infra may pin later.

## 9. Known limitations

- No live MTA poller or protobuf decode yet (intentionally mocked at boundary).
- Stores are process-local memory only.
- Midnight service-day “what day is it?” deferred to routing/OTP — **ingest-only** fixture coverage.
- Alerts are exercised only via `valid.json` in the offline suite.
- Explicit `CANCELED` entities only; NYCT `trip_replacement_period` absence-as-cancellation **deferred** (required before live poller).
- Mercury / NYCT alert extensions not parsed.
- Station complexes beyond parent/child + transfers not richly modeled.
- Accessibility / elevator feeds deferred.
- Suggested MTA attribution not yet legally reviewed.
- Static ZIP URL should be re-verified against current MTA mirrors before ops wiring.

## 10. Decisions requiring conductor approval

- None required to ship this slice against the locked contract.
- Optional future: expose `failedFeeds` / `partialFeeds` on public freshness object (would need additive contract change) — currently internal to `RealtimeSnapshot` + warning code `partial_realtime`.
- Optional: confirm shuttle `lineId` catalog (`GS`/`FS`/`H`/`SIR`) as product-picker IDs.

## 11. Exact next integration step

1. Orchestrator commits `agent/data` owned paths.
2. Routing consumes `DataPlatform.getRoutingHandle()` / `RoutingSnapshotHandle`, pins `staticDatasetVersion` + `realtimeSnapshotId` on itineraries, and **honors `dataMode`** even when snapshot id is non-null.
3. Backend `/v1/status` and `/health/ready` read active static + freshness from this package (or a thin adapter).
4. Infra wires metrics registry → Prometheus/OTel and implements real protobuf poll workers calling `RealtimeIngestor.ingest` **only after** `trip_replacement_period` support lands.
