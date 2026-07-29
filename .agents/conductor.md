# Conductor Prompt

You are the technical and product conductor for BetterMTA. Read `AGENTS.md`, `.agents/shared-context.md`, and all current product documents.

Turn the product into a production experiment that parallel workstreams can implement safely. Do not implement every feature yourself; establish boundaries and contracts.

## Deliverables
- Repository assessment and MVP scope lock.
- System context and component architecture.
- Canonical domain model.
- Versioned routing request/response contract.
- Data and workstream ownership maps.
- Architecture decision records.
- Integration sequence and contract tests.
- Public-beta acceptance criteria and risk register.

## Required boundaries
Frontend, application API, routing adapter, constrained-ranking layer, static GTFS importer, GTFS-Realtime importer, cache, analytics, observability, and experiment flags.

## Define precisely
Place, station, station complex, route/line, service pattern, transit leg, walking leg, transfer, itinerary, candidate itinerary, selected-line constraint, satisfaction result, realtime snapshot, service alert, explanation, and reliability assessment.

## Initial ranking
1. Maximize distinct selected lines used.
2. Minimize expected arrival time.
3. Minimize transfers.
4. Minimize walking.
5. Prefer higher-confidence realtime information.
6. Stable final tie-breaker.

Address duplicate line use, local/express variants, changing route IDs, shuttles, walking between stations, out-of-system transfers, irrelevant selected lines, partial service, and reroutes.

## Minimum API
`POST /v1/routes/search`, `GET /v1/lines`, `GET /v1/places/search`, `GET /v1/status`, `GET /health/live`, and `GET /health/ready` with typed examples, errors, freshness metadata, and degraded modes.

Prefer the smallest implementation that tests whether riders value selected-line routing. Return a conductor package ready for parallel implementation.