# Domain Model

**Owner:** Conductor  
**Status:** Locked canonical vocabulary  
**Machine-readable companion:** `contracts/schemas/**`, `contracts/typescript/**`

All workstreams must use these names and invariants. Implementation storage shapes may differ internally, but public and cross-service payloads must map to this model.

## 1. Entity catalog

### Place

A user-addressable origin or destination.

| Field | Meaning |
|---|---|
| `placeId` | Stable BetterMTA identifier |
| `label` | Human display name |
| `kind` | `station` \| `address` \| `poi` \| `current_location` \| `coordinate` |
| `lat` / `lon` | WGS84 coordinates when known |
| `stationId` | Optional link when place resolves to a station |

**Invariant:** A search request must resolve to coordinates and/or station references before routing.

### Station

A rider-facing subway stop name used for boarding/alighting.

| Field | Meaning |
|---|---|
| `stationId` | Stable BetterMTA station ID |
| `name` | Display name |
| `complexId` | Optional station complex |
| `stopIds` | GTFS stop / platform IDs belonging to the station |

### StationComplex

A connected set of stations/platforms treated as one transfer campus when walkways are in-system.

### Route / Line

A subway service the rider recognizes (e.g. `A`, `2`, `L`).

| Field | Meaning |
|---|---|
| `lineId` | Canonical BetterMTA line ID (stable product ID) |
| `gtfsRouteId` | Underlying GTFS `route_id` when 1:1; otherwise mapped |
| `label` | Short badge text |
| `displayName` | Accessible name |
| `color` | Official-ish display color token (never sole state indicator) |
| `isActive` | Whether selectable in current static dataset |

**Invariant:** Selected-line constraints refer to `lineId`, never raw display color.

### ServicePattern

A scheduleable pattern of stops for a line under a service calendar (local vs express, reroutes, shuttles). Distinct from the rider-facing `lineId` when the same line has multiple operating patterns.

### TransitLeg

A continuous ride on one `lineId` / trip between board and alight stops.

Must include: `legId`, `lineId`, `tripId` (if known), board/alight station or stop refs, depart/arrive timestamps, scheduled vs realtime timestamps when available, and source engine IDs.

**Invariant:** A selected line is “used” only if at least one `TransitLeg.lineId` equals that selected `lineId`.

### WalkingLeg

Walking between places, stations, or street access points. Includes duration, distance when known, and whether the walk is out-of-system.

### Transfer

A connection between consecutive transit legs, possibly via walking or in-complex transfer. Counted in ranking after arrival time.

### Itinerary

An ordered door-to-door journey: legs + aggregate metrics.

Required aggregates:

- `durationSeconds`
- `arrivalTime`
- `walkingSeconds`
- `waitingSeconds`
- `transferCount`
- `lineSequence` (ordered distinct ride segments)
- `satisfaction` (see below)
- `realtimeConfidence` (`high` \| `medium` \| `low` \| `none`)
- `alerts[]`
- `explanation`
- `fingerprint` (stable deterministic ID for tie-breaking)

### CandidateItinerary

An itinerary still inside the candidate pool before final top-3 truncation. Same shape as `Itinerary`, plus optional `candidateFamily` (`baseline` \| `constrained` \| `preference_biased` \| `targeted_combination`).

### SelectedLineConstraint

The set of `lineId`s the rider requires the router to use when feasible.

MVP limits:

- Minimum: 0 (baseline-only search)
- Maximum selected lines for beta: **5** (ADR-0006)
- Empty selection ⇒ return baseline ranking only; constrained list may be empty or omitted per API rules

### SatisfactionResult

Machine-readable accounting of constraint success.

