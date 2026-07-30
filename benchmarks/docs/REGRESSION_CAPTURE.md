# Regression Capture Workflow

**Owner:** Benchmark / QA

When a routing, ranking, or satisfaction defect is found (manual review, beta feedback, or integration failure), capture it as a **reproducible failing benchmark case** before fixing production code.

## Steps

1. **Reproduce** with a fixed `staticDatasetVersion` + `realtimeFixtureVersion` (or recorded pack ID).
2. **Name** the case: `bmc-reg-<yyyy-mm-dd>-<short-slug>`  
   Example: `bmc-reg-2026-08-12-a-omitted-but-ridden`
3. **Classify** honestly:
   - `recorded_data` if pinned to a recorded snapshot
   - `manually_reviewed_real_trip` if a human confirmed the OD/result
   - `synthetic_contract_fixture` only if the failure is demonstrated with synthetic fixtures
4. **Prefer invariants** that fail for the right reason (`satisfaction_accounting`, ranking, chronology) over brittle full-itinerary equality.
5. **Add** `benchmarks/cases/<caseId>.json` from the template.
6. **Run** `npm --prefix benchmarks/runner run run-benchmarks` and confirm the case **FAIL**s.
7. **File** the fix with Routing/Backend; keep the case. After the fix, the case must **PASS** (regression lock).
8. **Do not** edit `contracts/**` to hide the failure — open `docs/proposals/qa-contract-change-*.md` if the contract is wrong.

## Naming convention

| Prefix | Use |
|---|---|
| `bmc-` | Ordinary corpus case |
| `bmc-reg-` | Regression captured from a defect |
| `bmc-pending-` | Reserved OD awaiting live SUT |

Filename **must** equal `caseId` + `.json`.

## Template

See `benchmarks/templates/regression-case.template.json`.

## Minimal fields for a regression

- Stable `caseId`
- OD + timing + `selectedLineIds`
- `expectedFeasibility` / `minimumSatisfactionCount` if known
- Invariant list that fails today
- `humanReviewNotes` describing the defect and why the expected behavior is correct
- Dataset / realtime pins
- `sut` mapping (fixture or future live key)
