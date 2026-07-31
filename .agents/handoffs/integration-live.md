# Integration / Live workstream handoff

**Workstream:** Integration / Launch (Step 3 Phases 3–12A)  
**Branch:** `agent/integration-live`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Date:** 2026-07-31  
**Contract version consumed:** `2026-07-30`  
**Phase:** Step 3 Phase 12A — self-hosted Cloudflare controlled alpha (final certification go decision)

Distinguish: **implemented** / **tested** / **mocked** / **deferred** / **blocked**.

---

## Final status recommendation

```text
READY_FOR_CONTROLLED_ALPHA
```

**Bounded controlled alpha only.** Origin is a **self-hosted macOS** computer. Tunnel runs through a **user LaunchAgent** (`com.bettermta.cloudflared-alpha`, credentials-file, KeepAlive + RunAtLoad). Availability depends on home power, internet, host wakefulness, Docker/Colima, and user login. This is **not** cloud-grade and **not** public-beta readiness. Intended hosted private/public beta remains Fly.io (ADR-0012) — do **not** label `READY_FOR_PRIVATE_BETA` / `READY_FOR_PUBLIC_BETA`. No competitor-performance claims. OTP candidate-diversity risk remains open.

**Not** `READY_FOR_PUBLIC_BETA` (no Fly activation, no production domain/TLS, no Fly rollback drill).  
**Not** `READY_FOR_PRIVATE_BETA` when that label means the intended Fly private-beta cohort (ADR-0012).

**Phase 12A certification complete (2026-07-31).** Deploy decision: ADR-0021 — self-hosted macOS + Compose origin; Cloudflare Tunnel transport; Cloudflare Access auth; no router port forwarding. Hosted private/public beta remains a separate later phase.

### Tip commit lineage (Phase 12A → tip)

| SHA | Summary |
|---|---|
| *(pending)* | Phase 12A final certification docs + go decision (`READY_FOR_CONTROLLED_ALPHA`) — **pending certification commit after `130c4b3`** |
| `130c4b3` | 12A completion package (prior BLOCKED baseline + live Dockerfile verify gate) |
| `7f26e1c` | 12A.13 remediations: release-pin start/stop; TUNNEL `pgrep` presence-only; gitignore cloudflared creds |
| `c30bcd4` | 12A.11–12A.12: local reliability drills + latency sample |
| `79ee2be` | 12A.9: Access-aware alpha health monitor |
| `fba7b36` | 12A.8: immutable release deploy/rollback scripts |
| `ceaff95` | 12A.5–7: host preflight + Tunnel/Access docs |
| `ae4e820` | 12A.4: alpha restart policies + start/stop |
| `ba3d6d3` | 12A.3: loopback edge proxy |
| `dd72260` | 12A.2: ADR-0021 |
| `3ceb6f5` | Phase 11 handoff / BLOCKED baseline |

See also: `docs/RELEASE_GATE_REPORT.md`, `docs/alpha/REMOTE_VALIDATION.md`, `docs/alpha/RELIABILITY_DRILLS.md`, `docs/alpha/PERFORMANCE.md`, `infra/alpha/TUNNEL.md` (LaunchAgent section).

---

## Phase 12A progress (final certification)

| Step | Outcome |
|---|---|
| 12A.1 Local compose re-verify | **DONE** — edge healthy; CA01/CA02 PASS* |
| 12A.2 ADR-0021 | **DONE** |
| 12A.3 Edge proxy `127.0.0.1:8088` | **DONE** — smoke 8/8 |
| 12A.4 Restart policies + start/stop | **DONE** — release pins when `deployments/current.env` exists |
| 12A.5–7 Host / Tunnel / Access docs | **DONE** — LaunchAgent canonical runner documented |
| 12A.8 Release/rollback | **DONE** — distinct-digest rollback PASS (2026-07-31 certification) |
| 12A.9 External monitor tooling | **DONE** — remote CA09 **PASS** (official monitor 6/0) |
| 12A.10 Remote validation (20 tests) | **DONE** — `docs/alpha/REMOTE_VALIDATION.md` filled with evidence |
| 12A.11 Reliability drills | **PASS*** — service/Colima/LaunchAgent/RT-pause PASS; Mac reboot/logout **PENDING_USER** residual |
| 12A.12 Local latency sample | **PASS*** — `docs/alpha/PERFORMANCE.md`; not G15 SLO |
| 12A.13 Independent reviews + remediations | **DONE** — CF/exposure **PASS**; host/rollback **PASS**; fixtures/privacy **PASS** |

