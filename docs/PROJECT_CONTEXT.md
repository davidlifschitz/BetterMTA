# BetterMTA — Persistent Project Context

## Product
BetterMTA is a NYC transit-routing product for commuters and transit power users who believe they may know a better subway-line combination than a default navigation app. A rider enters an origin and destination, selects subway lines they want included, and BetterMTA finds and ranks the fastest valid routes using those lines.

## Core promise
**You know the subway. Your navigation app should listen to you.**

BetterMTA should feel familiar to a Google Maps transit user while adding constrained, editable subway routing and transparent route comparisons.

## Confirmed product decisions
- Familiar transit directions rather than an unfamiliar planning paradigm.
- Users may select lines before or after an initial route search.
- Line selection is initially a simple toggle.
- The router attempts to use every selected line.
- If all selected lines cannot form a valid route, rank options using the maximum feasible number.
- Required selections are hard constraints when feasible.
- Show the top three alternatives.
- Show total time, waits, walking, transfers, line travel, reliability, and crowding only when data supports them.
- Show the time cost and several alternatives when a user changes the route.
- Primary audience: NYC commuters and transit power users.
- Ask once before remembering preferences; automatic learning comes later.

## Product principles
Treat commuter knowledge as useful input; never hide tradeoffs; honor feasible constraints; make editing fast and reversible; use familiar UX; support better-route claims with evidence; and clearly distinguish live, stale, simulated, and unavailable data.

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

## Most important unresolved work
1. Routing engine specification.
2. GTFS and GTFS-Realtime data specification.
3. Canonical domain model.
4. Versioned API contract.
5. Route-quality benchmark corpus.
6. Detailed interaction and design system.
7. Location-data privacy model.
8. Observability, SLOs, incident response, and runbooks.
9. Beta launch and user-research plan.
10. Live-data implementation and production validation.

## Parallel-chat rule
Each chat should own one document or implementation workstream, read this file and the relevant source documents, avoid silently changing confirmed decisions, and explicitly propose any conflicting change.