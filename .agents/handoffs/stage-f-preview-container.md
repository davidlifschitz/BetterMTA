# Stage F production-container preview handoff

**Branch:** `codex/stage-f-preview-container`
**Parent:** `codex/stage-f-public-origin-verifier` at `cebb79c`
**Status:** Implemented and locally proven; GitHub CI artifact review pending
**Public-beta status:** `NOT_READY`

## 1. What was implemented

- A `public-beta-preview` CI job that builds the real production web Dockerfile,
  starts the resulting image only on runner-local loopback, runs the existing
  14 mocked-live core-flow/header/accessibility checks against the container,
  writes commit/image-bound evidence, uploads bounded artifacts, and cleans up.
- A fail-closed preview evidence writer with privacy-safe fixed errors.
- A loopback-only Playwright external-base mode that bypasses its local Next
  build when CI supplies the already-running container.
- External-container fixture verification that scans JavaScript chunks served
  by the running image while preserving the existing full local filesystem scan.
- Stage F readiness, release-gate, risk, tooling, and continuation updates. R32
  prevents treating this runner-local proof as hosted/public-platform evidence.

## 2. Files changed

- `.github/workflows/ci.yml`
- `apps/web/e2e/live.spec.cjs`
- `apps/web/playwright.config.ts`
- `infra/public-beta/write-preview-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `infra/public-beta/README.md`
- `docs/public-beta/READINESS.md`
- `docs/RISK_REGISTER.md`
- `docs/RELEASE_GATE_REPORT.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-preview-container.md`

## 3. Public interfaces and schemas

- CLI: `node infra/public-beta/write-preview-evidence.mjs --release-commit
  <40-lowercase-hex> --image-id <sha256:64-lowercase-hex> --smoke-status pass`.
- Successful JSON fields: `schemaVersion`, `status`, `previewClass`,
  `releaseCommit`, `imageId`, `smokeStatus`, `productionMutation`,
  `externalReachabilityVerified`, and `generatedAt`.
- Playwright environment: `BETTERMTA_E2E_EXTERNAL_BASE` accepts only the exact
  runner-local origin `http://127.0.0.1:3100`; other values fail with a fixed
  non-reflecting error.
- CI artifact: `public-beta-preview-<run-id>` containing the preview result JSON
  and Playwright failure evidence when present.

## 4. Assumptions

- GitHub-hosted Ubuntu runners provide Docker and permit loopback port binding.
- `apps/web/Dockerfile` remains the production image contract and continues to
  run the full `verify:no-fixtures` scan during live-mode builds.
- `http://127.0.0.1:3999` is a compile-time test origin only; Playwright route
  interception satisfies those browser requests and no API listener is started.

## 5. Validation commands

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/write-preview-evidence.mjs
node -e 'const fs=require("fs");const yaml=require("./contracts/node_modules/js-yaml");yaml.load(fs.readFileSync(".github/workflows/ci.yml","utf8"))'
cd apps/web && npx playwright test --list --project=mocked-live
cd apps/web && BETTERMTA_E2E_EXTERNAL_BASE=http://127.0.0.1:3100 npx playwright test --list --project=mocked-live
docker build --file apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3999 --build-arg NEXT_PUBLIC_API_MODE=live --build-arg NEXT_PUBLIC_FLAG_FEEDBACK=false --build-arg NEXT_PUBLIC_FLAG_ADDRESS_POI=false --tag bettermta-preview-local:cebb79c .
docker run --detach --name bettermta-preview-local --publish 127.0.0.1:3100:3000 bettermta-preview-local:cebb79c
cd apps/web && BETTERMTA_E2E_EXTERNAL_BASE=http://127.0.0.1:3100 npm run e2e
```

## 6. Validation results

- TDD RED: four preview/writer/structure tests failed for missing behavior; the
  API-origin regression failed against an empty build arg; the original
  container E2E run reproduced the mock-origin mismatch and host `.next` scan.
- TDD GREEN: 17/17 readiness tests pass; structure validation passes; writer
  syntax and workflow YAML parsing pass.
- Playwright configuration lists 14 tests in default and external-container
  modes and rejects a remote origin without reflecting it.
- Corrected production Docker build passes and returns a valid immutable
  `sha256:` image ID.
- All 14 mocked-live Playwright checks pass against the running container in
  18.1 seconds. Local evidence reports `PASS`, valid image shape, and no
  URL/hostname fields.
- After the final documentation/E2E edit, the Docker build stage and an in-image
  full fixture scan pass. Two full runtime-image rebuild attempts then stopped
  in Debian `apt-get` on an upstream ARM64 `libssl3` hash mismatch before app
  assembly; the earlier full runtime image is the one used for the 14/14 proof.
  The independent GitHub runner job remains the final runtime-image gate.
- First PR CI run `30955999872` passed 9/10 jobs. The new preview job built and
  started the container but its schema-backed Playwright tests lacked
  `contracts/node_modules` and failed to resolve Ajv. A TDD regression now
  requires `npm --prefix contracts ci` inside that job, and the job installs
  both lockfile-pinned dependency trees. The replacement CI run is required.
- Replacement CI run `30956256407` passed 10/10 jobs and retained a valid,
  privacy-safe image/smoke artifact. Post-run provenance inspection caught that
  the artifact used GitHub's synthetic pull-request merge SHA instead of the
  reviewed head commit. A TDD regression now binds the image tag and evidence to
  `github.event.pull_request.head.sha`, with `github.sha` only as the push-event
  fallback. A final replacement CI run and artifact audit are required.
- The explicit local preview container and image tag were removed after proof.

## 7. Fixture or sample-data instructions

- The preview image is live mode with fixture implementation excluded.
- The existing Playwright route mocks intercept the baked runner-local API
  origin. Do not start a service on port 3999 for this job.
- Keep the Docker build's full fixture scan and the external E2E served-chunk
  scan; they cover different layers.

## 8. Known defects

- Standalone `npx tsc --noEmit` in `apps/web` still reports pre-existing
  `ProcessEnv` typing errors in test fixtures. The production Docker/Next build
  passes; this slice did not broaden into unrelated test typing cleanup.
- The final local full-runtime rebuild is temporarily blocked by a repeated
  Debian ARM64 mirror checksum mismatch for `libssl3`; package integrity checks
  were not bypassed. The Docker build stage and fixture scan pass, and an earlier
  full runtime image passed all 14 container checks.
- The known pinned Next.js/npm advisories remain R24 / FU-NPM-01 / draft PR #7.

## 9. Known limitations

- No hosted or public preview was created. No Fly, edge, CDN, DNS, TLS, external
  reachability, production capacity, or rollback behavior was exercised.
- A green CI artifact still requires approved-commit and owner review before it
  can support the preview gate. It cannot close the other nine Stage F gates.
- GitHub runner and Docker runtime drift still require the stacked PR's CI job
  to pass; local Docker proof is not a substitute for that result.

## 10. Decisions requiring conductor approval

- Confirm that runner-local production-container evidence satisfies the
  CI-created preview portion of the Stage F gate after a green approved-commit
  artifact, or require a separately hosted preview class.
- Approve any later hosted preview, cloud credentials, public target, capacity
  run, or status transition. This branch authorizes none of them.

## 11. Exact next integration step

Publish this branch as a draft PR targeting
`codex/stage-f-public-origin-verifier`, require every CI job including
`public-beta-preview` to pass, and review its retained commit/image artifact.
Do not merge to `main`, deploy, or mark the public beta ready from this slice.
