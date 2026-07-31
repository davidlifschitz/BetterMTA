# Integration / Live workstream handoff

**Workstream:** Integration / Launch (Step 3 Phases 3–12A)  
**Branch:** `agent/integration-live`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Date:** 2026-07-31  
**Contract version consumed:** `2026-07-30`  
**Phase:** Step 3 Phase 12A — self-hosted Cloudflare controlled alpha (local path + docs through 12A.13; remote gates pending)

Distinguish: **implemented** / **tested** / **mocked** / **deferred** / **blocked**.

---

## Final status recommendation

```text
BLOCKED
```

**Not** `READY_FOR_CONTROLLED_ALPHA` — Access env unset; approved/denied login not evidenced in-repo; distinct-digest rollback still disk-blocked; some reliability drills `PENDING_USER`; origin is self-hosted macOS, not public beta.  
**Not** `READY_FOR_PUBLIC_BETA` (no Fly activation, no production domain/TLS, no Fly rollback drill).  
**Not** `READY_FOR_PRIVATE_BETA` when that label means the intended Fly private-beta cohort (ADR-0012).

**Phase 12A local work through 12A.13 remediations is in place.** Deploy decision: ADR-0021 — self-hosted macOS + Compose origin; Cloudflare Tunnel transport; Cloudflare Access auth; no router port forwarding. Hosted private/public beta remains a separate later phase.

### Tip commit lineage (Phase 12A → tip)

| SHA | Summary |
|---|---|
| `7f26e1c` | 12A.13 remediations: release-pin start/stop; TUNNEL `pgrep` presence-only; gitignore cloudflared creds |
| `c30bcd4` | 12A.11–12A.12: local reliability drills + latency sample |
| `79ee2be` | 12A.9: Access-aware alpha health monitor |
| `fba7b36` | 12A.8: immutable release deploy/rollback scripts |
| `ceaff95` | 12A.5–7: host preflight + Tunnel/Access docs |
| `ae4e820` | 12A.4: alpha restart policies + start/stop |
| `ba3d6d3` | 12A.3: loopback edge proxy |
| `dd72260` | 12A.2: ADR-0021 |
| `3ceb6f5` | Phase 11 handoff / BLOCKED baseline |

Working-tree note (2026-07-31 completion packaging, **uncommitted** unless landed later): live Dockerfile bake runs `verify:no-fixtures` when `NEXT_PUBLIC_API_MODE=live`; completion docs + `docs/alpha/REMOTE_VALIDATION.md` stub. Full web image rebuild **not** re-run — host disk ~1 Gi free (`df` ~992 Mi on Data volume).

See also: `docs/RELEASE_GATE_REPORT.md`, `docs/alpha/REMOTE_VALIDATION.md`, `docs/alpha/RELIABILITY_DRILLS.md`, `docs/RUNBOOKS.md`.

---

## Phase 12A progress (through 12A.13)

| Step | Outcome |
|---|---|
| 12A.1 Local compose re-verify | **DONE** — edge healthy; CA01/CA02 PASS* |
| 12A.2 ADR-0021 | **DONE** |
| 12A.3 Edge proxy `127.0.0.1:8088` | **DONE** — smoke 8/8 |
| 12A.4 Restart policies + start/stop | **DONE** — 12A.13: prefer release pins when `deployments/current.env` exists |
| 12A.5–7 Host / Tunnel / Access docs | **DONE** (templates + runbooks; interactive CF still operator) |
| 12A.8 Release/rollback | **PARTIAL** — retag/same-digest PASS; distinct-digest **disk-blocked** |
| 12A.9 External monitor tooling | **DONE** locally; remote CA09 **PENDING** (secrets) |
| 12A.10 Remote validation (20 tests) | **PENDING_USER** — stub `docs/alpha/REMOTE_VALIDATION.md` (no fake passes) |
| 12A.11 Reliability drills | **PARTIAL** — see drills doc; Mac reboot/logout, cloudflared sudo, Colima restart PENDING_USER/skipped |
| 12A.12 Local latency sample | **PARTIAL** — `docs/alpha/PERFORMANCE.md`; not G15 |
| 12A.13 Independent reviews + local remediations | **DONE (local)** — CF/exposure **PASS** (after Medium remediations); host/rollback High (start/stop pins) **fixed**; fixtures/privacy **PASS**; Medium Dockerfile `verify:no-fixtures` on live bake added (rebuild deferred for disk) |

### 12A.13 review summary

| Review | Verdict |
|---|---|
| CF Tunnel / Access / exposure | **PASS** (Mediums remediated: presence-only `pgrep`, gitignore for accidental creds) |
| Host / volumes / rollback / gate integrity | High (start/stop ignoring release pins) **fixed** in `7f26e1c` |
| Fixtures / dataMode / privacy | **PASS** (no Critical/High); live Dockerfile verify gate added for next bake |

---

## 1. What was implemented (shipped on this branch)

End-to-end live path on **local Docker Compose** (data + OTP + API + web), plus QA gates, Phase 10 hardening, and Phase 12A controlled-alpha local edge:

