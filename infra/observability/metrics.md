# Metric names

**Owner:** Infrastructure  
**Status:** Proposed naming; exporters not wired until services exist  
**Sources:** `docs/DATA_CONTRACT.md` §10, Acceptance Criteria C/E, `.agents/infrastructure.md`

Use Prometheus-style names (snake_case). Label carefully; avoid high-cardinality place strings.

## Data platform (DATA_CONTRACT §10)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `bettermta_static_import_status` | gauge | `version`, `result` | `1` success / `0` fail for last import |
| `bettermta_static_dataset_version_info` | gauge | `version` | Active static version marker |
| `bettermta_realtime_age_seconds` | gauge | `feed_id` | Age of latest realtime snapshot |
| `bettermta_realtime_poll_duration_seconds` | histogram | `feed_id` | Poll round-trip duration |
| `bettermta_realtime_parse_errors_total` | counter | `feed_id`, `reason` | Parse/decode failures |
| `bettermta_realtime_entity_count` | gauge | `feed_id`, `entity` | Entity counts in snapshot |
| `bettermta_realtime_broken_references_total` | counter | `feed_id` | Broken stop/trip refs |
| `bettermta_realtime_stale_duration_seconds` | gauge | `feed_id` | How long feed has been stale |
| `bettermta_realtime_last_success_unixtime` | gauge | `feed_id` | Last successful update |

## API / routing latency & reliability

| Metric | Type | Labels | Description |
|---|---|---|---|
| `bettermta_http_request_duration_seconds` | histogram | `route`, `method`, `status` | API latency — use for **p50/p95/p99** |
| `bettermta_route_search_total` | counter | `result` (`success\|error\|timeout`) | Search attempts |
| `bettermta_route_search_failures_total` | counter | `error_code` | Typed search failures |
| `bettermta_places_search_total` | counter | `result` | Place autocomplete |
| `bettermta_place_provider_total` | counter | `provider` (`station_index\|geocoder\|unknown`), `result` | Place/geocode provider attempts (ADR-0022) |
| `bettermta_place_provider_errors_total` | counter | `provider`, `reason` | Provider failures (`timeout\|http\|parse\|upstream\|unknown`) |
| `bettermta_candidate_coverage_total` | counter | `status` (`adequate\|degraded\|exhausted\|unknown`) | Preference candidate-coverage outcomes (ADR-0023) |
| `bettermta_candidate_budget_exhausted_total` | counter | | Candidate/time budget exhausted |
| `bettermta_candidate_families_attempted_sum` | counter | | Sum of families attempted (aggregate) |
| `bettermta_candidate_count_sum` | counter | | Sum of candidates considered |
| `bettermta_preference_covering_candidate_count_sum` | counter | | Sum of preference-covering candidates |
| `bettermta_preference_coverage_total` | counter | `bucket` (`none\|partial\|complete\|n_a`), `requested_bucket` (`0`–`5`) | Aggregate preference satisfaction — **no line-ID lists** |
| `bettermta_rate_limit_rejections_total` | counter | `route` | Rate-limit hits |
| `bettermta_cache_requests_total` | counter | `result` (`hit\|miss\|error`) | Cache hit rate |
| `bettermta_health_ready` | gauge | | `1` ready / `0` not ready |
| `bettermta_health_live` | gauge | | `1` live / `0` dead |

Histogram buckets (initial): `0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10` seconds.

### Privacy label rules (Wave 1D)

- Never put address text, POI queries, precise coordinates, or vendor place IDs in metric labels.
- `provider` must be a BetterMTA id (`station_index`, `geocoder`), never a vendor hostname.
- Preference coverage uses **counts/buckets only** — not raw `selectedLineIds`.
- In-process hooks: `apps/api/src/metrics/privacyMetrics.ts` (`PrivacySafeMetrics`). Places/routing waves should call these rather than inventing new high-cardinality series.

## Frontend

| Metric / signal | Source | Notes |
|---|---|---|
| Crash-free sessions | Error tracker | Alert on spike |
| `bettermta_web_client_errors_total` | RUM / tracker | Labeled by release |

## PLACEHOLDER

No metrics backend is provisioned yet (Fly metrics + optional Grafana Cloud / OTel later). Names above are the contract for application instrumentation.
