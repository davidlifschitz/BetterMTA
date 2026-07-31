# P1 Wave 1A Handoff — Address/POI place provider

**Workstream:** Wave 1A places (`agent/p1-wave1-places`)  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-p1-wave1-places`  
**Branch:** `agent/p1-wave1-places`  
**Base lock tip:** `b9139fb` (Wave 0 LOCKED: ADR-0022/0023 + contracts `2026-07-31`)  
**Surfaces:** runtime **yes**; contracts **no** (consumed only)

## 1. What was implemented

- Provider-agnostic `GeocoderProvider` boundary under `apps/api/src/adapters/places/`
- Deterministic `FakeGeocoderAdapter` for CI (`BETTERMTA_GEOCODER_PROVIDER=fake`)
- Real adapter: **Nominatim** / Nominatim-compatible (`nominatim`) with timeouts, ~1 rps pacing, bounded retries
- Feature flag `address_poi_enabled` (default **false**) via `flags.json` / `FEATURE_FLAGS_JSON` / `BETTERMTA_ADDRESS_POI_ENABLED`
- Station-index-first merge; geocode fills remaining `limit` slots only when flag on
- Optional Place fields: `provider`, `providerPlaceId`, `formattedAddress`, `attribution` (+ response-level `attribution`)
- Privacy-safe hashed query cache + in-process `pl_geo_*` resolve cache; no precise query/coords in normal logs
- Explicit empty / unavailable geocode states; never substitutes unrelated station
- API `CONTRACT_VERSION` bumped to `2026-07-31` to emit locked contract version
- AJV loader registers locked `candidate-coverage.schema.json` (consume-only fix)
- Docs: `docs/PLACE_PROVIDER.md`; env template + flags updated

## 2. Files changed

- `apps/api/src/adapters/places/**` (new)
- `apps/api/src/adapters/live/LiveDataAdapter.ts`
- `apps/api/src/adapters/fixture/FixtureDataAdapter.ts`
- `apps/api/src/app.ts`, `config.ts`, `constants.ts`, `types.ts`
- `apps/api/src/routes/v1/places.ts`
- `apps/api/src/validation/ajv.ts`
- `apps/api/test/places.test.ts` (new), `endpoints.test.ts`
- `infra/flags/flags.json`, `infra/flags/README.md`
- `infra/env/api/.env.example`
- `docs/PLACE_PROVIDER.md`
- `.agents/handoffs/p1-wave1-places.md` (this file)

**Not touched:** `contracts/**`, frontend, routing candidate orchestration, QA harness, certified alpha deploy.

## 3. Public interfaces and schemas

Consumes locked:

- `contracts/schemas/place-search-response.schema.json`
- `contracts/fixtures/places/place-search-address.json`
- ADR-0022 / API_CONTRACT § places semantics

Runtime:

- `GET /v1/places/search` may return geocode-backed places when flag + provider configured
- `DataAdapter.resolvePlace({ placeId: "pl_geo_*" })` uses short-lived resolve cache only

## 4. Assumptions

- Nominatim is the approved controlled-alpha adapter; public OSM instance needs identifying User-Agent and low QPS
- Flag stays **off** on certified alpha until separate go/no-go
- Wave 1C owns UI attribution chrome; Wave 1B owns routing candidate use of address PlaceRefs beyond resolvePlace
- Resolve cache is single-process memory (same constraint as in-memory rate limit)

## 5. Validation commands

```bash
cd services/routing && npm ci && npm run build
cd apps/api && npm ci && npm run typecheck && npm test
# focused:
npm test -- test/places.test.ts test/contract.test.ts test/endpoints.test.ts
```

## 6. Validation results

- `npm run typecheck` — **PASS**
- `npm test` (apps/api) — **88 passed, 1 skipped**
- Focused places/contract/endpoints/unit — **40 passed**

## 7. Fixture / sample-data instructions

- CI: `geocoderProvider: "fake"` + `addressPoiEnabled: true` (see `test/places.test.ts`)
- Fake catalog includes `277 Park` → `pl_geo_277_park_ave` matching contract address fixture shape
- Live Nominatim: see `docs/PLACE_PROVIDER.md` and `infra/env/api/.env.example`

## 8. Known defects

- None observed in API unit/integration suite after Wave 1A changes

## 9. Known limitations / gaps

- Geocode `resolvePlace` only works while in-process resolve cache is warm (post-search); cold `pl_geo_*` → honest miss / `unknown_place`
- No durable place store; multi-replica resolve cache not shared
- Public Nominatim unsuitable for high QPS; self-host or Nominatim-compatible paid URL recommended before broader beta
- Frontend still station-index UX until Wave 1C

## 10. Decisions requiring conductor approval

- Enabling `address_poi_enabled=true` on any alpha/beta environment (go/no-go separate from this branch)
- Switching default provider from `none` / choosing hosted Nominatim-compatible vendor for cost

## 11. Exact next integration step

1. Wave 1C: show attribution + address/POI results in place suggest when flag on  
2. Wave 1B: ensure route search uses resolved address PlaceRefs (lat/lon) without station substitution  
3. Infra: provision Nominatim User-Agent / optional base URL secrets; keep flag off on certified alpha  

## Risks

- R25 privacy/cost/attribution if flag enabled without User-Agent / attribution UI  
- Resolve-cache TTL miss → `unknown_place` for deep-linked `pl_geo_*` PlaceRefs  
- Public Nominatim rate limits under concurrent alpha testers