| Area | Status |
|---|---|
| Live GTFS-RT feed gateway + static import | implemented, tested (compose) |
| OTP 2.9.0 graph build/runtime + feed-prefixed route IDs | implemented, tested |
| Production `OtpCandidateProvider` + ranking library | implemented, tested |
| Backend production adapters, fixture lockout, 504 timeout | implemented, tested |
| Frontend live hardening + Playwright e2e | implemented, tested |
| Dockerfiles + `docker-compose.yml` stack | implemented, tested (compose healthy) |
| Alpha edge + start/stop + release pins | implemented, tested (local) |
| Tunnel/Access templates + docs | implemented (docs); live CF **pending operator** |
| Fly TOML / deploy docs | prepared, **not activated** (**blocked**) |
| Live HTTP SUT, recorded NYC cases, G01–G20 checklist | implemented, tested |
| Cloud Fly apps / TLS / rollback drill | **blocked** |
| Google superiority comparison | **not claimed** |
| Multi-candidate diversity under selected-line constraints | limited (single OTP plan family; multi-line risk) |
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
- Local compose is the controlled-alpha origin; availability depends on home power, internet, Docker Desktop/Colima, and host awake — not cloud-grade.
- Compose token `BETTERMTA_INTERNAL_TOKEN=dev-local-token` is **non-prod**.
- OTP needs ≳4 GiB Docker RAM (Colima ~12 GiB used successfully).
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

# Remote (PENDING_USER — needs Access secrets; see docs/alpha/REMOTE_VALIDATION.md)
# MONITOR_MODE=remote ./infra/alpha/scripts/monitor-alpha.sh
```

---

## 6. Validation results (evidence)

### Local edge / drills (12A.11–12A.12)

- Edge smoke **8/8**; local monitor **6/0** with `dataMode=live` after rollback recreate (see drills doc).
- Rollback retag drill PASS (~99 s); same digest (`previous.env` == `current.env`) — distinct-digest still disk-blocked.
- Latency sample: n=15 via edge; p50=42 ms p95=1170 ms — `docs/alpha/PERFORMANCE.md`.

### Remote (12A.10)

All 20 remote tests: **PENDING_USER** / not run — `docs/alpha/REMOTE_VALIDATION.md`.

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

- Candidate diversity: live path often returns a **single OTP plan family** — multi-line selected-line scenarios remain under-exercised (product risk).
- Compose `docker compose` plugin may be missing; use `docker-compose` (documented).
- Host disk critically tight (~1 Gi) — blocks distinct-digest rebuild/deploy drills and deferred live web image rebuild for Dockerfile verify proof.

---

## 9. Known limitations / residual risks / deferred

| Item | Status |
|---|---|
| Controlled alpha edge proxy (12A.3) | **DONE** |
| Cloudflare Tunnel + Access live config | **PENDING_USER** (docs only in-repo) |
| Remote Access smoke / 20 remote tests | **PENDING_USER** — blocks `READY_FOR_CONTROLLED_ALPHA` |
| Distinct-digest rollback (CA08) | **BLOCKED-for-disk** |
| Reliability drills Mac/cloudflared/Colima | **PENDING_USER** / skipped |
| Home power / internet / sleep / Docker HA | **Accepted limitation** (ADR-0021; R19–R21) |
| Fly activation | **BLOCKED** (separate hosted-beta phase) |
| Google/Apple/Citymapper comparison | **NOT_CLAIMED** |
| A11y D.3 / load-test p95 C.4 | **NOT_MEASURED** / G15 PARTIAL local only |
| Shadow human validity | **pending_review** |
| Multi-line candidate diversity | **Residual risk** |

---

## 10. Why not `READY_FOR_CONTROLLED_ALPHA`

1. Access env unset (`ALPHA_PUBLIC_BASE_URL`, `CF_ACCESS_*`); approved + denied login **not evidenced** in-repo.  
2. Distinct-digest rollback still **disk-blocked** (~1 Gi free).  
3. Some reliability drills **PENDING_USER** (Mac reboot/logout, cloudflared sudo HUP, Colima restart).  
4. Origin is **self-hosted macOS** — not public beta; no cloud SLA.

### Operator checklist to unblock (no secrets in docs)

1. Rotate tunnel token → credentials-file (named tunnel; no Quick Tunnel; no port forward).  
2. Access deny-default + email allowlist + OTP.  
3. Set `ALPHA_PUBLIC_BASE_URL` + `CF_ACCESS_*` locally / GH secrets (names only in repo).  
4. Run remote monitor + approved/denied login tests; fill `docs/alpha/REMOTE_VALIDATION.md` with evidence.  
5. Free disk for distinct-digest deploy/rollback drill (+ optional live web rebuild to prove Dockerfile verify).  
6. Approve reboot/logout / cloudflared sudo drills if required.

---

## 11. Decisions requiring conductor / human approval

1. Controlled-alpha tester allowlist and Access policy (emails stay out of repo).  
2. When to activate Fly for **hosted** private beta (separate from ADR-0021).  
3. Accept/reject live shadow reports (`humanValidity`).  
4. Whether multi-line diversity gaps block invite rollout for controlled alpha.  
5. Explicit approval for Mac reboot/logout and privileged cloudflared restart drills.

---

## 12. Exact next integration step

1. Operator completes Tunnel + Access (checklist above).  
2. Run remote monitor + the 20 remote tests; update `REMOTE_VALIDATION.md` with real evidence only.  
3. Free disk; complete distinct-digest rollback; optionally rebuild live web image to exercise Dockerfile `verify:no-fixtures`.  
4. Reconsider `READY_FOR_CONTROLLED_ALPHA` only after CA03–CA05 (+ preferred CA08/CA09) have remote evidence.  
5. Do **not** claim public beta or competitive superiority.

---

## Cost estimate (cite)

- `docs/RUNBOOKS.md` — **~$30–50/mo** Fly footprint (4 Machines, no Postgres; OTP dominates).  
- Local compose / controlled alpha: host/Colima electricity + disk only (no Fly IPv4/egress).

---

## Suggested skills (next agent)

- `verification-before-completion` before flipping status off `BLOCKED`
- Operator-led Cloudflare Access/Tunnel setup (no secrets in chat)
- `handoff` after remote CA03–CA05 evidence lands
