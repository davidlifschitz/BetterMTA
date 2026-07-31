# Wave 3 Review A — Architecture & ADR compliance

**Reviewer:** Independent (did not implement Wave 1/2)  
**Branch tip:** `08f8b84` (`origin/agent/p1-address-preferred-lines`)  
**Base lock:** `b9139fb`  
**Date:** 2026-07-31  
**Scope:** ADR-0022/0023 match, D1–D6 non-reopen, OTP substrate + BetterMTA coverage ownership, contracts↔runtime, connector/preferred-line semantics  
**Verdict:** **FAIL**

---

## Verdict rationale

P1 architecture is directionally correct: OTP remains the candidate substrate, BetterMTA owns multi-family orchestration / satisfaction / ranking, places use a flagged geocoder abstraction with station-first merge, connectors are soft-bias (not hard-ban), and contracts carry `candidateCoverage` + `insufficient_candidate_coverage` + `connector_filled`. D1–D6 are not reopened in code.

However, ADR-0023 §6’s anti–silent-0-of-N guard is gated on a Midtown-heavy seeded topology oracle. Large feasible corridors (Queens, Bronx, outer Brooklyn, Astoria) evaluate as not topologically sensible, so budget exhaustion can still return a success with 0 preferred-line satisfaction — the failure mode P1 was authorized to close. That is an architecture compliance miss for Review A.

---

## Findings

### HIGH

**H1 — Topology oracle too narrow; silent 0-of-N guard disabled outside Midtown seed set**

| Field | Value |
|---|---|
| SEVERITY | high |
| FILE | `services/routing/src/orchestration/topology.ts`, `services/routing/src/orchestration/coverage.ts`, `services/routing/src/otp-provider/provider.ts` |
| LOCATION | `SEEDED_TRANSFER_HUBS` (8 hubs); `isTopologicallySensible`; `assessCandidateCoverage.failInsufficientCoverage` |
| REQUIREMENT | ADR-0023 §5–§6 — BetterMTA owns candidate coverage; exhausted budget without preference-covering candidates when topology allows → `insufficient_candidate_coverage`, not silent 0-of-N |
| FINDING | Sensibility is true only when a preferred line has a seeded hub within ~3.2 km of OD/corridor. Seed set is Midtown/core only. Spot-checks: Jackson Hts→Forest Hills (E+F), Bronx 2+5, Astoria N+W, Coney Island F+Q all return **not sensible** → `failInsufficientCoverage` stays false even after full query-plan “budget exhausted.” Preference-biased OTP queries still run, but the contracted fail-closed signal does not. |
| EVIDENCE | `isTopologicallySensible` early-returns false when no seeded hub matches; `failInsufficientCoverage` requires `topologicallySensible === true`. Orchestration tests cover Midtown→Penn recovery, not outer-borough sensibility. |
| RECOMMENDED FIX | Expand topology to GTFS-derived line↔station index (or a much denser public hub set) for sensibility + via selection; treat “unknown topology” as sensible-when-preferred-nonempty (fail closed) rather than not-sensible (fail open); add QA cases for Queens/Bronx/Astoria corridors asserting no silent 0-of-N when covering candidates are absent after budget exhaustion. |

---

### MEDIUM

**M1 — Routing engine spec still documents hard constraints / hard bans (contradicts ADR-0023 + runtime)**

| Field | Value |
|---|---|
| SEVERITY | medium |
| FILE | `docs/ROUTING_ENGINE_SPEC.md` |
| LOCATION | §1 (“hard selected-line constraint”); §5 Family C (“ban non-selected; force subsets”) |
| REQUIREMENT | ADR-0023 — preferred lines + unselected connectors permitted; soft OTP bias only |
| FINDING | Spec prose still describes hard constraint semantics and Family C hard bans. Runtime correctly uses `unpreferredCost` soft bias (`DEFAULT_UNPREFERRED_COST` / `STRONG_UNPREFERRED_COST`) and explicitly keeps connectors available (`unpreferredGtfsRouteIds` comment). Doc/runtime fork risks a later agent reintroducing bans that break fill-the-gaps. |
| EVIDENCE | Spec lines ~10, ~87–89 vs `services/routing/src/orchestration/budgets.ts` and `query-plan.ts`. Spec §227 already mentions ADR-0023 multi-family soft orchestration — inconsistent within the same doc. |
| RECOMMENDED FIX | Amend §1/§5 to preferred-line maximization + soft unpreferred/via/subset families; reserve hard `banned.routes` as out of scope for connectors. |

**M2 — Empty candidate set never maps to `insufficient_candidate_coverage`**

