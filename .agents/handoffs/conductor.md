# Conductor Workstream Handoff

## 1. What was implemented

- Locked MVP scope and component architecture.
- Canonical domain model and ranking semantics.
- Versioned API + data contracts (`2026-07-30`).
- Architecture decision records and risk register.
- Workstream ownership / no-touch map.
- Integration sequence for parallel → integrate.
- Public-beta acceptance criteria.
- Machine-readable OpenAPI, JSON Schemas, TypeScript types, and synthetic fixtures under `contracts/`.
- Validation script for fixtures, OpenAPI path lock, and required docs.

**Not implemented:** routing engine, GTFS ingestion, application servers, frontend app, infra deploy, benchmark corpus runner.

## 2. Files changed

### Docs (new)
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/API_CONTRACT.md`
- `docs/DATA_CONTRACT.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/INTEGRATION_SEQUENCE.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/RISK_REGISTER.md`
- `docs/WORKSTREAM_OWNERSHIP.md`
- `docs/CONDUCTOR_PACKAGE.md`
- `.agents/handoffs/conductor.md` (this file)

### Docs (updated)
- `docs/PROJECT_CONTEXT.md`
- `docs/PROJECT_FILE_INDEX.md`
- `docs/TECHNICAL_DESIGN.md` (§6 superseded note)
- `docs/PARALLEL_WORKSTREAMS.md`
- `README.md`

### Contracts (new)
- `contracts/**` (OpenAPI, schemas, typescript, fixtures, validate script, package.json)

## 3. Public interfaces and schemas

- OpenAPI: `contracts/openapi/bettermta-v1.yaml`
- TS types: `contracts/typescript/index.ts`
- JSON Schema: `contracts/schemas/*.schema.json`
- Fixtures: `contracts/fixtures/**`
- Contract version constant: `2026-07-30`

Locked endpoints:

- `POST /v1/routes/search`
- `GET /v1/lines`
- `GET /v1/places/search`
- `GET /v1/status`
- `GET /health/live`
- `GET /health/ready`

## 4. Assumptions

- Confirmed PRD/product decisions remain binding.
- Mature GTFS router preferred; final engine choice deferred to routing with evidence.
- Max 5 selected lines in beta.
- Fixtures are synthetic and must be labeled as such.
- Deploy platform and geocoder vendors remain open.

## 5. Validation commands

```bash
cd contracts
npm install
npm run validate
```

Validation results (2026-07-30 local run):

```text
cd contracts && npm install && npm run validate
→ All conductor contract validations passed.
```

Covered: all listed fixtures vs JSON Schema, satisfaction accounting sanity checks, OpenAPI required paths, TypeScript contract version, required docs presence.

## 7. Fixture or sample-data instructions

Frontend/backend should load:

- `contracts/fixtures/routes/*.json`
- `contracts/fixtures/lines/subway-lines.json`
- `contracts/fixtures/places/place-search.json`
- `contracts/fixtures/status/*.json`
- `contracts/fixtures/errors/*.json`

Always honor `dataMode`. Do not present `synthetic` as live in production.

## 8. Known defects

None known in the contract package at handoff time (pending validation run).

## 9. Known limitations

- No runtime API server yet.
- Line catalog in fixtures is a subset, not full MTA set.
- Arrive-by search strategy unresolved.
- ADR-0005 deploy platform open.
- Crowding not in MVP responses.

## 10. Decisions requiring conductor approval

- Any change to `contracts/**` or locked docs listed in `WORKSTREAM_OWNERSHIP.md`
- Increasing max selected lines
- Changing ranking lexicographic order
- Exposing synthetic mode in public production UI
- Adding new public endpoints that FE/BE must share

## 11. Exact next integration step

1. Human reviews `agent/conductor`.
2. Merge into `main` (do not skip review).
3. Create worktrees for routing/data/backend/frontend/infra/qa.
4. Each workstream consumes `docs/CONDUCTOR_PACKAGE.md` + ownership map + fixtures.
5. Do **not** start those agents against this branch until merge is complete.

### Status labels
- **Implemented:** contracts + architecture docs + validation
- **Tested:** schema/fixture/OpenAPI/doc validation script
- **Mocked:** all route fixtures (`dataMode: synthetic` or explicit degraded modes)
- **Deferred:** live routing, live feeds, deploy vendor, geocoder, feedback endpoint
- **Blocked:** parallel implementation blocked on merge-to-main review
