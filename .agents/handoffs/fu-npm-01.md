# FU-NPM-01 Workstream Handoff

**Date:** 2026-08-03  
**Branch:** `codex/fu-npm-01`  
**Base:** `e83da75` (`agent/p1-address-preferred-lines`)  
**Deployment status:** **NOT DEPLOYED** — maintenance candidate only

## 1. What was implemented

- **Implemented:** upgraded the web app from Next.js `15.3.5` to the patched Next.js `15.5.22` line and kept `eslint-config-next` aligned at `15.5.22`.
- **Implemented:** upgraded Vitest to `^3.2.7` in `apps/web` and `services/data`.
- **Implemented:** added narrow web lockfile overrides for `postcss@8.5.25` and `sharp@0.35.3`. Next.js `15.5.22` still publishes vulnerable transitive ranges (`postcss@8.4.31` and `sharp@^0.34.3`), so the overrides close the remaining registry advisories without a framework-major migration.
- **Tested:** all six package trees report zero npm advisories after clean installs.
- **Deferred:** deployment. Per the roadmap, merging this maintenance work must not auto-redeploy the controlled-alpha host.

## 2. Files changed

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `services/data/package.json`
- `services/data/package-lock.json`
- `.agents/handoffs/fu-npm-01.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `docs/alpha/CONTROLLED_ALPHA_REVIEW_1.md`

## 3. Public interfaces and schemas

No API, contract, response schema, route-ranking behavior, feature flag, or rider-facing interface changed.

## 4. Assumptions

- The controlled alpha remains on its already-certified immutable P1 release while this branch is reviewed.
- `postcss@8.5.25` is compatible with Next.js's PostCSS usage; the production build passed.
- `sharp@0.35.3` is outside Next.js `15.5.22`'s declared `^0.34.3` optional range. BetterMTA currently has no `next/image` imports, and the production build passed; this override should still be removed when a supported Next.js release declares a patched Sharp range.
- Node 22 in CI and containers satisfies all upgraded package engine requirements.

## 5. Validation commands

```bash
npm --prefix apps/web ci
npm --prefix apps/web test
NEXT_PUBLIC_API_MODE=live \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 \
NEXT_PUBLIC_FLAG_FEEDBACK=false \
NEXT_PUBLIC_FLAG_ADDRESS_POI=false \
  npm --prefix apps/web run build
npm --prefix apps/web run verify:no-fixtures

npm --prefix contracts ci
npm --prefix services/data ci
npm --prefix services/data test
npm --prefix services/data run typecheck
npm --prefix services/data run build

for package in apps/web services/data apps/api services/routing contracts benchmarks/runner; do
  npm --prefix "$package" audit
done
```

## 6. Validation results

- **Before:** `apps/web` reported 4 advisories (2 critical, 2 high); `services/data` reported 5 (1 critical, 1 high, 3 moderate). The other four package trees reported zero.
- **After:** all six package trees report 0 total advisories.
- Web unit tests: 14 files passed, 79 tests passed.
- Web production live-mode build: passed on Next.js `15.5.22`.
- Web fixture-isolation scan: clean, 0 markers.
- Data unit tests: 3 files passed, 65 tests passed, 2 intentional skips.
- Data typecheck and build: passed.

## 7. Fixture or sample-data instructions

No fixture or sample-data changes. Preserve the live-build sequence: move or remove the prior `.next` output, set `NEXT_PUBLIC_API_MODE=live`, build, then run `verify:no-fixtures`.

## 8. Known defects

None found in the upgraded application paths.

## 9. Known limitations

- Next.js still warns that it inferred `/Users/thebiglipper/package-lock.json` as the workspace root in this local multi-lockfile environment. The warning predates this work and did not fail the build.
- The Sharp override is a compatibility bridge outside Next.js's declared optional range. There is no current `next/image` usage, but an image-optimizer regression check is required before adding that feature.

## 10. Decisions requiring conductor approval

- Merge timing into the P1 branch/main remains an owner decision.
- Deployment or creation of a new immutable alpha release remains a separate explicit decision; this workstream does not authorize it.

## 11. Exact next integration step

Push `codex/fu-npm-01`, require the full GitHub CI matrix to pass, review the two lockfile diffs and override rationale, then merge without running the release deployment workflow.
