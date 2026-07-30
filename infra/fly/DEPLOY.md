# Deploy & rollback (Fly.io) — PLACEHOLDER templates
#
# Status: ready-to-activate after ADR-0005 acceptance and service Dockerfiles exist.
# Do not run against production until apps/api, apps/web, services/data are merged.
#
# Prerequisites
# - flyctl authenticated
# - secrets loaded per infra/env/*/ and infra/env/SECRETS_POLICY.md
# - Dockerfiles at paths referenced in *.fly.toml
#
# First-time create (once per environment)
#
#   fly apps create bettermta-api
#   fly apps create bettermta-web
#   fly apps create bettermta-data
#
# Deploy (production)
#
#   fly deploy -a bettermta-api  -c infra/fly/api.fly.toml
#   fly deploy -a bettermta-web  -c infra/fly/web.fly.toml
#   fly deploy -a bettermta-data -c infra/fly/data.fly.toml
#
# Deploy gates
# - API deploy must pass Fly checks on /health/live and /health/ready
# - Failed readiness keeps old Machines receiving traffic under rolling strategy
# - Fail closed: do not promote a release that fails health gates
#
# Replica / cost caps (hard ceilings — matches infra/security/GUARDRAILS.md)
#
#   fly scale count api=1          # ceiling: max 2  →  fly scale count api=2
#   fly scale count web=1          # ceiling: max 2  →  fly scale count web=2
#   fly scale count poller=1       # data: exactly 1; never scale poller above 1
#
# Do not exceed api=2 or web=2 in public beta without a cost review.
# Autoscaling stays off until measured need.
#
# Data poller (always-on + health)
#
# - Keep poller at count 1: `fly scale count poller=1 -a bettermta-data`
# - Restart policy: rely on Fly Machine auto-restart on process exit; after
#   prolonged crash loops, `fly apps restart bettermta-data` and check logs
# - Private health / metrics expectation (PLACEHOLDER until services/data ships):
#   poller exposes an internal metrics or heartbeat endpoint (or emits
#   bettermta_realtime_age_seconds / import status) observable from the private
#   network or scraped via API `/v1/status` + `/health/ready` — not public HTTP
# - Entrypoint in data.fly.toml is a PLACEHOLDER; confirm against services/data
#   package.json / Dockerfile before first production deploy
#
# One-action rollback (Acceptance Criteria E.4)
#
#   fly releases rollback -a bettermta-api
#   fly releases rollback -a bettermta-web
#   fly releases rollback -a bettermta-data
#
# Verify after deploy / rollback
#
#   curl -fsS https://<api-host>/health/live
#   curl -fsS https://<api-host>/health/ready
#   curl -fsS https://<api-host>/v1/status
#
# Staging
# Use distinct app names (e.g. bettermta-api-staging) and the same toml files.
