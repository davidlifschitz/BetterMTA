# BetterMTA Implementation Roadmap

## Milestone 0 — Completed scaffold
- Mobile-first interface.
- Line toggles.
- Ranked prototype routes.
- API boundary.
- Tests, lint, and build scripts.

## Milestone 1 — Static routing proof
- Download and parse MTA subway GTFS.
- Build station/platform/transfer graph.
- Implement origin/destination station snapping.
- Implement required-line state search.
- Create 100-trip golden benchmark.
Exit: correct constrained itineraries on at least 95% of curated schedule-only cases.

## Milestone 2 — Real-time routing
- Decode GTFS-Realtime trip updates and alerts.
- Snapshot freshness and fallback logic.
- Exact itinerary replay and comparison.
Exit: every result reports feed freshness; stale feeds degrade safely.

## Milestone 3 — Product beta
- Real map and geocoding.
- Baseline versus BetterMTA comparison.
- Analytics, feedback, consented preference learning.
- Error monitoring and synthetic probes.
Exit: 25–50 trusted users complete recurring trips.

## Milestone 4 — Public beta production
- Load testing and SLOs.
- CI/CD with preview deployments and rollback.
- Privacy policy and support workflow.
- Accessibility review.
- Incident playbook.
Exit: public URL, monitored service, no critical known defects.

## Milestone 5 — Differentiation
- Live rerouting.
- Better delay handling.
- Crowding and historical reliability.
- “Beat the default” route discovery.
- Expanded transit modes.