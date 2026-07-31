# P1 Wave 2 Handoff — Integration (address preferred lines)

**Workstream:** Wave 2 Integration (`cursor-grok-4.5-high-fast`)  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Branch:** `agent/p1-address-preferred-lines`  
**Program tip SHA:** resolve `git rev-parse origin/agent/p1-address-preferred-lines` (pushed continuously)  
**Integration-complete functional tip:** `81b4de6df205846a0dcad9f872b5bbb89ffd7b39` (`81b4de6`) — all Wave 1 merges + Ajv dedupe; subsequent commits are handoff docs only  
**Wave 0 lock tip:** `b9139fb`  
**Contracts:** LOCKED `2026-07-31` (no contract edits)  
**Surfaces:** runtime integration **yes**; contracts **no**; certified alpha redeploy **no**

## 1. What was done

Integrated all Wave 1 branches into the program branch via merge commits (not squash), reconciled overlapping API files, fixed one integration-only Ajv duplicate registration, and validated the combined stack green locally.

**Not done:** merge to `main`; redeploy certified alpha; enable address/POI by default.

## 2. Source tips (verified via `git fetch`)

| Wave | Branch | Tip |
|---|---|---|
| 1A places | `origin/agent/p1-wave1-places` | `371ab9e` |
| 1B routing | `origin/agent/p1-wave1-routing` | `29712a9` |
| 1C frontend | `origin/agent/p1-wave1-frontend` | `c271032` |
| 1D privacy | `origin/agent/p1-wave1-privacy` | `feb57e7` |
| 1E QA | `origin/agent/p1-wave1-qa` | `38cf1f7` |

All are ancestors-of / based on lock `b9139fb`.

## 3. Merge chronology

Order executed (recommended):

1. **1B routing** → merge `c1935da` — clean
2. **1A places** → merge `18011fd` — clean (`apps/api/src/types.ts` auto-merged)
3. **1D privacy** → merge `000e6e2` — **conflict** in `apps/api/src/routes/v1/places.ts`
4. **1C frontend** → merge `59653c9` — clean
5. **1E QA** → merge `98ee12c` — clean (`ajv.ts` auto-merged with duplicate schema entry)
6. **Integration fix** → `81b4de6` — dedupe `candidate-coverage.schema.json` registration in Ajv loader

### Conflict resolution (1D ∩ 1A places route)

`apps/api/src/routes/v1/places.ts` kept **both**:

- Wave 1A: `geocodeCount` / `stationResultCount` / `addressPoiEnabled` / `hasAttribution` logging fields
- Wave 1D: privacy-safe `placeQueryHash`, `proximityGrid`, provider metric normalization, `privacyMetrics.recordPlaceProvider`

Also verified present after merge:

- Geocoder wiring in `apps/api/src/app.ts` (`createGeocoderProvider`, caches, `placesOpts`)
- `PrivacySafeMetrics` on `AppDeps`
- `candidate-coverage.schema.json` registered once before `route-search-response`

## 4. Feature flags / required env (default OFF)

Address/POI and new geocode behavior remain **default OFF**.

| Surface | Knob | Default |
|---|---|---|
| API | `address_poi_enabled` via `infra/flags/flags.json` | `false` |
| API | `BETTERMTA_ADDRESS_POI_ENABLED` | `false` / unset |
| API | `FEATURE_FLAGS_JSON={"address_poi_enabled":true}` | overlay only when needed |
| API geocoder | `BETTERMTA_GEOCODER_PROVIDER=fake\|nominatim` | see `docs/PLACE_PROVIDER.md` / `infra/env/api/.env.example` |
| Web | `NEXT_PUBLIC_FLAG_ADDRESS_POI` | `false` (`.env.production.example`) |
| Web live build | `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_BASE_URL` | required for production / `verify:no-fixtures` |

Tests may enable flags in-process; certified alpha must keep address/POI off until go/no-go.

## 5. Validation matrix (local)

| Check | Command | Result |
|---|---|---|
| Contracts | `cd contracts && npm run validate` | **PASS** |
| Routing unit | `cd services/routing && npm ci && npm test` | **PASS** (70 pass, 1 skip) |
| Routing build | `cd services/routing && npm run build` | **PASS** |
| API unit/integration | `cd apps/api && npm ci && npm test` | **PASS** (109 pass, 1 skip) |
| API typecheck | `cd apps/api && npm run typecheck` | **PASS** |
| Web unit | `cd apps/web && npm ci && npm test` | **PASS** (77 pass, 1 skip) |
| Web live build | `NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run build` | **PASS** |
| Web no-fixtures | `npm run verify:no-fixtures` (after live build) | **PASS** |
| P1 gate | `npm --prefix benchmarks/runner run gate-p1` | **GATE PASS** (merge-blocking invariants; G08/G09/G11/G12 pending; Fly G17 blocked — expected) |

Notes:

- Fixture-mode web builds intentionally contain fixture client markers; only live-mode builds are subject to `verify:no-fixtures`.
- `LineBadge.gs-as-s.test.tsx` remains `describe.skip` (P1 matrix #14) even though Wave 1C LinePicker/line-display already covers GS→S alias — QA harness not unskipped in this wave.

## 6. Remaining gaps / Wave 3 blockers

Non-blocking for this integration tip, but relevant for Wave 3 review:

1. **GS→S acceptance test still skipped** — unskip/align `LineBadge.gs-as-s.test.tsx` with Wave 1C display helpers once catalog/fixture lines include GS with `label: "S"`.
2. **gate-p1 PENDING rows** — G08 negative self-test, G09 recorded live NYC corpus, G11 live smoke, G12 shadow report (fixture SUT path is green).
3. **Live E2E / alpha stack** — not re-run here; do not redeploy certified alpha from this tip without explicit ops go/no-go.
4. **Address/POI still flag-gated OFF** — enabling requires env + privacy/ops review (ADR-0022); Nominatim QPS/User-Agent constraints apply.
5. **npm audit on web** — pre-existing advisories reported by `npm ci` (11 high / 2 critical); not introduced or fixed in Wave 2.

## 7. Risks

- Overlapping places/privacy/logging paths are reconciled but sensitive to future edits in `places.ts` / `app.ts` / `ajv.ts`.
- In-process geocode resolve/query caches and rate limits are single-process (same as prior alpha constraints).
- Enabling address/POI without Nominatim/fake provider config yields station-index-only or unavailable geocode paths — UI must keep honest empty/unavailable labeling.
- Program tip is **ahead of certified alpha**; do not treat this tip as redeployed.

## 8. Suggested skills for Wave 3

- `review-and-ship` / `.agents/review.md` for cross-wave review
- `verification-before-completion` before any alpha promote
- Benchmark/QA ownership via `benchmarks/docs/P1_ACCEPTANCE_MATRIX.md`

## 9. Stop conditions encountered

None. No contract changes required; merges completed without inventing semantics.
