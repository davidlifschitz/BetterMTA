# Human Review Workflow

**Owner:** Benchmark / QA  
**Internal corpus name:** “Beat Google 100” (not a public claim)

## When to human-review

- Any case classified `manually_reviewed_real_trip`
- External comparison slots (`external_comparison_manual`)
- Release go/no-go sampling from the active benchmark subset
- After large ranking or data-mapping changes

## Checklist (per itinerary / top result)

Answer yes/no/notes:

1. **Physically valid?** Legs connect; no impossible transfers; times move forward.
2. **Practical?** A rider would consider taking it (not absurd walks/waits for the scenario).
3. **Constraint-correct?** Satisfied lines were actually ridden; omitted lines are honestly omitted.
4. **Understandable?** Explanation facts support the UI summary; omissions are clear.
5. **Missing obvious route?** Is there a clearly better constrained option the system skipped?
6. **Preferable to baseline (for this scenario)?** Given the rider’s selected lines, is the constrained result the right tradeoff vs baseline? (Not “better than Google.”)

## Process

1. Run the case (live SUT or recorded pack) and export the report JSON.
2. Record answers in the case `humanReviewNotes` or a sibling review log under `benchmarks/reports/reviews/` (optional; created when reviews start).
3. If a defect is found, follow `REGRESSION_CAPTURE.md`.
4. Never promote a synthetic fixture case to `manually_reviewed_real_trip` without a real ride or trusted recording.

## External comparison rules

- Manual side-by-side only; **no scraping / ToS-violating automation**.
- Store qualitative notes + timestamps + dataset versions.
- Public claims require explicit benchmark evidence and conductor/marketing approval.
