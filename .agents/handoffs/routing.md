# Routing Workstream Handoff — Wave 1B Preferred-line candidate orchestration

**Branch:** `agent/p1-wave1-routing`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-p1-wave1-routing`  
**Lock tip base:** `b9139fb`  
**Tip SHA:** `af7ccf3d7fa61838dedd10c9b4db44345bcb0a74` (feature commit `03fc8c5`)  
**Date:** 2026-07-31  
**Contract version consumed:** `2026-07-31` (read-only; `contracts/**` not edited)  
**Remote:** pushed to `origin/agent/p1-wave1-routing` (no merge to main; no alpha redeploy)

---

## 1. What was implemented

**Implemented (ADR-0023)**

- BetterMTA-owned multi-family candidate orchestration in `@bettermta/routing`:
  - Unconstrained OTP baseline
  - Preference-biased OTP queries (`unpreferred` soft cost; connectors still allowed)
  - Via-station targeted queries from seeded preferred-line topology hubs
  - Preferred-subset targeted query (k-of-n) under budget
- Strict budgets: `MAX_OTP_QUERIES=6`, `DEFAULT_CANDIDATE_BUDGET=64`, per-family itinerary caps
- Deterministic fingerprint dedupe across families
- Privacy-safe `candidateCoverage` on `runRouteSearch` ok / insufficient outcomes
- Honest `insufficient_candidate_coverage` when budget exhausted without preference-covering candidates **and** topology is sensible (no silent 0-of-N)
- Soft-skip non-baseline OTP family failures (never infer impossibility from one bias miss); timeouts still hard-fail
- `connector_filled` explanation facts for unselected connectors
- Midtown-ish → Penn fixture regression (`midtown_penn_preference`) with PlaceRefs / public hubs only
- Minimal API binding: pass through `candidateCoverage` on success; include coverage fields on 503 details

**Not invented:** product ranking order unchanged (complete > partial > arrival…); OTP remains substrate; no path fabrication.

---

## 2. Files changed

- `services/routing/src/orchestration/*` (budgets, topology, query-plan, coverage, dedupe)
- `services/routing/src/otp-provider/{provider,query,types}.ts`
- `services/routing/src/{search,explanation,fixture-provider,contract-types,types,index}.ts`
- `services/routing/tests/orchestration.test.ts` (+ otp-provider / routing suites)
- `docs/ROUTING_ENGINE_SPEC.md`
- `apps/api/src/adapters/live/{LiveRoutingAdapter,routingBinding}.ts`, `apps/api/src/types.ts` (wiring only)
- `.agents/handoffs/routing.md` (this file)

Not modified: `contracts/**`, frontend, geocoder/places, acceptance harness ownership.

---

## 3. Tests

```bash
cd services/routing && npm test && npm run typecheck && npm run build
```

Results: **70 passed**, 1 skipped (live OTP env-gated).

Coverage includes unit/property/perf for query plan, topology, dedupe, coverage exhaustion, Midtown→Penn preference regression, existing ranking/OTP suites.

---

## 4. Assumptions

- OTP 2.9 GraphQL accepts `unpreferred.routes` (comma-separated) + `unpreferredCost`, and `via: [{ visit: { coordinate: { lat, lon }, minimumWaitTime } }]`.
- Default GTFS route ids are `MTASBWY:{lineId}` unless `lineIdToGtfsRouteIds` is injected by data/API binding.
- Seeded transfer hubs are sufficient for Midtown/core sensibility + via hints; full GTFS topology injection remains optional.
- Running the full planned query set for preferred searches marks `budgetExhausted` so 0-of-N under sensible topology can surface `insufficient_candidate_coverage`.

---

## 5. Gaps / risks

| Gap / risk | Notes |
|---|---|
| Live OTP via/unpreferred shape | Not validated against a running OTP in this wave (env-gated test remains); GraphQL field names may need a small adapter tweak |
| Seeded topology incompleteness | Outer-borough / SI / rare transfers may under-hint vias; injectable `PreferredLineTopology` is the extension point |
| Query amplification | Up to 6 OTP calls increases p95 latency vs single baseline — budgets are strict but SLOs need re-measure |
| API contract version constants | API `CONTRACT_VERSION` may still say `2026-07-30` in places; Wave 1A/conductor may bump — routing library mirror is `2026-07-31` |
| Acceptance harness (1E) | Not owned here; should add Midtown→Penn corpus case consuming this library behavior |

---

## 6. Push / merge policy

- Push `agent/p1-wave1-routing` only.
- **No merge to main. No alpha redeploy.**
