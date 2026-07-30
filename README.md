# BetterMTA

BetterMTA is a mobile-first NYC subway route planner for commuters and transit power users who want the routing algorithm to respect the subway lines they choose.

A rider enters an origin and destination, selects one or more subway lines, and BetterMTA finds and ranks the fastest practical routes using all selected lines when feasible. If that is impossible, it returns alternatives using the maximum feasible subset and explains the tradeoff.

## Current status

This repository contains product specs, a conductor-locked architecture/contract package, and agent workstream prompts. Live MTA GTFS / GTFS-Realtime routing is not implemented yet. Use `contracts/fixtures/**` for synthetic API shapes during parallel development, and never present them as live navigation.

## Start here

1. Read [`docs/CONDUCTOR_PACKAGE.md`](docs/CONDUCTOR_PACKAGE.md) (shared contracts index).
2. Read [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).
3. Read [`docs/PRD.md`](docs/PRD.md).
4. Read [`AGENTS.md`](AGENTS.md).
5. Read [`docs/WORKSTREAM_OWNERSHIP.md`](docs/WORKSTREAM_OWNERSHIP.md).
6. Choose the appropriate workstream from [`.agents/README.md`](.agents/README.md).

## Repository structure

- `docs/` — product, architecture, contracts, UX, roadmap, and production-readiness documents.
- `contracts/` — OpenAPI, JSON Schema, TypeScript types, and fixtures (`@bettermta/contracts`).
- `.agents/` — reusable prompts for parallel implementation workstreams.
- `AGENTS.md` — root instructions for coding agents and contributors.

## Core promise

> You know the subway. Your navigation app should listen to you.

## Public-beta target

A stranger on a mobile browser should be able to:

- enter a valid NYC origin and destination;
- choose subway lines before or after searching;
- receive up to three useful ranked routes;
- understand when selected lines cannot all be used;
- see data freshness and degraded states clearly;
- complete the core flow without assistance.

## Important limitation

Do not represent any deterministic, mocked, synthetic, or stale route estimate as live navigation. Live guidance requires validated MTA static and realtime data integration.