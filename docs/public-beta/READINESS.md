# Public-beta readiness

**Current status:** `NOT_READY`

This is the Stage F evidence index, not a launch approval. BetterMTA remains at
the status recorded in `docs/RELEASE_GATE_REPORT.md`. The local harness and CI
checks prove only that readiness mechanics are testable; hosted operation and
release evidence remain separate gates.

## Gate matrix

| Gate | Current evidence state | Exit evidence |
|---|---|---|
| Hosted private beta | Pending owner-authorized Stage D activation | Immutable hosted release, health/smoke evidence, approved privacy/support operation, and bounded cohort result |
| Route API load/p95 | Commit- and snapshot-bound probe plus CI synthetic loopback artifact implemented; approved target/data snapshot evidence pending | Owner-approved target and data snapshot with a privacy-safe probe artifact showing p95 under 2,000 ms and error rate within the agreed limit for the recorded release/data snapshot |
| Preview deployment | Runner-local production-container artifact proven in CI for commit `9f10e50` with 14/14 smoke checks; owner acceptance or a hosted-platform preview decision remains pending | CI-created preview from an approved commit with core-flow smoke evidence and no production mutation |
| Production rollback | Operator tooling prepared; live drill pending | Recorded prior images, executed rollback, health checks, candidate restore, elapsed time, and retained evidence |
| Core-flow accessibility | Commit-bound automated evidence mechanics are proven in CI; human review for an owner-approved release commit remains pending | Green CI artifact plus human review with no critical core-flow failures |
| Incident response | CI emits commit-bound playbook-readiness evidence; rota/channel approval and tabletop drill remain pending | Named on-call-lite owner, reachable private channel, drill evidence, and accepted stop/rollback thresholds |
| Public origin/TLS | Commit-bound, privacy-safe verifier implemented and locally tested; approved public target and external evidence pending | Approved public URL, valid TLS, runtime headers verified end to end, public health checks, limitations link, public DNS/CDN review, and retained owner-reviewed artifact |
| Limitations copy | Candidate `/limitations` route and planner-footer link pass local production E2E; approval/publication pending | Product/legal/owner approval and verified placement in the public core flow |
| Privacy/support | CI emits commit-bound policy/control readiness evidence; owner/legal approval, deployed retention proof, private channel, and response owners remain pending | Approved policy, retention controls, support channel, and response ownership |
| Claims discipline | Commit-bound named-competitor scan and pending-only writer present; publication review pending | Release copy review plus benchmark-backed methodology for any comparative statement; otherwise no comparative claim |

## Locally verifiable preparation

- Live-mode web builds must exclude fixture implementation markers.
- Playwright covers station selection, selected-line outcomes, stale/degraded
  honesty, error states, keyboard-only operation, mobile target sizing, and
  serious/critical WCAG scans.
- Production-mode Playwright verifies the limitations route and footer link,
  fresh request nonces, a nonce-based script policy with no script
  `unsafe-inline`/`unsafe-eval`, baseline response headers, and no browser CSP
  console errors on the tested pages.
- The `public-beta-preview` CI job builds the real production web Dockerfile,
  starts that immutable image on runner-local loopback, runs all 14 mocked-live
  checks against the container, scans its served chunks for fixture markers, and
  retains privacy-safe commit/image evidence without contacting a cloud host.
- After the mocked-live suite passes, CI writes commit-bound accessibility
  evidence for the keyboard-only flow, mobile 44 px targets, and axe WCAG 2 A/AA
  scan. It is deliberately labeled `AUTOMATED_PASS_HUMAN_PENDING` and cannot
  pass the gate until the retained human review records no critical core-flow
  failures for the same release commit.
- After structure validation passes, CI writes commit-bound incident-playbook
  readiness evidence. It is deliberately labeled
  `PLAYBOOK_PASS_ROTA_DRILL_PENDING`, leaves rota/channel/tabletop approval
  pending, and cannot pass the incident-response gate.
- After structure validation passes, CI also writes commit-bound
  privacy/support readiness evidence over the policy, retention/deletion,
  runtime privacy controls, and safe support workflow. It remains explicitly
  owner/legal/operational-approval pending and cannot pass the gate.
- After structure validation passes, CI scans only `apps/web/src` and
  `docs/public-beta/LIMITATIONS.md` with a deny-by-default named-competitor
  policy. Only the explicit public non-claim and fixed neutral MTA
  attribution/implementation wording are allowed; comparative variants such
  as “compared with,” “versus,” “arrives sooner,” “takes less time,” “better,”
  and “outperforms” fail with fixed non-reflecting errors. The route-set phrase
  `~N min faster than fastest baseline` and `next/font/google` remain allowed.
  Neutral MTA allowances are complete known constructs tied to statement or
  comment boundaries, so a comparison wrapping a neutral phrase still fails.
  The explicit non-claim must be anchored in both canonical limitations files;
  the page copy must be inside `LimitationsPage`’s returned JSX, not unused
  JSX, a test, or a comment. `LimitationsPage` must contain exactly one
  executable return, so conditional or unreachable extra returns fail closed.
  Return words and nested callback returns inside that returned JSX are ignored
  as component-control-flow returns. Straight or curly contraction forms are
  accepted. Signature discovery masks comments, strings, and template literals
  while preserving positions. Symlinks fail closed, and the three benchmark
  methodology contracts must be regular, nonempty files with their required
  stable markers.
