# BetterMTA Testing Strategy

**Owner:** Benchmark / QA  
**Status:** Seed corpus + fixture runner + live HTTP SUT + recorded NYC captures  
**Related:** `docs/ACCEPTANCE_CRITERIA.md` §D, `benchmarks/`

## 1. Goals

- Encode the product ranking and satisfaction invariants as **deterministic, machine-checkable assertions**.
- Grow an internal corpus colloquially called “Beat Google 100” — an **internal name only**, not a public superiority claim.
- Never scrape or automate third-party products in violation of their terms.
- Never label synthetic fixtures as verified real-world outcomes.
- Capture live API responses once into `recorded_data`; keep `live` cases for gate-time HTTP smoke.

## 2. Categories covered

| Category | What we test | Seed coverage |
|---|---|---|
| Borough / cross-borough OD | Manhattan, Brooklyn, Queens, Bronx, SI placeholders | Seed + recorded NYC |
| Peak / off-peak timing | `depart_at` morning/evening vs mid-day/late | Seed + pending |
| Selected line counts | 0, 1, 2, 3 lines | Seed + recorded |
| Transfers / complexes | Multi-leg + Times Sq / W4 style transfers | Seed (synthetic) + pending |
| Incompatible / impossible constraints | Partial + none feasibility with structured explanations | Seed + recorded |
| Duplicate selection | Dedupe must not inflate satisfaction | Seed |
| Local / express | Same `lineId` counts once | Pending live patterns |
| Data honesty | `dataMode` + freshness warnings | Seed + recorded (`stale`) |
| Ranking order | Complete≻partial; max satisfaction before time; time within sat | Seed (QA fixtures) |
| External comparison | Manual-only slots | 1 reserved case |
| Recorded realtime | Captured live responses under `fixtures/recorded-responses/` | 8 recorded cases |
| Live HTTP smoke | `classification=live` against local API | 1 live smoke case |

## 3. Corpus path to 100 cases

| Phase | Target count | Classification mix | Blocker |
|---|---|---|---|
| A — Seed | 20–30 | Mostly `synthetic_contract_fixture` + `pending_live_integration` | None |
| B — Routing integration | ~50 | `recorded_data` + `live` against HTTP SUT | Live stack (done locally) |
| C — Recorded feeds | ~70 | Expand `recorded_data` / data-owned packs | Broader OD/time coverage |
| D — Human-reviewed real trips | ~90 | `manually_reviewed_real_trip` with review checklist | Field / rider review sessions |
| E — Full “100” | 100 | Fill gaps across boroughs, peak windows, 1–3 lines, complexes | Integration workstream |

Assembly process:

1. Author case JSON conforming to `benchmarks/schema/benchmark-case.schema.json`.
2. Prefer **invariant lists** over a single golden itinerary.
3. Set `classification` honestly (`recorded_data` only with a file under `fixtures/recorded-responses/`).
4. Map `sut.kind` to `conductor_fixture` | `qa_fixture` | `recorded_response` | `live`.
5. Run `validate-cases` then `run-benchmarks` (fixture default).
6. For defects, follow `benchmarks/docs/REGRESSION_CAPTURE.md`.

## 4. Tooling layout

```text
benchmarks/
  schema/benchmark-case.schema.json
  cases/*.json
  fixtures/sut-responses/        # QA-owned synthetic responses
  fixtures/recorded-responses/   # Captured live API responses (not synthetic)
  runner/                        # TypeScript package (own package.json)
  docs/
  reports/                       # Generated (gitignored)
  templates/
  release-subset.json
```

## 5. Invariant classes

| ID | Intent | Gate |
|---|---|---|
| `valid_itinerary_structure` | Ajv vs `contracts/schemas/itinerary.schema.json` | Merge-blocking |
| `origin_destination_consistency` | Stop refs / optional expected stations | Merge-blocking |
| `chronological_legs` | Transit time order | Merge-blocking |
| `nonnegative_durations` | Durations ≥ 0 | Merge-blocking |
| `satisfaction_accounting` | Bind request↔requestedLineIds; counts; omitted; feasibility↔counts; leg evidence | Merge-blocking |
| `complete_beats_partial` | Ranking | Merge-blocking (skip if <2 itineraries) |
| `max_satisfaction_before_time` | Ranking lexicographic | Merge-blocking (skip if <2) |
| `deterministic_order` | Repeat search identical fingerprints | Merge-blocking |
| `max_three_itineraries` | Contract list cap | Merge-blocking |
| `honest_data_mode` | `dataMode` present; authored fixtures ≠ live | Merge-blocking |
| `impossible_constraint_explanation` | Structured facts when partial/none | Merge-blocking |
| `expected_feasibility` | Case expectation | Merge-blocking on release subset |
| `minimum_satisfaction` | Case floor | Merge-blocking on release subset |

Details: `docs/CI_QUALITY_GATES.md`. Release subset: `benchmarks/release-subset.json`. Self-test: `npm --prefix benchmarks/runner run self-test`.

## 6. System under test

| Mode | Env / flag | Notes |
|---|---|---|
| Fixture (default) | `BETTERMTA_SUT=fixture` | Deterministic CI |
| Live HTTP | `BETTERMTA_SUT=live` | `LiveSystemUnderTest` → `POST /v1/routes/search`; PlaceRef as `{placeId}` only |

Live runs write shadow reports: `benchmarks/reports/live-shadow-<timestamp>.{json,txt}` with OD, lines, versions, itinerary summary, satisfaction, latency, and `humanValidity` defaulting to `pending_review`.

## 7. Coverage today vs gaps

**Today:**

- Schema + ~30 cases (synthetics, recorded NYC, live smoke, remaining pendings)
- Fixture SUT + live HTTP SUT + hybrid runner
- Recorded captures pinned to `mta-subway-c9c3366cdd16` (dataMode often `stale`)
- Release gate checklist G01–G20

**Gaps:**

- Full 100-case geographic/time coverage
- Human-reviewed real trips
- Manual external comparison evidence
- Arrive-by still conductor-unresolved / beta-rejected
- SI / ferry-adjacent multimodal may be out of MVP scope
- Fly deploy / rollback still infra-blocked

## 8. What requires live-data integration

- Real travel times, waits, and transfer feasibility at gate time (`live` cases)
- Local vs express pattern distinction under one `lineId`
- Stale/live thresholds against real feed ages
- Reclassification of remaining `pending_live_integration` cases
- Any external comparison (manual only; evidence-backed claims)

## 9. Release gates (summary)

From `ACCEPTANCE_CRITERIA.md` §D, enforced here as:

1. Zero topology-invalid itineraries on the active release subset.
2. Zero selected-line accounting errors.
3. Deterministic repeats.
4. Honest degraded/synthetic/recorded labeling.

Runnable: `npm --prefix benchmarks/runner run gate` (exit 0/1/2). Emits `release-gate-*.md`.

Accessibility and FE mobile regressions are owned with Frontend; this workstream records the gate definition and expects their evidence in the go/no-go package.

## 10. Blind spots

- Fixture/recorded SUT cannot catch router regressions after capture time without re-recording or live smoke.
- Live `deterministic_order` can flake if snapshots change between the two searches in one case.
- Human preference (“preferable to baseline”) is not fully automatable.
- Performance p95 is owned with Backend/Infra probes; shadow reports capture per-case latency only.
- Marketing misuse of the “Beat Google 100” name (process risk R11).

## 11. Commands

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live
npm --prefix contracts install && npm --prefix contracts run validate
```
