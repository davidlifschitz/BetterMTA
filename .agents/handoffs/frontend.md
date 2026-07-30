# Frontend Workstream Handoff

**Branch:** `agent/frontend`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-frontend`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`

## 1. What was implemented

- Next.js 15 App Router TypeScript app under `apps/web/` (mobile-first, list-based UI, no map).
- Typed fixture-mode API client consuming `contracts/typescript` + `contracts/fixtures/**`, with a live HTTP client.
- **Live/fixture isolation:** `apps/web/src/lib/api/index.ts` loads the client via `create-client`; fixture mode uses `create-client.fixture.ts` which **dynamic-imports** `fixture-client` only. Live builds alias `create-client` → `create-client.live.ts` in `next.config.ts` (zero fixture imports). Verified: `NEXT_PUBLIC_API_MODE=live` production chunks contain **no** `req_fixture_*`, `gtfs_fixture_v1`, or fixture-only alert strings.
- Search screen: From/To combobox autocomplete (keyboard listbox), timing selector, collapsed Lines-to-use row, Find routes.
- **Use my location:** geolocation permission affordance; grant/deny/unsupported handled; fixture mode maps to Carroll St and labels the mapping honestly.
- Line picker sheet: badge toggles, selection ring + text (not color-only), accessible pressed state, summary, usable before/after search, preserves OD.
- Results: up to three route cards (duration/arrival, line sequence, coverage/omissions, **baseline delta**, **per-card freshness** via `realtimeConfidence`, walk/wait/transfers, alerts, dataMode/freshness banner, explanation disclosure).
- **Anonymous feedback:** thumbs up/down + optional short comment on results/empty, tied to `requestId` only via analytics `feedback_submitted` (fixture-mode console stub; no OD coords/addresses).
- Partial-satisfaction banner copy per UX_SPEC.
- Route detail view from card selection.
- States: loading, empty, invalid-input, no_transit_path, unknown_line/generic error, unavailable, stale, schedule_only, synthetic demo banner.
- Privacy-safe analytics dispatcher + `ANALYTICS.md` (viewport from `matchMedia`).
- Component/unit tests (vitest + Testing Library) and production builds for fixture + live.

## 2. Files changed

Owned paths only:

- `apps/web/**` (Next.js app, components, API client isolation, tests, ANALYTICS.md, README)
- `.agents/handoffs/frontend.md` (this file)

Orchestrator-owned (leave as-is): `.gitignore` (tracks `apps/web/src/lib/**`).

No edits under `contracts/**` or conductor docs.

## 3. Public interfaces and schemas

- Consumes (read-only): `contracts/typescript/index.ts`, `contracts/fixtures/**`
- Client interface: `apps/web/src/lib/api/types.ts` → `BetterMtaApi`
- Swap point: `apps/web/src/lib/api/index.ts` + `create-client.{fixture,live}.ts` (`NEXT_PUBLIC_API_MODE=fixture|live`)
- Analytics events: `apps/web/src/lib/analytics.ts` + `apps/web/ANALYTICS.md`
- No new shared schemas proposed or published

## 4. Assumptions

