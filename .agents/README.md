# BetterMTA Agent Workstreams

Use one workstream per chat or coding agent. Every workstream must first read `../AGENTS.md`, `../docs/PROJECT_CONTEXT.md`, and `shared-context.md`.

## Prompts

- `conductor.md` — architecture, contracts, ownership, sequencing, acceptance criteria.
- `routing-engine.md` — candidate generation, constraint satisfaction, ranking, explanations.
- `mta-data.md` — static GTFS and GTFS-Realtime ingestion, validation, freshness.
- `backend-api.md` — versioned API, privacy, rate limiting, experiments, observability.
- `mobile-web.md` — mobile-first route search, line picker, comparison, accessibility.
- `infrastructure.md` — CI/CD, monitoring, feature flags, alerts, runbooks, rollback.
- `benchmark-qa.md` — route benchmark, invariants, regression gates, human review.
- `integration-launch.md` — system integration, staged rollout, go/no-go and rollback.
- `single-agent.md` — end-to-end prompt when parallel work is unavailable.
- `handoff.md` — required workstream completion format.
- `review.md` — independent review findings format.

## Recommended order

1. Conductor locks contracts.
2. Routing, data, frontend, backend, infrastructure, and QA proceed in parallel against fixtures and shared schemas.
3. Workstreams produce handoffs.
4. Integration owner assembles the release candidate.
5. Benchmark and production gates determine rollout.