# Stage F public-surface handoff

**Date:** 2026-08-04
**Branch:** `codex/stage-f-public-surface`
**Base:** `codex/stage-f-readiness-harness`
**Release status:** `NOT_READY`

## 1. What was implemented

- A public-beta limitations page at `/limitations`, linked from the planner
  footer with a mobile-sized target.
- Per-request nonce CSP for production pages plus baseline response security
  headers.
- Production E2E coverage for limitations discoverability, serious/critical
  accessibility findings, fresh nonce rotation, header values, and CSP console
  errors.
- Fail-closed structure validation for the new route, middleware, and E2E
  contract.

This is an undeployed candidate. No Fly authentication, secrets, scaling,
feature activation, cohort expansion, or release-status change occurred.

## 2. Files changed

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/limitations/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/TripApp.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/e2e/live.spec.cjs`
- `infra/public-beta/validate-readiness.mjs`
- `infra/public-beta/tests/public-beta-readiness.test.mjs`
- Stage F readiness, runbook, risk, release-gate, index, and continuation docs.

## 3. Public interfaces and schemas

- New web route: `GET /limitations`.
- New response-header contract on matched Next.js page requests:
  nonce-based `Content-Security-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Permissions-Policy`, `Referrer-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, and
  `X-Permitted-Cross-Domain-Policies`.
- No API, OpenAPI, JSON Schema, shared type, or data-contract changes.

## 4. Assumptions made

- The existing public-beta limitations draft is the product-copy source for
  the candidate route; owner/product/legal approval remains required.
- The app owns its nonce CSP and baseline headers. TLS, HSTS, CDN/proxy policy,
  and final response-header verification belong to the approved public edge.
- `NEXT_PUBLIC_API_BASE_URL`, when set, is added to `connect-src` only when it
  is an origin-only HTTPS URL or a loopback HTTP URL. Invalid values are omitted
  from CSP rather than broadening the policy; the existing API client owns its
  separate invalid/unreachable-origin behavior.
- The narrow inline-style exception is limited to style attributes used by the
  existing line-badge CSS custom properties; script policy has no
  `unsafe-inline` or `unsafe-eval`.

## 5. Commands run and results

- `npm --prefix apps/web test` — 81/81 passed.
- Focused new Playwright tests — failed first for the missing route/headers,
  then passed after implementation.
- Live-mode production build and typecheck — passed; `/`, `/_not-found`, and
  `/limitations` are request-rendered (`ƒ`) as expected for nonce CSP.
- `npm --prefix apps/web run verify:no-fixtures` — clean, zero fixture markers.
- Full production Playwright suite — 14/14 passed.
- Public-beta harness — 10/10 passed after the new structure test failed first.
- `node infra/public-beta/validate-readiness.mjs --structure-only` —
  `STRUCTURE_PASS`; release evidence not asserted.
- `npm --prefix contracts run validate` — all conductor contract checks passed.
- `git diff --check` — passed.
- Bounded changed-file security scan — no credential-like literals, private
  keys, dangerous HTML sinks, dynamic execution, or open-redirect primitives;
  script CSP contains no unsafe execution exception.

## 6. Test coverage added

- Planner-to-limitations navigation and return link.
- Narrow-scope, no-account, and non-claims copy markers.
- Serious/critical axe scan on `/limitations`.
- Required baseline response headers on `/` and `/limitations`.
- Fresh, distinct CSP nonces across requests.
- No script `unsafe-inline`/`unsafe-eval` and no CSP browser-console errors.
- Structure validator requires the page, middleware, and E2E surfaces.

## 7. Fixture or sample-data instructions

The existing mocked-live Playwright server and fixtures are reused. No new
production fixtures or sample rider locations were added. Continue to run
`npm --prefix apps/web run verify:no-fixtures` against a live-mode build.

## 8. Known defects

- None found in the local candidate at handoff time.
- The separately tracked Next.js `15.3.5` high/critical advisory remains open
  until FU-NPM-01 / draft PR #7 is owner-merged and separately deployed.

## 9. Known limitations

- The route copy is not approved or published.
- The public hostname, TLS, HSTS policy, CDN/proxy behavior, and final edge
  headers are unverified.
- Nonce CSP forces request rendering of the app shell. Preview capacity,
  route-search/web p95, cache behavior, and cost need approved evidence (R30).
- `style-src-attr 'unsafe-inline'` remains for existing line-badge CSS custom
  properties; the script policy stays nonce-only.
- Human accessibility review and every other pending Stage F live gate remain
  open. Local E2E cannot substitute for them.

## 10. Decisions requiring conductor approval

- Approve/revise the limitations copy with product/legal/owner review.
- Approve the public origin, TLS and HSTS policy, and edge header ownership.
- Approve preview and load-test targets/workload before any remote traffic.
- Decide whether to accept nonce-driven request rendering after capacity and
  latency evidence.

## 11. Exact next integration step

From this branch, run:

```bash
npm --prefix apps/web test
NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 npm --prefix apps/web run build
npm --prefix apps/web run verify:no-fixtures
npm --prefix apps/web run e2e
node --test infra/public-beta/tests/public-beta-readiness.test.mjs
node infra/public-beta/validate-readiness.mjs --structure-only
npm --prefix contracts run validate
git diff --check
```

If all pass, publish a **draft stacked PR** targeting
`codex/stage-f-readiness-harness`. Do not merge or deploy. The release owner can
then review the stack and separately authorize the remaining Stage D/Stage F
hosted, edge, approval, preview, load, rollback, accessibility, and incident
evidence work.
