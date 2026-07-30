# BetterMTA Technical Design

## 1. Architecture
- Next.js App Router mobile web client.
- Backend-for-frontend route handlers.
- Dedicated routing service for graph building and path search.
- Static GTFS ingestion pipeline.
- GTFS-Realtime ingestion for trip updates and alerts.
- Redis-compatible cache for feed snapshots and hot route requests.
- Postgres for users, consented preferences, feedback, experiments, and benchmark results.
- Object storage for archived feed snapshots and reproducibility.

## 2. Transit graph
Model stations, platforms/stop IDs, transfer pathways, walking access edges, scheduled ride edges, and service-calendar validity. Preserve service IDs separately from physical trunk lines because NYC services can reroute.

## 3. Constraint semantics
Input: origin, destination, departure/arrival time, selected service IDs.

Ranking tuple:
1. Complete required-line coverage.
2. Number of required lines covered.
3. Arrival time / generalized travel cost.
4. Transfers.
5. Walking.
6. Reliability penalty.

The system should search state `(node, time, requiredLineMask)` so line coverage is part of the path state rather than a post-processing filter. For small selected sets, a bitmask is practical. Candidate generation should use a time-dependent multi-criteria Dijkstra or RAPTOR-family algorithm, followed by exact itinerary validation.

## 4. “Manually checking” interpretation
The application cannot rely on human review per request. Production implementation should emulate a careful manual check by generating multiple candidate families, replaying each itinerary against the same live snapshot, and comparing complete door-to-door time. Low-confidence disagreements can be sampled into an offline human benchmark queue.

## 5. Live data
- Poll and decode relevant MTA GTFS-Realtime feeds.
- Store feed timestamp, ingestion timestamp, and entity-level freshness.
- Apply trip updates and alerts to scheduled service.
- Degrade to schedule-only routing when live feeds are stale or unavailable.
- Display degraded mode to users.

## 6. API
**Superseded by** `API_CONTRACT.md` and `contracts/openapi/bettermta-v1.yaml` (contract version `2026-07-30`).

Locked minimum endpoints:

- `POST /v1/routes/search`
- `GET /v1/lines`
- `GET /v1/places/search`
- `GET /v1/status`
- `GET /health/live`
- `GET /health/ready`

`POST /v1/feedback` is reserved/optional for later beta, not required to unblock parallel work.

## 7. Reliability and operations
- Structured logs with request IDs.
- Metrics for latency, feed age, route count, failure classes, and constraint coverage.
- Error tracking and alerting.
- Feature flags for new ranking logic.
- Blue/green or preview deployment with rollback.
- Synthetic route probes every few minutes.

## 8. Security and privacy
- No account required for search.
- Explicit consent before preference learning.
- Minimize precise-location retention.
- Rate limiting and request-size limits.
- Secrets stored outside source control.
- Dependency and container scanning.

## 9. Test strategy
- Unit tests for graph and constraint semantics.
- Golden tests using fixed GTFS snapshots.
- Property tests: complete coverage must outrank partial coverage.
- Regression corpus of known NYC trips.
- Feed-failure and stale-data tests.
- Browser tests for the complete mobile workflow.
- Shadow comparison against baseline routing provider outputs where permitted.

## 10. Current scaffold boundary
The included repository demonstrates the UX and API contract with deterministic prototype ranking. It does not yet parse GTFS or provide live route guidance.