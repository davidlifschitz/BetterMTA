# BetterMTA Web (Frontend)

Mobile-first Next.js App Router client for BetterMTA public beta.

## Quick start

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000

## API swap point

All UI code imports the API through:

- `src/lib/api/index.ts` → exports `api`

| Mode | Env | Behavior |
|---|---|---|
| Fixture (default) | `NEXT_PUBLIC_API_MODE=fixture` or unset | Serves `contracts/fixtures/**` |
| Live | `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_BASE_URL` | HTTP `/v1/*` via `live-client.ts` |

Changing backends is a one-module change at `src/lib/api/index.ts`.

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
npm test          # vitest
npm run build     # production build
npm run lint
```

## Notes

- List-based UI (no map) for MVP speed.
- Reliability/crowding UI renders only when `displayEligible` is true.
- Synthetic/stale/schedule-only modes are always labeled.
