# BetterMTA Web (Frontend)

Mobile-first Next.js App Router client for BetterMTA public beta.

## Quick start

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `fixture` | `fixture` (local demos) or `live` (HTTP `/v1/*`) |
| `NEXT_PUBLIC_API_BASE_URL` | _(required in live)_ | Origin for live API, e.g. `https://api.example.com` |
| `NEXT_PUBLIC_FLAG_FEEDBACK` | off | Set `true` / `1` to show anonymous feedback. **Must stay off in production** until privacy-reviewed transport (ADR-0017). |
| `NEXT_PUBLIC_FLAG_RESULT_COUNT` | _(unset)_ | Optional UI result-count experiment knob |

See `.env.production.example` for live production defaults.

## API swap point

All UI code imports the API through:

- `src/lib/api/index.ts` → exports `api`

| Mode | Env | Behavior |
|---|---|---|
| Fixture (default) | `NEXT_PUBLIC_API_MODE=fixture` or unset | Serves `contracts/fixtures/**` |
| Live | `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_BASE_URL` | HTTP `/v1/*` via `live-client.ts` |

Changing backends is a one-module change at `src/lib/api/index.ts`.

### Live mode UI rules (ADR-0013…0018)

- Place autocomplete = `/v1/places/search` only (no local demo lists)
- Geolocation → coordinate `PlaceRef` labeled “Current location” (no demo-station mapping)
- Arrive-by timing option hidden
- Feedback control hidden unless `NEXT_PUBLIC_FLAG_FEEDBACK` is on
- Fixture tip copy / demo OD presets are fixture-only
- Synthetic banner only when the API payload says `dataMode: synthetic`

### Fixture scenario map

| Selection / place | Fixture |
|---|---|
| No selected lines | `routes/baseline-only.json` (`schedule_only`) |
| F + B | `routes/complete-match.json` (`synthetic`) |
| A + G + L | `routes/partial-match.json` (`synthetic`) |
| 7 only | `routes/degraded-realtime.json` (`stale`) |
| Origin/dest `*nopath*` | `errors/no-transit-path.json` |
| Origin/dest `*unavailable*` | `data_unavailable` error |
| Selected `Z9` | `errors/unknown-line.json` |

## Scripts

```bash
npm test                 # vitest unit tests
npm run build            # production build
npm run lint
npm run verify:no-fixtures   # after a live build: fail if fixture markers leak into .next chunks
npm run e2e              # Playwright mocked live suite (builds + starts Next in live mode)
npm run e2e:live         # env-gated real-stack specs (requires BETTERMTA_E2E_LIVE_BASE)
```

## Notes

- List-based UI (no map) for MVP speed.
- Reliability/crowding UI renders only when `displayEligible` is true.
- Synthetic/stale/schedule-only modes are always labeled honestly from the API payload.
