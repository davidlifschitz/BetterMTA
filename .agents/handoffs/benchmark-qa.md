# Benchmark / QA Handoff

**Workstream:** Benchmark / QA  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`  
**Phase:** Step 3 Phase 9 — live QA and release gates

## 1. What was implemented / remediated

- **Live HTTP SUT** (`benchmarks/runner/src/sut-live.ts`): `POST /v1/routes/search` against `BETTERMTA_LIVE_API_BASE` (default `http://127.0.0.1:8080`); PlaceRef as `{placeId}` only; fail-closed network errors; latency capture.
- **SUT selection:** `BETTERMTA_SUT=live|fixture` and CLI `--sut` (default fixture). Hybrid live mode keeps recorded/conductor/QA fixtures on disk for non-live cases.
- **Recorded NYC corpus:** 8 captures under `benchmarks/fixtures/recorded-responses/` from compose API `:8080` (`staticDatasetVersion=mta-subway-c9c3366cdd16`, `dataMode=stale`).
- **Live smoke case:** `bmc-live-smoke-f-carroll-bryant` (`classification=live`, soft under fixture SUT).
- **Shadow reports:** `benchmarks/reports/live-shadow-<ts>.{json,txt}` with `humanValidity=pending_review`.
- **Release-gate checklist:** `benchmarks/reports/release-gate-<ts>.md` (G01–G20); Fly BLOCKED / Google NOT_CLAIMED do not fail exit alone.
- Reclassified pending slots that had evidence into honest `recorded_data` (deleted old pending placeholders for those ODs).

**Status legend:** implemented / tested / mocked / deferred / blocked.

| Area | Status |
|---|---|
| Case schema (+ `live`, `recorded_response`) | implemented, tested |
| Fixture SUT | implemented, tested |
| Live HTTP SUT | implemented, tested (local compose :8080) |
| Recorded NYC cases (8) | implemented, tested |
| Live smoke case (1) | implemented, soft under fixture; HTTP under live |
| Shadow report writer | implemented, tested |
| Release checklist G01–G20 | implemented, tested |
| Self-test harness | implemented, tested |
| Fly deploy / rollback gates | blocked / pending (infra) |
| Google comparison | not claimed |
| Full 100-case corpus | deferred |

### Case counts by classification (approx)

| Classification | Count |
|---|---|
| `synthetic_contract_fixture` | 12 |
| `recorded_data` | 8 |
| `live` | 1 |
| `pending_live_integration` | 9 (remaining slots) |
| `external_comparison_manual` | 0 |
| `manually_reviewed_real_trip` | 0 |

## 2. Files changed

Owned paths only:

- `benchmarks/**` (schema, cases, runner, recorded-responses, release-subset, docs, README)
- `docs/TESTING_STRATEGY.md`
- `docs/CI_QUALITY_GATES.md`
- `docs/proposals/qa-live-sut-and-shadow-reports.md`
- `docs/proposals/qa-contract-change-feasibility-none-fixture.md` (unchanged prior proposal)
- `.agents/handoffs/benchmark-qa.md` (this file)

No edits to `contracts/**`.

## 3. Public interfaces and schemas

- **Case schema:** `benchmarks/schema/benchmark-case.schema.json`
- **Release subset:** `benchmarks/release-subset.json` (20 cases: 12 synthetic + 8 recorded)
- **SUT:** `SystemUnderTest.search(request)`; live adapter `LiveSystemUnderTest`
- **Commands:**
  - `npm --prefix benchmarks/runner run validate-cases`
  - `npm --prefix benchmarks/runner run run-benchmarks` (`--sut live|fixture`)
  - `npm --prefix benchmarks/runner run self-test`
  - `npm --prefix benchmarks/runner run gate` (`--sut`, `--subset`)

## 4. Assumptions

- Compose API on `:8080` is preferred; host-native `:3080` is a fallback.
- Recorded captures are point-in-time; re-record when routing semantics change materially.
- Live `deterministic_order` may flake if realtime snapshot changes between the two searches.
- Shadow `humanValidity` stays `pending_review` until a human marks accepted/rejected.

## 5. Validation commands

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live
npm --prefix contracts install && npm --prefix contracts run validate
```

## 6. Validation results

| Command | Result |
|---|---|
| `validate-cases` | PASS — 30 cases schema-valid |
| `run-benchmarks` (fixture) | PASS — pass=20 fail=0 soft=10 skipped=0; assertions pass=281 fail=0 skip=52 |
| `self-test` | PASS — 6/6 expected-fail invariants failed (exit 0) |
| `gate` (fixture) | PASS — release subset 20 cases; rankingPasses=20; checklist written; exit 0 |
| `run-benchmarks` (live `:8080`) | PASS — pass=21 fail=0 soft=9; live smoke complete/stale ~2107ms; shadow report written |
| `contracts validate` | PASS — unchanged conductor validations |

## 7. Fixture or sample-data instructions

- Conductor responses: `contracts/fixtures/routes/*.json` (read-only).
- QA responses: `benchmarks/fixtures/sut-responses/*.json`.
- Recorded live captures: `benchmarks/fixtures/recorded-responses/*.json`.
- Negative self-test responses: `benchmarks/fixtures/negative-responses/*.json`.
- Never present synthetic as live navigation or as `recorded_data`.

## 8. Known defects

- None known in fixture/recorded corpus at handoff authoring time (verify with gate run).

## 9. Known limitations

- Remaining `pending_live_integration` slots (arrive-by, Times Sq complex, Bronx, SI, E+F peak, local/express Q, coordinate POI, external compare, three-line chain).
- §D.3 a11y / p95 load not measured here.
- Fly activation blocked (infra).

## 10. Decisions requiring conductor approval

1. Additive conductor fixture for feasibility `none` — see prior proposal (still optional; QA uses own `feasibility-none` + recorded none capture).
2. Whether SI/ferry-adjacent cases remain in the public-beta corpus.

## 11. Exact next integration step

1. Human review shadow reports (`humanValidity`).
2. Infra wires `validate-cases` / `self-test` / `gate` into CI.
3. Optionally add a live release subset for nightly jobs when API is available.
4. Expand recorded corpus toward 100; reclassify remaining pendings with evidence only.
5. Unblock Fly gates when infra activates cloud deploy.
