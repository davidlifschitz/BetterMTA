# Alert definitions

**Owner:** Infrastructure  
**Status:** Proposed — not yet connected to a pager  
**Must-cover (Acceptance Criteria E):** search failure spike, p95 latency, stale realtime, readiness failure, deploy failure (+ frontend crash spike from infra prompt)

## Severity

| Sev | Meaning | Response |
|---|---|---|
| sev-1 | User-facing outage / incorrect live labeling risk | Page on-call; runbook |
| sev-2 | Degraded but usable | Business-hours slack + ticket |
| sev-3 | Early warning | Ticket only |

## Alerts

### 1. Search failure spike

| Field | Value |
|---|---|
| Name | `SearchFailureSpike` |
| Expr (PromQL sketch) | `sum(rate(bettermta_route_search_failures_total[5m])) / clamp_min(sum(rate(bettermta_route_search_total[5m])), 0.001) > 0.15` |
| For | 5m |
| Sev | sev-1 if also readiness ok but failures high; else sev-2 |
| Runbook | `docs/RUNBOOKS.md` → elevated routing latency / invalid routes |

### 2. API p95 > 2s

| Field | Value |
|---|---|
| Name | `ApiSearchP95High` |
| Expr | `histogram_quantile(0.95, sum by (le) (rate(bettermta_http_request_duration_seconds_bucket{route="/v1/routes/search"}[5m]))) > 2` |
| For | 10m |
| Sev | sev-2 (sev-1 if >5s for 5m) |
| Notes | Matches Acceptance Criteria C.4 under agreed beta load; exclude known upstream outage windows when annotating. |
| Runbook | elevated routing latency |

### 3. Realtime stale > 15 minutes

| Field | Value |
|---|---|
| Name | `RealtimeStale` |
| Expr | `max(bettermta_realtime_age_seconds) > 900` **or** `max(bettermta_realtime_stale_duration_seconds) > 900` |
| For | 2m |
| Sev | sev-2 (sev-1 if unlabeled live results — data honesty breach) |
| Threshold source | DATA_CONTRACT stale max age = 15 minutes |
| Runbook | stale realtime |

### 4. Readiness failing

| Field | Value |
|---|---|
| Name | `ReadinessFailing` |
| Expr | `bettermta_health_ready == 0` **or** synthetic probe `GET /health/ready` ≠ 200 |
| For | 3m |
| Sev | sev-1 |
| Runbook | rollback / failed static import |

### 5. Deploy failure

| Field | Value |
|---|---|
| Name | `DeployFailure` |
| Source | Fly deploy webhook / GitHub Actions workflow `deploy` conclusion == failure (when deploy workflow exists) |
| Sev | sev-2 (sev-1 if production blocked and no healthy prior release) |
| Runbook | rollback |

### 6. Frontend crash spike

| Field | Value |
|---|---|
| Name | `FrontendCrashSpike` |
| Expr (PromQL sketch) | `bettermta_web_crash_free_session_ratio < 0.95` for 15m |
| Notes | Absolute ratio preferred for MVP alerting. Relative baseline heuristic (drop >5pp vs 24h, or error/session >2× baseline) remains useful for triage dashboards once enough history exists. |
| Sev | sev-2 (sev-1 if blank screen / can't search) |
| Runbook | broken frontend deploy |

### 7. Geocoder provider failure spike

| Field | Value |
|---|---|
| Name | `GeocoderFailureSpike` |
| Expr | Geocoder errors are >25% of provider attempts over 10m, with at least five errors |
| For | 5m |
| Sev | sev-2; sev-1 only if station-index fallback is also unavailable |
| Runbook | `docs/RUNBOOKS.md` → geocoder provider outage |
| Privacy | BetterMTA provider id + bounded error class only; no query, address, coordinate, or vendor id labels |

## Notification channels (PLACEHOLDER)

- `#bettermta-alerts` Slack webhook — `ALERT_SLACK_WEBHOOK_URL` (secret)
- Email / PagerDuty — deferred until on-call rota exists

## Alert-as-code sketch

See `alerts.yaml` for a portable rule list (not bound to a specific SaaS yet).
