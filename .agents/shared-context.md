# Shared Context

## Product
BetterMTA is a mobile-first NYC subway route planner for commuters and transit power users who want the routing algorithm to listen to their selected subway lines.

## Core behavior
A user provides an origin, destination, departure time, and zero or more selected lines. Use all selected lines when feasible. Otherwise maximize the number satisfied. Rank ties by expected arrival time, transfers, walking, realtime confidence, and a stable final tie-breaker. Return up to three routes.

## Confirmed decisions
- Mobile web first.
- Familiar transit-directions entry flow.
- Select lines before or after search.
- Simple selected/unselected line controls in MVP.
- Top three alternatives.
- Show time, waits, walking, transfers, line breakdown, alerts, and freshness; show reliability or crowding only when defensible.
- No account required for public beta.
- Realtime MTA conditions matter.
- Explanations must come from structured routing facts.

## Production experiment
A stranger can complete the core flow without help. The system has validated transit data, visible freshness, structured logs, error monitoring, analytics, rate limiting, automated deployment, rollback, health checks, and routing regression benchmarks.

## Targets
- Route API p95 under two seconds.
- Topologically valid legs only.
- Accurate selected-line accounting.
- Deterministic ranking for identical inputs and snapshots.
- Never silently present stale data as live.

## Technical direction
Evaluate OpenTripPlanner or another mature GTFS router before custom graph search. BetterMTA’s differentiated layer is candidate generation, selected-line evaluation, ranking, comparison, explanation, and benchmark verification.

## Deferred
Accounts, native apps, AI chat, social features, historical dashboards, automatic preference learning, and unsupported crowding prediction.

## Required completion report
Files changed, interfaces changed, validation commands and results, known limitations, unresolved decisions, and remaining production risks.