# Integration / Live workstream handoff

**Workstream:** Integration / Launch (Step 3 Phases 3–12A)  
**Branch:** `agent/integration-live`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-integration-live`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`  
**Phase:** Step 3 Phase 12A — self-hosted Cloudflare controlled alpha (docs/ADR started; remote gates pending)

Distinguish: **implemented** / **tested** / **mocked** / **deferred** / **blocked**.

---

## Final status recommendation

```text
BLOCKED
```

**Not** `READY_FOR_CONTROLLED_ALPHA` — Phase 12A local edge (CA02) done; Tunnel, Access, remote smoke not yet evidenced.  
**Not** `READY_FOR_PUBLIC_BETA` (no Fly activation, no production domain/TLS, no Fly rollback drill).  
**Not** `READY_FOR_PRIVATE_BETA` when that label means the intended Fly private-beta cohort (ADR-0012).  

**Phase 12A started.** Deploy decision: ADR-0021 — self-hosted macOS + Compose origin; Cloudflare Tunnel transport; Cloudflare Access auth; no router port forwarding. Hosted private/public beta remains a separate later phase.

### Local stack evidence (12A.1) — cite briefly

- HEAD `3ceb6f5`, clean working tree, all suites green  
- Carroll→Bryant F: complete/`stale` ~3.3s cold  
- Static pin `mta-subway-c9c3366cdd16`; graph `…+otp2.9.0`  
- Watch: data ~6 GiB / ~100% CPU; host disk ~98%  

See also: `docs/RELEASE_GATE_REPORT.md` (CA01–CA07 + vocabulary), `docs/RUNBOOKS.md` (controlled-alpha pointer).

---

## 1. What was implemented (shipped on this branch)

End-to-end live path on **local Docker Compose** (data + OTP + API + web), plus QA gates and Phase 10 hardening:

| Area | Status |
|---|---|
| Live GTFS-RT feed gateway + static import | implemented, tested (compose) |
| OTP 2.9.0 graph build/runtime + feed-prefixed route IDs | implemented, tested |
| Production `OtpCandidateProvider` + ranking library | implemented, tested |
| Backend production adapters, fixture lockout, 504 timeout | implemented, tested |
| Frontend live hardening + Playwright e2e | implemented, tested |
| Dockerfiles + `docker-compose.yml` stack | implemented, tested (compose healthy) |
| Fly TOML / deploy docs | prepared, **not activated** (**blocked**) |
| Live HTTP SUT, recorded NYC cases, G01–G20 checklist | implemented, tested |
| Phase 10 Critical remediations (OTP NY TZ, timeout→504, hollow TRP LKG, `calendar_dates`, graph pin fail-closed) | implemented, tested |
| Phase 10 Medium (analytics scrub, release-subset gate, Fly prep, CI live web build) | implemented, tested |
| Cloud Fly apps / TLS / rollback drill | **blocked** |
| Google superiority comparison | **not claimed** |
| Multi-candidate diversity under selected-line constraints | limited (single OTP plan family; multi-line risk) |
| Shadow `humanValidity` | **pending_review** |

---

## 2. Files changed (integration-live scope)

Primary surfaces (cumulative on branch; not exhaustive):

- `services/data/**`, `services/otp/**`, `services/routing/**`
- `apps/api/**`, `apps/web/**`
- `docker-compose.yml`, Dockerfiles
- `infra/fly/**`, `.github/workflows/**` (prep only)
- `benchmarks/**` (live SUT, recorded cases, release gate)
- `docs/RUNBOOKS.md`, `docs/RELEASE_GATE_REPORT.md`, related testing/CI docs
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
- Local compose is the controlled-alpha origin; availability depends on home power, internet, Docker Desktop, and host awake — not cloud-grade.
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

# Local compose (prod-like)
docker info --format 'MemTotal={{.MemTotal}}'   # need ≳4GiB for OTP
ls services/otp/var/otp/graphs/active.json \
   services/data/var/data/static/active.json
