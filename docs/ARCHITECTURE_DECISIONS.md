# Architecture Decision Records

**Owner:** Conductor  
**Status:** Active  
**How to add:** Append ADR-XXXX; do not silently rewrite accepted decisions. Supersede with a new ADR when needed.

---

## ADR-0001 — Public beta is a narrow production experiment

**Status:** Accepted  
**Date:** 2026-07-30

### Context

BetterMTA could expand into multi-modal parity, accounts, and native apps immediately.

### Decision

Lock MVP to subway-only selected-line routing on mobile web with no accounts, no AI chat, and no unsupported crowding/prediction systems.

### Consequences

Faster parallel implementation; clearer acceptance criteria; deferred features must not block public beta.

---

## ADR-0002 — Prefer mature GTFS routing substrate

**Status:** Accepted direction / engine choice closed by ADR-0011  
**Date:** 2026-07-30

### Context

Custom graph search is tempting for selected-line masks, but costly to harden.

### Decision

Routing workstream must evaluate OpenTripPlanner (or another mature GTFS router) before proposing a custom substrate. Differentiated BetterMTA logic lives in candidate orchestration, satisfaction accounting, ranking, explanation, and benchmarks.

### Consequences

Routing delivered evidence-backed engine choice in `ROUTING_ENGINE_SPEC.md` (ADR-0002a recommendation). Final selection recorded in **ADR-0011**.

---

## ADR-0003 — Shared contracts are conductor-owned and implementation-neutral

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Parallel agents risk conflicting types and API shapes.

### Decision

Canonical docs in `docs/*CONTRACT*`, `DOMAIN_MODEL`, and machine-readable artifacts in `contracts/**` are conductor-owned. Other workstreams consume and propose changes; they do not silently fork shapes.

### Consequences

Slight coordination overhead; fewer merge conflicts on shared types.

---

## ADR-0004 — Versioned HTTP API under `/v1` with locked endpoint set

**Status:** Accepted  
**Date:** 2026-07-30

### Context

`TECHNICAL_DESIGN.md` sketched `/api/v1/routes`. Specialist prompts require `/v1/routes/search` and health endpoints.

### Decision

Lock:

- `POST /v1/routes/search`
- `GET /v1/lines`
- `GET /v1/places/search`
- `GET /v1/status`
- `GET /health/live`
- `GET /health/ready`

`TECHNICAL_DESIGN.md` §6 paths are superseded by `API_CONTRACT.md`. Hosting may put the API behind a reverse proxy or Next handlers, but public paths remain as locked.

### Consequences

Backend and frontend can stub against fixtures immediately.

---

## ADR-0005 — Deployment platform

**Status:** Closed by ADR-0012  
**Date:** 2026-07-30

### Context

Need preview deploys, rollback, and secrets management.

### Decision

Infrastructure proposed platform options with cost and rollback evidence. Must support the locked health endpoints and CI gates.

### Consequences

Platform selection recorded in **ADR-0012** (Fly.io). Parallel FE/BE proceeded on local/fixture mode while the proposal was open.

---

## ADR-0006 — Maximum selected lines for beta is 5

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Large selected sets explode candidate combinations.

### Decision

API rejects >5 selected line IDs. Ranking still maximizes distinct satisfied lines within that set.

### Consequences

Simpler bitmask / candidate budgets; documented UX limit.

---

## ADR-0007 — Ranking lexicographic order

**Status:** Accepted  
**Date:** 2026-07-30

### Decision

1. Maximize distinct selected lines used  
2. Minimize expected arrival time  
3. Minimize transfers  
4. Minimize walking  
5. Prefer higher realtime confidence  
6. Stable fingerprint ascending  

Complete satisfaction outranks any faster partial.

### Consequences

Property tests can assert ordering without depending on a specific engine.

---

## ADR-0008 — Fixture-first parallel development

**Status:** Accepted  
**Date:** 2026-07-30

### Decision

`contracts/fixtures/**` are the temporary source of truth for FE/BE integration until routing+data are live. All synthetic responses set `dataMode: synthetic`.

### Consequences

UI and API progress without blocking on OTP/GTFS readiness.

---

## ADR-0009 — No silent overturning of confirmed product decisions

**Status:** Accepted  
**Date:** 2026-07-30

### Decision

Confirmed decisions in `PROJECT_CONTEXT.md` / PRD remain binding. Conflicts require an explicit proposal and conductor/human approval.

### Consequences

Agents must mark unresolved items rather than invent product changes.

---

## ADR-0010 — Reliability and crowding are optional display fields

**Status:** Accepted  
**Date:** 2026-07-30

### Decision

API may omit reliability/crowding. UI shows them only when `displayEligible` (or equivalent) is true and data is defensible. Crowding prediction is out of MVP scope.

### Consequences

Prevents fake confidence indicators.

---

## ADR-0011 — OpenTripPlanner 2 as candidate-generation substrate

**Status:** Accepted  
**Date:** 2026-07-30

### Context

ADR-0002 required an evidence-backed engine choice before large custom search investment. `docs/ROUTING_ENGINE_SPEC.md` recommended OTP2 (ADR-0002a) with BetterMTA constraint logic outside the engine.

### Decision

Adopt **OpenTripPlanner 2**, pinned to container image **2.9.0**, as the production candidate-generation substrate. Selected-line satisfaction accounting, lexicographic ranking, deterministic tie-breaking, explanations, and top-3 truncation remain in the BetterMTA routing library **outside** OTP. Soft OTP preferences alone are insufficient for hard selected-line maximization.

