# BetterMTA SLOs (initial)

**Status: proposed, unmeasured**  
**Owner:** Infrastructure  
**Date:** 2026-07-30

These targets guide alerts and capacity planning. Do **not** claim achievement until measurement exists in production/staging under agreed load.

## Service level objectives

| SLO | Proposed target | Window | Notes |
|---|---|---|---|
| Route search availability | 99.0% successful non-5xx (excl. maintenance_mode) | 30d | Typed 4xx from bad input do not burn budget |
| Route search latency p50 | < 800 ms | 7d rolling | Proposed, unmeasured |
| Route search latency p95 | < 2.0 s | 7d rolling | Matches Acceptance Criteria C.4 |
| Route search latency p99 | < 5.0 s | 7d rolling | Proposed, unmeasured |
| `/health/ready` success | 99.5% probes OK | 30d | Synthetic external probe |
| Realtime freshness (live mode) | age ≤ 90 s for 95% of successful live searches | 7d | DATA_CONTRACT live max age |
| Stale avoidance | age > 15 min must not be labeled `live` | always | Honesty invariant |
| Crash-free web sessions | ≥ 99% | 7d | Error tracker |
| Deploy success | ≥ 95% production deploys | 30d | Includes health gate |

## Error budget (proposed)

At 99.0% monthly availability ≈ **7.2 hours** of search unavailability budget. Freeze risky experiments when budget < 25% remaining.

## Measurement PLACEHOLDER

- Metrics names: `infra/observability/metrics.md`
- No production telemetry pipeline yet
- First calibration after staging soak with fixture + live feeds

## Non-goals

- Multi-region active-active SLOs
- Sub-100ms edge SLOs
- Formal contractual SLA with customers
