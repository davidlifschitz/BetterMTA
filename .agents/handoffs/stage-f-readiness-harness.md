# Stage F readiness harness workstream handoff

## 1. What was implemented

- Added a bounded Node route-search load probe that permits loopback HTTP/HTTPS,
  requires HTTPS plus exact `LOAD_TEST` confirmation for remote targets, caps
  workload/concurrency/timeouts, drains at most 1 MiB per response, and emits
  aggregate privacy-safe JSON without the target hostname or response bodies.
- Added a fail-closed public-beta evidence validator with ten exact gates,
  release-commit binding, contained regular-file checks, a 50 MiB artifact cap,
  SHA-256 verification, allowlisted gate identifiers, and deterministic
  `NOT_READY` / `READY_FOR_PUBLIC_BETA` output.
- Fixed live Next.js alias precedence so production builds exclude the fixture
  client; fixed mocked-live E2E contract-version/schema registration drift and
  the current preferred-lines close-button locator.
- Added the readiness mechanics and full mocked-live Playwright suite to CI.
- Added draft readiness, incident, limitations, risk, runbook, release-report,
  and continuation-handoff artifacts. All live gates remain pending.

## 2. Files changed

- `.github/workflows/ci.yml`
- `apps/web/next.config.ts`
- `apps/web/e2e/helpers/api-mocks.cjs`
- `apps/web/e2e/helpers/schema.cjs`
- `apps/web/e2e/live.spec.cjs`
- `infra/public-beta/README.md`
- `infra/public-beta/load-route-search.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `docs/public-beta/READINESS.md`
- `docs/public-beta/INCIDENT_PLAYBOOK.md`
- `docs/public-beta/LIMITATIONS.md`
- `docs/public-beta/evidence-template.json`
- `docs/PROJECT_FILE_INDEX.md`
- `docs/RELEASE_GATE_REPORT.md`
- `docs/RISK_REGISTER.md`
- `docs/RUNBOOKS.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-readiness-harness.md`

## 3. Public interfaces and schemas

- New operator CLI:
  `node infra/public-beta/load-route-search.mjs --base-url <origin>` with bounded
  `--requests`, `--concurrency`, `--warmup`, `--p95-ms`,
  `--max-error-rate`, `--timeout-ms`, and `--fixture` options. Remote execution
  additionally requires `--confirm-target LOAD_TEST`.
- New validator CLI:
  `node infra/public-beta/validate-readiness.mjs --structure-only` or
  `--evidence <manifest> [--repo-root <root>] [--expected-commit <sha>]`.
- Evidence schema version 1 requires release metadata and exactly these gates:
  `hosted_private_beta`, `load_p95`, `preview_deployment`,
  `production_rollback`, `accessibility_core_flow`, `incident_response`,
  `public_origin_tls`, `limitations_copy`, `privacy_support_approval`, and
  `claims_discipline`.
- No HTTP API, OpenAPI, JSON Schema, route-ranking, or shared contract changed.

## 4. Assumptions

- Stage F load evidence targets an owner-authorized public HTTPS route API; the
  probe sends no credentials and does not support protected private origins.
- Route p95 remains below 2,000 ms under the separately approved beta workload.
- Runtime TLS and security headers may be supplied at the edge, so they require
  live verification rather than a repository-only claim.
- The Stage D branch remains the required base and is not merged or deployed by
  this workstream.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
git diff --check
npm --prefix contracts run validate
npm --prefix apps/web test
NEXT_PUBLIC_API_MODE=live \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 \
  npm --prefix apps/web run build
NEXT_PUBLIC_API_MODE=live \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 \
  npm --prefix apps/web run verify:no-fixtures
npm --prefix apps/web run e2e
```

The changed-file high-confidence scan also checks for private keys, common
provider tokens, authorization values, and credential-bearing URLs without
printing matched values.

## 6. Validation results

- Readiness harness: **9/9 passed**.
- Structure validator: **PASS**; explicitly did not assert release readiness.
- Contract schemas/fixtures: **PASS**.
- Web unit/integration: **14 files, 81 tests passed**.
- Live production build: **PASS**.
- Fixture marker scan: **0 markers** in emitted live client chunks.
- Playwright mocked-live suite: **12/12 passed** in 50.6 seconds, including
  keyboard-only, mobile 44 px controls, stale/schedule/error honesty,
  serious/critical axe scans, and fixture exclusion.
- Changed-file high-confidence secret scan: **17 files, 0 hits** before this
  handoff was added; rerun at final verification.
- `git diff --check`: initial two edited Markdown hard-break warnings were
  fixed; final rerun remains part of publication verification.
- Draft PR #10 is open against `codex/stage-d-private-beta-prep`; remote CI is
  pending on the final branch tip.

## 7. Fixture or sample-data instructions

- The load probe defaults to
  `contracts/fixtures/routes/request-depart-now.json`; use only approved,
  synthetic/place-ID input and never put rider coordinates or protected data in
  a committed fixture.
- Playwright runs the live client against local mocked API responses. This is
  regression and accessibility evidence, not hosted-release evidence.
- Start real release evidence from
  `docs/public-beta/evidence-template.json`. Keep every gate `pending` until a
  real, owner-reviewed artifact is captured for the exact release commit.

## 8. Known defects

- No new functional defect is known in this slice.
- Existing high/critical npm advisory remediation remains tracked separately as
  FU-NPM-01 / draft PR #7 and was intentionally not mixed into this branch.

## 9. Known limitations

- Public beta remains `NOT_READY`.
- No hosted private-beta operation, production load run, preview deployment,
  live rollback, human accessibility review, active incident rota, public
  origin/TLS/header check, policy approval, or limitations publication occurred.
- The load probe is intentionally unauthenticated and cannot test an Access-
  protected private origin.
- Structure-only CI and synthetic manifest tests prove mechanics only.
- Browser accessibility automation does not replace human screen-reader,
  zoom/reflow, motion, or cognitive review.

## 10. Decisions requiring conductor approval

- Merge order: Stage D draft PR #9 before this stacked Stage F branch.
- Any preview/production deployment or remote load target and workload.
- Incident owner/rota/channel, public URL, limitations copy, privacy/support
  approval, and the final public-beta evidence/status decision.
- Any Stage E or Stage G feature work, which remains ADR-gated.

## 11. Exact next integration step

Require every CI job on draft PR #10 to pass, then merge only after the Stage D
base and this stacked PR receive owner approval. The next external action is
not automatic: after owner merge/authorization, execute Stage D hosted
activation and capture its immutable release/rollback evidence; only then
collect the remaining Stage F gate artifacts for one exact commit.