| Field | Meaning |
|---|---|
| `requestedLineIds` | Echo of request, normalized order |
| `satisfiedLineIds` | Distinct selected lines used by ≥1 transit leg |
| `omittedLineIds` | Requested minus satisfied |
| `satisfactionCount` | `satisfiedLineIds.length` |
| `requestedCount` | `requestedLineIds.length` |
| `isComplete` | `satisfactionCount === requestedCount` when requestedCount > 0; `true` when requestedCount === 0 |
| `feasibility` | `complete` \| `partial` \| `none` \| `not_applicable` |

**Invariants:**

- Never count a selected line more than once.
- Never claim a line is satisfied unless a transit leg uses it.
- Duplicate rides on the same line do not increase satisfaction.

### RealtimeSnapshot

A versioned capture of GTFS-Realtime entities used for a search.

| Field | Meaning |
|---|---|
| `snapshotId` | Opaque ID |
| `feedTimestamps` | Source feed header timestamps |
| `ingestedAt` | Ingestion time |
| `ageSeconds` | Computed age at request time |
| `dataMode` | `live` \| `schedule_only` \| `stale` \| `synthetic` \| `unavailable` |

### ServiceAlert

Normalized alert affecting agencies, lines, stops, or trips. Must preserve severity and human header/description when available.

### Explanation

Structured facts supporting UI copy. Not free-form LLM prose for MVP.

Minimum fields:

- `summary` — one sentence derived from structured facts
- `facts[]` — typed facts (`line_used`, `line_omitted`, `transfer`, `walk`, `wait`, `realtime`, `baseline_delta`, `alert`)
- `baselineDeltaSeconds` — nullable time difference vs baseline best

### ReliabilityAssessment

Optional. Only present when defensible data exists.

| Field | Meaning |
|---|---|
| `level` | `high` \| `medium` \| `low` \| `unknown` |
| `basis` | Short machine code for why (`historical_ot`, `alert_impact`, `realtime_variance`, etc.) |
| `displayEligible` | If false, UI must hide reliability |

Crowding follows the same optional pattern and is **not** part of MVP responses unless later approved.

## 2. Ranking model (locked)

Lexicographic order for constrained candidates:

1. Maximize `satisfactionCount` (distinct selected lines used)
2. Minimize expected `arrivalTime`
3. Minimize `transferCount`
4. Minimize `walkingSeconds`
5. Prefer higher `realtimeConfidence`
6. Ascending stable `fingerprint`

Baseline candidates (no selected-line objective) rank by steps 2–6 only.

**Complete matches always outrank partial matches**, regardless of travel time.

## 3. Constraint edge cases (normative)

| Case | Behavior |
|---|---|
| Duplicate selected line IDs | Dedupe before search |
| Line selected but irrelevant to OD pair | May be omitted; explain in `omittedLineIds` |
| Local vs express variants of same `lineId` | Count once for satisfaction |
| Changing GTFS route IDs | Map via data platform to stable `lineId` |
| Replacement shuttles | May satisfy a line only if data maps shuttle to that `lineId`; otherwise omit and explain |
| Walking between stations | Allowed; counts toward walking metric |
| Out-of-system transfers | Allowed; still a transfer |
| Partial service / reroutes | Use active snapshot; alerts attached |
| All selected lines infeasible together | Return best partials; never empty generic failure if any practical partial exists |
| Zero candidates within budget | Typed error `insufficient_candidate_coverage` distinct from `no_transit_path` and from true constraint impossibility messaging |

## 4. Identity and versioning

Every route search response must echo:

- `requestId`
- `staticDatasetVersion`
- `realtimeSnapshotId` (nullable in schedule-only)
- `dataMode`
- `contractVersion` (`2026-07-30` for this lock)

## 5. Unresolved domain questions

Marked open; do not invent silent answers in implementation:

1. Exact `lineId` catalog vs GTFS `route_id` mapping table ownership details beyond “data owns mapping” — **data proposes, conductor approves**.
2. Whether arrive-by searches reverse-search or iteratively depart-search — **routing decides with ADR addendum**.
3. Accessibility-aware routing depth for MVP — **deferred unless QA corpus requires a minimal subset**.
