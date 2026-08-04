# Stage D private-beta preparation handoff

**State:** implementation candidate on `codex/stage-d-private-beta-prep`; local validation is complete, while publication/remote CI, merge, and deployment are pending at the time this handoff was updated. The live product remains `READY_FOR_P1_CONTROLLED_ALPHA`.

## 1. What was implemented

- An expiring, versioned geocode PlaceRef codec using AES-256-GCM with random nonces and authenticated context. Tokens resolve on any API replica that has the same key and fail closed on malformed input, tamper, expiry, non-canonical encoding, or a different key.
- Place-search and resolve wiring that seals route-needed geocoder fields without retaining the upstream provider identifier in the token. The short process cache remains only as an optimization.
- `BETTERMTA_PLACE_REF_KEY` validation and a production boot lockout when address/POI search is enabled without a valid 32-byte key.
- Privacy-safe logging changes that redact encrypted geocode PlaceRefs and stable place-query hashes. Place-search logs retain bounded query length, coarse proximity, counts, timing, and normalized provider/result fields.
- Read-only Fly preflight, current-release manifest capture, and guarded image-based rollback scripts. Operator tests cover dry-run behavior, malformed manifests, ambiguous images, protected-output rules, `fly`/`flyctl`, and the absence of obsolete `fly releases rollback` instructions.
- Deploy-workflow preparation that validates local Fly configuration, captures and retains the prior image set, labels deploy images with the Git commit, and points operators to the guarded rollback script.
- Draft-only privacy policy, support workflow, and support-log template. These are not approved, published, or wired into the product.
- No Fly authentication, app creation, secrets, volumes, deployment, scaling, live configuration, feature flag, tester cohort, or `main` change was performed.

## 2. Files changed

- API implementation: `apps/api/src/adapters/places/{index,placeId,placeRefCodec,placeSearch,resolveCache}.ts`, `apps/api/src/{app,config}.ts`, `apps/api/src/logging/{logger,privacy}.ts`, and `apps/api/src/routes/v1/places.ts`.
- API validation/docs: `apps/api/test/{placeRefCodec,privacy}.test.ts` and `apps/api/README.md`.
- Container/env: `docker-compose.yml`, `infra/env/api/.env.example`, and `infra/env/SECRETS_POLICY.md`.
- Fly preparation: `.github/workflows/deploy.yml`, `.gitignore`, `infra/fly/DEPLOY.md`, all four `infra/fly/*.fly.toml` files, `infra/fly/scripts/*.sh`, `infra/fly/tests/**`, and `infra/fly/manifests/.gitkeep`.
- Product/operations docs: `docs/{DEFERRED_BACKLOG,PLACE_PROVIDER,PROJECT_FILE_INDEX,RELEASE_GATE_REPORT,RISK_REGISTER,RUNBOOKS}.md`, `infra/observability/log-fields.md`, and `docs/private-beta/*.md`.
- Handoffs: `.agents/handoffs/{codex-full-roadmap-continuation,stage-d-private-beta-prep}.md`.

## 3. Public interfaces and schemas

- New secret name: `BETTERMTA_PLACE_REF_KEY`. It must decode from base64/base64url to exactly 32 bytes and must be identical across API replicas and the rollback set.
- Geocoder results continue to use the existing `placeId: string` wire field. The new value format is `pl_geo_v1.<canonical-base64url>` and is an opaque, short-lived route-resolution reference, not a durable user identifier.
- No JSON shape or required contract field changed. The shared contract still describes `placeId` as stable and still permits optional `placeQueryHash`; runtime geocode PlaceRefs are intentionally expiring/randomized and runtime logs no longer emit that query hash. Any shared-contract wording change requires conductor approval.
- Operator entry points are `infra/fly/scripts/preflight-private-beta.sh`, `capture-rollback-manifest.sh`, and `rollback-private-beta.sh`. Rollback consumes a schema-v1 manifest containing the exact four app/image pairs and defaults to dry-run.
- The support and privacy documents are internal drafts only; they do not create a public support interface or published policy.

## 4. Assumptions

- All API replicas in one release receive the same secret key; key rotation intentionally invalidates outstanding short-lived geocode PlaceRefs.
- The address/POI feature remains disabled until the owner approves provider, attribution, privacy, secret, observability, and live-validation gates.
- The API remains at one replica while its rate limiter and metrics are process-local. Stateless PlaceRef resolution alone does not make the whole API safe to scale.
- Fly app names and internal service URLs in the checked-in TOML files are the intended Stage D topology; the preflight must verify real remote state before mutation.
- Initial Fly activation has no prior hosted release to roll back to and therefore needs an explicit owner-approved first-deploy exception plus a post-deploy restore drill once two known-good image sets exist.

## 5. Validation commands

