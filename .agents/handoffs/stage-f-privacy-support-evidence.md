# Stage F privacy/support-evidence handoff

**Branch:** `codex/stage-f-privacy-support-evidence`  
**Parent:** `codex/stage-f-incident-evidence` at `894e7ed`  
**Status:** Implemented locally; latest CI artifact audit is retained in draft PR #16 comments
**Public-beta status:** `NOT_READY`

## 1. What was implemented

- A fail-closed writer for commit-bound privacy/support readiness evidence.
- CI wiring that runs after structure validation and retains the bounded result
  for 14 days.
- A restricted same-commit approval protocol covering deployed configuration,
  policy/provider disclosure, retention/deletion, support operations, privacy
  controls, findings, and owner/legal/operational sign-off.
- Structure validation over the existing private-beta policy, support workflow,
  ledger template, privacy-safe logging helpers/tests, forbidden-log-fields
  contract, and security guardrails.
- TDD and documentation that prevent green control mechanics from being
  presented as publication, deployed retention proof, active support, or gate
  passage. R35 records that risk.

## 2. Files changed

- `.github/workflows/ci.yml`
- `infra/public-beta/write-privacy-support-readiness-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `infra/public-beta/README.md`
- `docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md`
- `docs/public-beta/READINESS.md`
- `docs/RISK_REGISTER.md`
- `docs/RELEASE_GATE_REPORT.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-incident-evidence.md`
- `.agents/handoffs/stage-f-privacy-support-evidence.md`

## 3. Public interfaces and schemas

- CLI: `node infra/public-beta/write-privacy-support-readiness-evidence.mjs
  --release-commit <40-lowercase-hex> --controls-status pass`.
- Successful JSON fields: `schemaVersion`, `status`, `evidenceClass`, `gateId`,
  `releaseCommit`, `checks`, `policyApprovalStatus`,
  `retentionEnforcementStatus`, `supportChannelStatus`, `responseOwnerStatus`,
  `eligibleForGatePass`, `productionMutation`, and `generatedAt`.
- Fixed checks: `policy-and-provider-disclosure`,
  `retention-and-deletion-contract`, `privacy-safe-logging-controls`, and
  `support-intake-and-response`.
- Fixed state: `CONTROLS_PASS_APPROVAL_CHANNEL_PENDING`, policy
  `pending_owner_legal`, retention `pending_deployed_evidence`, support channel
  and response owner `pending_owner_approval`, `eligibleForGatePass: false`,
  and `productionMutation: false`.
- CI artifact: `public-beta-privacy-support-<run-id>` containing only
  `infra/public-beta/evidence/privacy-support/result.json`.
- Human protocol: copy `docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md` into the
  approved restricted evidence store and bind it to the same commit.

## 4. Assumptions

- Checked-in policy/support documents and runtime privacy tests can prove
  readiness mechanics, not actual deployed provider/retention/support state.
- Owner/legal/privacy review remains a human decision; this implementation does
  not provide legal advice or publish a policy.
- Contacts, identities, channel names, provider accounts/endpoints, protected
  origins, credentials, rider data, and private logs stay outside Git.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/write-privacy-support-readiness-evidence.mjs
node -e 'const fs=require("fs");const yaml=require("./contracts/node_modules/js-yaml");yaml.load(fs.readFileSync(".github/workflows/ci.yml","utf8"))'
npm --prefix contracts run validate
npm --prefix apps/web test
npm --prefix apps/web run e2e
git diff --check
```

## 6. Validation results

- TDD RED: 4/23 tests failed for exactly the missing writer, approval protocol,
  workflow, and structure requirements; the prior 19 tests remained green.
- First GREEN run passed 22/23 and exposed one Markdown-emphasis mismatch in the
  validator's private-channel pattern; the control was present and the pattern
  was corrected.
- TDD GREEN: 23/23 readiness tests pass.
- Structure validation reports `STRUCTURE_PASS`; writer syntax, workflow YAML
  parsing, and `git diff --check` pass.
- All conductor contract validations pass.
- Web unit tests pass 81/81 across 14 files.
- All 14 mocked-live Playwright checks pass in 45.2 seconds.
- The first two web dependency installs stopped on host `ENOSPC`. A dry-run
  confirmed only ignored dependency paths; `git clean -fdX` removed the
  accessibility/incident worktrees' reproducible web+contract `node_modules`
  and the current partial web tree, recovering 1.6 GiB. The current lockfile
  install then passed. No source, evidence, Git data, or live state was removed.
- Latest-head GitHub CI/artifact results must remain green. The authoritative
  remote audit is retained in draft PR #16 comments. This is the final parent
  privacy/support CI evidence for the stacked workstream; it is not claims
  evidence and does not substitute for a fresh CI run on a later child head.

## 7. Fixture or sample-data instructions

- No fixture or sample-data contract changed.
- CI reads committed control surfaces only; it does not query provider accounts,
  log stores, support channels, or live rider data.
- Store the completed approval record and deployed evidence in the approved
  restricted system, not this repository.

## 8. Known defects

- Standalone `npx tsc --noEmit` in `apps/web` still reports pre-existing
  `ProcessEnv` typing errors in test fixtures; production builds pass.
- The pinned Next.js/npm advisories remain R24 / FU-NPM-01 / draft PR #7.
- This slice does not configure deployed log retention, deletion tooling,
  provider disclosure, support access, or alert delivery.

## 9. Known limitations

- The CI artifact proves only that policy/support/control contracts are present
  for a commit; it does not prove a published or legally approved policy.
- The committed protocol remains
  `PENDING_OWNER_LEGAL_AND_OPERATIONAL_APPROVAL`; deployed retention/deletion,
  private support reachability, and response-owner assignment were not tested.
- `eligibleForGatePass` is always false for this automated artifact. The
  privacy/support gate and the other nine Stage F gates remain open.

## 10. Decisions requiring conductor approval

- Name the policy/legal/privacy reviewers and approve the final publishable
  policy, effective date, provider disclosures, and support route.
- Authorize the environment and evidence needed to verify deployed retention,
  deletion, access control, enabled features/providers, and cache/PlaceRef
  behavior.
- Approve the private support channel, hours, primary/backup response owners,
  escalation access, and restricted ledger/evidence store.

## 11. Exact next integration step

Keep draft PR #16 stacked on `codex/stage-f-incident-evidence`; require all ten
CI jobs and the latest `public-beta-privacy-support-<run-id>` head-commit audit
to remain green. The stacked claims/publication-readiness child must retain a
new head-commit audit for its own `public-beta-claims-<run-id>` artifact; the
parent privacy artifact remains only its final inherited control evidence. Then
obtain owner/legal/operational approval before publishing policy, claiming
deployed retention/deletion, or activating support. Do not merge to `main`,
contact live providers/support channels, change secrets, deploy, or mark the
public beta ready from this slice.
