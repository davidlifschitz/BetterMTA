# Stage F public-origin verifier handoff

**Date:** 2026-08-04
**Branch:** `codex/stage-f-public-origin-verifier`
**Base:** `codex/stage-f-public-surface`
**Release status:** `NOT_READY`

## 1. What was implemented

- A read-only public-origin verifier for an approved web origin and API origin.
- Runtime checks for HTTPS transport, security headers, fresh CSP nonces,
  limitations discoverability/copy markers, and API health/readiness/status.
- Fail-closed target validation, redirect refusal, bounded bodies/timeouts, full
  release-commit binding, and fixed privacy-safe failure codes.
- Readiness structure validation and test coverage for the new operator surface.

No remote target was contacted. No Fly authentication, deployment, secrets,
scaling, feature activation, cohort expansion, or status change occurred.

## 2. Files changed

- `infra/public-beta/verify-public-origin.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/README.md`
- `.gitignore`
- Stage F readiness, runbook, release-gate, risk, index, and continuation docs.

## 3. Public interfaces and schemas

New CLI:

```text
verify-public-origin.mjs --web-url ORIGIN --api-url ORIGIN
  --release-commit FULL_SHA [--timeout-ms N]
  [--confirm-target PUBLIC_ORIGIN_CHECK]
```

Stdout is one JSON object with schema version, timestamp, `PASS`,
`LOCAL_CHECK_PASS`, or `FAIL`, target class, release commit, evidence
eligibility, transport classification, data mode, and fixed failure codes. It
contains no target URL/hostname, response body, request ID, or credential.

No API, OpenAPI, JSON Schema, shared type, or data-contract changes were made.

## 4. Assumptions made

- Public web and API health surfaces are unauthenticated and use canonical,
  origin-only URLs; redirects indicate an incorrect operator target.
- Successful Node HTTPS requests use runtime CA and hostname verification.
- `live`, `stale`, and `schedule_only` are honest operable status modes;
  `synthetic`, `unavailable`, missing, or unknown modes fail this check.
- A passing remote artifact is necessary evidence, not independent proof of
  public DNS/CDN reachability or release approval.

## 5. Commands run and results

- Baseline public-beta harness — 10/10 passed.
- Four initial verifier tests — failed first because the script was absent,
  then passed after implementation.
- Unexpected status-mode reflection test — failed first with the untrusted
  value in evidence, then passed after output allowlisting.
- Structure-validator regression — failed first because the verifier was not
  required, then passed after structure wiring.

- Full public-beta harness — 15/15 passed.
- Structure-only validator — `STRUCTURE_PASS`; release evidence not asserted.
- Verifier syntax check — passed.
- Conductor contract validation — passed.
- `git diff --check` — passed.
- Bounded changed-file scan — no credential-like literals, private keys,
  dynamic/shell execution, followed redirects, or unbounded response helpers;
  six fixed GETs, manual redirects, body cap, confirmation, commit binding, and
  status-output allowlisting were confirmed.

## 6. Test coverage added

- Commit-bound local success with no hostname in output.
- Insecure and unconfirmed remote-target refusal without hostname leakage.
- Missing headers and reused CSP nonce fail closed with fixed reason codes.
- Oversized response bodies fail without unbounded buffering.
- Unexpected status-mode strings cannot be reflected into evidence output.
- Repository structure requires the verifier and its safety markers.

## 7. Fixture or sample-data instructions

Tests use an ephemeral loopback HTTP server with synthetic HTML and health
JSON. They do not require credentials, external networking, GTFS artifacts, or
rider locations. A local pass is labeled `LOCAL_CHECK_PASS` and is ineligible
for public-origin evidence.

## 8. Known defects

- None found in the local candidate at handoff time.
- Existing dependency advisories remain tracked by R24 / FU-NPM-01 and draft
  PR #7; this slice does not change dependencies.

## 9. Known limitations

- No real public origin, TLS chain, DNS, CDN, or external path was tested.
- The verifier does not approve HSTS policy and deliberately does not require
  HSTS until the public hostname policy is approved.
- A run from a private/privileged network is not independent public
  reachability evidence (R31); use a separately approved external monitor.
- It performs bounded read-only checks, not load testing or rollback.
- All other Stage D/Stage F live, human, operational, and approval gates remain
  open; public beta remains `NOT_READY`.

## 10. Decisions requiring conductor approval

- Approve the public web/API origins and authorize the exact remote verifier run.
- Approve public DNS/CDN and HSTS ownership/policy.
- Approve the independent external vantage point and evidence-retention root.
- Decide whether the combined public-origin evidence closes only that gate.

## 11. Exact next integration step

Run locally:

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
node --check infra/public-beta/verify-public-origin.mjs
npm --prefix contracts run validate
git diff --check
```

If green, publish a draft stacked PR targeting
`codex/stage-f-public-surface`. Do not merge, deploy, or run against a remote
target. The release owner must separately authorize the documented remote
command and every remaining Stage D/Stage F evidence action.
