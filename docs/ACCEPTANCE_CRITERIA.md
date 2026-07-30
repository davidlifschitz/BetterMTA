# Acceptance Criteria — Public Beta

**Owner:** Conductor  
**Status:** Locked release gates  
**Related:** `PRD.md` §8, `PRODUCTION_CHECKLIST.md`

A build may be called public beta only when all **Must** items pass. **Should** items may ship with documented waivers.

## A. Product behavior (Must)

1. User can enter origin and destination on mobile web without assistance.
2. User can select 0–5 subway lines before or after search with simple toggles.
3. When a complete selected-line itinerary exists, it ranks above every partial itinerary.
4. When complete satisfaction is infeasible, the API returns up to three alternatives maximizing distinct selected-line coverage and names omitted lines.
5. Results show total time, arrival, line sequence, walking, waiting, transfers, satisfaction, and freshness/degraded mode.
6. Reliability/crowding appear only when backend marks them display-eligible.
7. System never shows a dead-end generic empty state when a practical partial exists.
8. Editing selected lines recalculates without forcing the user to re-enter OD from scratch.

## B. Data honesty (Must)

1. Every route response includes `dataMode` and freshness metadata.
2. `synthetic` is not shown as live navigation in production.
3. `stale` and `schedule_only` are visibly labeled in the UI.
4. Required MTA attribution is available where legally required.

## C. API / engineering (Must)

1. Locked endpoints exist and conform to `contracts/openapi/bettermta-v1.yaml`.
2. Distinct typed errors are not collapsed into opaque 500s for known classes.
3. `/health/live` and `/health/ready` behave per contract.
4. Route search p95 < 2.0s under agreed beta load **excluding** upstream outage fallback paths.
5. Deterministic ranking for identical inputs + identical snapshots.

## D. Quality gates (Must)

1. Zero known topology-invalid itineraries in the active benchmark subset used for release.
2. Zero selected-line accounting errors on the release benchmark subset.
3. Core workflow has no critical accessibility failures (keyboard, name/role/value for line toggles, contrast, 44px targets on primary controls).
4. CI blocks failing unit/contract/lint/typecheck/build checks that are enabled for the repo.

## E. Operations (Must)

1. Structured logs with `requestId`.
2. Error monitoring enabled.
3. Alerts exist for search failure spike, p95 latency breach, stale realtime, readiness failure, deploy failure.
4. Documented one-action rollback tested at least once.
5. Rate limiting enabled on search and place autocomplete.

## F. Privacy (Must)

1. No account required for search.
2. Precise location not persisted by default.
3. Preference memory not silently enabled (consent required if any memory ships).

## G. Research / UX (Should)

1. First-time task-completion rate > 80% in moderated testing.
2. Feedback control available on itineraries.
3. Experiment framework can assign concise vs detailed explanations.

## H. Explicit non-claims (Must)

1. Marketing and UI do not claim BetterMTA beats Google/Apple/Citymapper without benchmark evidence from the QA corpus.
2. Prototype/fixture estimates are never described as live guidance.

## Evidence package for go/no-go

Integration workstream attaches:

- Benchmark report hash + dataset versions
- E2E + a11y summary
- Latency probe summary
- Known limitations list
- Risk register updates
