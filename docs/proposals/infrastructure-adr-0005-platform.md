# Proposal: ADR-0005 — Deployment platform

> **Disposition (2026-07-30):** **ACCEPTED** for Fly.io + api/web PR previews; Postgres deferred (create on first feedback feature); staging shared for data poller. Recorded as ADR-0012 / ADR-0016.

**Status:** Accepted (see disposition)  
**Owner:** Infrastructure (`agent/infrastructure`)  
**Date:** 2026-07-30  
**Related:** ADR-0005 (closed by ADR-0012), `docs/SYSTEM_ARCHITECTURE.md` §8, Acceptance Criteria E

## Context

BetterMTA public beta needs:

- Node application API (`apps/api`) with locked `/health/live`, `/health/ready`, `/v1/*`
- Next.js mobile web (`apps/web`)
- Always-on background pollers (`services/data`) for GTFS-Realtime
- Redis-compatible cache for hot snapshots / route cache
- Postgres for feedback, experiments, benchmarks (not on the anonymous search critical path)
- Preview environments, secrets outside git, one-action rollback, CI gates

Application services are not merged yet; this proposal selects a platform so infra templates can be ready-to-activate.

## Options compared

| Criterion | **Fly.io** | **Render** | **Railway** | **Vercel + separate workers** |
|---|---|---|---|---|
| Always-on API | Machines (per-second) | Web service (fixed tier) | Usage metered | Serverless / Fluid — poor fit for long poll/proxy |
| Background pollers | Always-on Machine | Background worker | Service (keep awake) | Needs second vendor (Fly/Render/Railway/cron) |
| Next.js web | Docker / Node Machine | Web service or static+SSR | Service | Native strength |
| Redis-compatible | Upstash extension or self-run | Render Key Value | Built-in Redis | External (Upstash) |
| Postgres | Managed Postgres or Machine+volume | Managed Postgres | Built-in Postgres | External (Neon/Supabase) |
| Health checks | First-class `[[http_service.checks]]` paths | Health check path per service | Health checks supported | Platform health ≠ app readiness contract |
| Preview envs | PR review apps / Apps | Single-service (Hobby) / full-stack (Pro) | PR ephemeral environments | Vercel previews for web only |
| One-action rollback | `fly releases rollback` / prior image | Instant rollback to retained build | Rollback within retention window | Vercel promote previous; workers separate |
| Secrets | `fly secrets` | Dashboard / Blueprint sync | Project variables | Vercel env + worker secrets (split) |
| Ops complexity | Medium (CLI, Machines) | Low (PaaS Blueprint) | Low–medium | High (two platforms) |
| Beta cost predictability | Usage meters; IPv4 + volumes add up | Flat instance tiers — easiest to forecast | Usage + spend caps | Web cheap; workers duplicate fixed cost |

### Evidence (pricing pages / docs, Jul 2026)

