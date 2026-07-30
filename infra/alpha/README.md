# Controlled alpha origin (Phase 12A)

Self-hosted macOS + Docker Compose origin for ADR-0021. Cloudflare Tunnel will
target the loopback edge; secrets, tunnel UUIDs, hostnames, and tester emails
stay **out of this repo**.

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

## Bring-up

```bash
cd /path/to/bettermta   # integration-live worktree

docker-compose -f docker-compose.yml -f docker-compose.alpha.yml build
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml up -d

# Smoke (no Cloudflare required):
./infra/alpha/scripts/smoke-edge.sh
```

Tear down:

```bash
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml down
```

## Related

- Ops pointer: `docs/RUNBOOKS.md` § Controlled alpha
- Deploy decision: ADR-0021 in `docs/ARCHITECTURE_DECISIONS.md`
- Gates: `docs/RELEASE_GATE_REPORT.md` (CA02+)
