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

Adopt **OpenTripPlanner 2**, pinned to container image **2.9.0**, as the production candidate-generation substrate. Selected-line satisfaction accounting, lexicographic ranking, deterministic tie-breaking, explanations, and top-3 truncation remain in the BetterMTA routing library **outside** OTP. Soft OTP preferences alone are insufficient for preferred-line coverage maximization (see ADR-0023).

### Consequences

Closes the ADR-0002a recommendation. Live OTP wiring is an implementation phase; ranking/property tests stay engine-agnostic. MOTIS remains a documented fallback if OTP ops cost or latency is unacceptable. Preferred-line candidate coverage ownership and fill-the-gaps orchestration are recorded in **ADR-0023**; OTP remains the substrate, not the product ranking authority.

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

**Status:** Superseded by ADR-0022  
**Date:** 2026-07-30  
**Superseded:** 2026-07-31

### Context

API_CONTRACT left the geocoder vendor open. Backend proposed station-index-first vs third-party-first for `/v1/places/search`.

### Decision

Beta place search = **full static-GTFS station / station-complex autocomplete** (station-index-first, accepting the backend place-provider proposal) plus **browser geolocation coordinates**. Arbitrary-address / POI geocoding is deferred.

### Consequences

Historical: no third-party geocoder required for the station-only beta slice. Place IDs stayed contract-stable. Address/POI geocoding and attribution are reopened under **ADR-0022** (P1 acceptance of `docs/proposals/address-preferred-lines-fill-gaps.md`). Station-index authority for subway stations is preserved.

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

---

## ADR-0021 — Self-hosted Cloudflare controlled alpha

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Phase 11 left Fly.io private/public beta **BLOCKED** (ADR-0012 not activated). A small remote dogfood cohort needs a controlled path without claiming cloud-grade or public-beta readiness. Router port forwarding is not acceptable.

### Decision

**Current deployment target** for Phase 12A is a **self-hosted controlled alpha** on the existing macOS computer running the Docker Compose stack:

| Layer | Choice |
|---|---|
| Origin | Existing macOS host + Docker Compose (`data` / `otp` / `api` / `web`) |
| External transport | Cloudflare Tunnel (no router port forwarding) |
| Authentication | Cloudflare Access — deny-by-default, exact email allowlist, email OTP/PIN |

Hard constraints:

- **No router port forwarding** permitted.
- Availability depends on home power, home internet, Docker Desktop, and the host remaining awake — **not** cloud-grade HA.
- This path is **not** public-beta ready and does **not** replace hosted private/public beta (still a separate later phase under ADR-0012).
- Existing correctness, security, privacy, data-honesty, fixture-exclusion, and rollback gates are **not** waived.

Go/no-go vocabulary: status value `READY_FOR_CONTROLLED_ALPHA` is a Phase 12A outcome. It must **not** be marked until remote controlled-alpha gates pass (Access + tunnel + origin evidence). Do not equate it with `READY_FOR_PRIVATE_BETA` or `READY_FOR_PUBLIC_BETA`.

### Consequences

Infra/docs proceed with Tunnel + Access + compose origin; edge proxy and ops runbooks land in later 12A slices. Secrets, tunnel UUIDs, hostnames, and tester emails stay out of the repo. Fly activation remains the path for hosted beta when chosen.

---

## ADR-0022 — Place search: station index + address/POI geocoder abstraction

**Status:** Accepted  
**Date:** 2026-07-31  
**Supersedes:** ADR-0013  
**Authority:** P1 acceptance of `docs/proposals/address-preferred-lines-fill-gaps.md`

### Context

ADR-0013 locked station-index-first place search and deferred arbitrary address/POI geocoding. Controlled-alpha findings showed office-style queries (e.g. `277 Park`) return zero place hits, forcing weak coordinate paths. PRD §5 already lists address/place origins and destinations. P1 reopens address/POI without abandoning station-index authority for subway stations.

### Decision

