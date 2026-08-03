# Wave 3 independent review gate

**Branch:** `agent/p1-address-preferred-lines`  
**Tip at gate close:** `f9e7481`  
**Date:** 2026-07-31  
**Verdict:** **PASS** — all Critical/High findings cleared; Wave 4 may proceed.

## Review outcomes

| Review | Initial | Highs | Remediation | Final |
|---|---|---|---|---|
| A Architecture / ADR | FAIL (H1 Midtown-only topology) | H1 | Citywide hubs + incomplete-seed fail-closed (`6117a00`) | **PASS** |
| B Routing correctness | PASS w/ High residuals | H1 OTP knobs unverified; H2 sequential latency | GraphQL unit tests + concurrent non-baseline OTP (`d58051b`) | **PASS** |
| C Privacy / security | PASS | none | — | **PASS** |
| D Frontend / a11y | PASS w/ High focus-trap | LinePicker Tab trap | Focus trap + test (`e71efc4`) | **PASS** |
| E Ops / rollback | PASS | none | — | **PASS** |

## Non-blocking residuals (Medium/Low) — before flag-on go/no-go

- **A M1:** `ROUTING_ENGINE_SPEC.md` still has some hard-constraint prose  
- **A M2:** empty drafts → `no_transit_path` vs coverage exhaustion  
- **A M3:** `pl_geo_*` resolve is process-local  
- **B M1–M4:** subset lex bias; joint topology; GTFS id binding; budgetExhausted semantics stretch  
- **D M1–M3:** PlaceSuggest tab order; coverage-failure rider copy; (aria-expanded fixed)  
- **E M1–M3:** web Docker `NEXT_PUBLIC_FLAG_ADDRESS_POI` ARG; geocode outage runbook/alert; metrics exporters PLACEHOLDER  

## Constraints carried into Wave 4

- Do **not** merge to `main` from this program alone without product owner ask  
- Preserve rollback to pre-P1 certified release  
- Do **not** broaden tester cohort automatically  
- Address/POI flags remain default **off** until Wave 4 evidence supports enablement  
- Status vocabulary: `READY_FOR_P1_CONTROLLED_ALPHA` or `BLOCKED` — not public/private beta / not cloud-grade  

## Stage C residual disposition — 2026-08-03

| Residual | Disposition | Evidence / remaining gate |
|---|---|---|
| A M1 routing spec hard-constraint prose | **Closed in Stage C candidate** | `docs/ROUTING_ENGINE_SPEC.md` now specifies preferred-line maximization, soft unpreferred costs, and connector availability |
| A M2 empty drafts misclassified | **Closed in Stage C candidate** | Exhausted empty preference searches consult provider coverage before `no_transit_path`; regression in `services/routing/tests/routing.test.ts` |
| A M3 process-local `pl_geo_*` resolve | **Carried to Stage D** | Acceptable only for the current flag-off, single-replica alpha; shared/opaque resolve story required before multi-instance private beta |
| B M1 subset lexical bias | **Closed in Stage C candidate** | Joint topology coverage selects subsets; lexical order is only the final deterministic tie-breaker |
| B M2 individual-line via scoring | **Closed in Stage C candidate** | Via hubs now rank requested-line coverage before OD detour |
| B M3 synthetic inverse GTFS ids | **Closed in Stage C candidate** | Live data catalog supplies both GTFS→line and line→GTFS mappings to the OTP provider |
| B M4 `budgetExhausted` semantics stretch | **Closed in Stage C candidate** | Full planned search no longer sets the flag; candidate/query ceiling tests cover false and true cases |
| D M1 PlaceSuggest option Tab order | **Closed** | Options use `tabIndex=-1`; combobox retains keyboard focus |
| D M2 coverage failure copy | **Closed** | Rider copy removes candidate/search-budget jargon while retaining honest preferred-line guidance |
| E M1 web Docker address flag ARG | **Closed** | Docker/Compose/Fly build inputs explicitly default `NEXT_PUBLIC_FLAG_ADDRESS_POI=false` |
| E M2 geocoder outage runbook/alert | **Closed application-side** | `GeocoderFailureSpike` + `docs/RUNBOOKS.md#geocoder-provider-outage` |
| E M3 metrics exporter placeholder | **Closed application-side; backend carried to Stage D** | Authenticated `/internal/metrics` implemented; scrape backend, rule loading, and pager remain unprovisioned |

This disposition does not authorize address/POI flag-on, a live redeploy, cohort expansion, a `main` merge, or Fly activation. Current status remains `READY_FOR_P1_CONTROLLED_ALPHA`.
