# Routing Engine Spec

**Owner:** Routing workstream (`agent/routing`)  
**Status:** Draft for conductor review  
**Date:** 2026-07-30  
**Related:** ADR-0002 (prefer mature GTFS substrate); this doc proposes **ADR-0002a** (engine choice) without editing `ARCHITECTURE_DECISIONS.md`.

## 1. Purpose

Document evidence for the candidate-generation substrate and define how BetterMTA’s **hard selected-line constraint** sits on top of that substrate: candidate families → exact satisfaction accounting → lexicographic ranking → structured explanations → top-3 truncation.

## 2. Product constraint that engines get wrong

BetterMTA requires:

1. Use **every** selected `lineId` when feasible.
2. Otherwise maximize the count of **distinct** selected lines used by transit legs.
3. Within the same satisfaction count, rank by arrival → transfers → walking → realtime confidence → fingerprint.

Mature routers optimize generalized cost, arrival time, and transfers. **Preferred-route penalties bias search; they do not enforce “use all of {A,D,F} when feasible.”** A soft preference can:

- Prefer one selected line and omit others that would still be feasible together.
- Return a faster non-selected itinerary that still “looks good” under Pareto filters.
- Fail to enumerate the combination family that would maximize satisfaction.

Therefore the engine is a **candidate generator**. Hard constraint semantics live in BetterMTA’s orchestration + accounting + ranking layer (`services/routing`).

## 3. Evaluation matrix

| Criterion | OpenTripPlanner 2 | MOTIS | RAPTOR libraries (e.g. planarnetwork/raptor, Cata-Dev/RAPTOR) |
|---|---|---|---|
| GTFS static | Yes (production-proven) | Yes | Yes (library-dependent loader) |
| GTFS-Realtime | Yes — trip updates, alerts; configurable updaters | Yes — `gtfsrt` (and other protocols) in timetable config | Usually none or DIY; not a full RT ops stack |
| Multiple itineraries | Yes — multi-criteria range-RAPTOR; `numItineraries`, group/similarity filters | Yes — plan API with `maxItineraries` / timetable view | Range / McRAPTOR variants; diversity tooling thinner |
| Route preference / ban | Preferred / unpreferred / banned routes & agencies; `otherThanPreferredRoutesPenalty`, `unpreferredCost` | Mode filters; weaker first-class “preferred set of subway lines” story for NYC line IDs | Implement yourself (filter trips / dominance) |
| Transfer handling | Street + transit transfers; transfer priority / costs | Timetable + optional OSM footpaths | Transfers from GTFS or synthetic footpaths |
| Integration cost | Java service; graph build; HTTP/GraphQL client from Node API | Native binary + HTTP; lighter ops than OTP for some teams | Lowest dependency weight; highest productization cost (RT, alerts, street access, ops) |
| Hard selected-line fit | Soft bias only — **insufficient alone** | Soft / mode-level — **insufficient alone** | Custom criteria possible but reinventing OTP/MOTIS |

### Sources

- OTP2 vs OTP1 feature comparison (multi-criteria range-RAPTOR, GTFS-RT): https://docs.opentripplanner.org/en/latest/Version-Comparison/
- OTP2 route request preferences / penalties / itinerary filters: https://docs.opentripplanner.org/en/latest/RouteRequest/
- OTP2 GTFS-RT updater config: https://docs.opentripplanner.org/en/latest/GTFS-RT-Config/
- MOTIS setup (GTFS + GTFS-RT datasets): https://github.com/motis-project/motis/blob/master/docs/setup.md
- MOTIS OpenAPI (`maxItineraries`, `realtimeMode`, plan API): https://github.com/motis-project/motis/blob/master/openapi.yaml
- RAPTOR paper (Delling et al.): https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
- TypeScript RAPTOR (planarnetwork): https://github.com/planarnetwork/raptor
- TypeScript McRAPTOR (Cata-Dev): https://github.com/Cata-Dev/RAPTOR

## 4. ADR-0002a recommendation

**Recommend: OpenTripPlanner 2 as the production candidate-generation substrate, with BetterMTA constraint orchestration outside OTP.**

### Why OTP2

