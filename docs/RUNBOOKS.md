# BetterMTA Runbooks

**Owner:** Infrastructure  
**Status:** Draft for public-beta ops  
**Related:** `docs/SLOS.md`, `infra/observability/alerts.md`, `infra/fly/DEPLOY.md`

Assume Fly.io apps `bettermta-api`, `bettermta-web`, `bettermta-data` once activated. Until services merge, treat steps that call live hosts as **PLACEHOLDER**.

---

## Stale realtime

**Trigger:** `RealtimeStale` — age > 15 minutes (DATA_CONTRACT).

1. Check `/v1/status` and compare feed ages / `dataMode`.
2. Check data poller logs: `fly logs -a bettermta-data` — poll errors, 401s, parse errors.
3. Verify `MTA_GTFS_RT_API_KEY` secret still valid; rotate if provider revoked.
4. If poller dead: restart `fly apps restart bettermta-data` or rollback data release.
5. Ensure API labels results `stale` or `schedule_only` — **never** unlabeled live.
6. Optional: set `realtime_enabled=false` (flag) to force schedule_only while investigating.
7. After recovery: confirm `bettermta_realtime_age_seconds` < 90s and `/health/ready` 200.

---

## Failed static import

**Trigger:** readiness reasons include `static_dataset_missing` / import failure metrics.

1. Inspect last import: `bettermta_static_import_status`, data logs.
2. Confirm `MTA_STATIC_GTFS_URL` reachable from the data Machine.
3. Do **not** activate a partial graph; keep prior active version (data workstream activation rules).
4. If corrupt artifact: re-run import from last-known-good archive in object store.
5. If no prior version: enable `maintenance_mode` or accept `unavailable` errors; page sev-1.
6. When new version validates: activate, verify `/health/ready`, run one synthetic route search.

---

## Elevated routing latency

**Trigger:** `ApiSearchP95High` (p95 > 2s) or search timeouts.

1. Confirm scope: `/v1/routes/search` only vs whole API.
2. Check cache hit rate (`bettermta_cache_requests_total`); warm miss storm → inspect Redis.
3. Check routing service CPU / timeouts; look for candidate explosion.
4. Mitigations (flags): lower `result_count` toward 1; set `candidate_strategy=baseline_only`; disable `constraints_enabled` if constrained path is hot.
5. If single bad deploy: **rollback API** (`fly releases rollback -a bettermta-api`).
6. Capture `requestId`s for failing slow traces; file routing issue with snapshot IDs.

---

## Invalid route reports

**Trigger:** User feedback / QA that itineraries are impossible or violate selected-line honesty.

1. Collect `requestId`, timestamp, origin/destination IDs (not precise coordinates), `selectedLineIds`, `dataMode`, static+realtime snapshot IDs from response metadata.
2. Reproduce against same snapshot if retained; else mark unreproducible.
3. If ranking bug: route to routing workstream with fixture proposal — do not hot-patch contracts.
4. If stale/wrong feeds: treat as data issue; consider `realtime_enabled=false`.
5. If widespread: `maintenance_mode=true` until fix+rollback decision.

---

## Broken frontend deploy

**Trigger:** `FrontendCrashSpike` or blank/error UI in production.

1. Confirm release version in error tracker vs `fly releases -a bettermta-web`.
2. **One-action rollback:** `fly releases rollback -a bettermta-web`.
3. Verify `https://<web-host>/` loads and can call API (CORS / `NEXT_PUBLIC_API_BASE_URL`).
4. If API contract mismatch: rollback web and/or api to last known compatible pair.
5. Block auto-deploys until fix merges; add regression test in frontend/QA.

---

## Rollback

**Trigger:** Bad deploy, readiness fail after release, sev-1 regression.

### One-action commands

```bash
fly releases rollback -a bettermta-api
fly releases rollback -a bettermta-web
fly releases rollback -a bettermta-data
```

### Verify

```bash
curl -fsS https://<api-host>/health/live
curl -fsS https://<api-host>/health/ready
curl -fsS https://<api-host>/v1/status
```

### Notes

- Prefer rolling back the **single** offending app first.
- Document the rollback in the incident channel with from→to release IDs.
- Acceptance Criteria E.4 requires this procedure tested at least once before public beta — see **Launch checklist** below (**post-first-deploy rollback drill: Pending**).

---

## Experiment regression

**Trigger:** Metric/UX regression after flag or `candidate_strategy` change.

1. Identify change: flag JSON, env override, or routing build.
2. Safe disable: set `candidate_strategy=default` or `baseline_only`; restore `explanation_variant=standard`; restore `result_count` default.
3. If code deploy: rollback the owning service.
4. Leave experiment assignment logging intact for postmortem; do not destroy analytics.
5. Re-open experiment only after benchmark/QA gate passes.

---

## Backup, restore, and retention

MVP-proportionate. Prefer managed snapshots over custom backup daemons.

### Postgres (when provisioned)

- **Daily snapshot:** enable provider daily automated backups (Fly Managed Postgres or volume snapshots if self-managed).
- **Restore:** create a new Postgres from the chosen snapshot; point `DATABASE_URL` at the restored instance; restart api; verify `/health/ready` and one write/read of feedback if that feature is live.
- **Retention:** keep **7 daily** snapshots for beta (extend only if feedback/support needs longer).
- **Note:** Prefer deferring Postgres creation until the feedback feature ships — anonymous search does not require it.

### Object-storage GTFS snapshot archives

- Retain **static GTFS version archives** used for active + prior graphs so imports and invalid-route reports stay reproducible.
- **Retention window:** keep at least the **last 14 days** of activated static versions (and any version referenced by open incident tickets) in object storage; prune older unmarked archives monthly.
- Realtime snapshots: retain short-lived copies only as needed for debugging (e.g. **24–72h**); not a long-term backup store.

### Redis / cache

- **Ephemeral / rebuildable** — do not back up Redis or Upstash cache.
- On loss: restart api/data consumers; accept cold-cache latency until warm; verify `bettermta_cache_requests_total` recovers.
- Never store sole copies of GTFS graphs or user data only in cache.

---

## Launch checklist (ops)

Track Acceptance Criteria E.4 and related go/no-go items:

| Item | Status |
|---|---|
| Post-first-deploy rollback drill (E.4): after first successful api/web deploy, run `fly releases rollback` once per app and verify `/health/live` + `/health/ready` | **Pending** — services absent |
| Deploy workflow active (ADR-0005 + apps/services merge) | **Pending** — `.github/workflows/deploy.yml` is PLACEHOLDER / workflow_dispatch-only |
| Alerts bound to a manager + Slack webhook | **Pending** |
| Postgres provisioned only when feedback feature needs it | **Deferred** (recommended) |

---

## Quick reference — flags

See `infra/flags/flags.json`. Emergency product off switch: `maintenance_mode=true`.
