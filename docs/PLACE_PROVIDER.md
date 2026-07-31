# Place provider (address / POI) — Wave 1A

**Owner:** Backend (API place-resolution boundary)  
**ADR:** ADR-0022  
**Contract:** `2026-07-31` (`GET /v1/places/search`, optional `provider` / `providerPlaceId` / `formattedAddress` / `attribution`)

## Choice

| Layer | Implementation |
|---|---|
| Interface | `GeocoderProvider` in `apps/api/src/adapters/places/` |
| CI / deterministic | `FakeGeocoderAdapter` (`BETTERMTA_GEOCODER_PROVIDER=fake`) |
| Controlled alpha | **Nominatim** (`BETTERMTA_GEOCODER_PROVIDER=nominatim`) — OpenStreetMap Nominatim or any Nominatim-compatible base URL |
| Default | `none` — station index only |

**Why Nominatim:** well-documented, no API key for the public instance, OSM attribution is clear, and the same adapter works against a self-hosted or commercial Nominatim-compatible endpoint (e.g. LocationIQ forward-geocode URL) by changing `BETTERMTA_NOMINATIM_BASE_URL` without code changes. Vendor hostnames never appear in `provider` (always BetterMTA id `geocoder`).

## Feature flag

- Flag id: `address_poi_enabled` (default **`false`** in `infra/flags/flags.json`)
- Resolution: `FEATURE_FLAGS_JSON` → `BETTERMTA_ADDRESS_POI_ENABLED` → `FLAG_DEFAULTS_PATH` / `flags.json` → hardcoded `false`
- Flag-off preserves certified station-index + geolocation behavior (ADR-0022 §7)

## Setup (controlled alpha)

1. Keep `address_poi_enabled=false` until go/no-go; do **not** redeploy certified alpha with the flag on without a separate decision.
2. Set secrets/env outside Git (see `infra/env/api/.env.example`):

```bash
BETTERMTA_GEOCODER_PROVIDER=nominatim
BETTERMTA_NOMINATIM_USER_AGENT="BetterMTA-Alpha/0.1 (your-ops-email@example.com)"
# optional:
# BETTERMTA_NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
# BETTERMTA_NOMINATIM_EMAIL=your-ops-email@example.com
FEATURE_FLAGS_JSON='{"address_poi_enabled":true}'
```

3. Public Nominatim usage policy requires a valid identifying User-Agent and ~1 request/second. This adapter enforces `BETTERMTA_GEOCODER_MIN_INTERVAL_MS` (default 1100) and bounded retries (`BETTERMTA_GEOCODER_MAX_ATTEMPTS`, default 2).

## Cost

| Option | Cost notes |
|---|---|
| Public `nominatim.openstreetmap.org` | Free; strict rate/UA policy — suitable only for light controlled-alpha traffic |
| Self-hosted Nominatim | Infra cost only |
| Nominatim-compatible hosted (e.g. LocationIQ) | Free tier / paid; put base URL + any token headers in env (do not commit) |

## Attribution

- Geocode-backed `address` / `poi` results **must** expose attribution (per-place and/or response-level) for UI (Wave 1C).
- Nominatim adapter default attribution: `© OpenStreetMap contributors`
- Fake/CI adapter uses: `Address results via BetterMTA geocoder adapter` (matches contract fixture copy)
- `provider` field is always a BetterMTA id (`station_index` \| `geocoder`), never a vendor hostname

## Privacy

- No precise address/coordinate or raw query text in normal logs (`places_ok` logs `queryLength`, counts, flags only; logger redacts `query` / `lat` / `lon` keys).
- Geocode query cache keys are **SHA-256** of normalized query + coarse proximity bucket (~0.1°), not raw pins.
- Resolve cache is in-process, TTL-bounded (`pl_geo_*` → Place); not durable; not analytics.
- No default retention of precise geocode query coordinates (ADR-0022 §5).
- Geocode miss / provider unavailable → stations only or empty places; **never** silently substitute an unrelated station. Unresolved `pl_geo_*` PlaceRef → `null` from `resolvePlace` (route path surfaces `unknown_place`).

## Behavior

1. Station index search runs first (authoritative for subway stations).
2. If flag on + geocoder configured, remaining `limit` slots fill with address/POI hits.
3. Station matches keep `provider: "station_index"`.
4. Timeouts / 429 / 5xx → bounded retry then `availability: unavailable` (station results still returned).

## Tests

```bash
cd apps/api && npm test -- test/places.test.ts test/contract.test.ts
```

Use `BETTERMTA_GEOCODER_PROVIDER=fake` + `addressPoiEnabled: true` for deterministic CI (no network).
