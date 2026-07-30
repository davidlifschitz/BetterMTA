# Proposal: Place / geocoding provider for `/v1/places/search`

> **Disposition (2026-07-30):** **ACCEPTED** — station-index-first for public beta (full static-GTFS station / station-complex autocomplete + browser geolocation). Third-party address/POI geocoding deferred. Recorded as ADR-0013.

**From:** Backend (`agent/backend`)  
**Date:** 2026-07-30  
**Status:** Accepted (see disposition)  
**Impacts:** Backend, Frontend, Infrastructure, Data (station catalog alignment)

## Problem

API_CONTRACT §12 leaves the geocoder vendor and place ID strategy unresolved. The fixture-backed API resolves a small synthetic catalog only.

## Proposal (additive, non-breaking)

1. Keep public `placeId` / `stationId` shapes unchanged.
2. Introduce a `PlaceProvider` adapter behind `DataAdapter.searchPlaces` / `resolvePlace`:
   - **MVP default:** station-name index derived from the active static GTFS dataset (data-owned export).
   - **Optional bias:** Mapbox or Google Places *only* for address/POI when `kind !== station`, with results mapped into BetterMTA `placeId`s.
3. Persist no precise coordinates by default; retention only of coarse analytics if infra enables it later.
4. Document attribution strings required by the chosen vendor for UI footer.

## Migration

- No schema change required for MVP station-only search.
- If address/POI fields need provider metadata later, propose additive optional fields (e.g. `provider`, `attribution`) rather than renaming `placeId`.

## Ask

Conductor approval of station-index-first vs third-party-first for public beta.