- After the scan passes, CI writes commit-bound claims evidence with status
  `AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING`,
  `comparativeClaimsStatus: "not_authorized"`, and
  `eligibleForGatePass: false`. It retains `scan.json` and `result.json` as a
  privacy-safe claims artifact; this is not publication approval.
- The bounded load probe requires a full lowercase release commit and validates
  the complete canonical `/v1/status` response (including contract version,
  data mode, dataset version, realtime fields, degraded, and messages) before
  and after measured route load. Its SHA-256 snapshot fingerprint covers only
  stable contract/data/dataset/snapshot identity; realtime age, degraded state,
  and messages are excluded from identity. Invalid, extra, missing, or
  degraded status and changed snapshots fail closed. Status and route requests
  fail closed on redirects, so a checked target cannot escape to a second
  origin. Latency percentiles cover all measured requests, are finite,
  nonnegative, and monotonic, with slow failed requests independently rejected
  at the p95 threshold. The optional fixture file and serialized request body
  are each bounded to 1 MiB before parsing or network I/O. It refuses insecure
  remote targets and requires explicit confirmation before remote traffic.
- CI runs the Node-built-ins-only synthetic runner on loopback with 100 measured
  route requests, serializes in-process runs before any output mutation,
  passes explicit absolute child script/cwd paths, and resolves and anchors the
  real output parent by device/inode,
  completes and validates an exact-inventory sibling stage, and publishes it
  with one final directory-entry rename before retaining only
  `probe.json` and `result.json` in `public-beta-load-readiness-<run-id>`. Its fixed result status is
  `SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING`, with
  `probeClass: "synthetic-local"`, `dataSnapshotStatus: "synthetic"`,
  `eligibleForGatePass: false`, and `betaCapacityEvidence: false`; it is never
  beta-capacity evidence and does not close `load_p95`. The writer rejects
  unexpected probe keys, non-monotonic percentiles, or unexpected nested
  threshold/status/failure fields. Runner failures clean only the owned stage;
  relative anchored-parent operations prevent renamed/replaced parents from
  orphaning stages or mutating replacement paths. After awaited children and
  test hooks, cwd identity is fstat-verified and unrelated cwd changes are
  repaired before relative cleanup/publication. A final-path symlink or
  regular-file, symlink, or non-empty directory swap is atomically quarantined
  as an opaque entry without following symlink entries; the empty real output
  directory is established before quarantine cleanup and remains the primary
  restoration guarantee. If the requested absolute parent path is moved, the
  original anchored parent is restored while the replacement parent remains
  untouched. Deterministic in-process mutation windows are
  closed. Final files must deep-match the writer-validated canonical probe/result
  projection, including timestamps, fingerprints, counts, metrics, thresholds,
  status checks, and flags. Same-UID external kernel-level races between
  synchronous validation and rename remain outside pure Node’s absolute
  exclusion boundary.
- The public-origin verifier refuses non-HTTPS or unconfirmed remote targets,
  never follows redirects, bounds bodies, emits no hostnames, binds results to a
  full release commit, and distinguishes local mechanics from eligible remote
  evidence.
- The evidence validator binds each passing gate to an artifact hash and the
  expected release commit.
- CI runs structure tests but does not evaluate the pending template as ready.

The nonce policy makes the application shell request-rendered. Preview and
approved load evidence must therefore confirm web capacity and p95 before any
public release. TLS, HSTS, CDN/proxy behavior, and final headers still require
verification at the approved public edge; local E2E is not that evidence.
The runner-local preview proves the production container artifact and core flow,
not hosted-platform integration, external reachability, CDN behavior, or public
capacity. Those remain separate owner-reviewed evidence.
The verifier reduces collection error but does not authorize a target or prove
independent public reachability. Run it only after owner approval and retain its
remote artifact alongside public-DNS/CDN and external-monitor evidence.
The synthetic load artifact proves only that the bounded mechanics and fixture
runner work on one checked-out commit. It is deliberately not a hosted load
test, an approved data snapshot, a capacity result, or a `load_p95` gate pass.

## Required release review

The release owner must review the evidence manifest, risk register, benchmark
report and methodology contracts, `docs/public-beta/PUBLICATION_REVIEW.md`,
accessibility summary, latency artifact, known limitations and attribution,
incident drill, public-origin/TLS checks, and rollback evidence together. A
passing tool result is necessary but not sufficient if the underlying evidence
is stale, synthetic, out of scope, or collected from another commit. The claims
artifact never authorizes a named-competitor comparison or publication by
itself.

No merge, deploy, public launch, cohort expansion, or status change is
authorized by this document.
