# Public-beta readiness tooling

These tools prepare and validate Stage F evidence. They do **not** deploy,
authenticate to Fly, change secrets, enable features, expand a cohort, or by
themselves declare the product ready.

## Route-search load probe

Use a local or explicitly confirmed HTTPS target. The default workload is 100
requests at concurrency 5, with a five-request warmup. The output contains no
target hostname, rider coordinates, credentials, response bodies, or request
IDs. Each response body is drained only up to 1 MiB; larger or unending bodies
fail as `response_too_large` rather than consuming unbounded memory.

```bash
# Local development target
node infra/public-beta/load-route-search.mjs \
  --base-url http://127.0.0.1:8080

# Authorized remote target only
node infra/public-beta/load-route-search.mjs \
  --base-url "$BETTERMTA_LOAD_BASE_URL" \
  --confirm-target LOAD_TEST \
  --requests 100 \
  --concurrency 5
```

Remote execution must be separately authorized by the owner. The route API
gate is p95 below 2,000 ms under the agreed beta workload, excluding upstream
outage fallback paths. A probe result is only one input to that gate; record
the release commit, dataset/snapshot, workload, and operating conditions in a
separate evidence artifact.

## Public-origin verifier

The public-origin verifier performs unauthenticated, read-only GET requests. It
checks the web root twice, `/limitations`, API liveness/readiness/status,
runtime TLS validation for remote targets, the final security-header contract,
fresh CSP nonces, and the public limitations markers. Requests never follow
redirects, bodies are capped at 1 MiB, and output contains fixed reason codes
instead of URLs, hostnames, response bodies, or request IDs.

```bash
# Local mechanics only; this cannot satisfy the public-origin gate.
node infra/public-beta/verify-public-origin.mjs \
  --web-url http://127.0.0.1:3000 \
  --api-url http://127.0.0.1:8080 \
  --release-commit "$(git rev-parse HEAD)"

# Owner-authorized public target only. Save stdout under the approved,
# non-committed evidence root used by the release manifest.
node infra/public-beta/verify-public-origin.mjs \
  --web-url "$BETTERMTA_WEB_BASE_URL" \
  --api-url "$BETTERMTA_API_BASE_URL" \
  --release-commit "$(git rev-parse HEAD)" \
  --confirm-target PUBLIC_ORIGIN_CHECK \
  > infra/public-beta/evidence/public-origin-tls.json
```

Remote targets must be origin-only HTTPS DNS names and both origins must be in
the same local/remote class. The confirmation token authorizes only the bounded
checks above; it does not authorize deployment, load, secrets, or configuration
changes. A remote `PASS` is one artifact for owner review. It does not replace
public-DNS/CDN review, independent external reachability, HSTS-policy approval,
or the other nine Stage F gates.

## Runner-local production-container preview

The `public-beta-preview` CI job builds `apps/web/Dockerfile` in live mode,
starts the resulting image only on `127.0.0.1:3100`, and points the existing
14-test mocked-live Playwright suite at that container. The image bakes the
runner-local mock API origin solely so Playwright can intercept API requests;
the job never starts an API listener, contacts a cloud host, or mutates a
deployment. The Docker build itself runs the full `verify:no-fixtures` scan,
and external-container E2E also checks the JavaScript chunks served by the
running image.

After the smoke suite passes, CI writes a bounded JSON artifact with:

```bash
node infra/public-beta/write-preview-evidence.mjs \
  --release-commit "$PREVIEW_RELEASE_COMMIT" \
  --image-id "$PREVIEW_IMAGE_ID" \
  --smoke-status pass
```

The workflow sets `PREVIEW_RELEASE_COMMIT` to the reviewed pull-request head SHA
or, for a push run, the push SHA; GitHub's synthetic pull-request merge SHA is
never used as release identity. The same value tags the image and binds the
evidence. The writer accepts only a full lowercase commit SHA, a Docker
`sha256:` image ID, and a passing smoke result. It emits no URL or hostname and
labels the artifact `ci-runner-local-production-container`, with production
mutation and external reachability both false. This proves a CI-created
production-container preview, not a hosted/public preview, edge integration, or
release readiness.

## Automated accessibility evidence

The `public-beta-readiness` job writes accessibility evidence only after the
existing 14-test mocked-live Playwright suite passes. That suite covers the
keyboard-only core flow, mobile 44 px target sizing, and serious/critical axe
findings under the WCAG 2 A/AA rule sets.

```bash
node infra/public-beta/write-accessibility-evidence.mjs \
  --release-commit "$ACCESSIBILITY_RELEASE_COMMIT" \
  --suite-status pass \
  > infra/public-beta/evidence/accessibility/result.json
```

