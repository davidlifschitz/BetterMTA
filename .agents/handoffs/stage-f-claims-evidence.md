# Stage F claims/publication-readiness handoff

**Branch:** `codex/stage-f-claims-evidence`  
**Parent:** `codex/stage-f-privacy-support-evidence`  
**Status:** Implemented locally; fresh child-head CI/artifact audit pending  
**Public-beta status:** `NOT_READY`

## 1. What was implemented

- A Node-built-ins-only scanner for the fixed publishable surfaces
  `apps/web/src` and `docs/public-beta/LIMITATIONS.md`.
- Deny-by-default detection for named-competitor references, with fixed
  non-reflecting errors and `--repo-root` support for isolated tests. Only the
  explicit non-claim and fixed neutral MTA attribution/implementation copy are
  allowed; comparative variants such as “compared with,” “versus,” “arrives
  sooner,” “takes less time,” “better,” and “outperforms” fail closed. Neutral
  MTA allowances are complete known constructs tied to statement/comment
  boundaries; arbitrary neutral fragments inside comparisons are not removed.
- Verification of the three benchmark methodology contracts as regular,
  nonempty, non-symlink files with stable required markers.
- Verification of the explicit public non-claim in both canonical files,
  `docs/public-beta/LIMITATIONS.md` and
  the actual returned JSX of `apps/web/src/app/limitations/page.tsx`; unused
  JSX, tests, and comments do not satisfy the rendered-page check. Straight and
  curly contraction forms are accepted. `LimitationsPage` must contain exactly
  one executable return; conditional or unreachable extra returns fail closed.
  Return words and nested callback returns inside the captured JSX expression
  are skipped as component-control-flow returns. The internal route-set
  baseline wording and `next/font/google` reference remain unchanged. Signature
  discovery masks comment/string/template contents while preserving source
  positions, so non-executable fake signatures cannot replace the component.
- A commit-bound claims-readiness writer that keeps publication review pending,
  comparative claims unauthorized, gate passage ineligible, and production
  mutation false.
- CI wiring for `scan.json`, `result.json`, and the retained
  `public-beta-claims-<run-id>` artifact using the pull-request head SHA or push
  SHA expression for both checkout and evidence binding.
- A human publication-review protocol, readiness structure checks, risk R36,
  and continuation/report/readiness documentation updates.

## 2. Files changed

- `infra/public-beta/scan-public-claims.mjs`
- `infra/public-beta/write-claims-readiness-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `.github/workflows/ci.yml`
- `docs/public-beta/PUBLICATION_REVIEW.md`
- `docs/public-beta/READINESS.md`
- `infra/public-beta/README.md`
- `docs/RISK_REGISTER.md`
- `docs/RELEASE_GATE_REPORT.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-privacy-support-evidence.md`
- `.agents/handoffs/stage-f-claims-evidence.md`

## 3. Public interfaces and schemas

- Scanner CLI: `node infra/public-beta/scan-public-claims.mjs` or
  `node infra/public-beta/scan-public-claims.mjs --repo-root <isolated-root>`.
- Scanner pass JSON: `schemaVersion: 1`, `status: "PASS"`,
  `scanClass: "public-copy-named-competitor-claims"`, numeric `filesScanned`,
  `prohibitedMatches: 0`, `nonClaimCopyPresent: true`, the three fixed
  `methodologyFiles`, and `generatedAt`.
- Claims writer CLI: `node infra/public-beta/write-claims-readiness-evidence.mjs
  --release-commit <40-lowercase-hex> --scan-status pass`.
- Writer state: `AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING`,
  `evidenceClass: "ci-claims-discipline-readiness"`,
  `gateId: "claims_discipline"`, fixed four-item `checks`,
  `publicationReviewStatus: "pending"`,
  `comparativeClaimsStatus: "not_authorized"`,
  `eligibleForGatePass: false`, and `productionMutation: false`.
- CI writes `infra/public-beta/evidence/claims/scan.json` and
  `infra/public-beta/evidence/claims/result.json`, then uploads
  `public-beta-claims-<run-id>`.
- Human protocol: `docs/public-beta/PUBLICATION_REVIEW.md` remains
  `PENDING_PUBLICATION_REVIEW` until same-commit review and sign-off.

## 4. Assumptions

- Public-copy scanning is intentionally limited to the two fixed publishable
  surfaces; benchmark methodology files are validated as regular, nonempty,
  non-symlink files with stable required markers, not treated as comparative
  results.
- Existing route-set baseline wording is an internal constrained comparison and
  remains unchanged.
- The inherited parent privacy/support artifact is final parent evidence only;
  it is not claims evidence and a child head requires a fresh CI audit.
- No secrets, hostnames, URLs, rider data, contacts, or private evidence are
  needed for this slice.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/scan-public-claims.mjs
node --check infra/public-beta/write-claims-readiness-evidence.mjs
node --check infra/public-beta/validate-readiness.mjs
npm --prefix contracts run validate
npm --prefix apps/web test
npm --prefix apps/web run build
git diff --check
```

