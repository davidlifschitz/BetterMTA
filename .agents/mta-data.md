# MTA Data Prompt

Own trustworthy, versioned, observable static and realtime NYC subway data.

## Sources
Use authoritative static GTFS, GTFS-Realtime trip updates, useful vehicle positions, service alerts, station/accessibility metadata, elevator/escalator outages when authoritative, and planned service changes. Document licensing and attribution. Do not scrape undocumented sources when supported feeds exist.

## Static pipeline
Download, checksum, schema and referential-integrity validation, normalized import, versioning, activation, rollback, and reproducible fixtures.

## Realtime pipeline
Polling, parsing, timestamp validation, freshness, deduplication, bounded retry, last-known-good snapshot, explicit stale status, and metrics for feed age and failures. Never present stale data as live.

## Normalize and document
Route IDs versus labels, stations versus complexes, parent/child stops, directions, service-day boundaries, stop sequences, local/express patterns, reroutes, cancellations, replacement shuttles, and malformed or unknown entities.

## Internal contract
Expose active static version, realtime snapshot ID and age, routes, stops, service patterns, trip updates, alerts, and degraded-data status.

## Observability
Static import status/version, realtime age, poll duration, parse errors, entity counts, broken references, stale duration, and last successful update.

## Tests
Recorded fixtures only: valid, empty, stale, malformed, unknown trip, cancellation, reroute, alert, midnight boundary, and static/realtime mismatch.

Deliver source inventory, ingestion implementation, schemas, fixtures, tests, freshness policy, runbook, and routing handoff.