# Recorded OTP GraphQL plans (Phase 5 adapter fixtures)

Capture context for BetterMTA Step 3 Phase 4.

| Field | Value |
|-------|-------|
| Captured at (UTC) | 2026-07-30T16:27:00Z (approx; see each JSON response timestamps) |
| graphVersion | `mta-subway-c9c3366cdd16+otp2.9.0` |
| staticVersionId | `mta-subway-c9c3366cdd16` |
| OTP image | `opentripplanner/opentripplanner:2.9.0` |
| Endpoint | `http://localhost:8090/otp/gtfs/v1` |
| Realtime | **OFF** — data gateway not live; updaters fail to connect; schedule-only routing |

## Files

| File | Query |
|------|-------|
| `a-baseline-carroll-bryant.json` | Carroll St (`nyct-gtfs:F21`) → 42 St-Bryant Pk (`nyct-gtfs:D16`), `numItineraries: 3` |
| `b-carroll-bryant-num8.json` | Same OD, `numItineraries: 8` |
| `c-brooklyn-queens.json` | Atlantic Av-Barclays (`nyct-gtfs:D24`) → Jackson Hts-Roosevelt Av (`nyct-gtfs:G14`) |
| `d-plan-introspection.json` | Introspection of Plan/Itinerary/Leg/Place/Route/Stop/LegTime fields used above |

## Selection notes (OTP 2.9 GTFS GraphQL)

- Itinerary times are exposed as `start` / `end` (`OffsetDateTime`). Recordings alias them as `startTime` / `endTime`.
- Leg times are `LegTime` objects; recordings select `scheduledTime` (+ optional `estimated`).
- `duration` (seconds), `walkDistance` (meters), `route.shortName` (line), stop `gtfsId`/`name` are included.
- Station→station searches may report `walkDistance: 0` when both ends are stop IDs (no access/egress street walk).

## Observed summaries at capture

- **(a)** 3 itineraries; lines: **F** (direct)
- **(b)** 8 itineraries; lines: **F**
- **(c)** 3 itineraries; lines: **B**, **F** (transfer at 34 St-Herald Sq)