docker-compose build && docker-compose up -d
docker-compose ps
curl -fsS http://localhost:8080/health/live
curl -fsS http://localhost:8080/health/ready
curl -fsS 'http://localhost:8080/v1/places/search?q=Carroll' | jq .
curl -fsS 'http://localhost:8080/v1/places/search?q=Bryant' | jq .
# Carroll St → 42 St-Bryant Pk on F
curl -fsS -X POST http://localhost:8080/v1/routes/search \
  -H 'content-type: application/json' \
  -d '{"origin":{"placeId":"st:F21"},"destination":{"placeId":"st:D16"},"timing":{"type":"depart_now"},"selectedLineIds":["F"]}' | jq .

# Live benchmark smoke (API up on :8080)
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live
```

---

## 6. Validation results (evidence)

### Key commits (tip → Phase 9)

| SHA | Summary |
|---|---|
| `2e7cf9a` | Phase 10: scrub geo analytics + harden release-subset gate (+ CI live web / no-fixtures) |
| `2e1e8f2` | Phase 10: Fly deploy prep without activation |
| `5a44eea` | Phase 10: hollow GTFS-RT LKG + `calendar_dates` |
| `04ffb8f` | Phase 10: OTP America/New_York departure + timeout→504 + graph pin fail-closed |
| `ae8facd` | Phase 9: live HTTP SUT, recorded NYC cases, release-gate checklist |
| `30d570f` | Phase 8: Dockerfiles, compose stack, Fly prep (not activated) |

### Commands re-run 2026-07-30 (Phase 11)

| Command | Result |
|---|---|
| `npm --prefix contracts run validate` | **PASS** |
| `npm --prefix benchmarks/runner run validate-cases` | **PASS** — 30 cases |
| `npm --prefix benchmarks/runner run self-test` | **PASS** — 6/6 expected fails + soft-subset policy |
| `npm --prefix benchmarks/runner run gate` (fixture) | **PASS** — rankingPasses=20; merge-blocking failures=0; checklist written |
| `flyctl` | **Absent** — cloud deploy remains BLOCKED |
| Docker MemTotal | ~12.5 GiB (OTP-capable) |
| Compose stack this session | **Not re-upped** (prior Phase 8/9 evidence stands) |

### Live smoke — Carroll → Bryant (Phase 9 evidence)

From `benchmarks/reports/live-shadow-2026-07-30T19-22-40-758Z.txt`:

- OD: `st:F21` → `st:D16`, lines `[F]`, `depart_now`
- API: `http://127.0.0.1:8080`
- `dataMode=stale`, static `mta-subway-c9c3366cdd16`
- Latency ~2107 ms; best satisfaction **complete** 1/1; 3 constrained + 3 baseline itineraries
- `humanValidity: pending_review`

### Phase 9 gate checklist summary

Fixture gate: G01–G07 **PASS** (merge-blocking). G08/G11/G12 **PENDING** inside gate process (self-test and live smoke verified separately). G13/G15 **NOT_MEASURED**. G14/G16 **PARTIAL**. G17 **BLOCKED**. G18/G19 **PENDING**. G20 **NOT_CLAIMED**.

Full table: `docs/RELEASE_GATE_REPORT.md` and `benchmarks/reports/release-gate-latest.md`.

### Phase 10 review + remediation summary

| Severity | Item | Resolution |
|---|---|---|
| Critical | OTP departure used UTC slices vs NY wall clock | Fixed `04ffb8f` — `America/New_York` via `Intl` |
| Critical | Soft abort-only timeout could hang | Fixed `04ffb8f` — hard race → `504 timeout` |
| Critical | Production without graph pin | Fixed `04ffb8f` — fail-closed |
| Critical | Hollow + TRP feeds overwriting LKG / staying live | Fixed `5a44eea` |
| Critical | `calendar_dates` absence cancels | Fixed `5a44eea` |
| Medium | Fly prep gaps (OTP context, flags bake, public API URL, API scale=1, data bind) | Fixed `2e1e8f2` — still **not activated** |
| Medium | Geo analytics / soft cases in merge gate / CI live web | Fixed `2e7cf9a` |

---

## 7. How to run local compose stack

