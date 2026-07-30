# Workstream Ownership Map

**Owner:** Conductor  
**Status:** Locked for parallel implementation  
**Branch of record:** `agent/conductor`

This map defines which workstream owns which paths after the conductor package is merged to `main`. Later agents must not modify another workstream’s owned paths without conductor approval.

## Workstreams

| Workstream | Branch | Prompt | Primary responsibility |
|---|---|---|---|
| Conductor | `agent/conductor` | `.agents/conductor.md` | Shared contracts, architecture, ownership, ADRs |
| Routing | `agent/routing` | `.agents/routing-engine.md` | Candidate generation, ranking, explanations |
| Data | `agent/data` | `.agents/mta-data.md` | Static GTFS + GTFS-Realtime ingestion |
| Backend | `agent/backend` | `.agents/backend-api.md` | Application API, adapters, caching |
| Frontend | `agent/frontend` | `.agents/mobile-web.md` | Mobile web UI |
| Infrastructure | `agent/infrastructure` | `.agents/infrastructure.md` | Deploy, CI/CD, observability, flags |
| Benchmark/QA | `agent/benchmark-qa` | `.agents/benchmark-qa.md` | Benchmark corpus, release gates |
| Integration | *(after parallel merge)* | `.agents/integration-launch.md` | Wire systems, beta launch |

## Shared / conductor-owned (do not edit without approval)

These files are the shared contract surface. Implementation workstreams may **consume** them and may open a change proposal, but must not silently rewrite them.

| Path | Notes |
|---|---|
| `docs/SYSTEM_ARCHITECTURE.md` | Component boundaries |
| `docs/DOMAIN_MODEL.md` | Canonical entities |
| `docs/API_CONTRACT.md` | Human API contract |
| `docs/DATA_CONTRACT.md` | Data freshness and snapshot contracts |
| `docs/ARCHITECTURE_DECISIONS.md` | Locked ADRs |
| `docs/INTEGRATION_SEQUENCE.md` | Integration order |
| `docs/ACCEPTANCE_CRITERIA.md` | Public-beta gates |
| `docs/RISK_REGISTER.md` | Known risks |
| `docs/WORKSTREAM_OWNERSHIP.md` | This file |
| `docs/CONDUCTOR_PACKAGE.md` | Consumer index |
| `contracts/**` | Machine-readable schemas, OpenAPI, fixtures, shared types |
| `AGENTS.md` | Root agent rules |
| `.agents/shared-context.md` | Shared product context |
| Confirmed product docs unless proposing an explicit change: `docs/PROJECT_CONTEXT.md`, `docs/PRD.md`, `docs/PRODUCT_PRINCIPLES.md`, `docs/VISION.md` |

## Owned implementation paths

Paths below are expected targets. They may not all exist until the owning workstream creates them. Create only within your ownership.

### Routing (`agent/routing`)

Owns:

- `services/routing/**`
- `docs/ROUTING_ENGINE_SPEC.md`
- routing unit/property/golden tests under `services/routing/**` or `tests/routing/**`
- ranking and explanation builders that emit conductor-shaped `SatisfactionResult` / `Explanation` objects

Must not modify:

- `contracts/**` (propose changes)
- backend HTTP handlers, frontend UI, data ingestion pipelines

### Data (`agent/data`)

Owns:

- `services/data/**`
- `docs/DATA_SPEC.md`
- static GTFS importer, realtime poller, snapshot store adapters
- recorded feed fixtures under `services/data/fixtures/**` or `fixtures/data/**`

Must not modify:

- `contracts/**` schemas that define public snapshot shapes without approval
- routing ranking logic, API handlers, frontend

### Backend (`agent/backend`)

Owns:

- `apps/api/**` or `services/api/**`
- OpenAPI *implementation* wiring that conforms to `contracts/openapi/**`
- routing adapter client, place-search adapter, rate limiting, request validation
- API integration tests under `apps/api/**` or `tests/api/**`

Must not modify:

- shared schema definitions in `contracts/schemas/**` without approval
- frontend presentation components
- GTFS parsing internals owned by data

### Frontend (`agent/frontend`)

Owns:

- `apps/web/**`
- `docs/DESIGN_SYSTEM.md` (if created)
- UI components, accessibility, client analytics mapping, E2E tests for the UI

Must not modify:

- ranking semantics
- `contracts/**` response shapes without approval
- server-side ingestion or routing internals

May use:

- `contracts/fixtures/**` for mocked API responses before live routing exists

### Infrastructure (`agent/infrastructure`)

Owns:

- `infra/**`
- `.github/workflows/**` (or equivalent CI)
- `docs/SLOS.md`, `docs/RUNBOOKS.md` (if created)
- environment templates, observability dashboards-as-code, feature-flag config skeletons

Must not modify:

- product ranking semantics
- API request/response field names in `contracts/**`

May add:

- deploy hooks that call existing health endpoints

### Benchmark / QA (`agent/benchmark-qa`)

Owns:

- `benchmarks/**`
- `docs/TESTING_STRATEGY.md`
- corpus schemas *derived from* conductor contracts
- release-gate scripts and reports

Must not modify:

- production ranking code except via failing tests / PRs owned by routing
- `contracts/**` without approval

## Cross-cutting change protocol

1. Prefer implementing against the current contract.
2. If a contract is wrong or incomplete, open a proposal in the PR description with:
   - impacted workstreams
   - migration plan for fixtures
   - whether the change is additive (preferred) or breaking
3. Conductor (or human maintainer acting as conductor) merges contract changes first.
4. Implementation workstreams rebase onto the updated contracts.

## Fixture contract for parallel UI/API work

Until live routing and live feeds are available:

- Backend and frontend **must** be able to run against `contracts/fixtures/**`.
- Fixture payloads must validate against `contracts/schemas/**`.
- Every fixture must set `dataMode` to one of: `live`, `schedule_only`, `stale`, `synthetic`, `unavailable`.
- UI copy must surface non-`live` modes; never present synthetic fixtures as live navigation.

## Package boundary summary

```text
contracts/          conductor-owned shared schemas + fixtures
apps/web/           frontend
apps/api/           backend application API
services/routing/   routing engine + ranking
services/data/      GTFS / GTFS-RT pipelines
infra/              deploy + observability
benchmarks/         QA corpus + runners
docs/*_SPEC.md      owned by specialist workstreams
docs/*CONTRACT*.md  conductor-owned
```
