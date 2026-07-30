# Structured log field conventions

**Owner:** Infrastructure  
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

## Privacy

- **Do not log precise coordinates** (lat/lon at full precision). If needed for debug, geohash ≤5 or station IDs only.
- Do not log full addresses; prefer place IDs / station IDs.
- Do not log secrets, `Authorization`, cookies, or raw DSNs.
- Do not log complete selected-line payloads beyond counts + hashed/sorted line ID lists when diagnosing ranking.

## Correlation

- Client may send `X-Request-Id`; API always returns one.
- Downstream routing/data calls propagate the same `requestId`.
