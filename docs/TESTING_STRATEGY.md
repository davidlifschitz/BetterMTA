# BetterMTA Testing Strategy

**Owner:** Benchmark / QA (`agent/benchmark-qa`)  
**Status:** Seed corpus + fixture runner  
**Related:** `docs/ACCEPTANCE_CRITERIA.md` §D, `benchmarks/`

## 1. Goals

- Encode the product ranking and satisfaction invariants as **deterministic, machine-checkable assertions**.
- Grow an internal corpus colloquially called “Beat Google 100” — an **internal name only**, not a public superiority claim.
- Never scrape or automate third-party products in violation of their terms.
- Never label synthetic fixtures as verified real-world outcomes.

## 2. Categories covered

| Category | What we test | Seed coverage |
|---|---|---|
| Borough / cross-borough OD | Manhattan, Brooklyn, Queens, Bronx, SI placeholders | Seed cases + pending slots |
| Peak / off-peak timing | `depart_at` morning/evening vs mid-day/late | Seed + pending |
| Selected line counts | 0, 1, 2, 3 lines | Seed |
| Transfers / complexes | Multi-leg + Times Sq / W4 style transfers | Seed (synthetic) |
| Incompatible / impossible constraints | Partial + none feasibility with structured explanations | Seed |
| Duplicate selection | Dedupe must not inflate satisfaction | Seed |
| Local / express | Same `lineId` counts once | Pending live patterns |
| Data honesty | `dataMode` + freshness warnings | Seed (`synthetic`, `stale`, `schedule_only`) |
| Ranking order | Complete≻partial; max satisfaction before time; time within sat | Seed (QA fixtures) |
| External comparison | Manual-only slots | 1 reserved case |
| Recorded realtime | Data-owned recordings | 1 reserved slot |

## 3. Corpus path to 100 cases

Current seed: **25** cases under `benchmarks/cases/`.

| Phase | Target count | Classification mix | Blocker |
|---|---|---|---|
| A — Seed (this package) | 20–30 | Mostly `synthetic_contract_fixture` + `pending_live_integration` | None |
| B — Routing integration | ~50 | Reclassify pending → executable against live/router SUT | Routing engine + adapter implementing `SystemUnderTest` |
| C — Recorded feeds | ~70 | Add `recorded_data` from data workstream fixtures | Data recorded GTFS-RT packs |
| D — Human-reviewed real trips | ~90 | `manually_reviewed_real_trip` with review checklist | Field / rider review sessions |
| E — Full “100” | 100 | Fill gaps across boroughs, peak windows, 1–3 lines, complexes, accessibility subset | Integration workstream |

Assembly process:

1. Author case JSON conforming to `benchmarks/schema/benchmark-case.schema.json`.
2. Prefer **invariant lists** over a single golden itinerary.
3. Set `classification` honestly.
4. Map `sut` to a conductor fixture, QA fixture, or (later) live SUT key.
5. Run `npm --prefix benchmarks/runner run validate-cases` then `run-benchmarks`.
6. For defects, follow `benchmarks/docs/REGRESSION_CAPTURE.md`.

## 4. Tooling layout

```text
benchmarks/
  schema/benchmark-case.schema.json
  cases/*.json
  fixtures/sut-responses/     # QA-owned synthetic responses (not conductor)
  runner/                     # TypeScript package (own package.json)
  docs/                       # Regression, gates, human review
  reports/                    # Generated (local)
  templates/                  # Regression case template
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
| `honest_data_mode` | `dataMode` present; fixtures ≠ live | Merge-blocking |
| `impossible_constraint_explanation` | Structured facts when partial/none | Merge-blocking |
| `expected_feasibility` | Case expectation | Merge-blocking on release subset (soft-omitted on placeholders) |
| `minimum_satisfaction` | Case floor | Merge-blocking on release subset (soft-omitted on placeholders) |

Details: `docs/CI_QUALITY_GATES.md` (mirrored at `benchmarks/docs/CI_QUALITY_GATES.md`). Release subset: `benchmarks/release-subset.json`. Self-test: `npm --prefix benchmarks/runner run self-test`.

## 6. Coverage today vs gaps

**Today (fixture SUT):**

- Schema + 25 seed cases
- Invariant library + reports
- Conductor fixtures exercised: `complete-match`, `partial-match`, `baseline-only`, `degraded-realtime`
- QA fixtures for ordering + feasibility none

**Gaps:**

- No live router SUT
- No recorded GTFS-RT packs wired
- No accessibility-specific cases yet (deferred unless corpus requires minimal subset)
- Arrive-by strategy still conductor-unresolved
- SI / ferry-adjacent multimodal may be out of MVP scope
- Full 100-case geographic/time coverage incomplete by design until Phases B–E

## 7. What requires live-data integration

- Real travel times, waits, and transfer feasibility
- Local vs express pattern distinction under one `lineId`
- Stale/live thresholds against real feed ages
- True impossible-constraint discovery (not hand-authored)
- Reclassification of `pending_live_integration` cases
- Any external comparison (manual only; evidence-backed claims)

## 8. Release gates (summary)

From `ACCEPTANCE_CRITERIA.md` §D, enforced here as:

1. Zero topology-invalid itineraries on the active release subset (`valid_itinerary_structure` + chronology/durations).
2. Zero selected-line accounting errors (`satisfaction_accounting`).
3. Deterministic repeats (`deterministic_order`).
4. Honest degraded/synthetic labeling (`honest_data_mode`).

Runnable: `npm --prefix benchmarks/runner run gate` (exit 0/1/2).

Accessibility and FE mobile regressions are owned with Frontend; this workstream records the gate definition and expects their evidence in the go/no-go package.

## 9. Blind spots

- Fixture SUT cannot catch router topology bugs that fixtures do not encode.
- Satisfaction alignment is only as good as case↔response mapping.
- No fuzz/property generation yet (planned: random place + line-set generator against live SUT).
- Human preference (“preferable to baseline”) is not fully automatable.
- Performance p95 is owned with Backend/Infra probes, not this runner.
- Marketing misuse of the “Beat Google 100” name (process risk R11).

## 10. Commands

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run gate
npm --prefix contracts install && npm --prefix contracts run validate
```