1. **Station index remains authoritative for subway stations** — full static-GTFS station / station-complex autocomplete continues to own station and station-complex results; station `placeId` / `stationId` identity stays stable.
2. **Address and POI resolution are supported** as first-class place inputs alongside station, current location, and coordinate refs. Results resolve to coordinates + display label suitable for routing; routing may snap to nearby stations internally.
3. **Geocoder provider abstraction** — BetterMTA owns a provider-agnostic places adapter. Vendor choice and wiring are implementation concerns behind that abstraction; contracts prefer additive optional fields (`provider`, `attribution`, `formattedAddress`) without renaming `placeId` (Wave 0B owns contract edits).
4. **Attribution** — vendor-required attribution strings must be available to the UI whenever non-station geocode results are shown; do not ship address/POI results without a documented attribution path.
5. **No default retention of precise query coordinates** — precise geocode query coordinates and reverse-geocode pins are not retained by default in logs, analytics, or durable stores. Redact or coarsen under the existing privacy baseline (see R10). Consent-gated retention remains out of scope until a reviewed transport exists (ADR-0017 family).
6. **Explicit failure behavior** — geocode miss or provider failure yields an honest empty / `unknown_place` (or equivalent contracted) outcome. Never silently substitute an unrelated station.
7. **Feature-flagged alpha rollout** — address/POI geocode is gated behind a feature flag for controlled alpha / beta. Certification status of the current station-index alpha is unchanged until a separate go/no-go. Flag-off preserves station-index + geolocation behavior.

### Consequences

Supersedes ADR-0013’s deferral of address/POI. Station-first ranking of station matches remains. Backend may integrate a concrete geocoder only after Wave 0B contract lock and privacy/attribution checklist. Secrets and vendor hostnames stay out of the repo. Deferred epics D1–D6 (maps parity, multi-modal places, etc.) remain deferred.

---

## ADR-0023 — Preferred lines, fill-the-gaps, and candidate coverage ownership

**Status:** Accepted  
**Date:** 2026-07-31  
**Related:** ADR-0007 (ranking order), ADR-0011 (OTP substrate)  
**Authority:** P1 acceptance of `docs/proposals/address-preferred-lines-fill-gaps.md`

### Context

Product docs previously described selected lines as hard “required” constraints when feasible. Soft OTP preferences plus natural top-N itineraries produced silent **0-of-N** outcomes when preferred lines were absent from OTP’s unconstrained candidate set (controlled-alpha: Midtown office → Penn with 2/7/GS). The intended experience is preferred-line maximization with system-filled connectors, not forcing riders to enumerate every transfer piece.

### Decision

1. **Selected lines = preferred lines** — rider-facing and product language treats the line picker as preferences to maximize, not a hard require-all-or-fail filter when connectors are needed.
2. **Maximize preference coverage** — when feasible, use every preferred line; otherwise rank by maximum feasible distinct preferred-line coverage (product invariant; ADR-0007).
3. **Unselected connector lines are permitted** — walks, transfers, station access, and **unselected** subway services may be inserted to complete a practical trip (“fill the gaps”). Riders need not toggle every connector.
4. **Ranking precedence** — complete preference match outranks any partial; higher coverage outranks lower coverage before convenience tie-breakers (arrival time, transfers, walking, realtime confidence, stable fingerprint per ADR-0007).
5. **BetterMTA owns candidate coverage; OTP remains substrate** — OpenTripPlanner 2 stays the candidate-generation engine (ADR-0011). Soft OTP route preferences alone are insufficient. BetterMTA routing orchestration must produce preference-covering candidates when topologically sensible (e.g. multi-query families, via/seed hints). Satisfaction accounting, lexicographic ranking, explanations, and top-3 truncation remain outside OTP.
6. **Exhausted budget → `insufficient_candidate_coverage`** — when the candidate budget is exhausted without producing feasible preference-covering candidates that topology would allow, surface an explicit contracted failure/degraded signal (`insufficient_candidate_coverage`), not a silent 0-of-N that reads as “the subway ignores you.”
7. **Omissions must be explained** — partial matches state which preferred lines are missing; never present a generic dead-end when a practical partial exists.
8. **Rider-facing S for internal GS** — the 42 St Shuttle keeps internal `lineId` `GS` (GTFS); rider-facing UI should label it **S**. Presentation-only; no runtime/line-id change in this ADR.

### Consequences

Amends product wording in `PROJECT_CONTEXT.md`, `PRD.md`, `PRODUCT_PRINCIPLES.md`, and `TECHNICAL_DESIGN.md`. Does not reopen D1–D6. Does not change certified-alpha runtime until implementation waves land behind flags. Wave 0B locks any contract error/code additions; later waves implement orchestration and FE copy.
