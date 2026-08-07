# Stage F load-evidence handoff

**Worktree:** `/Users/thebiglipper/Developer/bettermta-stage-f-load-evidence`

**Branch:** `codex/stage-f-load-evidence`

**Status:** Implemented and locally validated; stacked review/publication evidence pending

**Public-beta status:** `NOT_READY`

## 1. What was implemented

- Hardened the route-search load probe with required full lowercase release-commit
  binding, complete canonical `/v1/status` checks before and after measured
  load, stable-only SHA-256 snapshot fingerprints, redirect refusal, 1 MiB
  pre-parse and serialized request-body bounds, all-request finite monotonic
  latency accounting plus slow-failure rejection, fixed non-reflecting
  failures, and preserved request/concurrency/timeout/response-body limits.
- Added a probe-consuming readiness writer that validates commit, exact
  top-level and nested probe schemas, synthetic status identity, stable
  snapshot, metrics, threshold/failure-kind integrity, and local target class
  before emitting deliberately pending, gate-ineligible evidence.
- Added a Node-built-ins-only runner that starts a deterministic loopback fixture
  on an ephemeral port, executes the real probe for 100 measured requests,
  serializes in-process runs before output mutation, passes explicit absolute
  child cwd/script paths, resolves and anchors the real output parent by
  device/inode, repairs verified cwd-anchor changes after callbacks, completes
  and validates an exact-inventory sibling stage, synchronously revalidates
  bounded no-follow JSON through the writer’s canonical validator and deep
  cross-file projection equality immediately before one final directory-entry
  rename, rejects unsafe final-path swaps without traversing substituted
  targets, cleans partial artifacts on every injected
  probe/writer/validation/write/publication/post-step failure, invokes the real
  writer, and shuts down the fixture cleanly.
- Wired `public-beta-readiness` to the exact checked-out head SHA and retained
  the synthetic load artifact for 14 days before the human-pending writers.
- Added RED→GREEN tests, structure checks, R37, readiness/report/README
  documentation, full-roadmap continuation, and the parent claims handoff’s
  final PR #17 audit-evidence record.

## 2. Files changed

