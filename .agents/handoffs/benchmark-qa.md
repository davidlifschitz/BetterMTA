# Benchmark / QA Handoff — Wave 1E (P1 Acceptance)

**Workstream:** Benchmark / QA (Wave 1E)  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-p1-wave1-qa`  
**Branch:** `agent/p1-wave1-qa`  
**Date:** 2026-07-31  
**Lock tip base:** `b9139fb`  
**Phase:** P1 acceptance + adversarial matrix (no product features, no main merge, no redeploy)

## 1. What was implemented

- P1 acceptance matrix doc: `benchmarks/docs/P1_ACCEPTANCE_MATRIX.md`
- 18 `bmc-p1-*` benchmark cases (11 ready oracles + 7 pending soft/live)
- 4 QA SUT fixtures under `benchmarks/fixtures/sut-responses/p1-*.json`
- Focused gate subset: `benchmarks/p1-ready-subset.json` + `npm run gate-p1`
- API harness: `apps/api/test/p1Acceptance.harness.test.ts` (unknown_place, timeout, insufficient_candidate_coverage, privacy redaction)
- FE SKIP: `apps/web/src/components/LineBadge.gs-as-s.test.tsx` (GS→S pending Wave 1 FE)
- Minimal Ajv registration of `candidate-coverage.schema.json` so API tests can load Wave 0 response schema `$ref`s (test/harness unblock only)

| Area | Status |
|---|---|
| P1 matrix doc + runbook | implemented, tested |
| Ready fixture/oracle cases (11) | implemented, tested |
| Pending soft/live cases (7) | implemented (soft; not claimed pass) |
| API harness #7/#8/#13/#16 | implemented, tested |
| FE GS→S | deferred / skipped |
| Live Midtown/GCT regressions | blocked on Wave 1A+1D |
| Main merge / redeploy | out of scope |

## 2. Files changed

- `benchmarks/docs/P1_ACCEPTANCE_MATRIX.md`
- `benchmarks/p1-ready-subset.json`
- `benchmarks/README.md`
- `benchmarks/runner/package.json` (`gate-p1`)
- `benchmarks/cases/bmc-p1-*.json` (18)
- `benchmarks/fixtures/sut-responses/p1-*.json` (4)
- `apps/api/test/p1Acceptance.harness.test.ts`
- `apps/api/src/validation/ajv.ts` (register candidate-coverage schema)
- `apps/web/src/components/LineBadge.gs-as-s.test.tsx`
- `.agents/handoffs/benchmark-qa.md`

No edits to locked product OpenAPI/domain contracts beyond consuming existing schemas. No `release-subset.json` change.

## 3. Public interfaces and schemas

- Case schema unchanged: `benchmarks/schema/benchmark-case.schema.json`
- P1 tags: `p1_wave1e`, `p1_ready`, `p1_pending`, `alpha_regression`, `privacy_safe_placeref`, `oracle_only`
- Commands:
  - `npm --prefix benchmarks/runner run validate-cases`
  - `npm --prefix benchmarks/runner run gate-p1`
  - `npm --prefix benchmarks/runner run run-benchmarks`
  - `npm --prefix apps/api test -- p1Acceptance.harness.test.ts`
  - `npm --prefix apps/web test -- LineBadge.gs-as-s.test.tsx`

## 4. Assumptions

- Wave 1A provides address/POI → PlaceRef; Wave 1D preferred-line coverage + omissions.
- Wave 1 FE sets rider-facing `label: "S"` for `lineId: "GS"`.
- Live PlaceRefs `st:723` (GCT) / `st:128` (Penn) confirmed at integration time.
- Oracles encode desired post-P1 accounting, not current live alpha behavior.
- Privacy: coarse Midtown labels / station PlaceRefs only — no private addresses.

## 5. Validation commands

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run gate-p1
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
npm --prefix services/routing install && npm --prefix services/routing run build
npm --prefix apps/api install && npm --prefix apps/api test -- p1Acceptance.harness.test.ts
npm --prefix apps/web install && npm --prefix apps/web test -- LineBadge.gs-as-s.test.tsx
```

## 6. Validation results

| Command | Result |
|---|---|
| `validate-cases` | PASS — 48 cases schema-valid |
| `gate-p1` | PASS — 12 subset cases; rankingPasses=2 |
| `run-benchmarks` (fixture) | PASS — pass=31 fail=0 soft=17 |
| `self-test` | PASS |
| `gate` (release-subset) | PASS — unchanged 20-case subset |
| API `p1Acceptance.harness` | PASS — 4/4 (after routing build + Ajv schema register) |
| Web GS→S | SKIP — 1 skipped (expected) |

## 7. Fixture / sample-data instructions

- QA P1 oracles: `benchmarks/fixtures/sut-responses/p1-*.json`
- Pending live twins stay soft under fixture SUT; execute only with `BETTERMTA_SUT=live` after Wave 1A–1D.
- Never label synthetic oracles as `recorded_data`.

## 8. Known defects

- None in P1 ready subset at handoff time.
- Pre-existing: API Ajv omitted `candidate-coverage.schema.json` until this harness unblock.

## 9. Known limitations / gaps

- Address/POI/live Midtown cases pending Wave 1A+1D.
- GS→S skipped until FE/catalog ships GS with label S.
- Error-path rows owned by API vitest (not RouteSearchResponse benchmarks).
- `verify:no-fixtures` needs a live web production build artifact.

## 10. Decisions requiring conductor approval

1. Whether to promote any P1 ready cases into `release-subset.json` before live evidence.
2. Confirm live station PlaceRefs `st:723` / `st:128`.

## 11. Exact next integration step

1. Wave 1A/1D land → reclassify pending Midtown/GCT live cases with recorded or live evidence.
2. Wave 1 FE ships GS→S → unskip `LineBadge.gs-as-s.test.tsx`.
3. Optionally add P1 ready subset to CI alongside legacy release gate.
4. Do **not** merge to main or redeploy from this branch without conductor.

## Case counts (ready vs pending)

| Bucket | Count |
|---|---|
| P1 benchmark cases | 18 |
| Ready (`p1_ready`) | 11 |
| Pending (`p1_pending`) | 7 |
| P1 ready gate subset (incl. ranking seed) | 12 |
| API harness groups | 4 |
| FE SKIP | 1 |
