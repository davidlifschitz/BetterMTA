# Deploy & rollback (Fly.io) — prepared, not activated

**Preparation status:** Dockerfiles, Fly TOML, read-only preflight, immutable-image
manifest capture, and guarded rollback tooling are ready.
**Cloud deploy:** **NOT ACTIVATED / NOT PROVEN.** Run the preflight below against
current operator state. Do **not** claim a hosted deployment or private-beta readiness
without retained evidence from the activation, health gates, and rollback drill.

## Prerequisites (activation checklist)

- [ ] Install `flyctl` and authenticate (`fly auth login` or `FLY_API_TOKEN`)
- [ ] Install `jq`, `curl`, and Python 3.11+ (the local TOML preflight uses `tomllib`)
- [ ] Create apps (once per env): `bettermta-api`, `bettermta-web`, `bettermta-data`, `bettermta-otp`
- [ ] Create volumes: `bettermta_data`, `bettermta_otp_graphs`
- [ ] Set data bind host for private networking: `BETTERMTA_DATA_BIND_HOST=0.0.0.0`
      (defaults to `127.0.0.1` for compose + socat — see `infra/compose/README.md`)
- [ ] Set secrets from `infra/env/*/.env.example` (`BETTERMTA_*` names)
- [ ] Set `BETTERMTA_PLACE_REF_KEY` on the API from a 32-byte random base64/base64url
      value; keep it stable across compatible deploys and rollback images
- [ ] Seed OTP graph volume from a built `services/otp/var/otp/graphs/<version>/`
- [ ] Know the public API origin for web bake (`NEXT_PUBLIC_API_BASE_URL`) — **required**
- [ ] Dockerfiles present (confirmed paths below)

## Image / entrypoint map

| App | Dockerfile | Build context | CMD / process | Port |
|---|---|---|---|---|
| api | `apps/api/Dockerfile` | repo root | `node dist/index.js` | 8080 |
| web | `apps/web/Dockerfile` | repo root | `next start -H 0.0.0.0 -p 3000` | 3000 |
| data | `services/data/Dockerfile` | repo root | `node dist/main.js` (`gateway` process) | 8081 |
| otp | `services/otp/Dockerfile` | **`services/otp`** | OTP `--load --serve` via entrypoint | 8080 |

OTP compose and Fly must use the same Docker context (`services/otp`). The Dockerfile
`COPY`s `config/` and `docker/` relative to that directory. Fly has no `[build].context`
field — pass the directory as the first `fly deploy` argument.

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

Run the checked-in read-only gate first. It prints secret **names/status only**, never
values or operator identity:

```bash
BETTERMTA_API_BASE_URL=https://<api-host> \
BETTERMTA_WEB_BASE_URL=https://<web-host> \
./infra/fly/scripts/preflight-private-beta.sh --require-public-health
```

The deploy workflow additionally requires `--require-rollback-target` for a normal
deployment. Its explicit `initial_activation` exception runs `--initial-activation`,
which still verifies required secret names and volumes and refuses if any of the four apps
already has a Machine or image-bearing release. It is not a general bypass for capture
or preflight failure.

Before every non-initial deploy, capture the currently healthy four-app image set. The
output path should remain outside Git (the GitHub workflow retains it as a run artifact):

```bash
./infra/fly/scripts/capture-rollback-manifest.sh \
  --output infra/fly/manifests/predeploy-YYYYMMDDTHHMMSSZ.json
```

Capture refuses to overwrite an existing path and creates the manifest with mode `0600`.

```bash
fly deploy -a bettermta-data -c infra/fly/data.fly.toml --image-label '<git-sha>' \
  --ha=false --strategy rolling --yes

# OTP: context = services/otp; --config path is relative to that context
fly deploy services/otp -a bettermta-otp -c ../infra/fly/otp.fly.toml \
  --image-label '<git-sha>' --ha=false --strategy rolling --yes

fly deploy -a bettermta-api -c infra/fly/api.fly.toml --image-label '<git-sha>' \
  --ha=false --strategy rolling --yes

# Web: NEXT_PUBLIC_API_BASE_URL is bake-time. Dockerfile defaults to localhost —
# always pass a real public API origin or browsers will call the wrong host.
fly deploy -a bettermta-web -c infra/fly/web.fly.toml \
  --image-label '<git-sha>' \
  --ha=false --strategy rolling --yes \
  --build-arg 'NEXT_PUBLIC_API_BASE_URL=https://<api-host>'
```

CI (`deploy.yml`) requires workflow input `public_api_base_url` and **fails closed** on
empty / localhost / `127.0.0.1` values before deploying web.

### Deploy gates

- API: Fly checks on `/health/live` and `/health/ready`
- Web: `/` returns 200
- Fail closed: do not promote a release that fails health gates
- Fail closed: do not deploy web without an explicit non-localhost `NEXT_PUBLIC_API_BASE_URL`

### Replica / cost caps

```bash
fly scale count gateway=1 -a bettermta-data   # exactly 1
fly scale count 1 -a bettermta-api            # exactly 1 — in-memory rate limiter
fly scale count 1 -a bettermta-web            # ceiling max 2
fly scale count 1 -a bettermta-otp            # exactly 1 shared OTP
```

**API must stay at 1 Machine** until a shared rate-limit store exists. Scaling API >1
splits the in-memory limiter and under-enforces `429` (compose + `api.fly.toml` agree).
Do not exceed web=2 in public beta without a cost review. Autoscaling stays off until
measured need. No Postgres for anonymous search.

## One-action rollback — PENDING until Fly activated

Fly no longer provides a special `releases rollback` command. Its supported rollback
model is to redeploy a recorded prior image. BetterMTA captures the four compatible
images before deploy and redeploys them in dependency order through one guarded command:

```bash
BETTERMTA_API_BASE_URL=https://<api-host> \
BETTERMTA_WEB_BASE_URL=https://<web-host> \
./infra/fly/scripts/rollback-private-beta.sh \
  --manifest infra/fly/manifests/predeploy-YYYYMMDDTHHMMSSZ.json \
  --execute
```

Without `--execute`, the command is a validation-only dry run. Execution fails closed
on an unexpected app/config/image, waits for all four deploys, checks Machine state,
then probes API liveness/readiness/status and the web root. A mid-sequence platform
failure can still leave a mixed image set; inspect all four app statuses before retrying.
Rollback redeploys images only—current secrets, environment config, volumes, and data
remain current. See the [Fly rollback guide](https://fly.io/docs/blueprints/rollback-guide/).

After a successful activation and again after a rollback drill, require retained release
images and public health in one read-only check:

```bash
BETTERMTA_API_BASE_URL=https://<api-host> \
BETTERMTA_WEB_BASE_URL=https://<web-host> \
./infra/fly/scripts/preflight-private-beta.sh \
  --require-public-health \
  --require-rollback-target
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
