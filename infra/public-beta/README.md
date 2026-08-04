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
  --release-commit "$GITHUB_SHA" \
  --image-id "$PREVIEW_IMAGE_ID" \
  --smoke-status pass
```

The writer accepts only a full lowercase commit SHA, a Docker `sha256:` image
ID, and a passing smoke result. It emits no URL or hostname and labels the
artifact `ci-runner-local-production-container`, with production mutation and
external reachability both false. This proves a CI-created production-container
preview, not a hosted/public preview, edge integration, or release readiness.

## Readiness validation

CI validates mechanics only:

```bash
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
```

`--structure-only` means the scripts, CI wiring, templates, incident plan,
limitations route, nonce/header middleware, public-origin verifier, preview
evidence writer, and their test contracts are present. It never starts the app,
verifies a public edge, or means the release is ready.

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