### Remote gates (certification)

| Gate | Outcome |
|---|---|
| CA03–CA05 | **PASS** — named tunnel + Access allowlist/deny + remote smoke |
| CA08 | **PASS** — distinct-digest rollback (~105 s) |
| CA09 | **PASS** — official remote monitor 6/0 |
| CA10 | **PASS*** — Mac reboot/logout **PENDING_USER** residual (non-blocking) |
| CA11 | **PASS*** — local + remote Access n=15 samples; no competitor claims |

### 12A.13 review summary

| Review | Verdict |
|---|---|
| CF Tunnel / Access / exposure | **PASS** (LaunchAgent canonical; presence-only `pgrep`; gitignore for accidental creds) |
| Host / volumes / rollback / gate integrity | **PASS** (release pins fixed; distinct-digest rollback proven) |
| Fixtures / dataMode / privacy | **PASS** (live Dockerfile verify gate on live bake) |

---

## 1. What was implemented (shipped on this branch)

End-to-end live path on **local Docker Compose** (data + OTP + API + web), plus QA gates, Phase 10 hardening, and Phase 12A controlled-alpha edge + remote certification:

| Area | Status |
|---|---|
| Live GTFS-RT feed gateway + static import | implemented, tested (compose) |
| OTP 2.9.0 graph build/runtime + feed-prefixed route IDs | implemented, tested |
| Production `OtpCandidateProvider` + ranking library | implemented, tested |
| Backend production adapters, fixture lockout, 504 timeout | implemented, tested |
| Frontend live hardening + Playwright e2e | implemented, tested |
| Dockerfiles + `docker-compose.yml` stack | implemented, tested (compose healthy) |
| Alpha edge + start/stop + release pins | implemented, tested (local + remote) |
| Tunnel/Access + LaunchAgent runner | implemented, tested (remote certification) |
| Fly TOML / deploy docs | prepared, **not activated** (**blocked**) |
| Live HTTP SUT, recorded NYC cases, G01–G20 checklist | implemented, tested |
| Cloud Fly apps / TLS / rollback drill | **blocked** |
| Google superiority comparison | **not claimed** |
| Multi-candidate diversity under selected-line constraints | limited (single OTP plan family; multi-line risk **open**) |
| Shadow `humanValidity` | **pending_review** |

---

## 2. Files changed (integration-live scope)

Primary surfaces (cumulative on branch; not exhaustive):

- `services/data/**`, `services/otp/**`, `services/routing/**`
- `apps/api/**`, `apps/web/**` (incl. live Dockerfile `verify:no-fixtures` when mode=live)
- `docker-compose.yml`, `docker-compose.alpha.yml`, `docker-compose.release.yml`, Dockerfiles
- `infra/alpha/**`, `deployments/**`
- `infra/fly/**`, `.github/workflows/**` (prep / alpha-monitor soft-skip)
- `benchmarks/**` (live SUT, recorded cases, release gate)
- `docs/RELEASE_GATE_REPORT.md`, `docs/RUNBOOKS.md`, `docs/alpha/*`, related ADRs
- `.agents/handoffs/*.md` (workstream + this file)

Conductor `contracts/**` consumed read-only; no incompatible contract forks.

---

## 3. Public interfaces and schemas

Consumed locked conductor surfaces (`2026-07-30`):

- `POST /v1/routes/search`, `GET /v1/lines`, `GET /v1/places/search`, `GET /v1/status`
- `GET /health/live`, `GET /health/ready`
- OpenAPI / JSON Schema / fixtures under `contracts/**`

No new public beta claims beyond honest `dataMode` labeling.

---

## 4. Assumptions

