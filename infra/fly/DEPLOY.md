# Deploy & rollback (Fly.io) — prepared, not activated

**Phase 8 status:** Dockerfiles + compose + Fly TOML are ready.  
**Cloud deploy:** **BLOCKED** — `flyctl` is not installed in this environment and no Fly
credentials / apps exist. Do **not** claim a production deploy occurred.

## Prerequisites (activation checklist)

- [ ] Install `flyctl` and authenticate (`fly auth login` or `FLY_API_TOKEN`)
- [ ] Create apps (once per env): `bettermta-api`, `bettermta-web`, `bettermta-data`, `bettermta-otp`
- [ ] Create volumes: `bettermta_data`, `bettermta_otp_graphs`
- [ ] Fix data bind host (`0.0.0.0` / `BETTERMTA_INTERNAL_HOST`) for private networking
      (compose uses socat sidecar as a temporary bridge — see `infra/compose/README.md`)
- [ ] Set secrets from `infra/env/*/.env.example` (`BETTERMTA_*` names)
- [ ] Seed OTP graph volume from a built `services/otp/var/otp/graphs/<version>/`
- [ ] Dockerfiles present (confirmed paths below)

## Image / entrypoint map

| App | Dockerfile | CMD / process | Port |
|---|---|---|---|
| api | `apps/api/Dockerfile` | `node dist/index.js` | 8080 |
| web | `apps/web/Dockerfile` | `next start -H 0.0.0.0 -p 3000` | 3000 |
| data | `services/data/Dockerfile` | `node dist/main.js` (`gateway` process) | 8081 |
| otp | `services/otp/Dockerfile` | OTP `--load --serve` via entrypoint | 8080 |

## Local prod-like proof (no Fly)

```bash
# From repo root
docker info --format 'MemTotal={{.MemTotal}}'   # OTP needs ≳ 4 GiB
docker compose build
docker compose up -d
# Smoke: see docs/RUNBOOKS.md → Local compose bring-up
```

Compose-only token `BETTERMTA_INTERNAL_TOKEN=dev-local-token` is **not** for production.

## First-time create (once Fly is available)

```bash
fly apps create bettermta-api
fly apps create bettermta-web
fly apps create bettermta-data
fly apps create bettermta-otp

fly volumes create bettermta_data -a bettermta-data --region ewr --size 5
fly volumes create bettermta_otp_graphs -a bettermta-otp --region ewr --size 5
```

## Deploy (production) — PENDING activation

```bash
fly deploy -a bettermta-data -c infra/fly/data.fly.toml
fly deploy -a bettermta-otp  -c infra/fly/otp.fly.toml
fly deploy -a bettermta-api  -c infra/fly/api.fly.toml
fly deploy -a bettermta-web  -c infra/fly/web.fly.toml
```

### Deploy gates

- API: Fly checks on `/health/live` and `/health/ready`
- Web: `/` returns 200
- Fail closed: do not promote a release that fails health gates

### Replica / cost caps

```bash
fly scale count gateway=1 -a bettermta-data   # exactly 1
fly scale count 1 -a bettermta-api            # ceiling max 2; keep 1 (in-memory RL)
fly scale count 1 -a bettermta-web            # ceiling max 2
fly scale count 1 -a bettermta-otp            # exactly 1 shared OTP
```

Do not exceed api=2 or web=2 in public beta without a cost review.  
Autoscaling stays off until measured need. No Postgres for anonymous search.

## One-action rollback — PENDING until Fly activated

```bash
fly releases rollback -a bettermta-api
fly releases rollback -a bettermta-web
fly releases rollback -a bettermta-data
fly releases rollback -a bettermta-otp
```

## Verify after deploy / rollback

```bash
curl -fsS https://<api-host>/health/live
curl -fsS https://<api-host>/health/ready
curl -fsS https://<api-host>/v1/status
```

## Cost estimate (proposed Fly footprint)

Approximate monthly (shared-cpu, ewr, always-on, no Postgres):

| Machine | Size | Rough $/mo |
|---|---|---|
| api | shared-cpu-1x 1GB | ~$5–7 |
| web | shared-cpu-1x 512MB | ~$3–5 |
| data | shared-cpu-1x 512MB + 5GB vol | ~$3–6 |
| otp | shared-cpu-2x 4GB + 5GB vol | ~$15–25 |
| IPv4 / egress / misc | — | ~$2–5 |

**Ballpark total: ~$30–50/mo** for the four-app beta footprint (OTP dominates).  
Add Managed Postgres only when feedback ships (+~$15–30). Figures are estimates — confirm on Fly pricing before launch.

## Staging

Use distinct app names (e.g. `bettermta-api-staging`) and the same toml files.
