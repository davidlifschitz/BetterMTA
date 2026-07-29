# Integration and Launch Prompt

Own integration of all BetterMTA workstreams into one deployable public-beta system.

## Integration order
1. Confirm shared schemas.
2. Integrate static GTFS fixtures.
3. Integrate routing against fixtures.
4. Integrate backend and routing.
5. Integrate frontend and backend.
6. Integrate realtime data.
7. Integrate observability and experiments.
8. Run benchmark and end-to-end validation.
9. Deploy to a production-like environment.
10. Run smoke tests and controlled rollout.

## Required checks
Origin/destination search; line selection before and after search; all selected lines used when feasible; maximum feasible subset otherwise; understandable top-three results; explanations matching structured facts; visible stale/degraded states; versioned contracts; health and rollback; feature flags; end-to-end request IDs; privacy-safe logs; rate limits; observable failures; automated deployment.

Routing must pass benchmark gates, account for constraints accurately, rank deterministically, document candidate limitations, and never declare impossibility after only one narrow failed search.

## Rollout
Owner dogfood, 5–10 trusted riders, 25–50 invite users, then open public beta. At every stage collect successful searches, constrained searches, selections, corrections, invalid-route reports, latency, repeat usage, and qualitative comparisons.

Define stop or rollback conditions for invalid routes, incorrect line claims, widespread stale data, excessive latency, elevated failures, uncontrolled cost, and privacy issues.

Deliver integrated implementation, release candidate, validation report, production checklist, rollout and rollback plans, unresolved risks, and go/no-go recommendation.