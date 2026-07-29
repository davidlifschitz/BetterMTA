# Backend API Prompt

Own BetterMTA’s fast, stable, versioned application API.

## Minimum endpoints
- `POST /v1/routes/search`
- `GET /v1/lines`
- `GET /v1/places/search`
- `GET /v1/status`
- `GET /health/live`
- `GET /health/ready`

## Route search
Validate places, selected line IDs, and departure time; assign a request ID; capture static dataset and realtime snapshot versions; call the routing adapter; return up to three ranked itineraries, baseline comparison, structured explanations, and explicit freshness/degraded metadata.

## Typed errors
Invalid input, unknown place/line, no transit path, incomplete selected-line satisfaction, insufficient candidate coverage, timeout, data unavailable, stale realtime, rate limited, and internal error. Do not collapse failures into HTTP 500.

## Performance and cache
Use request timeouts and bounded retries only where safe. Cache stable metadata. Route cache keys must include relevant time and data snapshots. Instrument p50, p95, and p99.

## Privacy and security
No account required. Do not persist precise location by default. Separate operational logs from analytics; minimize IP retention; keep coordinates out of unrestricted logs. Add schema validation, payload limits, rate limiting, secure headers, dependency auditing, secret management, safe errors, and abuse-resistant place search.

## Experiments
Support small deterministic assignments for explanation density, line-picker presentation, result count, and candidate strategy.

## Tests
Unit, routing/data contract, API integration, rate limit, degraded-data, timeout, and schema compatibility tests.

Deliver implementation, OpenAPI or equivalent specification, typed client where appropriate, fixtures, tests, deployment configuration, and operational notes.