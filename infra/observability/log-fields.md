# Structured log field conventions

**Owner:** Infrastructure (+ Wave 1D privacy helpers in `apps/api`)  
**Applies to:** `apps/api`, `apps/web` (server), `services/data`, `services/routing`

Emit JSON logs (one event per line). Separate operational logs from product analytics.

## Required fields (API request path)

| Field | Type | Notes |
|---|---|---|
| `timestamp` | ISO-8601 UTC | |
| `level` | `debug\|info\|warn\|error` | |
| `message` | string | Short human summary |
| `service` | string | `api` \| `web` \| `data` \| `routing` |
| `requestId` | string | Echo `X-Request-Id` / generate if missing |
| `route` | string | e.g. `POST /v1/routes/search` |
| `statusCode` | number | HTTP status when applicable |
| `durationMs` | number | Handler duration |
| `dataMode` | string | `live\|schedule_only\|stale\|synthetic\|unavailable` when known |
| `errorCode` | string | Typed API error code when known |

## Privacy (ADR-0022 / API_CONTRACT §11)

Default logs/analytics **MUST NOT** retain:

- Precise geocode / proximity / reverse-geocode coordinates
- Full street-address or POI query strings (`q`, `query`, `formattedAddress`, …)
- Raw `providerPlaceId` / vendor IDs
- Secrets, `Authorization`, cookies, DSNs

**Prefer instead:**

| Allowed | Avoid by default |
|---|---|
| `requestId`, `placeId`, `stationId`, `kind`, BetterMTA `provider` | Precise `lat`/`lon`, proximity pins |
| `queryLength`, `placeQueryHash` (truncated SHA-256), `proximityProvided`, `proximityGrid` (~1 km) | Raw `q` / address text |
| `selectedLineCount` (aggregates) | Raw preferred-line ID lists in ops logs |
| `candidateCoverageStatus`, budget counters | OTP/vendor raw payloads |

TypeScript aids (contracts): `PrivacySafeRouteSearchLog` / `PrivacySafePlaceLogRef`.  
API helpers (call from places/geocode/routing waves): `apps/api/src/logging/privacy.ts`, `redactSensitive` in `apps/api/src/logging/logger.ts`.

## Correlation

- Client may send `X-Request-Id`; API always returns one.
- Downstream routing/data calls propagate the same `requestId`.
