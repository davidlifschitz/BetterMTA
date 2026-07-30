# System Architecture

**Owner:** Conductor  
**Status:** Locked for MVP / public-beta experiment  
**Audience:** All implementation workstreams

## 1. Purpose

BetterMTA is a production experiment that tests whether NYC subway riders value **selected-line constrained routing**. The architecture prefers the smallest separable system that can answer that question with trustworthy schedule/realtime data, visible freshness, and measurable quality.

## 2. MVP scope lock

### In scope

- Mobile-first web client
- Origin / destination / depart-now|depart-at|arrive-by search
- Subway line multi-select before or after search
- Baseline routes plus up to three constrained alternatives
- Selected-line satisfaction accounting and explanations
- Static GTFS + GTFS-Realtime (trip updates + alerts)
- Explicit live / schedule-only / stale / unavailable labeling
- Versioned HTTP API
- Health, readiness, structured logs, basic analytics events
- Fixture-backed development before live routing is ready

### Out of scope (public beta)

- Accounts / auth
- Native apps
- AI chat
- Social features
- Automatic preference learning beyond a single consent prompt scaffold
- Bus / LIRR / Metro-North / ferry / NJ Transit optimization
- Fare optimization
- Turn-by-turn underground positioning
- Crowding prediction unless an authoritative, defensible source is later approved
- Claims of beating third-party products without benchmark evidence

## 3. Context diagram

```text
Rider (mobile browser)
        │
        ▼
┌───────────────────┐
│  Mobile Web (FE)  │  apps/web
└─────────┬─────────┘
          │ HTTPS JSON
          ▼
┌───────────────────┐
│ Application API   │  apps/api
│ validation, cache │
│ experiment assign │
└───────┬───┬───────┘
        │   │
        │   └──────────────┐
        ▼                  ▼
┌─────────────────┐  ┌──────────────────┐
│ Routing service │  │ Data platform    │
│ candidates,     │  │ static GTFS,     │
│ ranking, explain│  │ GTFS-RT snapshots│
└────────▲────────┘  └────────┬─────────┘
         │                    │
         └──────── snapshots ─┘
```

External systems: MTA static GTFS, MTA GTFS-Realtime feeds, place/geocode provider (TBD), object storage for archived snapshots, Redis-compatible cache, Postgres for feedback/experiments/benchmarks (not required for anonymous search).

## 4. Component boundaries

| Component | Responsibility | Non-responsibility |
|---|---|---|
| Mobile web | Capture trip intent, present ranked itineraries, surface freshness/degraded modes, accessibility | Ranking, GTFS parsing |
| Application API | AuthN-less request validation, request IDs, adapter orchestration, caching, rate limits, typed errors | Graph search internals |
| Routing adapter | Translate API request + snapshots into engine calls; normalize engine output to domain itineraries | HTTP presentation |
| Constrained ranking layer | Selected-line satisfaction, lexicographic ranking, structured explanations | Feed ingestion |
| Candidate generation | Produce diverse feasible itineraries (prefer mature GTFS router) | UI copy |
| Static GTFS importer | Download, validate, version, activate, rollback schedule graph inputs | Ranking |
| GTFS-Realtime importer | Poll, decode, freshness, last-known-good, stale marking | Place search |
| Snapshot cache | Hot feed snapshots and optional hot route responses keyed by snapshot+request | Durable analytics warehouse |
| Analytics | Privacy-safe funnel events, experiment assignment logging | Precise location retention by default |
| Observability | Logs, metrics, traces, alerts, health probes | Product ranking policy |
| Feature flags | Disable realtime, constraints, change explanation density, maintenance mode | Hard-coding flags in UI without API support |

## 5. Request flow (happy path)

1. Client submits `POST /v1/routes/search` with origin, destination, timing, selected line IDs.
2. API validates input, assigns `requestId`, resolves places to internal place/station references.
3. API reads active static dataset version + current realtime snapshot metadata from data platform.
4. API calls routing adapter with resolved places, timing, selected lines, and snapshot handles.
5. Routing generates baseline and constrained candidate families, validates itineraries against the same snapshot, ranks, returns ≤3 constrained + baseline comparison payload.
6. API attaches freshness, warnings, experiment assignment, and returns conductor contract response.
7. Client renders cards; non-live modes are labeled.

## 6. Degraded modes

| Mode | Trigger | User-visible behavior |
|---|---|---|
| `live` | Realtime snapshot within freshness SLA | Normal results + freshness age |
| `schedule_only` | Realtime unavailable or explicitly disabled by flag | Results labeled schedule-only |
| `stale` | Realtime present but older than stale threshold | Results labeled stale; may still use last-known-good |
| `synthetic` | Fixture / mock path only | Must never be exposed unlabeled in production |
| `unavailable` | Static dataset missing or routing cannot run | Typed error / service unavailable UI |

## 7. Data separation invariant

Keep these layers separable at all times:

1. Static GTFS
2. Realtime ingestion
3. Candidate generation
4. Ranking / satisfaction
5. Application API
6. Presentation

No layer may silently rewrite another layer’s contract. See `WORKSTREAM_OWNERSHIP.md`.

## 8. Technology direction (locked preferences, not full vendor lock)

| Concern | Locked preference | Unresolved |
|---|---|---|
| Web client | Next.js App Router mobile web | Exact design-system package |
| API | Versioned HTTP JSON `/v1` | Host framework (Next route handlers vs standalone) — see ADR-0004 |
| Routing substrate | Prefer OpenTripPlanner or other mature GTFS router before custom graph search | Final engine choice — routing workstream must document evidence (ADR-0002 open) |
| Cache | Redis-compatible | Managed vendor |
| Durable store | Postgres for feedback, experiments, benchmarks | Schema details |
| Object storage | Archived feed snapshots | Vendor |
| Deploy | Automated CI + preview + one-action rollback | Platform (ADR-0005 open) |

## 9. Security / privacy baseline

- No account required for search.
- Do not persist precise coordinates by default.
- Separate operational logs from product analytics.
- Rate-limit search and place autocomplete.
- Secrets outside source control.
- Explicit consent before any preference memory (preference learning itself is deferred beyond consent scaffold).

## 10. Related documents

- Domain: `DOMAIN_MODEL.md`
- API: `API_CONTRACT.md` + `contracts/openapi/bettermta-v1.yaml`
- Data: `DATA_CONTRACT.md`
- Decisions: `ARCHITECTURE_DECISIONS.md`
- Ownership: `WORKSTREAM_OWNERSHIP.md`