- **Current** remote cohort target is self-hosted controlled alpha (ADR-0021); hosted private/public beta remains Fly.io (ADR-0012) as a **separate later phase**.
- Local compose is the controlled-alpha origin; availability depends on home power, internet, host wakefulness, Docker/Colima, and user login — **not** cloud-grade.
- Tunnel transport via user LaunchAgent `com.bettermta.cloudflared-alpha` (credentials-file, KeepAlive, RunAtLoad).
- Compose token `BETTERMTA_INTERNAL_TOKEN=dev-local-token` is **non-prod**.
- OTP needs ≳4 GiB Docker RAM (Colima ~12 GiB used successfully).
- Prefer `docker-compose` CLI when `docker compose` plugin is absent.
- Shadow reports require human review before treating live smoke as accepted evidence.
- No secrets, tunnel UUIDs, hostnames, or tester emails in the repo.

---

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-integration-live

# Contracts + QA (no stack required)
npm --prefix contracts run validate
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate

# Controlled-alpha local edge
./infra/alpha/scripts/preflight-host.sh
./infra/alpha/scripts/start-alpha.sh
./infra/alpha/scripts/smoke-edge.sh
MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh

# Live web bake fixture check (after local or Docker live build)
# Docker: baked into apps/web/Dockerfile when NEXT_PUBLIC_API_MODE=live
npm --prefix apps/web run verify:no-fixtures

# Remote (operator env on host; see docs/alpha/REMOTE_VALIDATION.md)
# set -a && source ~/.config/bettermta/alpha-access.env && set +a
# MONITOR_MODE=remote MONITOR_SOFT_SKIP=0 ./infra/alpha/scripts/monitor-alpha.sh
```

---

## 6. Validation results (evidence)

### Remote certification (12A.10)

- All 20 remote tests: **PASS** / **PASS*** — `docs/alpha/REMOTE_VALIDATION.md`.
- Official remote monitor: **6 passed, 0 warnings, 0 failed, 0 skipped**.
- Approved + denied Access interactive auth: **PASS** (host evidence; not in Git).

### Reliability drills (12A.11)

- Edge/web/API/data/OTP restarts, Colima restart, LaunchAgent kickstart, RT-pause: **PASS** / **PASS***.
- Distinct-digest rollback: **PASS** (~105 s) — `docs/alpha/RELIABILITY_DRILLS.md`.
- Mac logout/reboot: **PENDING_USER** (explicit residual; non-blocking for controlled alpha).

### Performance (12A.12)

- Local + remote Access n=15 samples — `docs/alpha/PERFORMANCE.md`; not G15 SLO; no competitor claims.

### Phase 9–11 baseline (unchanged honesty)

Fixture gate G01–G07 **PASS**. Fly **BLOCKED**. G20 **NOT_CLAIMED**. Full table: `docs/RELEASE_GATE_REPORT.md`.

---

## 7. How to run local compose / alpha stack

```bash
cd /Users/thebiglipper/Developer/bettermta-integration-live

