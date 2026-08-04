# Stage F incident-evidence handoff

**Branch:** `codex/stage-f-incident-evidence`  
**Parent:** `codex/stage-f-accessibility-evidence` at `2c49984`  
**Status:** Implemented locally; latest CI artifact audit is retained in draft PR #15 comments
**Public-beta status:** `NOT_READY`

## 1. What was implemented

- A fail-closed writer for commit-bound incident playbook-readiness evidence.
- CI wiring that runs after structure validation and retains the bounded result
  for 14 days.
- A restricted tabletop protocol covering prerequisites, roles, scenario,
  timeline, stop/rollback decisions, recovery, communications/privacy,
  findings, and release-owner sign-off for the same release commit.
- Structure and TDD coverage that prevents a green playbook check, pending
  template, or structure-only result from being presented as active incident
  capability or gate passage.
- Stage F readiness, risk, release-gate, tooling, and continuation updates. R34
  prevents treating mechanics as an approved rota/channel/tabletop.

## 2. Files changed

- `.github/workflows/ci.yml`
- `infra/public-beta/write-incident-readiness-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `infra/public-beta/README.md`
- `docs/public-beta/INCIDENT_DRILL.md`
- `docs/public-beta/READINESS.md`
- `docs/RISK_REGISTER.md`
- `docs/RELEASE_GATE_REPORT.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-accessibility-evidence.md`
- `.agents/handoffs/stage-f-incident-evidence.md`

## 3. Public interfaces and schemas

- CLI: `node infra/public-beta/write-incident-readiness-evidence.mjs
  --release-commit <40-lowercase-hex> --playbook-status pass`.
- Successful JSON fields: `schemaVersion`, `status`, `evidenceClass`, `gateId`,
  `releaseCommit`, `checks`, `rotaStatus`, `channelStatus`,
  `tabletopDrillStatus`, `eligibleForGatePass`, `productionMutation`, and
  `generatedAt`.
- Fixed checks: `detection-severity-roles`, `stop-response-recovery`, and
  `privacy-safe-communications-evidence`.
- Fixed state: `PLAYBOOK_PASS_ROTA_DRILL_PENDING`, rota/channel
  `pending_owner_approval`, tabletop `pending`, `eligibleForGatePass: false`,
  and `productionMutation: false`.
- CI artifact: `public-beta-incident-readiness-<run-id>` containing only
  `infra/public-beta/evidence/incident-readiness/result.json`.
- Human protocol: copy `docs/public-beta/INCIDENT_DRILL.md` into the approved
  restricted evidence store and bind the completed copy to the same commit.

## 4. Assumptions

- Playbook structure can be verified automatically; responder availability,
  channel reachability, judgment, and recovery behavior require human proof.
- A tabletop can simulate rollback decisions, but an actual hosted rollback
  remains separately owner-authorized and must redeploy recorded prior images.
- Responder identities, contacts, channel names, protected origins, credentials,
  rider/tester data, and private monitoring links stay outside Git.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/write-incident-readiness-evidence.mjs
node -e 'const fs=require("fs");const yaml=require("./contracts/node_modules/js-yaml");yaml.load(fs.readFileSync(".github/workflows/ci.yml","utf8"))'
npm --prefix contracts run validate
npm --prefix apps/web test
npm --prefix apps/web run e2e
git diff --check
```

## 6. Validation results

- TDD RED: 4/21 tests failed for exactly the missing writer, protocol, workflow,
  and structure requirements; the prior 17 tests remained green.
- TDD GREEN: 21/21 readiness tests pass.
- Structure validation reports `STRUCTURE_PASS`; writer syntax, workflow YAML
  parsing, and `git diff --check` pass.
- All conductor contract validations pass.
- Web unit tests pass 81/81 across 14 files.
- All 14 mocked-live Playwright checks pass in 47.1 seconds.
- Final PR #15 CI run `30958953291` passed 10/10 jobs for head
  `894e7ed1d0fbaac9e4b320f4b61d20c9fd842516`. Artifact
  `public-beta-incident-readiness-30958953291` matched that head, the exact
  fixed check list, pending rota/channel/tabletop state, gate ineligibility,
  no-mutation contract, valid timestamp, and privacy-safe no-URL/no-hostname
  shape. PR #15 remained draft, mergeable, and clean.
- All latest-head GitHub CI/artifact results must remain green. The
  authoritative remote audit is retained in draft PR #15 comments.

## 7. Fixture or sample-data instructions

- No fixture or sample-data contract changed.
- CI playbook readiness does not inject incidents, send load, page responders,
  or execute rollback.
- Use only bounded synthetic/tabletop inputs in a future approved drill. Store
  its completed record in the restricted evidence system, not this repository.

## 8. Known defects

- Standalone `npx tsc --noEmit` in `apps/web` still reports pre-existing
  `ProcessEnv` typing errors in test fixtures; production builds pass.
- The pinned Next.js/npm advisories remain R24 / FU-NPM-01 / draft PR #7.
- This slice does not provision observability, responders, channels, or hosted
  infrastructure and cannot repair a finding from a future tabletop.

## 9. Known limitations

- The CI artifact proves only that the operating contract is present for a
  commit. It does not prove a reachable human or communications channel.
- The committed protocol remains `PENDING_OWNER_APPROVAL_AND_DRILL`; no human
  tabletop or live incident response has occurred.
- `eligibleForGatePass` is always false for this automated artifact. The
  incident-response gate and the other nine Stage F gates remain open.

## 10. Decisions requiring conductor approval

- Approve the environment class, operating window, restricted channel,
  responder rota/role assignments, scenario, and evidence-retention location.
- Accept the stop/rollback/recovery thresholds and decide whether the tabletop
  is simulation-only or includes separately authorized actions.
- Assign the incident commander and release owner for sign-off. Any open
  critical finding blocks the gate under this protocol.

## 11. Exact next integration step

Review draft PR #15 and its final audit, then continue the stacked Stage F
evidence work from `codex/stage-f-privacy-support-evidence`. Conductor approval
is still required before assigning the rota/channel or running the same-commit
tabletop. Do not merge to `main`, page anyone, contact a live target, execute
rollback, deploy, or mark the public beta ready from this slice.
