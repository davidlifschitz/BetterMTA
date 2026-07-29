# Infrastructure and Observability Prompt

Own BetterMTA deployment, reliability controls, and observability for rapid public-beta iteration.

## Deployment
Use separate development and production environments, automated CI, automated production deployment from an approved branch, migration handling where applicable, one-action rollback, environment validation, secret management, and immutable artifacts where practical.

## Observability
Provide structured logs, request IDs, error tracking, API and routing latency, search success rate, feed age, GTFS import status, cache hit rate, rate-limit count, frontend errors, and health dashboards.

## Minimal actionable alerts
Search failure spike, p95 latency breach, stale realtime feed, readiness failure, deployment failure, and elevated frontend crash rate.

Liveness checks process health. Readiness verifies an acceptable static dataset and either valid realtime data or an explicitly permitted degraded mode.

## Feature flags
Support disabling realtime, selected-line constraints, or candidate variants; switching explanation variants; reducing result count; and maintenance mode.

## Platform safeguards
Use HTTPS, secure headers, application rate limiting, dependency and secret scanning, restricted administrative access, and usage/cost guardrails.

## Recovery and runbooks
Define backup, restoration, and retention for persisted state. Write runbooks for stale realtime, failed static import, elevated routing latency, invalid route reports, broken frontend deployment, rollback, and experiment regressions.

Recommend initial SLOs but do not claim they are achieved before measurement.

Deliver infrastructure configuration, CI/CD, dashboards, alerts, flags, runbooks, rollback instructions, cost risks, and launch checklist.