- **Fly.io:** usage billed per second for Machines; dedicated IPv4 ≈ $2/mo each; volumes ≈ $0.15/GB-mo; egress ≈ $0.02/GB NA/EU. Managed Postgres Basic listed ≈ $38/mo in third-party 2026 summaries; small self-managed Machine+volume is cheaper for beta. Sources: [Fly pricing](https://fly.io/docs/about/pricing/), [Above the API Fly teardown (Jun 2026)](https://abovetheapi.co/teardowns/fly-io-pricing/).
- **Render:** Starter web/worker ≈ $7/mo (512 MB); Postgres Basic-256mb ≈ $6/mo; Key Value Starter ≈ $10/mo; Hobby workspace $0 + compute; Pro workspace $25/mo for full-stack previews / autoscaling. Source: [Render pricing](https://render.com/pricing).
- **Railway:** Hobby $5/mo includes $5 usage credit; Pro $20/mo; usage beyond credit billed; rollback retention Hobby 72h / Pro 120h; spend limits available. Source: [Railway plans](https://docs.railway.com/pricing/plans), [cost control](https://docs.railway.com/pricing/cost-control).
- **Vercel:** Excellent Next.js previews; long-running GTFS-RT pollers and a conventional always-ready API are a poor single-platform fit → split ops and dual rollback paths.

## Recommendation

**Adopt Fly.io as the primary deploy platform for public beta.**

### Why (smallest credible fit)

1. **One platform for api + web + always-on data poller** without serverless cold starts on readiness-critical paths.
2. **Locked health contract maps cleanly** to Fly HTTP checks on `/health/live` and `/health/ready`.
3. **One-action rollback** via previous release/image (`fly releases rollback`) matches Acceptance Criteria E.4.
4. **Secrets stay out of git** (`fly secrets set`); env templates in `infra/env/**` are placeholders only.
5. **Cost at beta scale is lower than a three-Starter Render stack + Redis** when using small Machines + Upstash + a small Postgres Machine (feedback not required for search).
6. Avoids **Vercel+worker dual-platform** complexity for an MVP experiment.

**Render** is the explicit runner-up if the team prefers Blueprint UX and managed Redis/Postgres with zero DBA work — accept ≈ $37–55/mo Starter stack and optional Pro ($25) for full-stack previews.

**Railway** is viable for early spikes (best DX, spend caps) but Hobby rollback retention (72h) and usage-surprise risk make it weaker as the sole production bet without Pro + hard spend limits.

### Proposed topology (Fly)

| App | Role | Health |
|---|---|---|
| `bettermta-api` | `apps/api` | `/health/live` (liveness), `/health/ready` (deploy gate) |
| `bettermta-web` | `apps/web` | platform HTTP check on `/` (or FE health route when added) |
| `bettermta-data` | `services/data` poller / importer | process check; readiness reflected via API `/v1/status` + `/health/ready` |
| Upstash Redis | cache | n/a |
| Postgres Machine (or Fly Managed later) | feedback / experiments | n/a |

Environments: `development` (shared non-prod) and `production`. Preview: PR review apps for api+web when Dockerfiles exist.

### Estimated monthly cost (public-beta scale)

Assumptions: US region, low traffic (~thousands of searches/day), always-on api+web+data, light egress, Upstash pay-as-you-go Redis, **small self-managed Postgres Machine** (not Managed Basic).

| Line item | Estimate |
|---|---|
| API Machine `shared-cpu-1x` ~1 GB | ~$5–7 |
| Web Machine `shared-cpu-1x` ~512 MB | ~$3–4 |
| Data poller Machine `shared-cpu-1x` ~512 MB always-on | ~$3–4 |
| Dedicated IPv4 ×2 (api + web) | $4 |
| Postgres Machine + ~10 GB volume | ~$5–7 |
| Upstash Redis | ~$0–10 |
| Egress / incidental | ~$1–5 |
| **Total** | **≈ $25–45 / month** |

If Fly Managed Postgres Basic is preferred immediately: add ≈ **+$30–40** → **≈ $55–85 / month**.

**Cost guardrails:** API exactly 1 replica until shared rate-limit store (in-memory limiter); web max 2; no multi-region; poller single instance; Redis deferred for search path; monthly spend alert at $75; escalate to Render Managed stack only if ops pain exceeds savings.

## Consequences if accepted

- Infra owns `infra/fly/*.toml` templates marked **ready-to-activate** until `apps/*` and `services/data` merge.
- Conductor closes ADR-0005 by copying this decision into `ARCHITECTURE_DECISIONS.md` (infrastructure must not edit that file).
- Backend/data/frontend wire health and env var names from `infra/env/**`.
- Preview apps activate after Dockerfiles exist in owned service trees.

## Open items for conductor

1. Approve Fly.io vs switch to Render Blueprint.
2. Confirm Postgres: self-managed Machine for beta vs Managed from day one.
3. Confirm preview strategy: api+web PR apps only (data poller stays on shared staging feeds).
