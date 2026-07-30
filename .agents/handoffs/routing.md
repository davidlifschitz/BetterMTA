# Routing Workstream Handoff

**Branch:** `agent/routing`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-routing`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`

Clearly separated below: **implemented / tested / mocked / deferred / blocked**.

---

## 1. What was implemented

**Implemented**

- Engine evaluation + ADR-0002a **recommendation** (OTP2 + outer hard-constraint layer) in `docs/ROUTING_ENGINE_SPEC.md` (does not edit `ARCHITECTURE_DECISIONS.md`).
- TypeScript library `@bettermta/routing` under `services/routing/`:
  - `CandidateProvider` abstraction
  - Deterministic `FixtureCandidateProvider` (synthetic-only; default `realtimeConfidence: "none"` except `ranking_demo`)
  - Selected-line satisfaction accounting (DOMAIN_MODEL invariants)
  - Fail-closed `TooManySelectedLinesError` when deduped selection >5 (ADR-0006)
  - Draft validity gate (`validate.ts`) before enrichment/ranking
  - Stable content fingerprint (always recomputed; provider fingerprints ignored)
  - ADR-0007 lexicographic ranking + top-3 truncation
  - Constrained pool includes **all families** (incl. baseline) when lines are selected
  - Structured explanation builder
  - Library-only `perLineRideSeconds` on ranked itineraries (not in contract shapes)
  - Snapshot `dataMode` handling: `unavailable` → `data_unavailable`; `schedule_only`/`stale` → confidence force + `dataDegradation`
  - `runRouteSearch` outcomes: `ok`, `no_transit_path`, `insufficient_candidate_coverage`, `data_unavailable`
- Offline unit + property-style tests + schema validation against `itinerary.schema.json`
- Ranking micro-benchmark script

**Tested**

- Vitest coverage for satisfaction, ranking (incl. isolated ADR-0007 transfer/walk/confidence pairs), explanations, outcomes, fingerprint stability + lying-provider ignore, validity rejections, dataMode degradation, baseline-only complete match, AJV schema validation, rank-1000 smoke

**Mocked**

- All candidate generation via synthetic fixtures (`dataMode: synthetic`); no live MTA calls; no OTP process

**Deferred**

- Live OTP2 adapter / graph build / GTFS-RT wiring
- MOTIS bake-off on MTA extract
- Arrive-by search strategy addendum
- Production latency measurement including OTP
- Surfacing `perLineRideSeconds` into API contract shapes (library-only for now)

**Blocked**

- Nothing hard-blocked; OTP integration waits on data snapshot handles + infra process (expected parallel work)

---

## 2. Files changed

Created / updated (owned paths only):

- `docs/ROUTING_ENGINE_SPEC.md`
- `services/routing/package.json`
- `services/routing/package-lock.json`
- `services/routing/tsconfig.json`
- `services/routing/vitest.config.ts`
- `services/routing/src/index.ts`
- `services/routing/src/types.ts`
- `services/routing/src/contract-types.ts`
- `services/routing/src/candidate-provider.ts`
- `services/routing/src/fixture-provider.ts`
- `services/routing/src/satisfaction.ts`
- `services/routing/src/fingerprint.ts`
- `services/routing/src/validate.ts`
- `services/routing/src/ranking.ts`
- `services/routing/src/explanation.ts`
- `services/routing/src/search.ts`
- `services/routing/tests/routing.test.ts`
- `services/routing/scripts/bench-rank.ts`
- `.agents/handoffs/routing.md` (this file)

Not modified: `contracts/**`, conductor docs, repo-root `package.json`.

---

## 3. Public interfaces and schemas

Library entry: `services/routing/src/index.ts`

Primary API:

- `CandidateProvider.generateCandidates(CandidateSearchRequest)`
- `runRouteSearch(provider, request) → RouteSearchOutcome`
- `computeSatisfaction`, `normalizeSelectedLineIds`, `TooManySelectedLinesError`
- `computePerLineRideSeconds` (library-only)
- `validateCandidateDraft`
- `rankConstrained` / `rankBaseline` / `fingerprintItinerary` / `buildExplanation`
- `FixtureCandidateProvider`, `SYNTHETIC_SNAPSHOT`

Types structurally mirror `contracts/typescript/index.ts` via `src/contract-types.ts` (no contracts edits). `RankedItinerary` adds library-only `perLineRideSeconds`.

Consumed schemas (read-only): itinerary, satisfaction, data-snapshot; fixtures under `contracts/fixtures/routes/*`.

---

## 4. Assumptions

- OTP2 is the recommended substrate; soft preferred-route penalties are insufficient for hard selected-line maximization.
- Fixture provider rejects non-`synthetic` snapshots to prevent accidental “live” labeling in tests.
- Max 5 selected lines enforced in-library by throw (also expected at API).
- `constraintInfeasible` on `ok` means complete match not found; partials may still be returned.
- Coverage exhaustion is signaled by provider sentinel `itineraryId === "__coverage_exhausted__"` or thrown message containing `INSUFFICIENT_CANDIDATE_COVERAGE`.
- Baseline-family candidates participate in constrained ranking when selected lines are non-empty.