For pull requests, `ACCESSIBILITY_RELEASE_COMMIT` is the reviewed head SHA; for
pushes it is the push SHA. The writer accepts only a full lowercase commit SHA
and a passing suite status. Its fixed check list is emitted with
`AUTOMATED_PASS_HUMAN_PENDING`, `humanReviewStatus: pending`,
`eligibleForGatePass: false`, and `productionMutation: false`; it emits no URL
or hostname. CI uploads the result as
`public-beta-accessibility-<run-id>`.

Automated evidence is not human approval. Copy
`docs/public-beta/ACCESSIBILITY_REVIEW.md` into the gitignored
`infra/public-beta/evidence/accessibility/` directory, complete it against the
same release commit and approved target class, and retain it for owner review.
The template remains `PENDING_HUMAN_REVIEW` in Git and the accessibility gate
remains open until a completed review records `PASS` with no open critical
core-flow finding.

## Incident playbook readiness evidence

The `public-beta-readiness` job writes an incident-readiness artifact only
after the structure validator confirms that the playbook, tabletop template,
writer, CI wiring, and fail-closed release status are present.

```bash
node infra/public-beta/write-incident-readiness-evidence.mjs \
  --release-commit "$INCIDENT_RELEASE_COMMIT" \
  --playbook-status pass \
  > infra/public-beta/evidence/incident-readiness/result.json
```

For pull requests, `INCIDENT_RELEASE_COMMIT` is the reviewed head SHA; for
pushes it is the push SHA. The writer accepts only a full lowercase commit SHA
and a passing playbook-structure result. It emits the fixed status
`PLAYBOOK_PASS_ROTA_DRILL_PENDING`, with rota and channel approval pending,
tabletop status pending, `eligibleForGatePass: false`, and
`productionMutation: false`. It emits no URL or hostname. CI uploads the result
as `public-beta-incident-readiness-<run-id>`.

This artifact proves only the operating contract is present. Copy
`docs/public-beta/INCIDENT_DRILL.md` into the approved restricted evidence
store, bind it to the same release commit, and complete it only after the owner
approves the environment class, rota, restricted channel, stop/rollback
thresholds, and evidence retention. Keep identities, contact details, channel
names, protected origins, and private logs outside Git. A passing human drill
with no open critical finding is still required.

## Privacy and support readiness evidence

The `public-beta-readiness` job writes privacy/support readiness evidence only
after the structure validator confirms the draft policy, support workflow,
restricted-ledger template, privacy-safe logging controls/tests, approval
template, writer, and fail-closed release status are present.

```bash
node infra/public-beta/write-privacy-support-readiness-evidence.mjs \
  --release-commit "$PRIVACY_SUPPORT_RELEASE_COMMIT" \
  --controls-status pass \
  > infra/public-beta/evidence/privacy-support/result.json
```

For pull requests, `PRIVACY_SUPPORT_RELEASE_COMMIT` is the reviewed head SHA;
for pushes it is the push SHA. The writer accepts only a full lowercase commit
SHA and a passing controls-structure result. It emits
`CONTROLS_PASS_APPROVAL_CHANNEL_PENDING`, with owner/legal policy approval,
deployed retention evidence, private support channel, and response owners all
pending; `eligibleForGatePass` and `productionMutation` are false. It emits no
URL, hostname, or contact field. CI uploads the result as
`public-beta-privacy-support-<run-id>`.

This artifact is not policy publication or operational approval. Copy
`docs/public-beta/PRIVACY_SUPPORT_APPROVAL.md` into the approved restricted
evidence store and bind it to the same release commit. The owner must verify the
actual enabled providers/features, retention/deletion behavior, least-privilege
access, reachable private support path, response owners, and reviewer
disposition without putting identities, endpoints, or secrets in Git.

## Readiness validation

CI validates mechanics only:

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
```

`--structure-only` means the scripts, CI wiring, templates, incident plan,
limitations route, nonce/header middleware, public-origin verifier, preview,
accessibility, incident-readiness, and privacy/support evidence writers, pending
human review/tabletop/approval templates, and their test contracts are present.
It never starts the app, verifies a public edge, performs a human review or
tabletop, publishes a policy, activates support, or means the release is ready.

An owner-reviewed release evidence manifest can later be evaluated with:

```bash
node infra/public-beta/validate-readiness.mjs \
  --evidence /path/to/evidence.json \
  --expected-commit "$(git rev-parse HEAD)"
```

The evidence gate fails closed unless all ten required gates are `pass`, every
artifact exists beneath the selected repository/evidence root, every SHA-256
matches, each artifact is no larger than 50 MiB, and the manifest commit is the
expected release commit. Gate identifiers are allowlisted and are never copied
verbatim into failure codes. Start from
`docs/public-beta/evidence-template.json`; never replace pending entries with
passes until the referenced evidence was actually captured and reviewed.
