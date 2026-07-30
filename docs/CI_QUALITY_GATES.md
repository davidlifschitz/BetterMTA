# CI Quality Gates (Benchmark / QA)

**Owner:** Benchmark / QA  
**Maps to:** `docs/ACCEPTANCE_CRITERIA.md` section **D**

Canonical copy: this file (`docs/CI_QUALITY_GATES.md`). Mirrored under `benchmarks/docs/CI_QUALITY_GATES.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All merge-blocking invariant assertions passed on the release subset |
| 1 | One or more merge-blocking assertions failed, subset misconfigured, or ranking coverage is zero |
| 2 | Runner/config/case-schema error |

Fly-deploy **BLOCKED** / Google comparison **NOT_CLAIMED** checklist rows do **not** fail the gate by themselves.

## Commands

```bash
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
# optional:
npm --prefix benchmarks/runner run gate -- --subset benchmarks/release-subset.json
npm --prefix benchmarks/runner run gate -- --sut live
```

`self-test` exercises negative fixtures and must exit **0** when every expected-fail fails (exit **1** if an expected-fail unexpectedly passes).

### SUT modes

| `BETTERMTA_SUT` / `--sut` | Default | Behavior |
|---|---|---|
| `fixture` | yes | Conductor / QA / `recorded-responses/` disk fixtures |
| `live` | no | HTTP `POST {BETTERMTA_LIVE_API_BASE}/v1/routes/search` for live cases; fixtures for others |

`BETTERMTA_LIVE_API_BASE` defaults to `http://127.0.0.1:8080` (compose). Host-native fallback: `http://127.0.0.1:3080`.

## Release subset

File: `benchmarks/release-subset.json` (`{ "caseIds": [...] }`).

Includes synthetic fixtures **and** `recorded_data` NYC captures. Soft/`pending_live_integration` and `live` HTTP cases are excluded from the fixture subset. Every subset case must list **all** merge-blocking invariants in `invariantAssertions`.

Ranking coverage: the subset must include at least one multi-itinerary case such that `complete_beats_partial` or `max_satisfaction_before_time` **PASSes** (not only skips). Zero ranking passes → gate fail.

## Merge-blocking invariant classes

Aligned to acceptance §D (topology validity, constraint accounting, determinism) plus contract list/honesty rules:

| Invariant | §D rationale |
|---|---|
| `valid_itinerary_structure` | D.1 topology/schema-invalid itineraries (includes duplicate itinerary IDs) |
| `chronological_legs` | D.1 structural integrity |
| `nonnegative_durations` | D.1 structural integrity |
| `origin_destination_consistency` | D.1 journey coherence |
| `satisfaction_accounting` | D.2 selected-line accounting (binds `requestedLineIds` to request; feasibility↔counts) |
| `expected_feasibility` | Case expectation — merge-blocking on non-soft / release-subset cases |
| `minimum_satisfaction` | Case floor — merge-blocking on non-soft / release-subset cases |
| `complete_beats_partial` | Product ranking (A.3) — blocking when exercisable |
| `max_satisfaction_before_time` | Product ranking — blocking when exercisable |
| `deterministic_order` | D implied + C.5 deterministic ranking |
| `max_three_itineraries` | API contract list cap |
| `honest_data_mode` | B data honesty / R3 |
| `impossible_constraint_explanation` | A.4 / A.7 explain partials |

Skipped assertions (e.g. ordering with <2 itineraries) do **not** fail the gate.

## Soft / placeholder cases

Cases tagged `soft_feasibility`, classified `pending_live_integration`, or `live` under fixture SUT are reported as **soft** (not pass). Live cases execute only when `BETTERMTA_SUT=live`.

## Step 3 release checklist (20 gates)

`npm run gate` writes `benchmarks/reports/release-gate-<timestamp>.md` covering G01–G20 (schema, subset invariants, topology, accounting, ranking, determinism, honesty, self-test note, recorded corpus, live SUT, shadow report, a11y NOT_MEASURED, CI PARTIAL, p95 NOT_MEASURED, health PARTIAL, Fly BLOCKED, rollback PENDING, alerts PENDING, Google NOT_CLAIMED).

## Explicitly out of scope for this gate

**ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate.** Frontend owns a11y evidence; latency budgets are Integration/Infra.

Also non-blocking here:

- Unit/lint/typecheck/build (D.4) — repo CI with Infrastructure; this gate is additive.
- Soft-omitted `expected_feasibility` / `minimum_satisfaction` on placeholder cases **outside** the release subset.
- Fly cloud activation / rollback drill until infra unblocks.

## Reports

| Artifact | When |
|---|---|
| `benchmarks/reports/latest.{json,txt}` | Every benchmark run |
| `benchmarks/reports/live-shadow-<ts>.{json,txt}` | `BETTERMTA_SUT=live` with HTTP cases (`humanValidity` defaults to `pending_review`) |
| `benchmarks/reports/release-gate-<ts>.md` | Every `gate` run (+ `release-gate-latest.md`) |
