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

**Status:** Accepted direction / engine choice open  
**Date:** 2026-07-30

### Context

Custom graph search is tempting for selected-line masks, but costly to harden.

### Decision

Routing workstream must evaluate OpenTripPlanner (or another mature GTFS router) before proposing a custom substrate. Differentiated BetterMTA logic lives in candidate orchestration, satisfaction accounting, ranking, explanation, and benchmarks.

### Consequences

Routing delivers an evidence-backed engine choice ADR addendum (`ADR-0002a`) before large custom search investment.

**Unresolved:** Final engine selection.

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

**Status:** Open  
**Date:** 2026-07-30

### Context

Need preview deploys, rollback, and secrets management.

### Decision

Infrastructure proposes platform (e.g. Vercel + separate workers, Fly, Render, etc.) with cost and rollback evidence. Must support the locked health endpoints and CI gates.

### Consequences

Parallel FE/BE can proceed on local/fixture mode without waiting.

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

### Consequences:

Prevents fake confidence indicators.
