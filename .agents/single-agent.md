# Single-Agent End-to-End Prompt

Build BetterMTA as a production public-beta experiment using all repository documents and `.agents/shared-context.md` as requirements.

Work in order: inspect repository; lock MVP; define domains and contracts; evaluate mature GTFS routers before custom search; implement static and realtime ingestion; implement candidate generation and lexicographic selected-line ranking; implement versioned API; build mobile web interface; add route comparison and degraded states; add privacy-safe analytics, logs, monitoring, rate limits, health checks, feature flags, CI/CD, and rollback; create the 100-case benchmark; add unit, contract, integration, property, accessibility, benchmark, and E2E tests; deploy to a production-like environment; produce launch and rollback plans.

Do not build accounts, native apps, AI chat, social features, achievements, historical dashboards, automatic preference learning, or unsupported prediction systems.

Acceptance criteria: first-time mobile flow works; lines selectable before/after search; up to three valid routes; all selected lines used when feasible; maximum feasible subset otherwise; line claims match real legs; ranking deterministic; stale data never labeled live; route API p95 target under two seconds; operations monitored; no account required; tests/build pass; rollback tested.

At completion report architecture, files changed, interfaces, tests, benchmark and performance results, deployment status, unresolved risks, and deferred scope.