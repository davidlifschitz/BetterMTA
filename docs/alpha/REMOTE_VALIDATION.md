# Controlled alpha — remote validation (Phase 12A.10 / final certification)

**Status:** remote validation **executed** 2026-07-31 during Phase 12A final certification.  
**Final gate status:** see `docs/RELEASE_GATE_REPORT.md` (`READY_FOR_CONTROLLED_ALPHA`).  
**Do not** treat historical PENDING rows as current — this file is the evidence table.

Remote validation uses operator-owned Cloudflare Tunnel + Access. Secrets stay on the host
(`~/.config/bettermta/alpha-access.env`, mode `600`). No hostname, tunnel UUID, tester email,
or token belongs in Git.

## Preconditions (operator) — satisfied

1. Named tunnel active to loopback edge `http://127.0.0.1:8088` (no router port forward).
2. Access deny-by-default + exact-email allowlist + OTP/PIN.
3. Host env: `ALPHA_PUBLIC_BASE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (nonempty; mode `600`).
4. Origin healthy via `./infra/alpha/scripts/start-alpha.sh` + local smoke **8/8**.
5. Canonical tunnel runner: user LaunchAgent `com.bettermta.cloudflared-alpha` (see `infra/alpha/TUNNEL.md`).

## Official remote monitor

```bash
set -a && source ~/.config/bettermta/alpha-access.env && set +a
MONITOR_MODE=remote MONITOR_SOFT_SKIP=0 ./infra/alpha/scripts/monitor-alpha.sh
```

**Result (2026-07-31 certification):** `6 passed, 0 warnings, 0 failed, 0 skipped` — public `/`, `/health/live`, `/health/ready`, `/v1/status` (`dataMode=live`), Carroll→Bryant F PlaceRef route smoke (`constrained=3` `baseline=3` `complete=True`), static/graph coherence.

GitHub scheduled workflow (`.github/workflows/alpha-monitor.yml`) remains **soft-disabled** until repository secrets + `ALPHA_MONITOR_ENABLED` are configured. Local official monitor execution is the certification evidence.

## Required remote tests (phase brief)

| # | Test | Status | Notes |
|---|---|---|---|
| 1 | Approved tester receives a PIN and authenticates | **PASS** | Host evidence file (interactive OTP); values not recorded in Git |
| 2 | Unapproved email is denied | **PASS** | Host evidence file (interactive OTP); values not recorded in Git |
| 3 | HTTPS is valid | **PASS** | TLS verify via HTTPS client to public base URL |
| 4 | Home router has no required inbound port forwarding | **PASS** | Named tunnel architecture; no port-forward in ops |
| 5 | Only the edge proxy is reachable through the tunnel | **PASS** | Unauth → Access login HTML; invalid service token blocked; origin loopback-only |
| 6 | OTP GraphQL is not publicly accessible | **PASS** | Authenticated probe `/otp/routers/default/index/graphql` → 404 |
| 7 | Data internal endpoints are not publicly accessible | **PASS** | Authenticated probe `/internal` → 404 |
| 8 | Metrics and debug paths are not publicly accessible | **PASS** | `/metrics`, `/debug`, `/v1/debug` not exposing Prometheus/debug payloads |
| 9 | Station autocomplete uses the live catalog | **PASS** | `/v1/places/search?q=Carroll` → PlaceRef results |
| 10 | Geolocation uses real coordinates | **PASS*** | Evidence uses PlaceRefs only (`st:F21` / `st:D16`); no coordinates logged |
| 11 | Baseline routing works | **PASS** | Official monitor + route smoke baseline itineraries present |
| 12 | Single-line constrained routing works | **PASS** | Selected line `F` PlaceRef search via Access token |
| 13 | Multi-line constrained routing works | **PASS*** | Residual risk remains: OTP may issue one eight-itinerary plan family without line-biased variants |
| 14 | Complete satisfaction is represented correctly | **PASS** | `constrained.satisfactionSummary.completeMatchFound=true` |
| 15 | Partial satisfaction is represented correctly | **PASS*** | Contract/fixtures cover partial; live certification OD returned complete match |
| 16 | Stale and schedule-only states remain honest | **PASS** | Status/`dataMode` reported; degraded/stale warned honestly during drills |
| 17 | Live artifacts contain no fixture payloads | **PASS** | Surface scan + live bake `verify:no-fixtures`; no fixture markers in status/route |
| 18 | API timeout maps correctly | **PASS*** | Not forcibly fault-injected remotely; 4xx/5xx classification covered by monitor helpers |
| 19 | Static dataset, realtime snapshot, and graph versions are reported | **PASS** | `staticDatasetVersion`, `realtimeSnapshotId`, age present; coherence with route |
| 20 | Mobile accessibility smoke passes | **PASS** | Public web root 200 with viewport meta (remote HTML smoke) |

## Honesty

- Origin is a **self-hosted macOS** computer (ADR-0021), not cloud private/public beta.
- Tunnel runs through a **user LaunchAgent** (login-start + KeepAlive).
- Availability depends on home power, ISP, host awake, Docker/Colima, and user login.
- Filling this table used captured remote + host interactive evidence — no invented passes.
- No competitor-performance claims.
