# API Contract

**Owner:** Conductor  
**Status:** Locked v1 (Wave 0B additive lock)  
**Machine-readable:** `contracts/openapi/bettermta-v1.yaml`  
**Contract version:** `2026-07-31`

This document supersedes path names in `TECHNICAL_DESIGN.md` §6. Product behavior from the PRD remains unchanged.

Base path: `/v1`  
Content type: `application/json`  
Time format: ISO-8601 timestamps with offset or `Z`.

## Compatibility (Wave 0B)

Additive relative to `2026-07-30`:

- Place results may include `provider`, `providerPlaceId`, `formattedAddress`, `attribution` (and response-level `attribution`).
- Route search responses may include optional `candidateCoverage`.
- Explanation facts may include `connector_filled`.
- `insufficient_candidate_coverage` remains a contracted `503` code; details SHOULD carry CandidateCoverage fields.

Preserved:

- `PlaceRef` shapes: `placeId` | `stationId` | `coordinate` (+ optional `label`).
- Internal `lineId` values (GS stays GS; rider-facing S is presentation-only).
- Existing required route-search fields; older clients may ignore new optional properties.

Clients must tolerate absent optional fields. Servers emitting `2026-07-31` may omit `candidateCoverage` only during transitional rollout; fixtures for Wave 0B include it.

## 1. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/routes/search` | Baseline + preferred-line constrained route search |
| `GET` | `/v1/lines` | Active subway lines for picker |
| `GET` | `/v1/places/search` | Place autocomplete (stations + feature-flagged address/POI) |
| `GET` | `/v1/status` | Public data freshness / degraded status |
| `GET` | `/health/live` | Process liveness |
| `GET` | `/health/ready` | Readiness (static OK + realtime OK or permitted degraded) |

Optional later (not MVP-required to implement now, reserved names):

- `POST /v1/feedback` — route correction / feedback (backend may stub)

## 2. Common headers / metadata

### Request

- `X-Request-Id` optional; server generates if absent
- `X-BetterMTA-Client` optional client identifier (`web`)

### Response

- `X-Request-Id` always
- `X-Contract-Version: 2026-07-31`
- Cache headers only for stable metadata (`/v1/lines` may be cached briefly)

## 3. POST `/v1/routes/search`

### Request

```json
{
  "origin": { "placeId": "pl_origin_1" },
  "destination": { "placeId": "pl_dest_1" },
  "timing": {
    "type": "depart_now"
  },
  "selectedLineIds": ["A", "D"],
  "clientContext": {
    "viewport": "mobile",
    "experimentOptIn": true
  }
}
```

`selectedLineIds` are **preferred lines** (ADR-0023): maximize distinct coverage; unselected connector lines, walks, and transfers may fill gaps. Internal ids only (GS stays GS).

#### Origin / destination reference (one of)

```json
{ "placeId": "pl_..." }
```

```json
{ "stationId": "st_..." }
```

```json
{ "coordinate": { "lat": 40.75, "lon": -73.99 }, "label": "Pinned location" }
```

Address/POI results from place search are used via stable `placeId` (not `providerPlaceId`).

#### Timing

```json
{ "type": "depart_now" }
```

```json
{ "type": "depart_at", "time": "2026-07-30T13:15:00-04:00" }
```

```json
{ "type": "arrive_by", "time": "2026-07-30T09:00:00-04:00" }
```

#### Limits

| Field | Rule |
|---|---|
| `selectedLineIds` | 0–5 unique IDs |
| payload size | ≤ 16 KiB |
| unknown line IDs | `400 unknown_line` |

### Response (success `200`)

```json
{
  "contractVersion": "2026-07-31",
  "requestId": "req_123",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "realtimeSnapshotId": "rt_987",
  "dataMode": "live",
  "freshness": {
    "realtimeAgeSeconds": 18,
    "staticActivatedAt": "2026-07-29T06:00:00Z",
    "warnings": []
  },
  "baseline": {
    "itineraries": []
  },
  "constrained": {
    "itineraries": [],
    "satisfactionSummary": {
      "bestSatisfactionCount": 2,
      "requestedCount": 2,
      "completeMatchFound": true
    }
  },
  "candidateCoverage": {
    "status": "adequate",
    "familiesAttempted": ["baseline", "constrained", "preference_biased"],
    "candidateCount": 8,
    "preferenceCoveringCandidateCount": 3,
    "budgetExhausted": false
  },
  "experiment": {
    "explanationVariant": "concise"
  }
}
```

Each itinerary must conform to `contracts/schemas/itinerary.schema.json`.

Rules:

- Return at most **3** constrained itineraries.
- Return at most **3** baseline itineraries.
- If `selectedLineIds` is empty, `constrained.itineraries` is `[]` and `satisfactionSummary.completeMatchFound` is `true` with `requestedCount: 0`.
- Partial matches allowed; UI uses `satisfaction` + `explanation`.
- Preference satisfaction remains the ranking authority; `candidateCoverage` is diagnostic only.
- When the candidate budget is exhausted without trustworthy preference-covering candidates, return `503 insufficient_candidate_coverage` rather than a silent 0-of-N success.
- Never omit `dataMode`.
- Explanation fact `connector_filled` may mark an unselected connector line used to complete a trip.

## 4. GET `/v1/lines`

Query: none required.

```json
{
  "contractVersion": "2026-07-31",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "lines": [
    {
      "lineId": "A",
      "label": "A",
      "displayName": "A train",
      "color": "#0039A6",
      "textColor": "#FFFFFF",
      "isActive": true,
      "gtfsRouteIds": ["A"]
    }
  ]
}
```