- Fixture scenario routing by selected lines / placeId tokens is acceptable for parallel UI work until backend is live.
- List-based results (no map) is the MVP presentation per `.agents/mobile-web.md`.
- Official MTA line colors from the lines fixture are OK for badges; no proprietary map assets used.
- Place autocomplete uses fixture places plus a small local demo place list for OD presets.
- Reliability/crowding remain hidden unless `displayEligible === true` (current fixtures: hidden).
- Depart-at / arrive-by selectors send a timing type with a placeholder ISO time; true datetime pickers deferred.
- Fixture-mode geolocation maps to a demo station (Carroll St) — labeled in UI; live mode sends coordinate `PlaceRef`.
- Feedback transport is analytics console stub until a real beacon exists.

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-frontend/apps/web && npm test
cd /Users/thebiglipper/Developer/bettermta-frontend/apps/web && npm run build
NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run build
# Live isolation check:
rg -n 'req_fixture_complete|Signal problems near Queensboro|req_fixture_error|itin_c_1|gtfs_fixture_v1|createFixtureApiClient|fixture-client' .next/static/chunks
# Expect: no matches
cd /Users/thebiglipper/Developer/bettermta-frontend && npm --prefix contracts run validate
```

## 6. Validation results

| Command | Result |
|---|---|
| `npm test` (apps/web) | **PASS** — 4 files, **30 tests** |
| `npm run build` (fixture) | **PASS** |
| `npm run build` (live) | **PASS** — fixture-leak grep: **NO_MATCHES (clean)** |
| `npm --prefix contracts run validate` | **PASS** — unchanged |

### Tested states

- Synthetic complete match
- Partial satisfaction + omission copy
- Stale dataMode banner
- Schedule-only baseline
- `no_transit_path`
- `data_unavailable`
- `unknown_line` error UI
- Invalid input (cleared OD)
- **Loading** (in-flight promise)
- **Empty results** (empty itinerary arrays via API mock)
- **Route detail** rendering from card select
- Line edit re-run preserving OD
- Line picker keyboard (Enter toggle, Escape close)
- **Autocomplete combobox keyboard** (ArrowUp/Down/Enter/Escape)
- **Geolocation** grant (fixture mapping) + deny
- **Feedback** submit tied to `requestId`
- Viewport derived from `matchMedia` (desktop)
- Reliability hidden when not `displayEligible`
- Baseline delta + per-card freshness on RouteCard

### Viewports

- CSS mobile-first shell `max-width: 440px`; analytics viewport from `matchMedia("(max-width: 767px)")`.
- No automated visual regression screenshots captured (optional; not blocked).

## 7. Fixture or sample-data instructions

```bash
cd apps/web && npm install && npm run dev
```

Default `NEXT_PUBLIC_API_MODE` is fixture. Scenario map:

| Input | Fixture / mode |
|---|---|
| No lines | `baseline-only.json` → `schedule_only` |
| F + B | `complete-match.json` → `synthetic` |
| A + G + L | `partial-match.json` → `synthetic` |
| 7 only | `degraded-realtime.json` → `stale` |
| Place id contains `nopath` | `no_transit_path` |
| Place id contains `unavailable` | `data_unavailable` |
| Selected `Z9` | `unknown_line` |
| Use my location (fixture) | Maps origin to Carroll St; label discloses demo mapping |

Live swap:

```bash
NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run dev
```

## 8. Known defects

- None blocking for fixture-mode MVP.
- Depart-at / arrive-by do not yet expose a datetime control (timing type only).
- Place search UX is minimal; remote fixture query “union” only returns two stations unless local demo labels match.

## 9. Known limitations

- **Mocked:** all route/line/place/status payloads (fixtures); analytics/feedback transport (console stub).
- **Fixture-mode location:** geolocation grant does not reverse-geocode; maps to a fixed demo station with honest labeling.
- **Deferred:** map sheet, real reverse-geocoder, full autocomplete provider, network analytics beacon, datetime picker UI, A/B explanation experiment assignment beyond rendering `experiment.explanationVariant`, E2E Playwright suite, screenshot pack.
- **Blocked:** live `/v1` integration until backend workstream exposes a reachable base URL.

## 10. Decisions requiring conductor approval

- None filed. No contract change proposals under `docs/proposals/`.
- Optional future proposal: richer place-search fixtures (more NYC stations) to reduce local demo place seeding in the client.

## 11. Exact next integration step

1. Orchestrator commits `apps/web/**` + this handoff on `agent/frontend` (plus existing `.gitignore` fix).
2. After backend `/v1` is available, set `NEXT_PUBLIC_API_MODE=live` and point `NEXT_PUBLIC_API_BASE_URL` at the API; live factory is already aliased with no UI module changes required beyond env.
3. QA/benchmark workstream can exercise fixture scenarios listed above against the UI.

### Distinctions

| Category | Items |
|---|---|
| Implemented | Search, location permission, combobox autocomplete, line picker, results, baseline delta, card freshness, detail, feedback, banners, states, analytics mapping, fixture dynamic-import isolation, live client, tests, fixture+live production builds |
| Tested | 30 vitest tests: picker, satisfaction/omissions, dataMode, stale/schedule_only/partial/error/empty/loading/detail/unavailable/unknown_line, keyboard picker+autocomplete, geolocation grant/deny, feedback, viewport, OD-preserving re-run, baseline delta; `next build` fixture+live OK; live chunks fixture-clean |
| Mocked | Fixture API responses; console analytics/feedback stub |
| Deferred | Map, reverse geocoder, datetime picker UI, network analytics beacon, screenshots/E2E browser pack |
| Blocked | Live API wiring (needs backend) |