```bash
cd /Users/thebiglipper/Developer/bettermta-integration-live

# Prerequisites: Docker RAM ≳4 GiB; graphs + static active pointers present
docker-compose build
docker-compose up -d
docker-compose ps
docker-compose logs -f api data otp web

# Host ports: web :3000, api :8080, data :8081, otp :8090
# Tear down:
docker-compose down
```

Internal networking and smoke curls: `docs/RUNBOOKS.md` § Local compose bring-up / Smoke tests.

---

## 8. Known defects

- Candidate diversity: live path often returns a **single OTP plan family** — multi-line selected-line scenarios remain under-exercised (product risk).
- Compose `docker compose` plugin may be missing; use `docker-compose` (documented).
- README “live not implemented” line is stale relative to this branch (docs drift; not a runtime defect).

---

## 9. Known limitations / residual risks / deferred

| Item | Status |
|---|---|
| Controlled alpha edge proxy (12A.3) | **DONE** — `docker-compose.alpha.yml` + Caddy `127.0.0.1:8088`; smoke `infra/alpha/scripts/smoke-edge.sh` |
| Cloudflare Tunnel + Access configs | **PENDING** (later 12A; no secrets in repo) |
| Remote Access smoke / `READY_FOR_CONTROLLED_ALPHA` | **PENDING** — final status blocked on remote gates |
| Home power / internet / sleep / Docker Desktop HA | **Accepted limitation** (ADR-0021; risks R19–R21) |
| Fly activation (`flyctl` + creds + apps) | **BLOCKED** (separate hosted-beta phase) |
| Production domain + TLS (Fly) | **BLOCKED** / not started |
| Fly one-action rollback drill (E.4) | **PENDING** (blocked on activation) |
| Production alerts + pager binding | **PENDING** |
| Google/Apple/Citymapper comparison | **NOT_CLAIMED** |
| A11y D.3 / load-test p95 C.4 | **NOT_MEASURED** |
| Shadow human validity | **pending_review** |
| Full ~100-case live corpus | **Deferred** |
| Postgres / feedback | **Deferred** (ADR-0016) |
| Multi-line candidate diversity | **Residual risk** |
| Cost at Fly private beta | Ballpark **~$30–50/mo** (see RUNBOOKS / ADR proposal); OTP dominates |

---

## 10. Decisions requiring conductor / human approval

1. Controlled-alpha tester allowlist and Access policy (emails stay out of repo) — when CA gates are ready.
2. When to activate Fly (`ACTIVATE` deploy workflow + secrets) for **hosted** private beta (separate from ADR-0021).
3. Accept/reject live shadow reports (`humanValidity`).
4. Whether multi-line diversity gaps block invite rollout for controlled alpha or later hosted beta.

---

## 11. Exact next integration step

1. **Next (12A.4+):** Cloudflare Tunnel + Access (deny-by-default, email OTP/PIN) to `http://127.0.0.1:8088`; no router port forward.
2. Remote smoke via Access; complete CA03–CA05; only then reconsider `READY_FOR_CONTROLLED_ALPHA`.
3. Expand controlled-alpha runbook under `infra/alpha/` (12A.5–7); keep host-awake / disk watch documented.
4. Hosted Fly private/public beta remains later — do not conflate with controlled alpha.
5. Do **not** claim `READY_FOR_CONTROLLED_ALPHA`, public beta, or competitive superiority without remote evidence + existing gate discipline.

---

## Cost estimate (cite)

- `docs/RUNBOOKS.md` — **~$30–50/mo** Fly footprint (4 Machines, no Postgres; OTP dominates).
- `docs/proposals/infrastructure-adr-0005-platform.md` — **≈ $25–45/mo**; **≈ $55–85/mo** with Managed Postgres Basic.
- Local compose: host/Colima electricity + disk only (no Fly IPv4/egress).

---

## Suggested skills (next agent)

- `verification-before-completion` before flipping status off `BLOCKED`
- `ship-workbench` / infra deploy docs when activating Fly
- `handoff` after Fly first-deploy + rollback drill
