# Secrets policy (BetterMTA)

**Owner:** Infrastructure  
**Rule:** Real secrets never enter git. Only placeholder names appear under `infra/env/**`.

## What is a secret

- MTA GTFS-Realtime API keys / tokens
- Cache URLs containing passwords (`REDIS_URL`, `CACHE_URL`)
- Postgres connection strings (`DATABASE_URL`)
- Error-tracking DSNs (`SENTRY_DSN`, `ERROR_TRACKING_DSN`)
- Place/geocode provider API keys
- BetterMTA encrypted geocode PlaceRef keys (`BETTERMTA_PLACE_REF_KEY`)
- Any signing keys or webhook secrets

## What may live in git

- Variable *names* and example placeholder values (`REPLACE_ME`, `redis://USER:PASS@host:6379`)
- Non-secret defaults (ports, flag defaults, poll interval caps, public API base URL hostnames for docs)
- This policy document

## How secrets reach the platform (Fly.io — proposed)

1. Human or CI OIDC injects values into the Fly org — never into the repository.
2. Per app:
   ```bash
   fly secrets set -a bettermta-api \
     MTA_GTFS_RT_API_KEY=... \
     CACHE_URL=... \
     DATABASE_URL=... \
     ERROR_TRACKING_DSN=...
   ```
3. Staging and production use **separate** Fly apps and secret stores.
4. Preview/PR apps use staging-scoped or ephemeral credentials with least privilege; never production MTA keys if avoidable.
5. Rotate by `fly secrets set` (new value) then verify `/health/ready` and `/v1/status`; revoke old provider keys after cutover.

`BETTERMTA_PLACE_REF_KEY` is intentionally shared by compatible API replicas and
rollback images. Rotation invalidates outstanding short-lived geocode PlaceRefs; rotate
only during a controlled window and verify a fresh place-search → route-search flow.

## CI

- GitHub Actions may use repository/environment secrets for deploy tokens only.
- Workflows must not echo secret values.
- `npm audit` and contract validation do not require production secrets.

## Local development

- Copy `infra/env/<service>/.env.example` → gitignored `.env.local` (service-owned).
- Prefer fixture / synthetic data modes from conductor contracts; do not require production feed keys for UI work.

## Incident

If a secret is committed: rotate immediately, purge from git history with maintainer approval, and treat as a sev-1 security event.