## 5. GET `/v1/places/search`

Query params:

| Param | Required | Notes |
|---|---|---|
| `q` | yes | 1–100 chars |
| `limit` | no | default 8, max 15 |
| `proximityLat` / `proximityLon` | no | bias only; do not log precisely by default |

Semantics (ADR-0022):

- Station index remains authoritative for subway stations.
- Address/POI results are feature-flagged; when present they use stable BetterMTA `placeId` values.
- `kind` is the place-type discriminator (`station` \| `address` \| `poi` \| `current_location` \| `coordinate`).
- Optional additive fields: `provider`, `providerPlaceId`, `formattedAddress`, `attribution`.
- `provider` is a BetterMTA id (`station_index`, `geocoder`, …) — never a vendor hostname.
- Geocode-backed `address` / `poi` results MUST expose attribution (per-place and/or response-level) for UI.
- Geocode miss → empty `places` or `unknown_place` when a PlaceRef cannot be resolved; never silently substitute an unrelated station.

```json
{
  "contractVersion": "2026-07-31",
  "query": "277 Park",
  "attribution": "Address results via BetterMTA geocoder adapter",
  "places": [
    {
      "placeId": "pl_geo_277_park_ave",
      "label": "277 Park Avenue",
      "kind": "address",
      "provider": "geocoder",
      "providerPlaceId": "prov_opaque_277_park",
      "formattedAddress": "277 Park Avenue, New York, NY 10017",
      "attribution": "Address results via BetterMTA geocoder adapter"
    }
  ]
}
```

## 6. GET `/v1/status`

```json
{
  "contractVersion": "2026-07-31",
  "dataMode": "live",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "realtimeSnapshotId": "rt_987",
  "realtimeAgeSeconds": 18,
  "degraded": false,
  "messages": []
}
```

## 7. Health

### `GET /health/live`

`200` `{ "status": "ok" }` if process is up.

### `GET /health/ready`

`200` when static dataset is active **and** (realtime is fresh **or** degraded mode is explicitly permitted).

`503` otherwise:

```json
{
  "status": "not_ready",
  "reasons": ["static_dataset_missing"]
}
```

## 8. Error model

All errors:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Human-readable safe message",
    "requestId": "req_123",
    "details": {}
  }
}
```

| Code | HTTP | When |
|---|---|---|
| `invalid_input` | 400 | Schema/validation failure |
| `unknown_place` | 400 | Unresolvable place |
| `unknown_line` | 400 | Unknown selected line |
| `no_transit_path` | 404 | No path even without constraints |
| `incomplete_selected_line_satisfaction` | 200* | Reserved notice code in warnings; partials still 200 |
| `insufficient_candidate_coverage` | 503 | Candidate/time budget exhausted without trustworthy preference-covering candidates (ADR-0023) |
| `timeout` | 504 | Upstream/routing timeout |
| `data_unavailable` | 503 | Static missing / routing offline |
| `stale_realtime` | 200 | Soft warning via `dataMode: stale` + warning code |
| `rate_limited` | 429 | Abuse controls |
| `internal_error` | 500 | Unexpected |

\* Partial satisfaction is a **successful** response with itineraries and explanations, not an HTTP error.

For `insufficient_candidate_coverage`, `details` SHOULD include privacy-safe CandidateCoverage fields plus optional `requestedLineIds` (see `contracts/fixtures/errors/insufficient-candidate-coverage.json`). Do not include coordinates or raw vendor payloads.

Do not collapse distinct failures into opaque `500`.

## 9. Freshness metadata

Every route search and status response includes enough information for the UI to label live vs degraded data. See `DATA_CONTRACT.md`.

## 10. Caching

| Endpoint | Cacheability |
|---|---|
| `/v1/lines` | Short TTL OK (≤ 5 minutes) keyed by `staticDatasetVersion` |
| `/v1/places/search` | Optional short TTL; never cache precise current-location queries across users |
| `/v1/routes/search` | Optional; key must include normalized OD, timing bucket, selected lines, static version, realtime snapshot ID, experiment variant |
| health | no public CDN cache |

## 11. Privacy-safe logging representation

Default logs/analytics MUST NOT retain precise geocode query coordinates, proximity pins, or full street-address query strings (ADR-0022). Prefer:

| Allowed | Avoid by default |
|---|---|
| `requestId`, `placeId`, `stationId`, `kind`, `provider` | Precise `lat`/`lon`, proximity pins |
| `selectedLineIds`, timing type | Raw `q` address text |
| Coarsened grid / hashed query if needed | `providerPlaceId` dumps tied to PII |
| CandidateCoverage counters/status | OTP/vendor raw payloads |

TypeScript aid: `PrivacySafeRouteSearchLog` / `PrivacySafePlaceLogRef` in `contracts/typescript/index.ts`.

## 12. Fixtures

Frontend and backend must support the fixture set under `contracts/fixtures/**` for local and CI work before live routing exists. Fixture responses set `dataMode: "synthetic"` unless testing a specific degraded mode.

Wave 0B additions:

- `fixtures/places/place-search-address.json`
- `fixtures/errors/insufficient-candidate-coverage.json`
- `candidateCoverage` on complete/partial route fixtures

## 13. Unresolved API items

1. Concrete geocoder vendor wiring — implementation behind the `geocoder` provider abstraction; secrets/hostnames stay out of contracts.
2. Whether `/v1/feedback` ships in the first public URL — deferred but reserved.
3. Arrive-by precision / search window — routing + backend to document after engine choice.