### Consequences

Closes the ADR-0002a recommendation. Live OTP wiring is an implementation phase; ranking/property tests stay engine-agnostic. MOTIS remains a documented fallback if OTP ops cost or latency is unacceptable.

---

## ADR-0012 — Fly.io as beta deployment platform

**Status:** Accepted  
**Date:** 2026-07-30

### Context

ADR-0005 left the deploy vendor open. Infrastructure proposed Fly.io with api+web preview scope and deferred Postgres (see ADR-0016).

### Decision

Adopt **Fly.io** as the public-beta deployment platform. Accept api+web PR preview apps; keep the data poller on shared staging feeds. Do not provision Postgres in the initial deployment (ADR-0016).

### Consequences

Closes ADR-0005. Infra owns `infra/fly/*.toml` ready-to-activate templates; secrets stay in `fly secrets`; one-action rollback via prior release/image.

---

## ADR-0013 — Beta place search is station-index-first

**Status:** Accepted  
**Date:** 2026-07-30

### Context

API_CONTRACT left the geocoder vendor open. Backend proposed station-index-first vs third-party-first for `/v1/places/search`.

### Decision

Beta place search = **full static-GTFS station / station-complex autocomplete** (station-index-first, accepting the backend place-provider proposal) plus **browser geolocation coordinates**. Arbitrary-address / POI geocoding is deferred.

### Consequences

No third-party geocoder required for public beta. Place IDs stay contract-stable; attribution UI for a future vendor is deferred with address/POI search.

---

## ADR-0014 — Arrive-by search deferred for beta

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Request schema includes `timing.type=arrive_by`, but reverse/iterative arrive-by strategy was unresolved and is not required for a narrow beta.

### Decision

Arrive-by is deferred for beta. `POST /v1/routes/search` **rejects** `timing.type=arrive_by` with the contracted `invalid_request` error and a clear message. The web UI must **not** offer arrive-by in live mode. The request schema **keeps** `arrive_by` (contract unchanged) — rejection is a documented beta limitation.

### Consequences

No schema break; FE must hide arrive-by in live mode; backend returns typed 4xx rather than silently treating arrive-by as depart-now.

---

## ADR-0015 — Maps, crowding, accounts, and profiles deferred

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Public beta is a narrow production experiment (ADR-0001). Maps, crowding indicators, accounts, and persistent profiles expand scope without unblocking selected-line routing.

### Decision

Defer for beta: interactive maps, crowding indicators, user accounts, and persistent user profiles.

### Consequences

Reinforces ADR-0001 / ADR-0010. Reliability/crowding fields remain optional and display-gated when data is defensible later.

---

## ADR-0016 — Postgres excluded from initial deployment

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Anonymous selected-line search does not require durable storage. Infrastructure cost and ops drop if Postgres is deferred.

### Decision

Exclude Postgres from the initial Fly.io deployment. Introduce Postgres only when an approved feature (e.g. privacy-reviewed feedback transport) requires it.

### Consequences

Lower beta cost; feedback and related writes stay off until ADR-0017 transport exists. Infra must not block search readiness on `DATABASE_URL`.

---

## ADR-0017 — Anonymous feedback disabled until privacy-reviewed transport

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Anonymous feedback can leak location/route context without a reviewed retention and transport path. Console stubs must not ship as production behavior.

### Decision

Anonymous feedback is **DISABLED** in production until a privacy-reviewed transport exists: feedback feature flag defaults **off** in production; web UI must **not** render the feedback control in live mode; no console-stub submission in production builds.

### Consequences

No Postgres requirement from feedback for launch. Enabling feedback later requires an explicit privacy review and flag flip, not a silent UI ship.

---

## ADR-0018 — No fixture or synthetic data in live builds

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Fixture-first development (ADR-0008) must not leak into production deployments or live web bundles.

### Decision

No fixture or synthetic data in live builds or deployments: production API startup **MUST fail** (process exit nonzero) if fixture mode is configured; live web builds must contain **no** fixture payloads; only the backend's explicit non-live `dataMode` may drive degraded labeling in production.

### Consequences

Hard fail-closed guard on API boot; FE build pipelines must strip or exclude fixture imports from production artifacts.

---

## ADR-0019 — Realtime freshness thresholds and maintenance_mode binding

**Status:** Accepted  
**Date:** 2026-07-30

### Context

`DATA_CONTRACT` defines freshness thresholds and honest labeling. Infra needed a clear deploy-gate behavior for planned maintenance.

### Decision

Realtime freshness thresholds and honest labeling per `DATA_CONTRACT` remain binding for live data. The `maintenance_mode` flag makes `/health/ready` **fail** (accepted infrastructure open question).

### Consequences

Deploy gates and load balancers treat maintenance as not-ready; clients can still rely on `/health/live` for process liveness where applicable.

---

## ADR-0020 — SI/ferry-adjacent QA corpus membership deferred

**Status:** Accepted  
**Date:** 2026-07-30

### Context

QA noted Staten Island Railway / ferry-adjacent cases expand the Must-set corpus beyond the subway-only public-beta promise.

### Decision

SI/ferry-adjacent QA corpus membership is **deferred** out of the public-beta Must set (accepted QA note). Coverage may remain as optional/synthetic cases but does not gate beta launch.

### Consequences

Narrower Must-set gates; SIR/ferry scenarios stay informative rather than release-blocking until product scope expands.
