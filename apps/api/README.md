# BetterMTA Application API

Fixture-backed Fastify service implementing the locked `/v1` contract.

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
| `BETTERMTA_REQUEST_TIMEOUT_MS` | `2000` | Soft abort + hard Promise.race timeout for route search |
| `BETTERMTA_RATE_LIMIT_MAX` | `120` | Max requests per window (search + places) |
| `BETTERMTA_CHEAP_RATE_LIMIT_MAX` | `600` | Max requests per window for `/v1/lines` + `/v1/status` |
| `BETTERMTA_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `BETTERMTA_TRUST_PROXY` | `false` | Fastify `trustProxy` (`true` / hop count). Set hop count behind Fly edge |
| `BETTERMTA_ALLOW_RATE_LIMIT_KEY` | off (on in `NODE_ENV=test`) | Honor `X-Rate-Limit-Key` override |
| `BETTERMTA_ALLOW_EXPERIMENT_SEED` | off (on in `NODE_ENV=test`) | Honor `X-Experiment-Seed` override |
| `BETTERMTA_LINES_CACHE_TTL_MS` | `300000` | Lines cache TTL |
| `BETTERMTA_ROUTE_CACHE_TTL_MS` | `30000` | Route-search cache TTL |
| `BETTERMTA_ADAPTER_READY_MODE` | `healthy` | `healthy` \| `degraded` \| `not_ready_static` \| `not_ready_realtime` |
| `BETTERMTA_PERMIT_DEGRADED_READY` | `true` | Allow ready when realtime is degraded |
| `BETTERMTA_FIXTURES_ROOT` | `../../contracts/fixtures` | Fixture directory |
| `BETTERMTA_CONTRACTS_ROOT` | `../../contracts` | Contracts root for Ajv schemas |
| `BETTERMTA_LOG_LEVEL` | `info` | Structured log level |

## Fixture route selection

See `src/adapters/fixture/selection.ts` and `.agents/handoffs/backend.md`.

## Route cache key

`route|{od}|{timingBucket}|{sortedLines}|{staticVersion}|{snapshotId|none}|{explanationVariant}`

## Adapters

- `DataAdapter` — snapshot handles, lines, places, status, readiness
- `RoutingAdapter` — consumes `RoutingSnapshotHandle`; fixture implementation serves `contracts/fixtures/routes/**`
