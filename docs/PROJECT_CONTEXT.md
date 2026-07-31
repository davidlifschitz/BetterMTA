# BetterMTA — Persistent Project Context

## Product
BetterMTA is a NYC transit-routing product for commuters and transit power users who believe they may know a better subway-line combination than a default navigation app. A rider enters an origin and destination (station, address, place, or current location), selects preferred subway lines, and BetterMTA finds and ranks the fastest valid routes that maximize those preferences—filling walks, transfers, and unselected connectors when needed (ADR-0022, ADR-0023).

## Core promise
**You know the subway. Your navigation app should listen to you.**

BetterMTA should feel familiar to a Google Maps transit user while adding constrained, editable subway routing and transparent route comparisons.

## Confirmed product decisions
- Familiar transit directions rather than an unfamiliar planning paradigm.
- Users may select preferred lines before or after an initial route search.
- Line selection is initially a simple toggle.
- Selected lines are **preferred lines**: maximize distinct preference coverage when feasible (ADR-0023).
- If all preferred lines cannot form a valid route, rank options using the maximum feasible number.
- Unselected connector lines, walks, and transfers may be inserted to complete a practical trip; riders need not enumerate every connector.
- Complete preference matches outrank partials; higher coverage outranks convenience tie-breakers within the same coverage level.
- Omissions of preferred lines must be explained; exhausted candidate budget surfaces `insufficient_candidate_coverage` rather than a silent 0-of-N.
- Show the top three alternatives.
- Show total time, waits, walking, transfers, line travel, reliability, and crowding only when data supports them.
- Show the time cost and several alternatives when a user changes the route.
- Primary audience: NYC commuters and transit power users.
- Ask once before remembering preferences; automatic learning comes later.

## Product principles
Treat commuter knowledge as useful input; never hide tradeoffs; maximize feasible preferred-line coverage and explain omissions; make editing fast and reversible; use familiar UX; support better-route claims with evidence; and clearly distinguish live, stale, simulated, and unavailable data.

## Current production definition
The target is a public beta, not full Google Maps parity. It should be mobile-first, understandable without assistance, measurable, monitored, safely deployable, and powered by a replaceable real routing/data layer.

## Current implementation boundary
A mobile-first prototype has been designed with origin/destination entry, line selection, ranked alternatives, and comparison metrics. Prototype route estimates are deterministic and not connected to MTA GTFS or GTFS-Realtime. They must not be represented as live navigation.

## Existing source documents
- `VISION.md`
- `PRODUCT_PRINCIPLES.md`
- `PRD.md`
- `TECHNICAL_DESIGN.md`
- `UX_SPEC.md`
- `ROADMAP.md`
- `PRODUCTION_CHECKLIST.md`

## Conductor lock status
Shared architecture and contracts remain locked (`docs/CONDUCTOR_PACKAGE.md`, `docs/*CONTRACT*`, `contracts/**`, contract version `2026-07-30`) until Wave 0B proposes additive contract changes. Step 2 parallel workstreams are merged into `agent/integration-live`. Phase 1 production decisions are closed in `ARCHITECTURE_DECISIONS.md` (ADR-0011–ADR-0021). P1 product semantics are closed in **ADR-0022** (places) and **ADR-0023** (preferred lines / candidate coverage). Implementation workstreams must consume those artifacts and must not silently fork them. Deferred epics D1–D6 stay in `docs/DEFERRED_BACKLOG.md`.

## Most important unresolved work
1. ~~Routing engine selection.~~ Closed: OTP 2.9.0 substrate (ADR-0011); live OTP wiring remains.
2. Live GTFS / GTFS-Realtime ingestion, snapshot promotion, and freshness labeling in production (data contract surface locked).
3. ~~Canonical domain model.~~ Locked in `DOMAIN_MODEL.md`.
4. ~~Versioned API contract.~~ Locked in `API_CONTRACT.md` + `contracts/openapi/bettermta-v1.yaml`.
5. Live route-quality benchmark runs against the production API (corpus exists; SI/ferry Must-set deferred per ADR-0020).
6. Detailed interaction and design system polish for live mode (arrive-by and feedback controls hidden per ADR-0014 / ADR-0017).
7. Location-data privacy model for geocode + any future feedback expansion (baseline + ADR-0022 no-default-precise-coord retention; detailed threat model still open).
8. Observability, SLOs, incident response, and runbooks in the Fly.io environment (ADR-0012).
9. Beta launch and user-research plan.
10. Live-data implementation phases: OTP graph build, API live mode fail-closed guards (ADR-0018), web production builds without fixtures, end-to-end production validation.
11. ~~Deploy platform vendor.~~ Closed: Fly.io (ADR-0012); Postgres deferred (ADR-0016). Current dogfood path: self-hosted controlled alpha (ADR-0021).
12. ~~Geocoding / place provider.~~ Reopened under P1: station index remains authoritative; address/POI via geocoder abstraction (ADR-0022 supersedes ADR-0013). Feature-flagged rollout; Wave 0B contracts then implementation waves.
13. Preferred-line candidate coverage orchestration (ADR-0023) — BetterMTA-owned; OTP remains substrate (ADR-0011).

## Parallel-chat rule
Each chat should own one document or implementation workstream, read this file and the relevant source documents, avoid silently changing confirmed decisions, and explicitly propose any conflicting change.