./infra/alpha/scripts/start-alpha.sh   # uses release pins if deployments/current.env exists
./infra/alpha/scripts/smoke-edge.sh
./infra/alpha/scripts/stop-alpha.sh    # no -v; volumes kept
```

Internal networking and smoke curls: `docs/RUNBOOKS.md` § Controlled alpha / Local compose.

---

## 8. Known defects

- Candidate diversity: live path often returns a **single OTP plan family** — multi-line selected-line scenarios remain under-exercised (**residual product risk; non-blocking for controlled alpha**).
- Compose `docker compose` plugin may be missing; use `docker-compose` (documented).

---

## 9. Known limitations / residual risks / deferred

| Item | Status |
|---|---|
| Controlled alpha edge proxy (12A.3) | **DONE** |
| Cloudflare Tunnel + Access live config | **DONE** (certification evidence on host) |
| Remote Access smoke / 20 remote tests | **DONE** |
| Distinct-digest rollback (CA08) | **PASS** |
| Reliability drills Mac reboot/logout | **PENDING_USER** residual (non-blocking) |
| Home power / internet / sleep / Docker HA | **Accepted limitation** (ADR-0021; R19–R21) |
| Fly activation | **BLOCKED** (separate hosted-beta phase) |
| Google/Apple/Citymapper comparison | **NOT_CLAIMED** |
| A11y D.3 / load-test p95 C.4 | **NOT_MEASURED** / G15 PARTIAL local only |
| Shadow human validity | **pending_review** |
| Multi-line candidate diversity | **Residual risk (open)** |
| GH alpha-monitor workflow | **Optional** — soft until repo secrets + `ALPHA_MONITOR_ENABLED` |

---

## 10. Why `READY_FOR_CONTROLLED_ALPHA`

Certification evidence (2026-07-31) satisfies ADR-0021 controlled-alpha gates with honest bounded scope:

1. **Remote validation complete** — all 20 tests documented in `docs/alpha/REMOTE_VALIDATION.md`; official remote monitor **6/0**; approved + denied Access auth evidenced on host (no emails in Git). Gates CA03–CA05 **PASS**.
2. **Rollback integrity proven** — distinct-digest web image rollback **PASS** (~105 s); CA08 **PASS**. Evidence: `docs/alpha/RELIABILITY_DRILLS.md` drill #15.
3. **Reliability drills green with documented residuals** — service restarts, Colima restart, LaunchAgent kickstart, RT-pause **PASS**; CA10 **PASS*** with Mac reboot/logout **PENDING_USER** (explicit, non-blocking given ADR-0021 honesty). Evidence: `docs/alpha/RELIABILITY_DRILLS.md`.
4. **Performance sampled honestly** — local + remote Access n=15 in `docs/alpha/PERFORMANCE.md`; CA11 **PASS***; not G15 SLO; no competitor claims.
5. **Canonical tunnel runner documented** — user LaunchAgent `com.bettermta.cloudflared-alpha` (credentials-file, KeepAlive, RunAtLoad) in `infra/alpha/TUNNEL.md` LaunchAgent section; exactly one `cloudflared` process.
6. **Gate report aligned** — `docs/RELEASE_GATE_REPORT.md` final status `READY_FOR_CONTROLLED_ALPHA` with CA03–CA05/CA08/CA09 **PASS** and CA10/CA11 **PASS***.

**Explicit scope limits (not waived):**

- Origin is **self-hosted macOS** — availability depends on home power, internet, host wakefulness, Docker/Colima, user login.
- **Bounded controlled alpha** — allowlisted testers via Cloudflare Access only.
- **Not** cloud-grade, **not** public beta, **not** Fly private beta.
- **No** competitor-performance claims.
- OTP **candidate-diversity risk remains open** (multi-line scenarios may collapse to one plan family).

---

## 11. Decisions requiring conductor / human approval

1. Controlled-alpha tester allowlist and Access policy (emails stay out of repo).  
2. When to activate Fly for **hosted** private beta (separate from ADR-0021).  
3. Accept/reject live shadow reports (`humanValidity`).  
4. Whether multi-line diversity gaps block expanding the controlled-alpha cohort beyond initial allowlist.  
5. Explicit approval for optional Mac reboot/logout drills.

---

## 12. Exact next integration step (operators)

1. **Invite allowlisted testers** — share Access-protected URL only after allowlist is set; emails stay out of repo.  
2. **Optional:** configure GitHub repository secrets + `ALPHA_MONITOR_ENABLED` for scheduled alpha-monitor workflow (workflow remains soft until enabled).  
3. **Optional:** run Mac reboot/logout drill with explicit operator approval; confirm LaunchAgent + `start-alpha.sh` recovery.  
4. Do **not** merge to `main` automatically — conductor review of certification commit + cohort decision first.  
5. Do **not** claim public beta, Fly private beta, or competitive superiority.

---

## Cost estimate (cite)

- `docs/RUNBOOKS.md` — **~$30–50/mo** Fly footprint (4 Machines, no Postgres; OTP dominates).  
- Local compose / controlled alpha: host/Colima electricity + disk only (no Fly IPv4/egress).

---

## Suggested skills (next agent)

- `handoff` after certification commit is pushed
- Operator-led tester onboarding (no secrets in chat)
- `verification-before-completion` before any status flip toward hosted private/public beta
