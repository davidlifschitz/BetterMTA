# Wave 1D — Privacy and observability handoff

**Branch:** `agent/p1-wave1-privacy`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-p1-wave1-privacy`  
**Lock tip (start):** `b9139fb`  
**Tip SHA (this wave):** `3a964d9`  
**Date:** 2026-07-31  
**Contract version consumed:** `2026-07-31` (read-only; no `contracts/**` edits)
**Remote:** `origin/agent/p1-wave1-privacy` pushed (no main merge; no redeploy)

Distinguish: **implemented** / **tested** / **mocked (placeholder)** / **deferred** / **blocked**.

---

## 1. What was implemented

- **Implemented:** ADR-0022 / API_CONTRACT §11 privacy helpers — hash place/POI queries, coarsen coords (~1 km), hash vendor IDs, build `PrivacySafePlaceLogRef` / route-search log shapes (counts, not line lists).
- **Implemented:** Strengthened `redactSensitive` for address/POI/`providerPlaceId`/secrets + precise coordinate-pair strings.
- **Implemented:** `PrivacySafeMetrics` hooks — place-provider latency/errors, candidate-budget/coverage counters, preference-coverage aggregate buckets (no location content in labels).
- **Implemented:** Thin wiring on `GET /v1/places/search` and `POST /v1/routes/search` (+ coverage-exhausted path) via `privacySignals.ts`.
- **Implemented:** AJV loader registers `candidate-coverage.schema.json` so Wave 0B `$ref` resolves (consume-only; no contract edit).
- **Implemented:** Ops docs — `infra/observability/log-fields.md`, `metrics.md`, `docs/RUNBOOKS.md` privacy section, `GUARDRAILS.md`, API README.
- **Tested:** `apps/api/test/privacy.test.ts` regression suite (+ unit/endpoints green).
- **Deferred:** Prometheus/OTel export; durable retention / consent transport (ADR-0017); deep geocode-adapter instrumentation inside Wave 1A code (helpers ready for them to call).
- **Blocked:** None for this wave’s scope. Full candidateCoverage emission awaits routing/API merge of Wave 1B/1C fields on live responses.

---

## 2. Files changed

- `apps/api/src/logging/privacy.ts` (**new**)
- `apps/api/src/logging/logger.ts`
- `apps/api/src/metrics/privacyMetrics.ts` (**new**)
- `apps/api/src/services/privacySignals.ts` (**new**)
- `apps/api/src/routes/v1/places.ts`
- `apps/api/src/routes/v1/routesSearch.ts`
- `apps/api/src/plugins/helpers.ts` (`privacyMetrics` on `AppDeps`)
- `apps/api/src/app.ts`
- `apps/api/src/validation/ajv.ts` (register coverage schema)
- `apps/api/test/privacy.test.ts` (**new**)
- `apps/api/README.md`
- `infra/observability/log-fields.md`
- `infra/observability/metrics.md`
- `infra/security/GUARDRAILS.md`
- `docs/RUNBOOKS.md`
- `.agents/handoffs/privacy.md` (this file)

**Not modified:** `contracts/**`, Wave 1A geocode business logic, Wave 1B/1C ranking/orchestration internals, frontend analytics beyond existing rules.

---

## 3. Public interfaces and schemas

- Consumed (read-only): `PrivacySafePlaceLogRef`, `PrivacySafeRouteSearchLog`, `CandidateCoverage`, ADR-0022/0023.
- Produced: helper APIs under `apps/api/src/logging/privacy.ts`, `apps/api/src/metrics/privacyMetrics.ts`, `apps/api/src/services/privacySignals.ts`.
- Metric **names** documented in `infra/observability/metrics.md` (in-process until exporters land).
- No HTTP schema changes.

---

## 4. Assumptions

- Places/geocode wave will call `recordPlaceProvider` / hash helpers when vendor adapter lands; until then places path uses bounded `station_index`/`unknown` provider labels from response shape.
- Routing wave will populate `candidateCoverage` on responses/errors; API hooks already read it when present and record exhausted coverage on `insufficient_candidate_coverage`.
- Preference-coverage metrics intentionally omit raw `selectedLineIds` (aggregates only). Contract’s `PrivacySafeRouteSearchLog.selectedLineIds` remains available for rare debug — default ops logs use `selectedLineCount`.
- No broadening of web analytics collection.

---

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-p1-wave1-privacy
npm --prefix services/routing run build   # file: dep for api tests
npm --prefix apps/api install
npm --prefix apps/api test -- test/privacy.test.ts test/unit.test.ts test/endpoints.test.ts
npm --prefix apps/api run typecheck
```

---

## 6. Validation results

| Check | Result |
|---|---|
| `test/privacy.test.ts` | **PASS** (17) |
| `test/unit.test.ts` | **PASS** (8) |
| `test/endpoints.test.ts` | **PASS** (11) |
| Live geocode vendor path | **Not run** — adapter not in this wave |
| Metrics backend scrape | **PLACEHOLDER** — in-process only |

---

## 7. Fixture or sample-data instructions

None new. Privacy tests use existing fixture adapters + synthetic PlaceRefs.

---

## 8. Known defects

None introduced. Pre-existing: API local `CONTRACT_VERSION` / `Place` types still lag Wave 0B additive fields in places (provider fields optional via cast) — owned by places/backend waves.

---

## 9. Known limitations

- Metrics are in-memory process counters, not exported.
- Candidate-budget metrics stay zero until responses include `candidateCoverage`.
- Data-service logger still only redacts secrets (not coords); document recommends calling shared API helpers or mirroring patterns — data wave ownership.

---

## 10. Decisions requiring conductor approval

- None. Optional follow-up: whether ops logs should ever include hashed sorted `selectedLineIds` (contract allows; Wave 1D defaults to counts only).

---

## 11. Exact next integration step

1. Places wave: call `PrivacySafeMetrics.recordPlaceProvider` + never log raw vendor payloads.
2. Routing wave: emit `candidateCoverage`; API already records metrics/logs when present.
3. Conductor/integration: merge after Wave 1A–1C land; do **not** merge to `main` from this wave alone; no redeploy.

### Suggested skills for next agent

- `handoff` (if continuing another wave)
- `verification-before-completion` before claiming places/routing privacy wiring done
- `review-and-ship` only when integration assembles waves
