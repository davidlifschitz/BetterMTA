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

## 3. Preference / constraint semantics
Input: origin, destination, departure/arrival time, preferred (selected) service IDs.

Product semantics (ADR-0023): selected lines are **preferred lines**. Maximize distinct preference coverage; permit unselected connector lines, walks, and transfers to complete a practical trip. Complete preference match outranks partial; higher coverage before convenience tie-breakers. OTP 2 remains the candidate-generation substrate (ADR-0011); BetterMTA owns orchestration so preference-covering candidates appear when topologically sensible. Exhausted budget → `insufficient_candidate_coverage`. Omissions must be explained.

Ranking tuple (aligned with ADR-0007):
1. Complete preferred-line coverage.
2. Number of preferred lines covered (satisfaction count).
3. Arrival time / generalized travel cost.
4. Transfers.
5. Walking.
6. Reliability penalty / realtime confidence.
7. Stable fingerprint.

The system should treat preference coverage as part of path state (e.g. `(node, time, preferredLineMask)`) rather than a post-processing filter alone. For small selected sets, a bitmask is practical. Candidate generation uses the OTP substrate plus BetterMTA multi-family / via orchestration, followed by exact itinerary validation and ranking outside OTP.

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