1. Mature GTFS + GTFS-Realtime path suitable for NYC subway public beta.
2. Native multi-itinerary / Pareto-style output, which matches the need for diverse candidates before ranking.
3. Explicit preferred / unpreferred / banned route knobs useful for **preference-biased** family searches (not for hard satisfaction).
4. Lower risk than shipping a custom RAPTOR stack with street access, alerts, and RT matching.
5. Aligns with ADR-0002 (“prefer mature GTFS routing infrastructure”).

### Why not MOTIS as primary (yet)

MOTIS is a credible alternative: strong GTFS/GTFS-RT story and a modern plan API. It is a strong **fallback / bake-off** candidate if OTP ops cost or latency is unacceptable. It does not solve the hard selected-line constraint any better than OTP; the same outer layer is required. Integration evidence for MTA subway specifics is thinner in-repo than OTP’s ecosystem depth.

### Why not a standalone RAPTOR library as primary

Libraries are excellent for algorithm experiments and offline benchmarks, but MVP would still need: GTFS-RT application, alert attachment, access/egress walking, graph versioning, and production ops. That recreates much of OTP/MOTIS. Keep RAPTOR libraries as **benchmark / research** tools, not the beta substrate.

### What this recommendation does *not* claim

- No claim that OTP alone implements selected-line maximization.
- No claim of latency or quality superiority vs Google/Apple/Citymapper.
- No production OTP deployment is implemented in this workstream slice; only the TypeScript constraint/ranking library + fixture provider.

## 5. Hard selected-line constraint layer (architecture)

```text
API (resolved OD + timing + selectedLineIds + RoutingSnapshotHandle)
        │
        ▼
┌───────────────────────────────────────────┐
│ Candidate orchestration (BetterMTA)       │
│  Family A: baseline (no line objective)   │
│  Family B: preference-biased OTP queries  │
│  Family C: targeted combination queries   │
│            (ban non-selected; force       │
│             subsets / ordered covers)     │
└────────────────────┬──────────────────────┘
                     │ raw engine itineraries
                     ▼
┌───────────────────────────────────────────┐
│ Normalize → CandidateItinerary drafts     │
│ (preserve sourceEngineIds, snapshot pin)  │
└────────────────────┬──────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────┐
│ Exact satisfaction accounting             │
│ (DOMAIN_MODEL / ADR-0007 invariants)      │
└────────────────────┬──────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────┐
│ Lexicographic ranking + fingerprint       │
│ Explanation builder from structured facts │
│ Top-3 truncate (baseline + constrained) │
└───────────────────────────────────────────┘
```

### 5.1 Candidate generation families

| Family | `candidateFamily` | Engine usage | Purpose |
|---|---|---|---|
| Baseline | `baseline` | Unbiased OTP plan | Comparison set; also proves a transit path exists |
| Preference-biased | `preference_biased` | Preferred = selected lines; modest `otherThanPreferredRoutesPenalty` | Cheap recall of itineraries that *tend* to use selected lines |
| Targeted combinations | `targeted_combination` | Ban or strongly unprefer non-selected routes; optional ordered / subset queries for k-of-n selected lines | Recover complete and max-partial covers that soft bias misses |
| Constrained (label) | `constrained` | Post-accounting label for ranked constrained pool members | API/fixture vocabulary |

Deduplicate by fingerprint (or leg signature) across families before ranking. Stop when a documented **candidate budget** is exhausted (see outcomes below).

### 5.2 Exact satisfaction accounting (outside engine)

Normative rules (DOMAIN_MODEL):

- Deduplicate `selectedLineIds` before search; **fail closed** if deduped count exceeds 5 (`TooManySelectedLinesError`, ADR-0006).
- A line is satisfied iff ≥1 **transit** leg has `lineId` equal to that selected id.
- Walking legs never satisfy.
- Duplicate rides on the same `lineId` count once.
- Local/express variants sharing the same product `lineId` count once.
- `feasibility`: `complete` \| `partial` \| `none` \| `not_applicable` (0 selected lines).
- When selected lines are present, constrained ranking considers **all candidate families** (including baseline), deduped by fingerprint. The baseline list remains the unbiased time-ranked top-3 from the baseline family only.
- Invalid drafts (negative metrics, empty legs, non-chronological transit) are dropped before enrichment/ranking with counted reject reasons.
- Provider-supplied fingerprints are ignored; fingerprints are always recomputed from content.
- Library-only `perLineRideSeconds` (ride seconds per `lineId`) is computed from transit legs and attached on ranked results — **not** part of API contract shapes.

