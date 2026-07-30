# Backend API Handoff

**Workstream:** Backend (`agent/backend`)  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-backend`  
**Contract version:** `2026-07-30`  
**Date:** 2026-07-30

## 1. What was implemented

- Fastify + TypeScript HTTP service under `apps/api/` (own `package.json`, Vitest, `tsx` dev/start).
- Locked endpoints only:
  - `POST /v1/routes/search`
  - `GET /v1/lines`
  - `GET /v1/places/search`
  - `GET /v1/status`
  - `GET /health/live`
  - `GET /health/ready`
- Response headers `X-Request-Id` and `X-Contract-Version: 2026-07-30` on all responses.
- Baseline security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- Ajv validation from `contracts/schemas/route-search-request.schema.json` (16 KiB body limit, ≤5 unique `selectedLineIds`).
- Typed `ApiError` mapping per API_CONTRACT §8 (no collapse of known failures into opaque 500s).
- `DataAdapter` + `RoutingAdapter` interfaces; fixture-backed implementations serving `contracts/fixtures/**`.
- Cross-cutting: soft abort + hard `Promise.race` timeout → `504 timeout`; in-memory rate limit → `429 rate_limited` on search/places **and** cheap GETs (lines/status, larger bucket); lines cache by `staticDatasetVersion`; route-search cache with documented key; deterministic `explanationVariant`; readiness reflecting adapter state.
- Dependency-free latency histogram (bucketed; approximate p50/p95/p99) recorded on every response.
- Structured JSON logs with `requestId`; coordinate fields redacted from logs; no accounts.

## 2. Files changed

Owned paths only:

- `apps/api/**` (scaffold, source, tests, lockfile, README)
- `docs/proposals/backend-place-provider.md`
- `.agents/handoffs/backend.md` (this file)

No edits to `contracts/**`, conductor docs, frontend, routing, or data services.

## 3. Public interfaces and schemas

Consumes (read-only):

- `contracts/openapi/bettermta-v1.yaml`
- `contracts/schemas/*.schema.json`
- `contracts/fixtures/**`
- Shared vocabulary from `contracts/typescript/index.ts` (mirrored locally in `apps/api/src/types.ts`)

Adapter boundaries (`apps/api/src/adapters/types.ts`):

- `DataAdapter`: snapshot handle, lines, places, status, readiness, place/line resolution
- `RoutingAdapter.searchRoutes({ request, selectedLineIds, snapshot, requestId, explanationVariant, signal })`

## 4. Assumptions

- Fixture mode is the temporary production of truth for BE/FE until routing + data adapters are wired.
- Sentinel place IDs (`pl_unreachable`, `pl_timeout`, `pl_coverage_fail`, `pl_data_unavailable`) are backend test/control hooks, not part of the public contract.
- Optional request header `X-Experiment-Seed` forces deterministic experiment assignment **only** when `NODE_ENV=test` or `BETTERMTA_ALLOW_EXPERIMENT_SEED=true` (non-prod testing affordance; default OFF in production).
- Optional request header `X-Rate-Limit-Key` overrides the rate-limit bucket **only** when `NODE_ENV=test` or `BETTERMTA_ALLOW_RATE_LIMIT_KEY=true` (default OFF in production). Production rate keys use `request.ip`.
- `BETTERMTA_TRUST_PROXY` defaults to `false`. Behind Fly (or any reverse proxy), infra **must** set it to the known proxy hop count so `request.ip` reflects the real client without accepting spoofed `X-Forwarded-For` from arbitrary hop depths.
- Client `X-Request-Id` is sanitized (control chars stripped, max 128 chars) before reuse.
- Degraded readiness is permitted by default (`BETTERMTA_PERMIT_DEGRADED_READY=true`).

## 5. Validation commands

```bash
npm --prefix apps/api install
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix contracts install
npm --prefix contracts run validate
```

## 6. Validation results

| Command | Result |
|---|---|
| `npm --prefix apps/api test` | **PASS** — 6 files, **50/50** tests |
| `npm --prefix apps/api run typecheck` | **PASS** |
| `npm --prefix contracts run validate` | **PASS** (unchanged conductor package) |

## 7. Fixture or sample-data instructions

Fixtures root: `contracts/fixtures` (override with `BETTERMTA_FIXTURES_ROOT`).

**Route fixture selection** (`src/adapters/fixture/selection.ts`):

1. `pl_unreachable` / `st_unreachable` → `404 no_transit_path`
2. `pl_coverage_fail` → `503 insufficient_candidate_coverage`
3. `pl_data_unavailable` → `503 data_unavailable`
4. `pl_timeout` → wait for abort → `504 timeout`
5. empty `selectedLineIds` → `routes/baseline-only.json` (`dataMode: schedule_only`)
6. selected `["7"]` → `routes/degraded-realtime.json` (`dataMode: stale`)
7. selected `["F","B"]` (any order) → `routes/complete-match.json` (`synthetic`)
8. any other known non-empty selection → `routes/partial-match.json` (`synthetic`)

Example complete-match request: `contracts/fixtures/routes/request-depart-now.json`.

**Status selection:** `BETTERMTA_ADAPTER_READY_MODE=healthy|degraded|not_ready_static|not_ready_realtime`.

**Route cache key:**  
`route|{normalizedOd}|{timingBucket}|{sortedLines}|{staticVersion}|{snapshotId\|none}|{explanationVariant}`

## 8. Known defects

- None open after the 2026-07-30 remediations below (previously found, now fixed):
  - `X-Rate-Limit-Key` was honored unconditionally → gated behind `NODE_ENV=test` / `BETTERMTA_ALLOW_RATE_LIMIT_KEY`.
  - `trustProxy: true` + IP rate keys allowed `X-Forwarded-For` bucket spoofing → `BETTERMTA_TRUST_PROXY` defaults false; deploy must set hop count.
  - Soft abort-only timeout could hang forever on non-compliant adapters → hard `Promise.race` timeout maps to `504 timeout`.
  - `/v1/lines` and `/v1/status` were unmetered → shared cheap/larger read limiter applied.
- Fastify `preParsing` oversized-body path and `bodyLimit` both map to `invalid_input`; duplicate paths are intentional defense-in-depth.

## 9. Known limitations

- **Mocked:** all routing results and most place/status data (fixture adapters).
- No production geocoder, OTP/routing client, or live GTFS snapshot store.
- In-memory rate limit and caches are single-process only (not multi-instance safe).
- Latency histogram is in-process only (not scraped/exported to a metrics backend yet).
- Experiment assignment only covers `explanationVariant` (not line-picker / result-count variants).
- Fixture partial/complete itinerary bodies are not re-ranked by the API (ranking stays in routing workstream).
- `incomplete_selected_line_satisfaction` and `stale_realtime` appear as successful/soft metadata, not HTTP error bodies (per contract).

## 10. Decisions requiring conductor approval

- Place/geocoding provider strategy — see `docs/proposals/backend-place-provider.md`.
- Whether internal control headers (`X-Experiment-Seed`, `X-Rate-Limit-Key`) should be documented in OpenAPI (currently gated test helpers, not public contract).

## 11. Exact next integration step

1. Orchestrator commits `apps/api/**` + proposal + this handoff on `agent/backend`.
2. After routing exposes a `RoutingAdapter`-compatible client and data exposes snapshot handles, replace fixture adapters in `buildApp` with production adapters **without** changing HTTP paths or response schemas.
3. Frontend may already call these paths against fixture mode; wire preview deploy via infrastructure to `apps/api` start script.
4. Infra must set `BETTERMTA_TRUST_PROXY` to the Fly edge hop count before relying on IP-based rate limiting in production.
5. QA should add load probes against `/v1/routes/search` p95 once a non-fixture routing adapter exists (API now records in-process latency buckets).

### Implemented vs mocked vs deferred vs blocked

| Area | State |
|---|---|
| HTTP endpoints + headers + typed errors | **Implemented + tested** |
| Security headers + request-id sanitization | **Implemented + tested** |
| Ajv request validation + contract response tests | **Implemented + tested** |
| Rate limit (incl. lines/status), hard timeout, caches, experiments, readiness | **Implemented + tested** |
| Latency histogram (p50/p95/p99-capable) | **Implemented + tested** |
| Privacy-safe structured logging | **Implemented** |
| RoutingAdapter / DataAdapter interfaces | **Implemented** |
| Fixture adapters + fixture selection | **Mocked (intentional)** |
| Live routing / live GTFS / geocoder | **Deferred** |
| Multi-instance rate limit / Redis cache / metrics export | **Deferred** |
| `/v1/feedback` | **Deferred** (reserved, not implemented) |
| Contract changes | **Blocked on conductor** (proposals only) |
