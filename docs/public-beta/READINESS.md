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
| Preview deployment | Not implemented or proven | CI-created preview from an approved commit with core-flow smoke evidence and no production mutation |
| Production rollback | Operator tooling prepared; live drill pending | Recorded prior images, executed rollback, health checks, candidate restore, elapsed time, and retained evidence |
| Core-flow accessibility | Mocked-live keyboard/mobile/axe suite prepared for CI | Green CI artifact plus human review with no critical core-flow failures |
| Incident response | Playbook prepared; rota/channel approval pending | Named on-call-lite owner, reachable private channel, drill evidence, and accepted stop/rollback thresholds |
| Public origin/TLS | Pending | Approved public URL, valid TLS, secure headers, public health checks, and limitations link verified |
| Limitations copy | Draft present | Product/legal/owner approval and verified placement in the public core flow |
| Privacy/support | Drafts present | Approved policy, retention controls, support channel, and response ownership |
| Claims discipline | Automated/product rules present; publication review pending | Release copy review plus benchmark-backed methodology for any comparative statement; otherwise no comparative claim |

## Locally verifiable preparation

- Live-mode web builds must exclude fixture implementation markers.
- Playwright covers station selection, selected-line outcomes, stale/degraded
  honesty, error states, keyboard-only operation, mobile target sizing, and
  serious/critical WCAG scans.
- The bounded load probe refuses insecure remote targets and requires explicit
  confirmation before remote traffic.
- The evidence validator binds each passing gate to an artifact hash and the
  expected release commit.
- CI runs structure tests but does not evaluate the pending template as ready.

## Required release review

The release owner must review the evidence manifest, risk register, benchmark
report, accessibility summary, latency artifact, known limitations, incident
drill, public-origin/TLS checks, and rollback evidence together. A passing tool
result is necessary but not sufficient if the underlying evidence is stale,
synthetic, out of scope, or collected from another commit.

No merge, deploy, public launch, cohort expansion, or status change is
authorized by this document.
