# P1 Acceptance Matrix (Wave 1E)

**Owner:** Benchmark / QA  
**Branch:** `agent/p1-wave1-qa`  
**Scope:** Address/POI + preferred-line fill-gaps acceptance & adversarial cases  
**Does not:** implement product features, edit locked contracts, merge to main, or redeploy

## How to run the P1 suite

```bash
# Install runner once
npm --prefix benchmarks/runner install

# Schema-validate entire corpus (includes P1 cases)
npm --prefix benchmarks/runner run validate-cases

# Fixture corpus (P1 ready cases execute; pending are soft)
npm --prefix benchmarks/runner run run-benchmarks

# P1 ready subset gate (hard cases only — no soft/pending)
npm --prefix benchmarks/runner run gate-p1

# Optional: full self-test + legacy release subset
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate

# API harness (failed geocode / timeout / insufficient_candidate_coverage / privacy)
npm --prefix apps/api test -- p1Acceptance.harness.test.ts

# Web: GS→S presentation (SKIP until Wave 1 frontend maps label)
# + analytics privacy + fixture-leak script ownership
npm --prefix apps/web test -- LineBadge.gs-as-s.test.tsx
npm --prefix apps/web test -- analytics.test.ts
# After a live production web build:
# NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://example.invalid \
#   npm --prefix apps/web run build && npm --prefix apps/web run verify:no-fixtures
```

Live twin cases need Wave 1A–1D integrated API:

```bash
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live
```

## Matrix

| # | Scenario | Case / harness | Status |
|---|---|---|---|
| 1 | Station→station, no prefs | `bmc-p1-station-station-no-prefs` | **READY** |
| 2 | Station→station, one preferred | `bmc-p1-station-station-one-pref` | **READY** |
| 3 | Address→station | `bmc-p1-address-station` | **PENDING** (Wave 1A+1D) |
| 4 | Station→address | `bmc-p1-station-address` | **PENDING** (Wave 1A+1D) |
| 5 | Address→address | `bmc-p1-address-address` | **PENDING** (Wave 1A+1D) |
| 6 | POI→address | `bmc-p1-poi-address` | **PENDING** (Wave 1A+1D) |
| 7 | Failed geocode | `apps/api/test/p1Acceptance.harness.test.ts` (`unknown_place`) | **READY** (API harness) |
| 8 | Provider timeout | same harness (`timeout` / `pl_timeout`) | **READY** (API harness) |
| 9 | Complete preference match | `bmc-p1-complete-preference-match` | **READY** |
| 10 | Maximal partial preference | `bmc-p1-maximal-partial-preference` | **READY** |
| 11 | Unselected connector line | `bmc-p1-unselected-connector` | **READY** (QA fixture oracle) |
| 12 | Topologically irrelevant preferred | `bmc-p1-irrelevant-preferred` | **READY** |
| 13 | Candidate budget → `insufficient_candidate_coverage` | API harness (`pl_coverage_fail`) | **READY** (API harness) |
| 14 | GS displayed as S | `apps/web/.../LineBadge.gs-as-s.test.tsx` | **READY** (79-test web suite passed in Wave 4) |
| 15 | Live build no fixture leakage | `apps/web` `verify:no-fixtures` | **READY** (script; needs live build) |
| 16 | Privacy-safe logs | API `redactSensitive` + web `analyticsPlaceId` harness | **READY** |
| 17 | Deterministic repeated routing | `bmc-p1-deterministic-repeat` | **READY** |
| 18 | Stale / schedule_only modes | `bmc-p1-stale-mode`, `bmc-p1-schedule-only-mode` | **READY** |

### Controlled-alpha regressions (privacy-safe PlaceRefs)

| Regression | Case | Status |
|---|---|---|
| Midtown Park Ave area → 34 St–Penn preferred 7+2 uses prefs when feasible | `bmc-p1-midtown-penn-72-oracle` (shape) + `bmc-p1-alpha-midtown-penn-72` (live) | Oracle **READY** / Live **FLAG_OFF** |
| Same OD with 7,2,GS must not silent 0-of-3; explain omission | `bmc-p1-alpha-midtown-penn-72gs-no-silent-zero` | **FLAG_OFF** live |
| GCT→Penn with 7,2,GS preserves practical subset + explains omission | `bmc-p1-alpha-gct-penn-72gs` + live twin | Oracle **READY** / Live **PASS** (Wave 4) |

Privacy rules for these cases: station/`st:` PlaceRefs or coarse Midtown labels only — **no** private street addresses, tenant names, or rider history.

Wave 4 evidence: immutable release `rel-20260803T183449Z-78c2ca507c3f` passed the station-based GCT live case, including 2-of-3 satisfaction, omission explanation, and deterministic repeat ordering. The two Midtown coordinate cases are explicitly unavailable while address/POI remains flag-off; they are not release regressions or evidence of flag-on readiness.

## Counts

| Bucket | Count |
|---|---|
| Benchmark cases tagged `p1_wave1e` | 18 |
| Ready (`p1_ready`) | 11 |
| Pending soft (`p1_pending`) | 7 |
| API harness scenarios (7, 8, 13, 16) | 4 groups |
| FE SKIP (14) | 1 |
| Web fixture-leak ownership (15) | 1 script |

`p1-ready-subset.json` lists 11 hard P1 fixture/oracle cases plus `bmc-ordering-complete-beats-faster-partial` so the focused gate has ranking coverage.

## Tags

| Tag | Meaning |
|---|---|
| `p1_wave1e` | Owned by this wave |
| `p1_ready` | Fixture/oracle executes under fixture SUT |
| `p1_pending` | Soft / TODO until Wave 1A–1D |
| `soft_feasibility` | Runner treats as soft (does not inflate pass counts) |
| `alpha_regression` | Controlled-alpha finding lock |
| `privacy_safe_placeref` | OD uses PlaceRefs/coarse labels only |
| `oracle_only` | Synthetic expected-shape lock; not a live capture |

## Assumptions

- Wave 1A supplies address/POI geocode → stable `PlaceRef`.
- Wave 1D supplies preferred-line candidate coverage + omission explanations.
- Wave 1 FE maps rider-facing **S** while keeping internal `lineId` `GS`.
- Fixture oracles encode **desired** post-P1 accounting; they are not evidence that live alpha already behaves correctly.
- `st:723` (GCT) / `st:128` (Penn) are the intended live station PlaceRefs; confirm against live catalog when integrating.

## Gaps / risks

- Live Midtown regressions will fail today’s OTP top-N behavior until Wave 1D lands (known alpha finding).
- GS→S is presentation-only; fixture `subway-lines.json` currently omits GS — FE/data waves must add `lineId=GS` with `label=S`.
- Error-path matrix rows (7/8/13) are API vitest-owned because benchmark cases expect `RouteSearchResponse`, not typed errors.
- Coordinate OD cases use coarse labels; never log raw query text (API redaction already covers this).
- Do not add soft/pending P1 cases to `release-subset.json` until live evidence exists.