---

## 5. Validation commands

```bash
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/services/routing install
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/services/routing test
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/services/routing run typecheck
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/services/routing run bench:rank
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/contracts install
npm --prefix /Users/thebiglipper/Developer/bettermta-routing/contracts run validate
```

---

## 6. Validation results

| Command | Result |
|---|---|
| `services/routing` vitest | **43 passed / 0 failed** (1 file) |
| `services/routing` typecheck | **pass** |
| `bench:rank` | Prior slice: `avgMs ≈ 0.11–0.23` for 1000 candidates × 50 iters (`dataMode: synthetic`) |
| `contracts` validate | **All conductor contract validations passed** (unchanged) |

---

## 7. Fixture or sample-data instructions

```ts
import {
  FixtureCandidateProvider,
  SYNTHETIC_SNAPSHOT,
  runRouteSearch,
} from "@bettermta/routing"; // or relative src/index.ts

const provider = new FixtureCandidateProvider({ scenario: "complete_f_b" });
const outcome = await runRouteSearch(provider, {
  origin: { label: "Origin", lat: 40.68, lon: -74.0 },
  destination: { label: "Dest", lat: 40.75, lon: -73.98 },
  timing: { type: "depart_now" },
  selectedLineIds: ["F", "B"],
  snapshot: SYNTHETIC_SNAPSHOT, // dataMode: synthetic
});
```

Scenarios: `complete_f_b`, `partial_a_g_l`, `baseline_only`, `five_lines`, `diverse_rank`, `ranking_demo` (only scenario with non-`none` realtimeConfidence), `empty`; flags `empty`, `exhaustBudget`.

FE/BE should continue using `contracts/fixtures/**` until OTP is wired.

---

## 8. Known defects / fixed findings (remediation)

Fixed in this remediation pass:

1. **CRITICAL** — Baseline family excluded from constrained ranking → now included when selected lines non-empty (regression: baseline_only + `["2"]` → complete match).
2. **HIGH** — No itinerary validity gate → `validateCandidateDraft` drops invalid drafts with counted reasons.
3. **MEDIUM** — >5 selected lines silently truncated → `TooManySelectedLinesError`.
4. **MEDIUM** — Per-line ride seconds → `computePerLineRideSeconds` + `RankedItinerary.perLineRideSeconds` (library-only, not contract).
5. **MEDIUM** — No distinct realtime-unavailable handling → `data_unavailable` / `dataDegradation` + confidence forcing.
6. **MEDIUM** — Precomputed draft.fingerprint trusted → always recompute.
7. **LOW** — Walk fingerprint missing legId/distanceMeters → included.
8. **LOW** — Fixture confidence defaults → `"none"` except `ranking_demo`.
9. **LOW** — ADR-0007 isolated comparator tests added (transfers, walking, realtimeConfidence).
10. **INFO** — `DomAIN_MODEL` typo fixed in `docs/ROUTING_ENGINE_SPEC.md`.

---

## 9. Known limitations

- No live OTP/MOTIS integration yet (OTP adapter deferred).
- Arrive-by strategy unresolved / deferred.
- Candidate budget / family orchestration against a real engine is specified but not executed.
- Performance numbers exclude engine latency.
- Contract types are mirrored (not a package dependency) — drift risk if contracts change without routing rebase.
- `perLineRideSeconds` is library-only until a contract proposal is accepted.

---

## 10. Decisions requiring conductor approval

1. **ADR-0002a recommendation:** adopt OTP2 as candidate substrate; keep hard selected-line logic outside the engine (`docs/ROUTING_ENGINE_SPEC.md`). Conductor should append ADR-0002a to `ARCHITECTURE_DECISIONS.md` if accepted.
2. Optional short MOTIS bake-off before irreversible infra lock-in (recommended in spec; not a contract change).
3. Optional future contract proposal to expose `perLineRideSeconds` / `dataDegradation` on the public API (currently library-only / outcome fields).

---

## 11. Exact next integration step

1. Conductor/human accepts or revises ADR-0002a.
2. Data workstream exposes pin-able `RoutingSnapshotHandle` + static GTFS suitable for OTP graph build.
3. Routing implements `OtpCandidateProvider` (HTTP/GraphQL) mapping engine itineraries → `RawCandidateDraft`, preserving `sourceEngineIds` and snapshot pin.
4. Backend calls `runRouteSearch` and maps `RouteSearchOutcome` → `/v1/routes/search` errors (`no_transit_path`, `insufficient_candidate_coverage`, `data_unavailable`) per `API_CONTRACT.md`.
5. QA adds golden cases from fixtures + live snapshot hashes.

---

## Suggested skills (next agent)

- `implementation-loop` or `tdd` when wiring OTP adapter
- `verification-before-completion` before claiming production readiness
- `handoff` when closing the OTP integration slice
