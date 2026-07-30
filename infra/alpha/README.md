# Controlled alpha origin (Phase 12A)

Self-hosted macOS + Docker Compose origin for ADR-0021. Cloudflare Tunnel will
target the loopback edge; secrets, tunnel UUIDs, hostnames, and tester emails
stay **out of this repo**.

## Index (12A.3–12A.7)

| Doc / path | Phase | Role |
|---|---|---|
| This README | 12A.3–4 | Edge bind, compose override, start/stop |
| [`HOST.md`](./HOST.md) | **12A.5** | macOS operating requirements |
| [`TUNNEL.md`](./TUNNEL.md) | **12A.6** | Named Cloudflare Tunnel (interactive CF setup) |
| [`ACCESS.md`](./ACCESS.md) | **12A.7** | Cloudflare Access allowlist + OTP + service token |
| [`cloudflared/config.template.yml`](./cloudflared/config.template.yml) | 12A.6 | Safe ingress template (placeholders only) |
| [`Caddyfile`](./Caddyfile) | 12A.3 | Edge routes to api/web |
| [`scripts/preflight-host.sh`](./scripts/preflight-host.sh) | 12A.5 | Read-only host / Docker / tunnel / health report |
| [`scripts/start-alpha.sh`](./scripts/start-alpha.sh) | 12A.4 | Compose up + wait ready + smoke |
| [`scripts/stop-alpha.sh`](./scripts/stop-alpha.sh) | 12A.4 | Compose down (volumes preserved) |
| [`scripts/smoke-edge.sh`](./scripts/smoke-edge.sh) | 12A.4 | Local edge HTTP smoke (no Cloudflare) |

**Operator order:** `preflight-host.sh` → fix manual host settings → `start-alpha.sh` → configure Tunnel/Access outside Git → remote smoke with Access.

## Edge bind

| Bind | Role |
|---|---|
| `127.0.0.1:8088` | **Edge** (Caddy) — only public-facing origin for Tunnel |

Routing (`infra/alpha/Caddyfile`):

- `/v1/*` → `api:8080`
- `/health/*` → `api:8080`
- all other paths → `web:3000` (pages + assets)

Web is baked with `NEXT_PUBLIC_API_BASE_URL=""` so the browser calls same-origin
`/v1/...` through the edge (not `http://localhost:8080`).

## What is / isn’t published on the host (alpha override)

Bring-up uses root compose **plus** `docker-compose.alpha.yml`.

| Service | Host publish (alpha) | Notes |
|---|---|---|
| **edge** | `127.0.0.1:8088` only | Tunnel target |
| **api** | `127.0.0.1:8080` only | Local debug; prefer edge |
| **web** | `127.0.0.1:3000` only | Local debug; prefer edge |
| **data** | **none** | Reachable on Docker network as `data:8082` only |
| **otp** | **none** | Reachable on Docker network as `otp:8080` only |

Data internal (8081/8082), OTP GraphQL (8090), and metrics/debug must **not**
be published on `0.0.0.0` for alpha. Root `docker-compose.yml` alone still maps
those ports for local-dev convenience — do **not** use that map for the
controlled-alpha origin.

## Restart + health dependencies (12A.4)

All long-running alpha services use `restart: unless-stopped` (data, data-proxy,
otp, api, web, edge).

Dependency-aware startup (Compose `depends_on` + `service_healthy` where
applicable):

| Service | Waits for | Notes |
|---|---|---|
| data-proxy | data healthy | No proxy healthcheck (socat TCP forward) |
| otp | data healthy (+ proxy started) | |
| api | data healthy + **otp healthy** | Alpha healthcheck hits `/health/ready` |
| web | api healthy | Web is **not** the readiness authority |
| edge | api + web healthy | Edge `/health/live` probes API process |

**Readiness authority:** API `/health/ready` (static/OTP coherent; realtime may
be `stale`/degraded and still permit schedule routing). Graph/static mismatch
remains fail-closed on the routing path. Do not treat web or edge HTML as ready.

## Required files (no secrets committed)

| Path | Required? | Role |
|---|---|---|
| `docker-compose.yml` | yes | Base stack |
| `docker-compose.alpha.yml` | yes | Alpha override (edge, binds, restart/health) |
| `infra/alpha/Caddyfile` | yes | Edge routes |
| `infra/alpha/cloudflared/config.template.yml` | yes | Template only — copy outside repo |
| `.env` / tunnel creds / Access tokens | **no** | Never commit; see `TUNNEL.md` / `ACCESS.md` |
| `services/otp/var/otp/graphs/active.json` | soft | Needed for OTP/API ready |
| `services/data/var/data/static` | soft | Needed for data ready |

Local compose still embeds a **compose-only** internal token (`dev-local-token`).
That is not a Tunnel/Access secret and must not be reused in production.

## Bring-up / tear-down

Preferred:

```bash
cd /path/to/bettermta   # integration-live worktree

./infra/alpha/scripts/preflight-host.sh   # read-only host checks
./infra/alpha/scripts/start-alpha.sh      # up + wait ready + smoke
./infra/alpha/scripts/stop-alpha.sh       # compose down (volumes preserved)
```

Environment knobs for `start-alpha.sh`:

| Var | Default | Meaning |
|---|---|---|
| `EDGE_BASE` | `http://127.0.0.1:8088` | Edge origin |
| `ALPHA_WAIT_SECS` | `420` | Max wait for live+ready |
| `ALPHA_ROUTE_SMOKE` | `1` | Include places/route search in smoke |

Public health (preflight only when set — secrets outside Git):

| Var | Meaning |
|---|---|
| `ALPHA_PUBLIC_BASE_URL` | `https://<ALPHA_HOSTNAME>` |
| `CF_ACCESS_CLIENT_ID` | Access service token client id |
| `CF_ACCESS_CLIENT_SECRET` | Access service token secret |

Manual equivalent:

```bash
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml build
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml up -d
./infra/alpha/scripts/smoke-edge.sh

# Tear down WITHOUT deleting volumes:
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml down
```

`stop-alpha.sh` / `down` intentionally omit `-v` so bind-mounted data and OTP
graph artifacts persist across restarts.

## Related

- Ops pointer: `docs/RUNBOOKS.md` § Controlled alpha
- Deploy decision: ADR-0021 in `docs/ARCHITECTURE_DECISIONS.md`
- Gates: `docs/RELEASE_GATE_REPORT.md` (CA02–CA06; Tunnel/Access remote evidence still pending)
