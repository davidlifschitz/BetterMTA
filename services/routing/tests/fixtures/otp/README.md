# OTP recorded plan fixtures (routing package copy)

**Provenance:** Copied from `services/otp/recorded/*.json` (Phase 4 capture). Do not reference that package path from tests — keep this copy in sync manually when recordings are refreshed.

| Field | Value |
|-------|-------|
| Captured at (UTC) | 2026-07-30T16:27:00Z (approx; see each JSON) |
| graphVersion | `mta-subway-c9c3366cdd16+otp2.9.0` |
| OTP image | `opentripplanner/opentripplanner:2.9.0` |
| Endpoint | `http://localhost:8090/otp/gtfs/v1` |
| Realtime | OFF (schedule-only) |

| File | Query |
|------|-------|
| `a-baseline-carroll-bryant.json` | Carroll St → 42 St-Bryant Pk, `numItineraries: 3` |
| `b-carroll-bryant-num8.json` | Same OD, `numItineraries: 8` |
| `c-brooklyn-queens.json` | Atlantic Av-Barclays → Jackson Hts-Roosevelt Av |

Times in these recordings are OffsetDateTime strings (`startTime` / `endTime` aliases). The production provider also accepts epoch-millis `start`/`end` from unaliased OTP 2.9 selections.
