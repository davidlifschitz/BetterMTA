# Integration Sequence

**Owner:** Conductor  
**Status:** Locked process for parallel → integrate

## Phase 0 — Conductor lock (this package)

1. Merge `agent/conductor` into `main` after human review.
2. Do **not** start implementation agents against divergent contract forks.
3. Implementation workstreams consume:
   - `docs/SYSTEM_ARCHITECTURE.md`
   - `docs/DOMAIN_MODEL.md`
   - `docs/API_CONTRACT.md`
   - `docs/DATA_CONTRACT.md`
   - `docs/ARCHITECTURE_DECISIONS.md`
   - `docs/WORKSTREAM_OWNERSHIP.md`
   - `docs/ACCEPTANCE_CRITERIA.md`
   - `docs/RISK_REGISTER.md`
   - `contracts/**`

## Phase 1 — Parallel implementation (separate worktrees)

Run concurrently after Phase 0 merge:

| Workstream | Entry criteria | Exit criteria |
|---|---|---|
| Routing | Contracts merged | Engine choice ADR addendum + ranking library + tests against fixtures/golden stubs |
| Data | Contracts merged | Importer + snapshot API + recorded fixtures + freshness metrics |
| Backend | Contracts merged | `/v1` endpoints conforming to OpenAPI; fixture mode works |
| Frontend | Contracts merged | Core mobile flow against fixture API; a11y smoke |
| Infrastructure | Contracts merged | CI, preview, health checks, log/metric skeletons, rollback doc |
| Benchmark/QA | Contracts merged | Corpus schema + seed cases + gate definitions |

**Hard rule:** One Cursor chat / agent per worktree. No shared checkout edits.

## Phase 2 — Pairwise contract integration

Order of wiring:

1. **Data → Routing**  
   Routing consumes static version + realtime snapshot handles. Validate degraded modes.

2. **Routing → Backend**  
   Backend adapter calls routing; replace fixture itineraries behind a flag.

3. **Backend → Frontend**  
   Point web app at real API in preview; keep fixture fallback for storybook/local.

4. **Infrastructure wraps all**  
   Enable probes on `/health/*` and `/v1/status`; wire alerts.

5. **QA gates on preview**  
   Run benchmark runner + E2E + a11y against preview.

## Phase 3 — Integration / launch workstream

Follow `.agents/integration-launch.md` only after pairwise green:

1. End-to-end subway trip on live (or permitted degraded) data
2. Labeling audit for freshness
3. Release gates from `ACCEPTANCE_CRITERIA.md`
4. Public-beta limitations page
5. Go/no-go review

## Contract tests (minimum)

Conductor provides schemas + fixtures. Each workstream must add tests that fail on contract drift:

| Test | Owner |
|---|---|
| Fixture JSON validates against JSON Schema | Conductor script + CI (infra wires) |
| OpenAPI path set matches `API_CONTRACT.md` | Backend |
| Ranking property: complete > partial | Routing + QA |
| Response always includes `dataMode` | Backend + QA |
| UI never claims synthetic/stale as live | Frontend + QA |

## Merge policy

1. Contract changes merge before dependent implementation.
2. Feature branches rebase onto updated `main`.
3. Do not long-lived-fork `contracts/**`.

## Rollback sequence

1. Feature-flag routing to fixture/safe mode if needed (never unlabeled synthetic in public).
2. Roll back deploy via infra one-action rollback.
3. If static dataset bad: data rollback to previous `staticDatasetVersion`.
4. Announce degraded mode via `/v1/status`.
