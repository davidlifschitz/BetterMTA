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
| Route API load/p95 | Harness implemented; beta-load evidence pending | Privacy-safe probe artifact showing p95 under 2,000 ms and error rate within the agreed limit for the recorded release/data snapshot |
| Preview deployment | Runner-local production-container artifact proven in CI for commit `9f10e50` with 14/14 smoke checks; owner acceptance or a hosted-platform preview decision remains pending | CI-created preview from an approved commit with core-flow smoke evidence and no production mutation |
| Production rollback | Operator tooling prepared; live drill pending | Recorded prior images, executed rollback, health checks, candidate restore, elapsed time, and retained evidence |
| Core-flow accessibility | Commit-bound automated evidence mechanics are proven in CI; human review for an owner-approved release commit remains pending | Green CI artifact plus human review with no critical core-flow failures |
| Incident response | CI emits commit-bound playbook-readiness evidence; rota/channel approval and tabletop drill remain pending | Named on-call-lite owner, reachable private channel, drill evidence, and accepted stop/rollback thresholds |
| Public origin/TLS | Commit-bound, privacy-safe verifier implemented and locally tested; approved public target and external evidence pending | Approved public URL, valid TLS, runtime headers verified end to end, public health checks, limitations link, public DNS/CDN review, and retained owner-reviewed artifact |
| Limitations copy | Candidate `/limitations` route and planner-footer link pass local production E2E; approval/publication pending | Product/legal/owner approval and verified placement in the public core flow |
| Privacy/support | CI emits commit-bound policy/control readiness evidence; owner/legal approval, deployed retention proof, private channel, and response owners remain pending | Approved policy, retention controls, support channel, and response ownership |
| Claims discipline | Automated/product rules present; publication review pending | Release copy review plus benchmark-backed methodology for any comparative statement; otherwise no comparative claim |

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
- The bounded load probe refuses insecure remote targets and requires explicit
  confirmation before remote traffic.
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

## Required release review

The release owner must review the evidence manifest, risk register, benchmark
report, accessibility summary, latency artifact, known limitations, incident
drill, public-origin/TLS checks, and rollback evidence together. A passing tool
result is necessary but not sufficient if the underlying evidence is stale,
synthetic, out of scope, or collected from another commit.

No merge, deploy, public launch, cohort expansion, or status change is
authorized by this document.
