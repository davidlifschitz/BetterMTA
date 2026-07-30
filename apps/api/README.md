# BetterMTA Application API

Fastify service implementing the locked `/v1` contract with **fixture** (dev/test) and **live** (data service + OTP) adapters.

## Scripts

```bash
npm install
npm run dev
npm test
npm run typecheck
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3080` | Listen port |
| `HOST` | `127.0.0.1` | Bind host |
| `BETTERMTA_ADAPTER_MODE` | `live` | `fixture` \| `live`. **Forbidden:** `fixture` when `NODE_ENV=production` (ADR-0018) |
| `BETTERMTA_DATA_INTERNAL_URL` | `http://localhost:8081` | Data service internal HTTP base |
| `BETTERMTA_DATA_INTERNAL_TOKEN` | _(empty)_ | Bearer token for `/internal/*` |
| `BETTERMTA_DATA_STATUS_TTL_MS` | `5000` | Status poll cache TTL (SWR) |
| `BETTERMTA_DATA_CATALOG_TTL_MS` | `60000` | Line/station catalog cache TTL (SWR) |
| `BETTERMTA_OTP_URL` | `http://localhost:8090` | OpenTripPlanner base URL |
| `BETTERMTA_OTP_TIMEOUT_MS` | `4000` | OTP candidate-provider timeout |
| `BETTERMTA_OTP_PROBE_TTL_MS` | `10000` | Cached OTP reachability probe for `/health/ready` |
| `BETTERMTA_OTP_GRAPH_VERSION` | _(empty)_ | Optional graph pin; prefix must match `staticDatasetVersion` or searches return `data_unavailable` |
| `BETTERMTA_REQUEST_TIMEOUT_MS` | `2000` | Soft abort + hard Promise.race timeout for route search |
| `BETTERMTA_RATE_LIMIT_MAX` | `120` | Max requests per window (search + places) |
| `BETTERMTA_CHEAP_RATE_LIMIT_MAX` | `600` | Max requests per window for `/v1/lines` + `/v1/status` |
| `BETTERMTA_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `BETTERMTA_TRUST_PROXY` | `false` | Fastify `trustProxy` (`true` / hop count). Set hop count behind Fly edge |
| `BETTERMTA_ALLOW_RATE_LIMIT_KEY` | off (on in `NODE_ENV=test`) | Honor `X-Rate-Limit-Key` override |
| `BETTERMTA_ALLOW_EXPERIMENT_SEED` | off (on in `NODE_ENV=test`) | Honor `X-Experiment-Seed` override |
| `BETTERMTA_LINES_CACHE_TTL_MS` | `300000` | Lines response cache TTL |
| `BETTERMTA_ROUTE_CACHE_TTL_MS` | `30000` | Route-search cache TTL |
| `BETTERMTA_ADAPTER_READY_MODE` | `healthy` | Fixture readiness: `healthy` \| `degraded` \| `not_ready_static` \| `not_ready_realtime` |
| `BETTERMTA_PERMIT_DEGRADED_READY` | `true` | Allow ready when realtime is degraded |
| `BETTERMTA_FIXTURES_ROOT` | `../../contracts/fixtures` | Fixture directory |
| `BETTERMTA_CONTRACTS_ROOT` | `../../contracts` | Contracts root for Ajv schemas |
| `BETTERMTA_LOG_LEVEL` | `info` | Structured log level |
| `BETTERMTA_LIVE_STACK` | unset | Set to `1` to enable real-stack integration test |

## Fixture route selection

See `src/adapters/fixture/selection.ts` and `.agents/handoffs/backend.md`.

## Route cache key

`route|{od}|{timingBucket}|{sortedLines}|{staticVersion}|{snapshotId|none}|{explanationVariant}`

Live mode includes the live `staticDatasetVersion` and `realtimeSnapshotId` from the data service at search time.

## Adapters

- `DataAdapter` — snapshot handles, lines, places, status, readiness
- `RoutingAdapter` — consumes `RoutingSnapshotHandle`
- **Fixture:** `adapters/fixture/*` (dev/test only)
- **Live:** `adapters/live/LiveDataAdapter` (HTTP → data `/internal/*`) + `LiveRoutingAdapter` (`@bettermta/routing` `runRouteSearch` + OTP `createOtpCandidateProvider`, feature-detected)

## Rate limiting

In-memory fixed-window limiter — **single-replica scope** (startup log: `rate_limit_scope`). Not safe across multiple API instances without a shared store.

## Privacy

Structured logs redact coordinates and raw place-search query text. Prefer `queryLength` / `proximityProvided` over raw values.
