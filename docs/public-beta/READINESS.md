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
| Preview deployment | Runner-local production-container preview job and commit/image evidence writer implemented; local 14/14 proof passed; approved-commit CI artifact review pending | CI-created preview from an approved commit with core-flow smoke evidence and no production mutation |
| Production rollback | Operator tooling prepared; live drill pending | Recorded prior images, executed rollback, health checks, candidate restore, elapsed time, and retained evidence |
| Core-flow accessibility | Mocked-live keyboard/mobile/axe suite prepared for CI | Green CI artifact plus human review with no critical core-flow failures |
| Incident response | Playbook prepared; rota/channel approval pending | Named on-call-lite owner, reachable private channel, drill evidence, and accepted stop/rollback thresholds |
| Public origin/TLS | Commit-bound, privacy-safe verifier implemented and locally tested; approved public target and external evidence pending | Approved public URL, valid TLS, runtime headers verified end to end, public health checks, limitations link, public DNS/CDN review, and retained owner-reviewed artifact |
| Limitations copy | Candidate `/limitations` route and planner-footer link pass local production E2E; approval/publication pending | Product/legal/owner approval and verified placement in the public core flow |
| Privacy/support | Drafts present | Approved policy, retention controls, support channel, and response ownership |
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