```bash
npm --prefix apps/api test -- --run test/placeRefCodec.test.ts
npm --prefix apps/api test -- --run test/privacy.test.ts
npm --prefix apps/api test -- --run
npm --prefix apps/api run typecheck
./infra/fly/tests/operator-scripts.test.sh
./infra/fly/scripts/preflight-private-beta.sh --local-only
npm --prefix contracts test
docker compose config -q
# Local fallback when the Docker CLI has no Compose plugin:
docker-compose config -q
git diff --check
```

The full-repository CI-equivalent validation and stacked draft-PR CI are required before this candidate is called branch-ready.

## 6. Validation results

- PlaceRef codec suite: **12/12 passed** after RED→GREEN coverage for canonical base64url, exact expiry, provider-field allowlisting, and bounded token metadata.
- Privacy suite: **17/17 passed** after RED→GREEN coverage for removal of stable query/provider hashes plus whole-field, embedded-message, and recursive-array PlaceRef/coordinate redaction.
- Full API suite: **123 passed, 1 intentionally skipped** across 12 files; TypeScript no-emit build passed.
- Conductor contract validator: **PASS** for every fixture, schema/OpenAPI check, contract version/export, and required conductor document.
- Fly operator regression and local-only preflight: **PASS**, including macOS Bash 3.2 compatibility, `fly`/`flyctl`, hostile-origin rejection, hostname-safe failures, genuine initial-activation proof, current-image capture, manifest mode/refusal-to-overwrite, exact one-Machine caps, immutable action/deploy labels, and guarded rollback.
- Workflow/infra parsing: **5 YAML, 1 JSON, and 4 TOML files passed**; standalone `docker-compose config -q` passed with a test-only placeholder key because this host's Docker CLI has no Compose subcommand.
- Diff whitespace/stale-command hygiene and a high-confidence scan across **34 changed/untracked files**: **PASS**.
- Remote draft-PR CI: **pending**. No live Fly check was attempted because no CLI/authentication or activation was authorized.

## 7. Fixture or sample-data instructions

- `apps/api/test/placeRefCodec.test.ts` uses test-only random/fixed 32-byte keys and short expiries; no production key or real rider location is stored in fixtures.
- `infra/fly/tests/fixtures/fly` and `curl` are deterministic fakes. Run only through `infra/fly/tests/operator-scripts.test.sh`; they must never be placed ahead of real tools for an operator run.
- For a real environment, create the 32-byte key directly in the approved secret-management path and pass it to Fly without copying it into the repository, shell history, CI logs, or support records.
- Runtime rollback manifests belong under the gitignored `infra/fly/manifests/` directory or another access-controlled evidence store; only `.gitkeep` is committed.

## 8. Known defects

- No known failing targeted test remains.
- Aggregated production logs/metrics, pager/alert delivery, and a shared rate limiter are not implemented or activated. Multiple API replicas are therefore still prohibited.
- A first-ever Fly deployment cannot capture a prior Fly image set. The workflow fails closed unless the operator explicitly selects the initial-activation input and remote preflight proves that all four apps have zero Machines and zero image-bearing releases while required secret names and volumes exist.
- The guarded rollback is sequential. A mid-sequence failure can temporarily leave a mixed four-service image set; the script stops and requires operator recovery.

## 9. Known limitations

- A geocode PlaceRef expires after the configured short lifetime and becomes invalid after key rotation. Clients must search again rather than persist it.
- Token sealing protects the content from clients/log readers but does not replace HTTPS, secret management, input validation, or provider privacy controls.
- Fly configuration, secrets, volumes, and external provider state are not rolled back by the image rollback script.
- The privacy and support retention periods are proposed launch requirements, not claims about an active backend.
- Five soft live candidate-diversity/timeout watch cases remain from Stage C and must bound any private-beta cohort decision.

## 10. Decisions requiring conductor approval

- Whether to clarify the shared `placeId` contract from “stable” to explicitly allow expiring opaque geocode references, and whether to deprecate/remove optional `placeQueryHash` in a versioned contract update.
- Whether and when to merge Stage C, this stacked Stage D candidate, and later `main`.
- Fly activation authority, initial-activation exception, exact secret/key lifecycle, retained rollback evidence, and any scale above one API replica.
- Privacy-policy owner/legal approval, enforceable log-retention values, support contact/channel, and incident-response targets.
- Address/POI flag-on, external provider activation, live rollback drill, cohort size, and treatment of the five soft routing watch cases.

## 11. Exact next integration step

Run the complete local validation matrix on the final tree, review the diff for secrets and contract drift, commit the candidate, push `codex/stage-d-private-beta-prep`, and open a **draft stacked PR with base `codex/stage-c-wave3`**. The PR must state that Fly activation, secrets, deployment, scaling, address/POI flag-on, cohort expansion, `main` merge, and `READY_FOR_PRIVATE_BETA` are all out of scope. After CI is green, stop at the owner gate; do not run remote preflight or deployment commands without explicit approval.
