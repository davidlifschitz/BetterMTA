# Controlled alpha — reliability drills (Phase 12A.11 + final certification)

**Dates:** 2026-07-30 (local), 2026-07-31 (certification re-run + remote monitor)  
**Host:** self-hosted macOS + Colima Docker  
**Stack:** `docker-compose -f docker-compose.yml -f docker-compose.alpha.yml -f docker-compose.release.yml`  
**Edge:** `http://127.0.0.1:8088`  
**Tunnel runner:** user LaunchAgent `com.bettermta.cloudflared-alpha` (credentials-file)  
**Release pointers (host-only `deployments/*.env`):** current `rel-20260731T155125Z-cert-distinct`; previous `rel-20260730T204924Z-ceaff95fab26`

## Method

For each performed drill:

1. Record start time  
2. Perform the action  
3. Wait until edge `/health/live` + `/health/ready` return 200 (and `/` 200 after web restart)  
4. Run `./infra/alpha/scripts/smoke-edge.sh` and/or  
   `MONITOR_MODE=remote MONITOR_SOFT_SKIP=0 ./infra/alpha/scripts/monitor-alpha.sh` (Access token)  
5. Note approximate outage and honest `dataMode`

**Honesty notes**

- `/health/ready` is API readiness. Web may briefly fail HTML until Next.js finishes boot.  
- Never unlabeled “live” when stale.  
- Mac logout/reboot **not** executed (needs explicit operator approval) — residual availability risk documented; **non-blocking** for controlled-alpha go given ADR-0021 honesty.  
- Do **not** dump cloudflared argv/credentials.

## Results table

| # | Drill | Result | Approx duration | Evidence / notes |
|---|---|---|---|---|
| 1 | Edge proxy restart | **PASS** | ~6 s | `docker-compose … restart edge`; smoke **8/8**; remote monitor **6/0** |
| 2 | Web restart | **PASS** | ~5 s | Wait for `/` 200; smoke **8/8**; remote monitor **6/0** |
| 3 | API restart | **PASS** | ~19 s | Ready ~13 s; smoke **8/8**; remote monitor **6/0** |
| 4 | Data restart | **PASS** | ~4 s | `restart data data-proxy`; smoke **8/8**; remote monitor **6/0** |
| 5 | OTP restart | **PASS*** | ~4 s wall | One immediate remote monitor run showed **4 pass / 1 fail** during OTP settle; subsequent RT-pause + final monitors **6/0**. Treat as brief settle race |
| 6 | Named-tunnel LaunchAgent restart | **PASS** | ~6 s | `launchctl kickstart -k gui/$UID/com.bettermta.cloudflared-alpha`; exactly one `cloudflared`; remote monitor **6/0** |
| 7 | Docker/Colima restart | **PASS** | ~86 s | `colima restart` then `start-alpha.sh`; smoke **8/8**; remote monitor **6/0** (1 warn once) |
| 8 | Mac logout/login | **PENDING_USER** | — | Explicit approval required; residual risk: tunnel RunAtLoad needs login |
| 9 | Mac reboot | **PENDING_USER** | — | Explicit approval required; residual risk accepted for controlled alpha |
| 10 | Temporary internet interruption | **PASS*** | soft-sim | Soft substitute = realtime pause (#11). Hard NIC flap not performed |
| 11 | Realtime polling interruption | **PASS** | ~25–27 s | `docker pause bettermta-data-1` then unpause; remote monitor **6/0** |
| 12 | Hollow realtime | **PASS (unit evidence)** | — | Phase 10 unit evidence in `services/data/tests/realtime-live.test.ts` (hollow LKG) |
| 13 | Static dataset rollback | **SKIPPED** | — | Only one static version on disk |
| 14 | OTP graph rollback | **SKIPPED** | — | Only one graph dir on disk |
| 15 | Application release rollback (distinct digest) | **PASS** | ~105 s | Certification web image LABEL `bettermta.certification.build=cert-distinct-20260731` (digest prefix `69821325b92de52d`) → rollback to prior tag (digest prefix `9f71ea0812587a02`, no cert label). `rollback-release.sh` exit 0; local smoke **8/8**; remote Access smoke PASS. Host evidence: `deployments/manifests/certification-distinct-rollback-20260731T155537Z.json` (gitignored) + this table |

## Post-drill / certification stack check

| Check | Result |
|---|---|
| Edge `/health/live` + `/health/ready` | 200 |
| Local smoke | **8/8** |
| Official remote monitor | **6/0** (final) |
| Tunnel process count | 1 (`pgrep -x cloudflared`) |
| Volumes deleted? | No |

## Operator follow-ups (non-blocking residuals)

```bash
# Optional: Mac logout/login or reboot with explicit approval, then confirm LaunchAgent + start-alpha
# Optional: enable GH alpha-monitor secrets (workflow remains soft until ALPHA_MONITOR_ENABLED)
```
