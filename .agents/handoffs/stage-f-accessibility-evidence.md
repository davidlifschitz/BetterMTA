# Stage F accessibility-evidence handoff

**Branch:** `codex/stage-f-accessibility-evidence`  
**Parent:** `codex/stage-f-preview-container` at `9f10e50`  
**Status:** Implemented and locally validated; final GitHub CI artifact audit pending  
**Public-beta status:** `NOT_READY`

## 1. What was implemented

- A fail-closed writer for commit-bound automated accessibility evidence.
- CI wiring that runs the writer only after the existing 14-test mocked-live
  keyboard/mobile/axe suite passes and retains the bounded result for 14 days.
- A human accessibility review protocol covering the same release commit,
  target class, core flow, keyboard, screen reader, visual/motion behavior,
  findings, and release-owner sign-off.
- Structure and TDD coverage that prevents automated evidence, a pending
  template, or a structure-only check from being presented as gate passage.
- Stage F readiness, risk, release-gate, tooling, and continuation updates. R33
  prevents treating automated checks as completed human approval.

## 2. Files changed

- `.github/workflows/ci.yml`
- `infra/public-beta/write-accessibility-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `infra/public-beta/README.md`
- `docs/public-beta/ACCESSIBILITY_REVIEW.md`
- `docs/public-beta/READINESS.md`
- `docs/RISK_REGISTER.md`
- `docs/RELEASE_GATE_REPORT.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-preview-container.md`
- `.agents/handoffs/stage-f-accessibility-evidence.md`

## 3. Public interfaces and schemas

- CLI: `node infra/public-beta/write-accessibility-evidence.mjs
  --release-commit <40-lowercase-hex> --suite-status pass`.
- Successful JSON fields: `schemaVersion`, `status`, `evidenceClass`, `gateId`,
  `releaseCommit`, `checks`, `humanReviewStatus`, `eligibleForGatePass`,
  `productionMutation`, and `generatedAt`.
- Fixed checks: `keyboard-only-core-flow`, `mobile-44px-targets`, and
  `axe-wcag2a-wcag2aa`.
- Fixed state: `AUTOMATED_PASS_HUMAN_PENDING`, `humanReviewStatus: pending`,
  `eligibleForGatePass: false`, and `productionMutation: false`.
- CI artifact: `public-beta-accessibility-<run-id>` containing only
  `infra/public-beta/evidence/accessibility/result.json`.
- Human protocol: copy `docs/public-beta/ACCESSIBILITY_REVIEW.md` beneath the
  gitignored accessibility evidence root and bind the completed copy to the
  same release commit.

## 4. Assumptions

- The existing mocked-live Playwright suite remains the automated contract for
  keyboard operation, mobile target sizing, and serious/critical axe findings.
- Automated browser checks are useful release evidence but cannot substitute
  for review with assistive technology and human judgment.
- Reviewer identity, target hostname, credentials, precise rider coordinates,
  and private assistive-technology logs do not belong in committed evidence.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/write-accessibility-evidence.mjs
node -e 'const fs=require("fs");const yaml=require("./contracts/node_modules/js-yaml");yaml.load(fs.readFileSync(".github/workflows/ci.yml","utf8"))'
npm --prefix contracts run validate
npm --prefix apps/web test
npm --prefix apps/web run e2e
git diff --check
```

## 6. Validation results

- TDD RED: four writer/workflow/structure tests failed before the writer and CI
  wiring existed; two review-template/structure tests then failed while the
  human protocol was absent.
- TDD GREEN: 19/19 readiness tests pass; structure validation reports
  `STRUCTURE_PASS`; writer syntax, workflow YAML parsing, and `git diff --check`
  pass.
- All conductor contract validations pass.
- Web unit tests pass 81/81 across 14 files.
- All 14 mocked-live Playwright checks pass in 46.1 seconds.
- Final GitHub CI and retained accessibility-artifact results remain to be
  recorded before this handoff is final.

## 7. Fixture or sample-data instructions

- No fixture or sample-data contract changed.
- Automated accessibility evidence depends on the existing mocked-live
  Playwright routes. Keep the live-mode fixture exclusion and production
  preview scans as separate controls.
- Do not commit a completed human review if it contains target identity or
  private reviewer/session data; retain it in the approved evidence store.

## 8. Known defects

- Standalone `npx tsc --noEmit` in `apps/web` still reports pre-existing
  `ProcessEnv` typing errors in test fixtures; production builds pass.
- The pinned Next.js/npm advisories remain R24 / FU-NPM-01 / draft PR #7.
- This slice adds no new user-interface behavior and therefore does not repair
  any finding a future human accessibility review may discover.

## 9. Known limitations

- The automated artifact exercises mocked-live browser behavior, not a hosted
  or public target and not assistive-technology judgment.
- The committed human protocol remains `PENDING_HUMAN_REVIEW`; no person has
  executed or signed it for this candidate.
- `eligibleForGatePass` is always false for this automated artifact. The
  accessibility gate remains open, as do the other nine Stage F gates.

## 10. Decisions requiring conductor approval

- Choose and authorize the review target class and exact release commit.
- Assign a human reviewer, screen reader/OS/browser matrix, evidence-retention
  location, and release owner for sign-off.
- Decide whether any open high-severity finding is acceptable. An open critical
  core-flow finding always blocks the gate under this protocol.

## 11. Exact next integration step

Publish this branch as a draft PR targeting `codex/stage-f-preview-container`,
require every CI job to pass, and audit `public-beta-accessibility-<run-id>` for
exact head-commit binding, fixed automated checks, pending human status, gate
ineligibility, production-mutation false, and absence of URL/hostname fields.
Do not merge to `main`, deploy, conduct a human review against an unapproved
target, or mark the public beta ready from this slice.