- `infra/public-beta/load-route-search.mjs`
- `infra/public-beta/write-load-readiness-evidence.mjs`
- `infra/public-beta/run-synthetic-load-evidence.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `.github/workflows/ci.yml`
- `infra/public-beta/README.md`
- `docs/public-beta/READINESS.md`
- `docs/RELEASE_GATE_REPORT.md`
- `docs/RISK_REGISTER.md`
- `.agents/handoffs/codex-full-roadmap-continuation.md`
- `.agents/handoffs/stage-f-claims-evidence.md`
- `.agents/handoffs/stage-f-load-evidence.md`

## 3. Public interfaces and schemas

- Probe CLI requires `--base-url` and `--release-commit <40-lowercase-hex>`;
  remote targets additionally require HTTPS and `--confirm-target LOAD_TEST`.
- Probe output is schema version 1 and includes `releaseCommit`, `dataMode`,
  `snapshotFingerprint`, `snapshotStable`, `statusChecks`, bounded metrics,
  thresholds, and fixed failure kinds without origins, bodies, or status tokens.
- Writer CLI is
  `node infra/public-beta/write-load-readiness-evidence.mjs --probe <path> --release-commit <sha>`.
  Its fixed status is `SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING`, with
  `evidenceClass: "ci-load-p95-readiness"`, `gateId: "load_p95"`,
  `probeClass: "synthetic-local"`, `targetApprovalStatus: "pending"`,
  `dataSnapshotStatus: "synthetic"`, `eligibleForGatePass: false`,
  `betaCapacityEvidence: false`, and `productionMutation: false`.
- Runner CLI is
  `node infra/public-beta/run-synthetic-load-evidence.mjs --release-commit <sha> --output-dir <absolute-empty-dir>`.
  It writes only `probe.json` and `result.json`.
- CI artifact name is `public-beta-load-readiness-${{ github.run_id }}` with
  14-day retention.

## 4. Assumptions

- `/v1/status` follows the canonical `StatusResponse` schema in
  `contracts/openapi/bettermta-v1.yaml`; stable identity is limited to
  contract version, data mode, dataset version, and optional realtime snapshot
  ID. Realtime age, degraded, and messages are validated but excluded from the
  fingerprint.
- The synthetic fixture’s `dataMode` and dataset token are intentionally
  synthetic and do not represent the production data snapshot.
- A green local fixture run proves mechanics only. The approved HTTPS target,
  real data snapshot, hosted capacity, and owner review remain separate.
- Existing product routing invariant and public-beta `NOT_READY` state remain
  unchanged.

## 5. Validation commands

```bash
/Users/thebiglipper/.local/bin/node --test infra/public-beta/tests/public-beta-readiness.test.mjs
/Users/thebiglipper/.local/bin/node --test --test-name-pattern='restores|anchored parent|unexpected staged' infra/public-beta/tests/public-beta-readiness.test.mjs
/Users/thebiglipper/.local/bin/node --test --test-name-pattern='serializes concurrent|cwd-changing|semantic cross-file|anchored parent' infra/public-beta/tests/public-beta-readiness.test.mjs
/Users/thebiglipper/.local/bin/node infra/public-beta/validate-readiness.mjs --structure-only
/Users/thebiglipper/.local/bin/node --check infra/public-beta/load-route-search.mjs
/Users/thebiglipper/.local/bin/node --check infra/public-beta/write-load-readiness-evidence.mjs
/Users/thebiglipper/.local/bin/node --check infra/public-beta/run-synthetic-load-evidence.mjs
/Users/thebiglipper/.local/bin/node --check infra/public-beta/validate-readiness.mjs
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); puts 'YAML_PARSE_PASS'"
/Users/thebiglipper/.local/bin/node infra/public-beta/run-synthetic-load-evidence.mjs --release-commit "$(git rev-parse HEAD)" --output-dir /tmp/bettermta-load-evidence-check
git diff --check
```

The workflow YAML was parsed locally with the available YAML parser without
installing dependencies. Existing contract/web dependency checks were not
installed or broadened.

## 6. Validation results

- TDD RED: the five re-review regression areas were reproduced before fixes:
  redirect escape, oversized fixture/request body, non-monotonic percentiles,
  incomplete failure-injection coverage, and final-path symlink-swap publication.
- TDD GREEN: the full public-beta readiness suite passes 74/74 with Node
  v24.14.0, including redirect no-follow, canonical-status, degraded-health,
  all-request latency, exact-schema, 1 MiB boundary, atomic-directory
  publication, anchored-parent identity, regular-file/symlink/parent-swap
  cleanup, post-callback inventory/result-schema validation, serialized-run and
  cwd-anchor recovery, writer-canonical cross-file equality, every failure
  phase, no-origin regressions, the absolute CI/README output-path contract,
  and whole-entry quarantine of non-empty final output directories.
- Focused publication-boundary regressions cover concurrency, cwd recovery,
  semantic mutations, symlink, regular-file, renamed/replaced-parent,
  post-callback unexpected-file/result-schema changes, redirect escape, fixture
  bounds, all injected cleanup phases, and the absolute workflow-path and
  non-empty-final-output regressions.
- `validate-readiness.mjs --structure-only` returns `STRUCTURE_PASS`.
- All four changed-script Node syntax checks return exit 0; Ruby Psych returns
  `YAML_PARSE_PASS` for `.github/workflows/ci.yml`; and `git diff --check`
  returns exit 0.
- The real runner/probe/writer output-shape path returns exit 0 with 100
  measured requests, exactly `probe.json` and `result.json`, synthetic pending
  state, and no loopback origin in either artifact.
- Dependency-only checks were attempted without installation:
  `npm --prefix contracts run validate` exits 1 because `ajv`, `ajv-formats`,
  and `js-yaml` are missing; `npm --prefix apps/web test` and
  `npm --prefix apps/web run build` exit 127 because `vitest` and `next` are
  missing. No dependency installation was performed.
- No dependency installation, remote CI run, PR update, deployment, secret,
  scaling, cohort, production, or main-merge action was performed.

## 7. Fixture or sample-data instructions

- The runner’s fixture is created in-process and binds only to loopback on an
  ephemeral port; it does not contact a network target.
- The probe’s existing route request fixture remains a bounded local request
  body: raw fixture input and serialized body are each capped at exactly 1 MiB,
  with the boundary accepted and oversize input rejected before fetch. No GTFS,
  realtime, rider, credential, or production snapshot data is written to the
  evidence artifact.
- CI creates a fresh empty evidence directory and uploads only the two runner
  outputs.

## 8. Known defects

- The synthetic artifact cannot establish real beta capacity or close `load_p95`;
  R37 remains open until owner-approved target/data evidence exists.
- The runner anchors the real parent directory, verifies device/inode identity,
  serializes in-process calls, passes explicit absolute child cwd/script paths,
  uses relative stage/output operations, fstat-verifies and repairs cwd changes,
  and restores the original cwd. Parent
  rename/replacement failures clean and restore the output entry inside the
  anchored original parent without mutating the replacement path; the requested
absolute path can be temporarily unavailable. Final regular-file, symlink, and
non-empty directory entries are atomically quarantined as opaque entries;
symlink entries are not followed, and the empty real output directory is
established before quarantine cleanup. Deterministic
  in-process mutation windows are closed, while same-UID external kernel-level
  races between final validation and rename remain outside pure Node’s absolute
  exclusion boundary. The writer’s exported semantic validator and canonical
  result projection are the source of truth; final files must deep-match those
  in-memory canonical objects, including ISO-UTC timestamps, fingerprints,
  counts, metrics, thresholds, status checks, and flags.
- The remote target path is implemented but intentionally unexecuted in this
  workstream; HTTPS, explicit authorization, and owner review remain required.
- Parent PR #17 claims audit evidence is retained as parent-owned context and
  was not re-run or remotely verified by this load slice.

## 9. Known limitations

- Snapshot identity validation is intentionally allowlisted and token-based; it
  does not independently attest to the correctness of a provider’s dataset.
  Redirects are never followed, and redirect attempts are classified as fixed
  failures rather than evidence from a second origin.
- p50/p95/p99 are measured over all route request durations using the existing
  bounded percentile convention and must be finite, nonnegative, and monotonic;
  slow failed requests are separately rejected at the p95 threshold. Upstream
  outage fallback behavior remains excluded by the documented gate protocol.
- Publication relies on a complete sibling stage and one directory-entry rename;
  on the local macOS platform a final-path swap fails closed and is restored as
  an empty real directory, with no writes through the symlink target. Platform
  behavior should be rechecked if this protocol is ported elsewhere.
- Structure-only validation proves mechanics and pending-state safeguards, not
  operational readiness or a public deployment.

## 10. Decisions requiring conductor approval

- Approve the real HTTPS load target, exact workload/thresholds, data snapshot,
  owner, and same-commit evidence-retention location before any remote probe.
- Decide when the approved real artifact is sufficient to review `load_p95`; do
  not promote the synthetic result or alter `NOT_READY` from this slice.
- Keep the parent claims PR #17 audit and the load artifact as separate gate
  evidence classes.

## 11. Exact next integration step

Run the full final local validation set on this child head, inspect the
generated synthetic artifact inventory, and hand the uncommitted worktree to the
owner for review. If approved later, run the real probe only against the
owner-approved HTTPS target and real data snapshot, retain privacy-safe
same-commit evidence, and have the release owner review all ten gates together.
Do not commit, push, merge, deploy, change secrets, scale, expand a cohort, or
claim beta capacity from this handoff.