| Field | Value |
|---|---|
| SEVERITY | medium |
| FILE | `services/routing/src/orchestration/coverage.ts`, `services/routing/src/search.ts` |
| LOCATION | `failInsufficientCoverage` requires `candidateCount > 0`; empty drafts → `no_transit_path` |
| REQUIREMENT | ADR-0023 §6 — exhausted budget without trustworthy preference-covering candidates |
| FINDING | If all OTP family queries return zero drafts (or all invalid) while preferences + sensible topology apply, search returns `no_transit_path` rather than coverage exhaustion. Distinct product signal, but can mislabel a coverage-budget failure as “no path.” |
| EVIDENCE | `assessCandidateCoverage` lines requiring `candidateCount > 0`; `runRouteSearch` early `drafts.length === 0` → `no_transit_path`. |
| RECOMMENDED FIX | When `preferredLineIds.length > 0`, plan completed / budgetExhausted, and topology sensible, map empty/non-covering outcomes to `insufficient_candidate_coverage` (keep true `no_transit_path` for baseline-empty with no preferences). |

**M3 — Geocode `pl_geo_*` resolve is process-local memory only**

| Field | Value |
|---|---|
| SEVERITY | medium |
| FILE | `apps/api/src/adapters/live/LiveDataAdapter.ts`, `apps/api/src/adapters/places/resolveCache.ts`, `docs/PLACE_PROVIDER.md` |
| LOCATION | `resolvePlace` for `pl_geo_*` → in-process resolve cache only |
| REQUIREMENT | ADR-0022 — address/POI as first-class PlaceRefs suitable for routing; honest `unknown_place` on miss (no station substitution) |
| FINDING | Resolve path is correct (no station substitution) and documented, but PlaceRefs are not durable across process restart / multi-instance. Fine for single-host controlled alpha; fragile if flag-on traffic spans restarts or replicas before a shared resolve store exists. |
| EVIDENCE | `LiveDataAdapter.resolvePlace` returns cache-only for `pl_geo_*`; PLACE_PROVIDER.md states in-process TTL cache. |
| RECOMMENDED FIX | Accept for alpha with runbook note; before multi-replica / hosted beta, add shared short-TTL resolve or embed coarsened coords in a signed/opaque place token (privacy-reviewed). |

---

### LOW

**L1 — Contract `CandidateFamily` includes unused `constrained`**

| Field | Value |
|---|---|
| SEVERITY | low |
| FILE | `contracts/schemas/candidate-coverage.schema.json`, `services/routing/src/orchestration/query-plan.ts` |
| LOCATION | enum `baseline \| constrained \| preference_biased \| targeted_combination` |
| REQUIREMENT | Contracts coherent with runtime |
| FINDING | Orchestration emits `baseline`, `preference_biased`, `targeted_combination` only. `constrained` is never produced. Harmless reserved value; slightly confusing. |
| RECOMMENDED FIX | Document as reserved, or drop from enum in a later contract wave if unused. |

**L2 — Rider-facing explanation summaries still say “selected lines”**

| Field | Value |
|---|---|
| SEVERITY | low |
| FILE | `services/routing/src/explanation.ts` |
| LOCATION | `summaryFromSatisfaction` |
| REQUIREMENT | ADR-0023 §1 — selected = preferred (language) |
| FINDING | FE preference copy uses “preferred lines”; library summaries still say “selected lines.” Semantics OK; copy inconsistent. |
| RECOMMENDED FIX | Align summary strings with preferred-line product language. |

---

## Check matrix

| Check | Result |
|---|---|
| ADR-0022 places (station authority, geocoder abstraction, attribution, flag, no silent station sub, privacy-safe logs) | **Pass** (see M3 for resolve durability) |
| ADR-0023 preferred-line maximize + connectors + ranking precedence | **Pass** (satisfaction/ranking/connectors) |
| ADR-0023 BetterMTA owns coverage; OTP substrate | **Pass** structurally (`createOtpCandidateProvider` + orchestration) |
| ADR-0023 exhausted → `insufficient_candidate_coverage` | **Fail citywide** (H1); Midtown path covered by tests |
| D1–D6 not reopened | **Pass** — no bus/NJ/maps/accounts/Postgres/feedback-transport/competitor claims; arrive-by still API-rejected + live UI off (`shouldOfferArriveBy` fixture-only) |
| Contracts ↔ runtime | **Pass** with L1; schemas/`2026-07-31` include place additives + `candidateCoverage` + error code; API/Ajv/OpenAPI aligned |
| Connector / preferred semantics | **Pass** — soft unpreferred only; connectors excluded from satisfaction; `connector_filled` facts; GS remains internal id |

---

## Validation not run

This review is architecture/ADR static analysis only. Not re-run: unit/integration/contract/benchmark/live OTP stacks. Midtown fixture orchestration tests were read, not executed.

---

## Status (workstream review format)

`NOT CLEAN — 6 findings` (1 high, 3 medium, 2 low)

**Review A verdict: FAIL**
