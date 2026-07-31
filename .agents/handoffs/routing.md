# Routing Workstream Handoff — Wave 3 Review B High remediations

**Branch:** `agent/p1-address-preferred-lines`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Tip SHA:** `e8c368fd9034101f29e2733fb4ead6377de26ecc`  
**Fix commit:** `d58051b1ab70f353e590a5b413353dfd93ad76fc`  
**Date:** 2026-07-31  
**Remote:** pushed to `origin/agent/p1-address-preferred-lines` (no merge to main; no alpha redeploy)  
**Contracts:** not edited

---

## Review B Highs remediated

### High 1 — Live OTP preference generation unverified

**Change:** Deterministic unit coverage for `buildPlanRequestBody` in `services/routing/tests/otp-provider.test.ts`:

- baseline → GraphQL document has no `unpreferred` / `via`
- preference_biased → query includes `unpreferred`; variables carry routes + cost
- via → query includes `via`; variables carry visit coordinate

No live OTP required. Midtown fixture regression remains for end-to-end preference ranking; GraphQL knob shape is now unit-proven.

### High 2 — Sequential query amplification

**Change:** `createOtpCandidateProvider` in `otp-provider/provider.ts`:

- Baseline still runs first and hard-fails on timeout/unavailable/bad_response
- Remaining preference/via/subset queries run via `Promise.allSettled` (respects `maxQueries`)
- Non-baseline AbortController budget shortened via `nonBaselineTimeoutMs` (`min(timeout, 2500, max(500, floor(timeout/2)))`)
- Soft-skip non-baseline non-timeout failures (timeouts still hard-fail after the batch)
- Early-complete: skip fan-out when baseline already has a complete preference match; after parallel batch, mark `stoppedEarlyWithCoverage` when complete + ≥2 families
- `budgetExhausted` / `candidateCoverage` / `insufficient_candidate_coverage` semantics preserved
- Concurrency unit test asserts overlapping in-flight preference bodies + soft-skip path

Worst-case wall time ≈ baseline timeout + one shortened parallel batch (not 6 × full timeout).

---

## Files changed (this tip)

- `services/routing/src/otp-provider/provider.ts`
- `services/routing/src/otp-provider/index.ts` (export `nonBaselineTimeoutMs`)
- `services/routing/tests/otp-provider.test.ts`
- `.agents/handoffs/routing.md` (this file)

---

## Tests

```bash
cd services/routing && npm test && npm run typecheck
```

Results: **80 passed**, 1 skipped (live OTP env-gated).

---

## Push / merge policy

- Push `agent/p1-address-preferred-lines` only.
- **No merge to main. No alpha redeploy.**

---

## Prior Wave 1B notes (historical)

Earlier preferred-line orchestration (ADR-0023) landed on `agent/p1-wave1-routing` / related tips: multi-family plan, budgets, dedupe, coverage exhaustion, Midtown fixture regression, soft-skip non-baseline failures. See git history on that branch for the original file set (`services/routing/src/orchestration/*`, search/explanation wiring, API coverage pass-through).