## 6. Validation results

- TDD RED: the six-finding regression set and follow-up review regressions
  exposed comparative variants, methodology integrity, symlinks, canonical
  non-claim anchoring, contraction forms, exact checkout/ref binding, neutral
  fragment wrapping, comment-only rendered-page copies, unused JSX outside the
  component return, multiple executable returns in the component body, return
  text/callback returns inside the captured JSX expression, and fake signatures
  in non-executable source.
- TDD GREEN: the full readiness suite passes 42/42, including the newline-
  spanning hostile-claim regression, comparative-variant and neutral-wrapper
  tables, empty/directory/malformed methodology cases, symlink cases,
  canonical anchoring, line/block comment rejection, unreachable JSX rejection,
  single-return structural rejection, JSX return-text/callback skipping,
  contraction forms, and checkout/ref identity.
- Current structure output is `STRUCTURE_PASS`; all three changed Node scripts
  pass `node --check`; workflow YAML parses; and `git diff --check` passes.
- `npm run validate` in `contracts` is blocked with exit 1 because `ajv`,
  `ajv-formats`, and `js-yaml` are absent. `npm test` and `npm run build` in
  `apps/web` are blocked with exit 127 because `vitest` and `next` are absent.
  No dependency installation was performed.
- No remote CI run, publication review, deployment, or production mutation has
  been performed by this workstream. Parent privacy/support final CI evidence
  remains the audit retained in draft PR #16 comments.

## 7. Fixture or sample-data instructions

- No fixture, GTFS, route, benchmark corpus, or sample-data contract changed.
- The hostile scanner test copies the existing public surfaces into an ephemeral
  temporary root and adds a non-committed hostile line; it does not alter the
  repository copy.
- CI scans committed copy and verifies committed methodology files only. No
  live provider, account, deployment, or rider data is contacted.

## 8. Known defects

- R36 remains open: deny-by-default scanning and fixed comparative-variant
  coverage reduce phrasing gaps but cannot prove that every future semantic
  variant is covered; human review is still required.
- The child-head CI artifact audit has not yet been run, so remote workflow
  behavior and uploaded artifact contents remain unverified locally.

## 9. Known limitations

- A passing scan proves only fixed-surface copy discipline for one commit; it
  does not prove benchmark quality, public reachability, legal attribution,
  human approval, publication, or public-beta readiness.
- `comparativeClaimsStatus` remains `not_authorized` and the claims gate remains
  pending. No named-competitor superiority statement may be published from
  this slice.
- The publication protocol is a draft record until a reviewer completes the
  inventory, claims classification, benchmark, attribution, findings, and
  sign-off fields.

## 10. Decisions requiring conductor approval

- Select the release commit and approve the human publication reviewer(s),
  product owner, and any legal/attribution reviewer.
- Decide whether any exact comparative statement is needed; if so, approve its
  methodology, corpus, comparator treatment, and reproducible evidence before
  authorizing it.
- Decide publication disposition only after the same-commit CI artifact and
  completed review are available. Do not mark `claims_discipline` passed from
  the automated writer.

## 11. Exact next integration step

Run a fresh full CI check on the uncommitted child head through the approved
orchestrator, audit `public-beta-claims-<run-id>` against that head, then obtain
same-commit human publication review using
`docs/public-beta/PUBLICATION_REVIEW.md`. Keep the claims gate pending and do
not merge to `main`, deploy, publish copy, authorize comparative claims, change
secrets, expand a cohort, or perform live Fly/auth operations from this slice.
