# Frontend Workstream Handoff — P1 Wave 1C

**Branch:** `agent/p1-wave1-frontend`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-p1-wave1-frontend`  
**Lock tip base:** `b9139fb`  
**Date:** 2026-07-31  
**Contract version consumed:** `2026-07-31` (read-only; `contracts/**` not edited)

## 1. What was implemented

- Unified station/address/POI place suggest UX consuming additive place fields (`kind`, `provider`, `formattedAddress`, `attribution`) when present.
- Feature flag `NEXT_PUBLIC_FLAG_ADDRESS_POI` (default **off**) — flag-off keeps prior station-first autocomplete; flag-on shows address/POI with kind/source labels + attribution.
- Current-location flow unchanged (live → coordinate PlaceRef; fixture → demo station mapping with honest label).
- Accessible combobox autocomplete (listbox keyboard nav, `aria-*`, live suggestion status).
- Preferred-line copy throughout (picker, results, banners, loading) — not required-line framing (ADR-0023).
- Complete / partial preference banners; `connector_filled` explanation note when API/facts provide it.
- Dedicated `insufficient_candidate_coverage` UI (`coverage-failure-state`) with CandidateCoverage detail lines.
- Rider-facing **S** for internal `lineId` `GS` (badge, sequences, coverage, filter alias); requests keep `GS`.
- No `providerPlaceId` / vendor hostnames exposed in UI.
- Fixture client demos: address places, GS line, `2+7+GS` coverage failure, connector_filled on complete match.
- Component/unit tests expanded; live `verify:no-fixtures` still intended (clean `.next` before live build).

## 2. Files changed

Owned paths only:

- `apps/web/**` (components, libs, styles, README, env example, tests)
- `.agents/handoffs/frontend.md` (this file)

**Not touched:** `contracts/**`, geocoder backend, routing orchestration, privacy infra, QA corpus.

## 3. Public interfaces and schemas

- Consumes (read-only): `contracts/typescript` + `contracts/fixtures/**` @ `2026-07-31`
- New FE helpers: `line-display`, `place-display`, `preference-copy`
- Flag: `NEXT_PUBLIC_FLAG_ADDRESS_POI=true|1`
- No new shared schemas proposed

## 4. Assumptions

- Address/POI results appear only when the API returns them **and** the FE flag is on; Wave 1A owns geocoder wiring.
- `connector_filled` explanation depends on API/routing facts (Wave 1B); fixture injects a demo fact for F+B.
- Catalog may omit GS; FE presents a fallback shuttle line for picker demos without renaming `lineId`.
- Partial banner copy follows ADR-0023 / P1 proposal (“Couldn’t use all preferences…”) rather than pre-P1 UX_SPEC “selected lines” wording.
- Live isolation check requires a clean `.next` after switching from fixture → live build (stale fixture chunks otherwise).

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-p1-wave1-frontend/apps/web
npm test
npm run build
rm -rf .next && NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run build
NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run verify:no-fixtures
```

## 6. Validation results

| Command | Result |
|---|---|
| `npm test` | **PASS** — 13 files, **77 tests** |
| `npm run build` (fixture) | **PASS** |
| live build + `verify:no-fixtures` (clean `.next`) | **PASS — CLEAN** |

## 7. Fixture or sample-data instructions

```bash
cd apps/web && npm install && npm run dev
# Address/POI unified UX:
NEXT_PUBLIC_FLAG_ADDRESS_POI=true npm run dev
```

| Input | Demo |
|---|---|
| F + B | Complete match + connector_filled note |
| A + G + L | Partial preferences banner |
| 2 + 7 + S (GS) | `insufficient_candidate_coverage` |
| Query `277` / `Park` with flag on | Address/POI suggestions + attribution |
| Flag off | Station-only suggestions |

## 8. Known defects

- None blocking in unit/component suite.

## 9. Known limitations / gaps

- Real address hits still depend on Wave 1A geocoder behind API flag; FE only surfaces additive fields when present.
- Real preference-covering candidates / coverage errors depend on Wave 1B routing orchestration.
- UX_SPEC.md still says “Required-line coverage” / “Lines to use” in places — product docs lag; FE follows ADR-0023.
- No new Playwright E2E coverage for address/POI or coverage-failure in this wave.
- Depart-at/arrive-by datetime pickers still deferred.

## 10. Decisions requiring conductor approval

- None. Presentation-only GS→S and preferred-line copy per ADR-0022/0023.

## 11. Exact next integration step

1. Push/merge Wave 1C FE after parallel waves land behind flags.
2. Wave 1A: enable geocoder; FE flag-on when attribution path ready.
3. Wave 1B: emit `connector_filled` + `insufficient_candidate_coverage` with details in live stack.
4. QA (1E): exercise address OD + preferred 2/7/GS corpus against live UI.

## Risks

- **R27** mitigated in FE copy/S labeling; runtime ranking still Wave 1B.
- **R25/R26** remain backend/routing-owned; FE fails honestly when signals arrive.
- Stale `.next` after fixture→live build can false-fail `verify:no-fixtures` — always `rm -rf .next` for live isolation check.
