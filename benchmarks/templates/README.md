# Benchmark case templates

## `regression-case.template.json`

Copy this file when locking a defect. Default `classification` is
`synthetic_contract_fixture` — change only when you have real recorded or
human-reviewed evidence.

### REPLACE steps

1. Copy `regression-case.template.json` → `benchmarks/cases/bmc-reg-<yyyy-mm-dd>-<short-slug>.json`.
2. Replace `caseId` so it matches the filename stem (`bmc-reg-…`).
3. Replace `title` with a short defect description.
4. Replace `origin` / `destination` / `timing` / `selectedLineIds` with the failing request.
5. Set `expectedFeasibility` and `minimumSatisfactionCount` to the **correct** expectation (not the buggy output).
6. Trim or extend `invariantAssertions` to the invariants that should catch the defect (keep merge-blocking ones when the case joins the release subset).
7. Replace `humanReviewNotes` with repro + expected correct behavior.
8. Replace `staticDatasetVersion` / `realtimeFixtureVersion` (`gtfs_REPLACE`, `rt_REPLACE`).
9. Replace `sut.responseId` (`REPLACE_RESPONSE_STEM`) with a conductor fixture stem, QA fixture stem, or add a new fixture under `benchmarks/fixtures/sut-responses/`.
10. Run `npm --prefix benchmarks/runner run validate-cases` then `run-benchmarks` — the new case should **FAIL** until the product bug is fixed; after the fix it must **PASS**.

Do not edit `contracts/**` to hide a failure. Open a QA proposal under `docs/proposals/` if the contract itself is wrong.
