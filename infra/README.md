# Infrastructure package

**Workstream:** Infrastructure (`agent/infrastructure`)  
**Status:** Templates ready-to-activate — application services not merged on this branch

| Path | Purpose |
|---|---|
| `alpha/` | Controlled-alpha edge (Caddy) + smoke; see `alpha/README.md` |
| `compose/` | Compose helpers (data-proxy notes) |
| `fly/` | Fly.io app configs + deploy/rollback commands |
| `env/` | `.env.example` placeholders + secrets policy |
| `observability/` | Log fields, metrics, alerts |
| `flags/` | Feature-flag defaults |
| `security/` | Rate-limit, HTTPS, audit, cost guardrails |

Platform decision proposal: `docs/proposals/infrastructure-adr-0005-platform.md` (Fly.io recommended).

Do not put real secrets in this tree.
