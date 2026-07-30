# BetterMTA — Parallel Workstreams

Use one chat or agent per workstream. Every workstream should read `PROJECT_CONTEXT.md`, the relevant source documents, `../AGENTS.md`, and its specialist prompt under `../.agents/`.

## 1. Routing Engine Specification
Define graph state, hard constraints, infeasibility behavior, candidate generation, ranking, tie-breaking, realtime weighting, explanations, and performance targets.

**Deliverable:** `ROUTING_ENGINE_SPEC.md`

## 2. Data Specification
Define static GTFS, GTFS-Realtime, alerts, elevator data, station metadata, refresh cadences, validation, stale behavior, fallbacks, storage, and attribution.

**Deliverable:** `DATA_SPEC.md`

## 3. Domain Model
Define canonical entities and invariants for stations, complexes, stops, lines, service patterns, trips, transfers, walking edges, constraints, itineraries, alternatives, alerts, and preferences.

**Deliverable:** `DOMAIN_MODEL.md`

## 4. API Contract
Specify versioned endpoints, schemas, error codes, validation, caching, rate limits, and examples.

**Deliverable:** `API_CONTRACT.md` or OpenAPI.

## 5. Route Benchmark and Test Strategy
Build canonical NYC trip cases, selected-line constraints, expected feasibility, route-validity checks, regression policy, property tests, realtime scenarios, performance tests, and thresholds.

**Deliverables:** `TESTING_STRATEGY.md` and fixtures.

## 6. UX and Design System
Complete screen states, map interactions, route-card anatomy, loading/error/empty states, accessible patterns, typography, spacing, color, icons, motion, and responsive behavior.

**Deliverables:** `DESIGN_SYSTEM.md` plus wireframes or Figma designs.

## 7. Production Architecture and Operations
Finalize service boundaries, deployment topology, caching, databases, queues, secrets, environments, CI/CD, flags, observability, SLOs, alerts, rollback, recovery, and runbooks.

**Deliverables:** `SYSTEM_ARCHITECTURE.md`, `SLOS.md`, and `RUNBOOKS.md`.

## 8. Security and Privacy
Threat-model location and trip-history data; define retention, consent, deletion, authentication, authorization, abuse prevention, vendor sharing, encryption, and disclosures.

**Deliverables:** `SECURITY_PRIVACY.md` and threat model.

## 9. Analytics and Experimentation
Define product events, success metrics, route-selection funnels, comparison metrics, explanation A/B tests, privacy-safe analytics, and dashboards.

**Deliverable:** `ANALYTICS_SPEC.md`.

## 10. Beta Launch Plan
Define cohort, recruitment, onboarding, feedback, support, rollout stages, go/no-go criteria, known limitations, distribution, and review cadence.

**Deliverable:** `LAUNCH_PLAN.md`.

## Suggested integration order
1. ~~Domain model / API / data contracts / system architecture.~~ Delivered by conductor package — see `CONDUCTOR_PACKAGE.md`.
2. After conductor merge to `main`: routing, data, backend, frontend, infrastructure, and QA in **parallel** (separate worktrees).
3. Specialist specs in parallel with implementation where needed (`ROUTING_ENGINE_SPEC.md`, `DATA_SPEC.md`, etc.).
4. Pairwise integration per `INTEGRATION_SEQUENCE.md`.
5. Benchmark gates + UX polish.
6. Privacy/analytics hardening.
7. Integration/launch workstream and public-beta go/no-go.