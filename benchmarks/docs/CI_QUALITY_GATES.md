# CI Quality Gates (Benchmark / QA)

**Owner:** Benchmark / QA  
**Maps to:** `docs/ACCEPTANCE_CRITERIA.md` section **D**

Canonical copy: `docs/CI_QUALITY_GATES.md`. Keep this file in sync.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All merge-blocking invariant assertions passed on the release subset |
| 1 | One or more merge-blocking assertions failed, subset misconfigured, or ranking coverage is zero |
| 2 | Runner/config/case-schema error |

## Commands

```bash
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
# optional explicit subset path:
npm --prefix benchmarks/runner run gate -- --subset benchmarks/release-subset.json
```

`self-test` exercises negative fixtures and must exit **0** when every expected-fail fails (exit **1** if an expected-fail unexpectedly passes).

## Release subset

File: `benchmarks/release-subset.json` (`{ "caseIds": [...] }`).

The gate **reads this file by default** (or `--subset <path>`). Soft/placeholder cases are excluded. Every subset case must list **all** merge-blocking invariants in `invariantAssertions` (not soft-omitted).

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

Cases tagged `soft_feasibility` or classified `pending_live_integration` are reported as **soft** (not pass) so corpus health is not inflated. They may omit request-aligned satisfaction/feasibility assertions while fixtures are mismatched placeholders.

## Explicitly out of scope for this gate

**ACCEPTANCE_CRITERIA §D.3 accessibility/performance is NOT measured by this gate.** Frontend owns a11y evidence; latency budgets are Integration/Infra.

Also non-blocking here:

- Unit/lint/typecheck/build (D.4) — repo CI with Infrastructure; this gate is additive.
- Soft-omitted `expected_feasibility` / `minimum_satisfaction` on placeholder cases **outside** the release subset.

## Reports

Machine + human reports land in `benchmarks/reports/latest.{json,txt}` with totals: `pass` / `fail` / `soft` / `skipped`.
