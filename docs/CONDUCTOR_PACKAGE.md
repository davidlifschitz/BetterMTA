# Conductor Package Index

**Branch:** `agent/conductor`  
**Contract version:** `2026-07-30`  
**Status:** Ready for review; do not start parallel implementation until merged to `main`

## What this package locks

BetterMTA’s shared architecture and implementation-neutral contracts so routing, data, backend, frontend, infrastructure, and QA can proceed in parallel without rewriting each other’s types.

## Documents other workstreams must consume

| File | Why |
|---|---|
| `docs/SYSTEM_ARCHITECTURE.md` | Boundaries and MVP scope |
| `docs/DOMAIN_MODEL.md` | Canonical entities + ranking |
| `docs/API_CONTRACT.md` | HTTP endpoints and errors |
| `docs/DATA_CONTRACT.md` | Snapshot/freshness modes |
| `docs/ARCHITECTURE_DECISIONS.md` | ADRs |
| `docs/INTEGRATION_SEQUENCE.md` | Parallel → integrate order |
| `docs/ACCEPTANCE_CRITERIA.md` | Release gates |
| `docs/RISK_REGISTER.md` | Known risks |
| `docs/WORKSTREAM_OWNERSHIP.md` | File ownership / no-touch rules |

## Machine-readable artifacts

| Path | Why |
|---|---|
| `contracts/openapi/bettermta-v1.yaml` | OpenAPI 3 for `/v1` |
| `contracts/schemas/*.schema.json` | JSON Schema for payloads |
| `contracts/typescript/*` | Shared TS types |
| `contracts/fixtures/**` | Synthetic responses for FE/BE |
| `contracts/package.json` | Local validation package |
| `contracts/scripts/validate.mjs` | Schema + fixture validation |

## Explicitly unresolved (do not invent silently)

1. Final routing engine (OTP vs alternative) — routing evidence required  
2. Deploy platform vendor — infrastructure proposal  
3. Geocoding / place provider — backend proposal  
4. Arrive-by search strategy details — routing addendum  
5. Per-feed freshness threshold tuning after measurement — data + infra  
6. Whether `/v1/feedback` ships on day-one public URL — deferred/reserved  

## Next step after merge

1. Human reviews and merges `agent/conductor` → `main`.  
2. Create sibling worktrees for routing/data/backend/frontend/infra/qa.  
3. Each agent reads this index + ownership map + its `.agents/*.md` prompt.  
4. Integrate only after pairwise contract wiring per `INTEGRATION_SEQUENCE.md`.
