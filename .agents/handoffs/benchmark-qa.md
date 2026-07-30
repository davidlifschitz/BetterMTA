# Benchmark / QA Handoff

**Workstream:** Benchmark / QA  
**Branch / worktree:** `agent/benchmark-qa` @ `/Users/thebiglipper/Developer/bettermta-benchmark-qa`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`

## 1. What was implemented / remediated

- Benchmark case JSON Schema with honest `classification` (including `pending_live_integration` = slot reserved, evidence not yet collected).
- Seed corpus of **25** deterministic cases; soft placeholders no longer claim `recorded_data` / `external_comparison_manual`.
- TypeScript runner with fixture SUT, Ajv validation, machine + human reports (`pass` / `fail` / `soft` / `skipped`).
- Invariant library: request↔`requestedLineIds` binding, feasibility↔counts coherence, duplicate itinerary ID check.
- Negative self-test harness (`npm run self-test`) proving fail paths.
- CI gate over `benchmarks/release-subset.json` with merge-blocking including `expected_feasibility` / `minimum_satisfaction`, ranking-coverage check, and explicit §D.3 out-of-scope note.
- Docs: testing strategy, CI gates (root + benchmarks mirror), regression template REPLACE steps.

**Status legend:** implemented / tested / mocked / deferred / blocked.

| Area | Status |
|---|---|
| Case schema | implemented, tested |
| Seed cases (25) | implemented, tested (fixture SUT) |
| Runner + soft-aware reports | implemented, tested |
| Fixture SUT | implemented, mocked |
| Invariant library | implemented, tested (+ self-test negatives) |
| Release subset + gate | implemented, tested (exit 0) |
| Self-test harness | implemented, tested (exit 0 = expected fails fire) |
| Live router SUT adapter | deferred (blocked on routing) |
| Full 100-case corpus | deferred (phases B–E) |
| Recorded GTFS-RT cases | deferred; slot kept as `pending_live_integration` |
| Manual external comparison | deferred; slot kept as `pending_live_integration` |
| Fuzz / property generators | deferred |
| §D.3 a11y / performance | deferred (external to this gate) |

### Case counts by classification

| Classification | Count |
|---|---|
| `synthetic_contract_fixture` | 12 (all in release subset) |
| `pending_live_integration` | 13 (soft placeholders; includes former recorded/external slots) |
| `recorded_data` | 0 (no evidence yet) |
| `external_comparison_manual` | 0 (no evidence yet) |
| `manually_reviewed_real_trip` | 0 |
| **Total** | **25** |

### Report accounting (fixture run)

- Non-soft pass ≈ 12 (release synthetics)
- Soft ≈ 13 (placeholders; not counted as pass)
- Fail ≈ 0

## 2. Files changed

Owned paths only:

- `benchmarks/**` (schema, cases, runner, fixtures including `negative-responses/`, release-subset, docs, templates, README)
- `docs/TESTING_STRATEGY.md`
- `docs/CI_QUALITY_GATES.md`
- `docs/proposals/qa-contract-change-feasibility-none-fixture.md` (unchanged proposal)
- `.agents/handoffs/benchmark-qa.md` (this file)

No edits to `contracts/**` or conductor docs.

## 3. Public interfaces and schemas

- **Case schema:** `benchmarks/schema/benchmark-case.schema.json`
- **Release subset:** `benchmarks/release-subset.json`
- **SUT interface:** `SystemUnderTest.search(request)` in `benchmarks/runner/src/types.ts`
- **Commands:**
  - `npm --prefix benchmarks/runner run validate-cases`
  - `npm --prefix benchmarks/runner run run-benchmarks`
  - `npm --prefix benchmarks/runner run self-test`
  - `npm --prefix benchmarks/runner run gate` (optional `-- --subset <path>`)

## 4. Assumptions

- Fixture SUT is sufficient until routing exposes a real `SystemUnderTest`.
- Soft `pending_live_integration` cases may map to mismatched fixtures for structural wiring only.
- Conductor fixtures must keep `dataMode` ≠ `live` unless explicitly tagged.
- Ordering invariants skip (not fail) when fewer than two constrained itineraries exist.

## 5. Validation commands

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
npm --prefix contracts install
npm --prefix contracts run validate
```

## 6. Validation results

| Command | Result |
|---|---|
| `validate-cases` | PASS — 25 cases schema-valid |
| `run-benchmarks` | PASS — cases pass=12 fail=0 soft=13 skipped=0; assertions pass=209 fail=0 skip=52 |
| `self-test` | PASS — 6/6 expected-fail invariants failed (exit 0) |
| `gate` | PASS — release subset 12 cases; rankingPasses=6; §D.3 note emitted; exit 0 |
| `contracts validate` | PASS — unchanged conductor validations |

No conductor fixture invariant failures on mapped synthetic cases.

## 7. Fixture or sample-data instructions

- Conductor responses: `contracts/fixtures/routes/*.json` (read-only).
- QA responses: `benchmarks/fixtures/sut-responses/*.json`.
- Negative self-test responses: `benchmarks/fixtures/negative-responses/*.json` (not part of the corpus).
- Never present fixtures as live navigation or verified real-world outcomes.

## 8. Known defects

- None failing on the fixture corpus after remediation.
- Conductor route fixtures each expose ≤1 constrained itinerary; multi-itinerary ranking is covered by QA fixtures in the release subset.

## 9. Known limitations

- No live network / live router (deferred).
- 25 ≠ 100; path in `docs/TESTING_STRATEGY.md`.
- Soft placeholders do not assert OD-specific satisfaction against mismatched fixtures.
- Fuzzing / property generators deferred.
- Arrive-by semantics still conductor-unresolved.
- SI/ferry multimodal may be out of MVP scope.
- **§D.3 accessibility/performance is NOT measured by this gate** (Frontend / Integration own those evidence packages).

## 10. Decisions requiring conductor approval

1. Additive conductor fixture for feasibility `none` — see `docs/proposals/qa-contract-change-feasibility-none-fixture.md`.
2. Whether SI/ferry-adjacent cases remain in the public-beta corpus or are explicitly deferred.

## 11. Exact next integration step

1. Routing (or Backend adapter) implements `SystemUnderTest` against real search.
2. Wire runner CLI / env to select live SUT instead of fixture SUT.
3. Reclassify soft `pending_live_integration` cases; turn on full satisfaction/feasibility assertions; promote evidence-backed cases to `recorded_data` / `external_comparison_manual` / `manually_reviewed_real_trip`.
4. Data supplies recorded packs → fill recorded slot with honest `recorded_data`.
5. Infrastructure adds `validate-cases`, `self-test`, and `gate` to CI after package install.
6. Conductor reviews feasibility-none fixture proposal if FE/BE need a shared mock.
