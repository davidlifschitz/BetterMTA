# Controlled alpha — remote validation (Phase 12A.10)

**Status:** all tests below are **PENDING_USER** / **not run** in-repo.  
**Final gate status:** `BLOCKED` (see `docs/RELEASE_GATE_REPORT.md`).  
**Do not** treat this file as evidence of `READY_FOR_CONTROLLED_ALPHA`.

Remote validation requires operator-owned Cloudflare Tunnel + Access setup,
`ALPHA_PUBLIC_BASE_URL`, and Access service-token env vars (names only — never
commit values). No hostname, tunnel UUID, tester email, or token belongs in Git.

## Preconditions (operator)

1. Named tunnel active to loopback edge `http://127.0.0.1:8088` (no router port forward).
2. Access deny-by-default + email allowlist + OTP/PIN.
3. Locally / in GitHub secrets: `ALPHA_PUBLIC_BASE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
4. Origin stack healthy via `./infra/alpha/scripts/start-alpha.sh` + local smoke.

## Required remote tests (phase brief)

| # | Test | Status | Notes |
|---|---|---|---|
| 1 | Approved tester receives a PIN and authenticates | **PENDING_USER** | Not evidenced in-repo |
| 2 | Unapproved email is denied | **PENDING_USER** | Not evidenced in-repo |
| 3 | HTTPS is valid | **PENDING_USER** | Needs real alpha hostname |
| 4 | Home router has no required inbound port forwarding | **PENDING_USER** | Operator confirm |
| 5 | Only the edge proxy is reachable through the tunnel | **PENDING_USER** | |
| 6 | OTP GraphQL is not publicly accessible | **PENDING_USER** | |
| 7 | Data internal endpoints are not publicly accessible | **PENDING_USER** | |
| 8 | Metrics and debug paths are not publicly accessible | **PENDING_USER** | |
| 9 | Station autocomplete uses the live catalog | **PENDING_USER** | |
| 10 | Geolocation uses real coordinates | **PENDING_USER** | PlaceRefs only in logs/analytics |
| 11 | Baseline routing works | **PENDING_USER** | |
| 12 | Single-line constrained routing works | **PENDING_USER** | |
| 13 | Multi-line constrained routing works | **PENDING_USER** | Diversity residual risk remains |
| 14 | Complete satisfaction is represented correctly | **PENDING_USER** | |
| 15 | Partial satisfaction is represented correctly | **PENDING_USER** | |
| 16 | Stale and schedule-only states remain honest | **PENDING_USER** | |
| 17 | Live artifacts contain no fixture payloads | **PENDING_USER** | Dockerfile live bake will run `verify:no-fixtures` on next rebuild |
| 18 | API timeout maps correctly | **PENDING_USER** | |
| 19 | Static dataset, realtime snapshot, and graph versions are reported | **PENDING_USER** | |
| 20 | Mobile accessibility smoke passes | **PENDING_USER** | |

Where practical, run Playwright against the Access-protected alpha using a
service token. Automated remote monitor:

```bash
export ALPHA_PUBLIC_BASE_URL="https://<ALPHA_HOSTNAME>"
export CF_ACCESS_CLIENT_ID="…"
export CF_ACCESS_CLIENT_SECRET="…"
MONITOR_MODE=remote ./infra/alpha/scripts/monitor-alpha.sh
```

Local dogfood (`MONITOR_MODE=local`) does **not** satisfy these twenty tests.

## Honesty

- Origin is a **self-hosted macOS** computer (ADR-0021), not cloud private/public beta.
- Availability depends on home power, ISP, host awake, and Docker/Colima.
- Filling this table with PASS requires captured remote evidence — never invent passes.
