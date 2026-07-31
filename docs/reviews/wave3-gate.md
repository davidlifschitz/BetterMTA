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