### 5.3 Ranking (ADR-0007)

Constrained pool:

1. `satisfactionCount` desc  
2. `arrivalTime` asc  
3. `transferCount` asc  
4. `walkingSeconds` asc  
5. `realtimeConfidence` desc (`high` > `medium` > `low` > `none`)  
6. `fingerprint` asc  

Baseline pool: steps 2–6 only. Complete matches always outrank partials.

### 5.4 Outcomes (do not collapse)

| Outcome | When | HTTP mapping (API) |
|---|---|---|
| Success (complete / partial) | ≥1 trustworthy constrained and/or baseline itinerary after ranking | `200`; partials still success |
| `no_transit_path` | No transit path even without selected-line constraints | `404` |
| `insufficient_candidate_coverage` | Candidate/time budget exhausted without trustworthy candidates | `503` |
| `data_unavailable` | Snapshot `dataMode: unavailable` — no itineraries fabricated | `503` / `data_unavailable` |
| Constraint infeasible (true) | Selected set cannot be fully satisfied; **partials still returned when they exist** | `200` with `feasibility: partial` or empty constrained only if no partial exists **and** baseline proves the network is reachable |

Soft degradation (still `ok`): `dataMode: schedule_only` forces `realtimeConfidence: none` and sets `dataDegradation: schedule_only`; `dataMode: stale` caps confidence at `low` and sets `dataDegradation: stale`.

Never infer impossibility from a single failed preference-biased query.

### 5.5 Explanations

Built only from structured facts (`line_used`, `line_omitted`, `transfer`, `walk`, `wait`, `realtime`, `baseline_delta`, `alert`). No LLM prose in MVP.

## 6. Library delivered in this workstream

Path: `services/routing/`

| Module | Role |
|---|---|
| `candidate-provider` | Abstraction over engine/fixture candidate generation |
| `fixture-provider` | Deterministic offline provider; `dataMode: synthetic` |
| `satisfaction` | Exact selected-line accounting + `TooManySelectedLinesError` + `computePerLineRideSeconds` |
| `fingerprint` | Stable content-derived fingerprint (always recomputed) |
| `validate` | Draft validity gate before enrichment |
| `ranking` | ADR-0007 lexicographic sort + top-3 |
| `explanation` | Structured `Explanation` builder |
| `search` | Orchestrates validate → normalize → account → explain → rank → outcomes |

Live OTP adapter is **deferred** (requires data snapshot wiring + infra process). Arrive-by search strategy remains **deferred** (DOMAIN_MODEL unresolved).

## 7. Performance characteristics (measured, offline)

Measured on the ranking pure function only (no OTP), Node 20+, synthetic candidates (`dataMode: synthetic`):

| Operation | N | Observed | Notes |
|---|---|---|---|
| `rankConstrained` + top-3 truncate | 1_000 candidates × 50 iters | **~0.11–0.23 ms avg** (`npm run bench:rank`) | CPU-bound compares; no I/O |
| Single-pass rank in vitest smoke | 1_000 candidates | **~0.4–1.2 ms** wall | Includes enrich overhead in smoke test |

These numbers characterize the **BetterMTA layer**, not OTP query latency. Production p95 < 2.0s (ACCEPTANCE_CRITERIA) must include engine + network and will be re-measured when OTP is wired.

## 8. Limits and risks

1. Soft OTP preferences can miss combination covers → targeted family + budget required.
2. Arrive-by search strategy (reverse vs iterative depart) remains open (DOMAIN_MODEL unresolved #2); propose addendum after OTP wiring.
3. Fixture provider is synthetic — never label as `live` in production.
4. Engine choice should be confirmed by a short MOTIS bake-off on the same MTA GTFS extract before irreversible infra lock-in.

## 9. Next integration step

Backend adapter calls `runRouteSearch` with a real `CandidateProvider` once data exposes `RoutingSnapshotHandle` + static graph for OTP. Until then, FE/BE continue against `contracts/fixtures/**` with `dataMode: synthetic`.
