# @bettermta/contracts

Conductor-owned, implementation-neutral schemas, OpenAPI, TypeScript types, and fixtures.

## Consume from other workstreams

- **Do not edit** without conductor approval.
- Import types from `contracts/typescript/index.ts` (or a future built export once monorepo tooling lands).
- Validate local changes with:

```bash
cd contracts
npm install
npm run validate
```

## Layout

| Path | Contents |
|---|---|
| `openapi/bettermta-v1.yaml` | HTTP API |
| `schemas/*.schema.json` | JSON Schema |
| `typescript/index.ts` | Shared TS types |
| `fixtures/**` | Synthetic request/response examples |
| `scripts/validate.mjs` | Fixture + schema validation |

## Data mode rule

Fixtures default to `dataMode: "synthetic"`. Frontend and backend must label non-`live` modes and must never present synthetic fixtures as live navigation in production.
