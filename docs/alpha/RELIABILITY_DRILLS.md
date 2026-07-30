# Controlled alpha — local reliability drills (Phase 12A.11)

**Date:** 2026-07-30  
**Host:** self-hosted macOS + Colima Docker  
**Stack:** `docker-compose -f docker-compose.yml -f docker-compose.alpha.yml`  
**Edge:** `http://127.0.0.1:8088`  
**Release pointer:** `rel-20260730T204924Z-ceaff95fab26`  
**Disk at drill time:** ~2.2–3.1 Gi free (avoid image pulls/builds)  
**Evidence logs (host tmp, not committed):** `/tmp/bettermta-drill-*.log`

## Method

For each performed drill:

1. Record start time  
2. Perform the action  
3. Wait until edge `/health/live` + `/health/ready` return 200  
4. Run `./infra/alpha/scripts/smoke-edge.sh` and/or `MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh`  
5. Note approximate outage (action → ready) and `dataMode` / static coherence when visible  

**Honesty notes**

- `/health/ready` is API readiness (data+OTP adapters). Web may briefly 502 after a web-only restart until Next.js finishes boot.  
- Feed age was often `stale` mid-session (MTA poll timeouts); after full stack recreate, status recovered to `dataMode=live`. Never unlabeled “live” when stale.  
- No Cloudflare Access remote path was exercised here (CA03–CA05 still PENDING).  
- Do **not** reboot or logout this Mac without explicit operator approval.

## Results table

| # | Drill | Result | Approx duration | Evidence / notes |
|---|---|---|---|---|
| 1 | Edge proxy restart | **PASS** | ~10 s | `docker-compose … restart edge`; ready ~5 s; smoke **8/8**; `dataMode=stale` preserved; static `mta-subway-c9c3366cdd16` |
| 2 | Web restart | **PASS*** | ~4 s to API-ready; web HTML recovered &lt;90 s | Immediate smoke: `/` **502** (Next not up yet) while `/health/ready` already 200. Recovery recheck: smoke **8/8**. *Document race: wait on `GET /` 200, not only API ready |
| 3 | API restart | **PASS** | ~38 s | `restart api`; ready ~33 s; smoke **8/8**; status stayed honest (`stale` → later fresh snapshot id) |
| 4 | Data restart | **PASS** | ~15 s | `restart data data-proxy`; ready ~11 s; smoke **8/8**; static version unchanged |
| 5 | OTP restart | **PASS** | ~59 s | `restart otp`; ready ~55 s; smoke **8/8**; local monitor **6 pass / 1 stale warn**; static/graph coherence OK |
| 6 | cloudflared restart | **PENDING_USER** | — | Process present (`pgrep -x cloudflared`). `kill -HUP` → **operation not permitted** (LaunchDaemon). Manual (no tokens): `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` then confirm `pgrep -x cloudflared` + local edge health. Do not dump argv/credentials |
| 7 | Docker Desktop / Colima restart | **SKIPPED** (risk) | — | Colima running. **Not** executed: host disk ~2.4 Gi free; full VM restart risks long OTP/graph outage + recovery pressure. Prefer operator window with ≥6 Gi free. Manual if needed: `colima restart` then `./infra/alpha/scripts/start-alpha.sh` |
| 8 | Mac logout/login | **PENDING_USER** | — | Skipped — needs explicit user approval (LaunchAgents/user session side effects) |
| 9 | Mac reboot | **PENDING_USER** | — | Skipped — do not reboot without explicit approval |
| 10 | Temporary internet interruption | **PENDING_USER** / soft-sim | — | Hard host disconnect not performed. Soft substitute: drill **#11** (pause data). Full Wi‑Fi/Ethernet flap remains operator-owned |
| 11 | Realtime polling interruption | **PASS** | ~27 s | `docker pause bettermta-data-1` ~25 s then `unpause`; edge stayed live+ready; monitor **6/0 fail** with honest `stale` warning + static coherence; route smoke OK. Complements data restart recovery (#4) |
| 12 | Hollow realtime | **PASS (unit evidence)** | — | Live hollow inject unsafe/unnecessary on alpha host. Phase 10 unit evidence: `services/data/tests/realtime-live.test.ts` — `describe("partial-feed status + hollow LKG")`, esp. `hollow protobuf WITH trip_replacement_period does not overwrite LKG or become live` and empty/hollow poll LKG retention. Related: handoff Phase 10 hollow GTFS-RT LKG |
| 13 | Static dataset rollback | **SKIPPED** | — | Runbook: `docs/RUNBOOKS.md` § Static rollback. Only one version on disk: `mta-subway-c9c3366cdd16` under `services/data/var/data/static/versions/`. No prior pointer to repoint safely |
| 14 | OTP graph rollback | **SKIPPED** | — | Same runbook. Only graph dir: `mta-subway-c9c3366cdd16+otp2.9.0`. No prior graph for safe `active.json` repoint |
| 15 | Application release rollback | **PASS*** | ~99 s | `./deployments/scripts/rollback-release.sh` → recreate + edge ready + smoke **8/8**; manifest `deployments/manifests/rollback-20260730T210125Z.json`. *Same RELEASE_ID / digests as `previous.env`/`current.env`/` :local` — **retag path** proven, **not** distinct-digest rollback. Post-status: `dataMode=live` static `mta-subway-c9c3366cdd16` |

## Post-drill stack check

| Check | Result |
|---|---|
| Edge `/health/live` + `/health/ready` | 200 |
| `MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh` | 6 passed, 0 failed (after rollback; `dataMode=live`) |
| Static / route coherence | `mta-subway-c9c3366cdd16` |
| Volumes deleted? | No |

## Operator follow-ups (PENDING_USER)

```bash
# cloudflared (LaunchDaemon) — no tokens on argv in docs
sudo launchctl kickstart -k system/com.cloudflare.cloudflared
pgrep -x cloudflared   # expect running
curl -fsS http://127.0.0.1:8088/health/live

# Optional later (disk + approval):
# colima restart && ./infra/alpha/scripts/start-alpha.sh
# Mac logout/login or reboot — only with explicit approval
```

## Related

- Runbooks: `docs/RUNBOOKS.md`  
- Alpha index: `infra/alpha/README.md`  
- Release/rollback: `deployments/README.md`  
- Gate report: `docs/RELEASE_GATE_REPORT.md`  
- Local latency sample (12A.12): `docs/alpha/PERFORMANCE.md`
