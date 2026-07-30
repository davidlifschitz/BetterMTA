# Contract change proposal: feasibility-none route fixture

**From:** Benchmark / QA  
**Date:** 2026-07-30  
**Impacted:** Conductor, Frontend, Backend

## Problem

`contracts/fixtures/routes/` includes `complete-match`, `partial-match`, `baseline-only`, and `degraded-realtime`, but no synthetic response where constrained best feasibility is `none` (satisfactionCount 0 with structured omissions) while a baseline remains available.

QA currently covers this with `benchmarks/fixtures/sut-responses/feasibility-none.json` (QA-owned, synthetic).

## Proposal (additive)

Add `contracts/fixtures/routes/feasibility-none.json` (or `impossible-constraint.json`) validating against `route-search-response.schema.json`, with:

- `constrained.itineraries[0].satisfaction.feasibility: "none"`
- `omittedLineIds` == all requested
- explanation facts including `line_omitted`
- `satisfactionSummary.completeMatchFound: false`, `bestSatisfactionCount: 0`
- optional non-empty `baseline.itineraries` to show A.7 (no dead-end when practical baseline exists)

## Migration

- Additive fixture only; no schema break.
- Frontend can mock the impossible-constraint empty-constraint UX.
- QA will remap `bmc-impossible-sir-z-brooklyn` to the conductor fixture once merged.

## Preference

Additive. No breaking change.
