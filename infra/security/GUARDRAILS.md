# Security & cost guardrails

**Owner:** Infrastructure  
**Status:** Expectations for backend/frontend/data to implement; platform templates enforce HTTPS.

## Rate limits (application — Acceptance Criteria E.5)

Referencing `docs/API_CONTRACT.md` and architecture security baseline:

| Endpoint | Proposed beta default | Notes |
|---|---|---|
| `POST /v1/routes/search` | 30 req/min / client key (IP + optional header) | Return typed `429` |
| `GET /v1/places/search` | 60 req/min / client key | Autocomplete-friendly |
| Other `/v1/*` | 120 req/min / client key | Soft ceiling |

Env knobs: `RATE_LIMIT_SEARCH_PER_MIN`, `RATE_LIMIT_PLACES_PER_MIN` in `infra/env/api/.env.example`.

Metrics: `bettermta_rate_limit_rejections_total`.

## Payload caps

| Cap | Value | Source |
|---|---|---|
| Route search body | ≤ **16 KiB** | API_CONTRACT limits |
| Place query string | ≤ 256 chars (proposed) | backend should enforce |
| `selectedLineIds` | 0–5 unique | API_CONTRACT / ADR-0006 |

Env: `PAYLOAD_MAX_BYTES=16384`.

## HTTPS & secure headers checklist

Deploy platform must force HTTPS (`force_https = true` in Fly templates).

Application / edge should set:

- [ ] `Strict-Transport-Security` (HSTS) on public hosts
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (or stricter)
- [ ] `Content-Security-Policy` appropriate for Next.js (frontend-owned)
- [ ] `Permissions-Policy` disabling unused powerful APIs
- [ ] No mixed-content API calls from web
- [ ] Cookies (if any later): `Secure; HttpOnly; SameSite` — accounts deferred

## Dependency scanning

CI job `dependency-audit` runs `npm audit --audit-level=high` on `contracts` and any present `apps/*` / `services/*` / `benchmarks` packages. High findings warn on PRs; release gate should fail closed once services exist (QA/integration).

Secret scanning: rely on GitHub push protection + never commit `.env` (see `infra/env/SECRETS_POLICY.md`).

## Cost guardrails

| Control | Setting |
|---|---|
| API replicas | **exactly 1** until a shared rate-limit store exists (in-memory limiter; see compose + `api.fly.toml`) |
| Web replicas | max 2 |
| Data poller | **exactly 1** instance |
| OTP | **exactly 1** shared instance |
| Autoscaling | off until measured need (Render/Fly horizontal caps documented when enabled) |
| Poll interval | `REALTIME_POLL_INTERVAL_MS` default 15s, hard max 60s |
| Static import concurrency | `1` |
| Monthly spend alert | $75 (human-configured in Fly billing) |
| Hard rethink threshold | $150/mo sustained without traffic justification |
| Preview apps | api+web only; do not run duplicate production pollers per PR |
| Geocode / place provider | Feature-flagged; no default precise-coord retention; do not log vendor hostnames or raw query text (ADR-0022 / Wave 1D) |

Do **not** scale the API above 1 Machine in public beta. Multi-replica API would
partition rate-limit buckets and under-enforce Acceptance Criteria E.5.

## Admin access

- Fly org: least-privilege members; production secrets restricted.
- No public admin UI in MVP.
- Database: private network only; no `0.0.0.0` expose for Postgres.
