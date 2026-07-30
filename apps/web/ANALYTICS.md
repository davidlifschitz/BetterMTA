# Analytics event mapping

Privacy-safe funnel events for the BetterMTA mobile web client.

## Transport

- Implementation: `src/lib/analytics.ts`
- Default dispatcher: console in non-production (`track()` / `setAnalyticsDispatcher`)
- No network beacon in MVP — swap the dispatcher later without changing call sites

## Rules

- Never send precise coordinates (`lat`/`lon`)
- Prefer opaque `placeId` / `stationId` / `requestId` / `itineraryId`
- Line identifiers are service labels (e.g. `F`), not user PII
- Do not attach free-text address strings entered by the user

## Event map

| UI moment | Event | Key properties |
|---|---|---|
| User taps **Find routes** | `search_started` | `hasSelectedLines`, `selectedLineCount`, `timingType`, `viewport` |
| User picks an autocomplete place | `place_selected` | `field`, `placeKind`, `placeId` |
| User changes depart/arrive timing | `timing_changed` | `timingType` |
| Line picker sheet opens | `line_picker_opened` | `selectedLineCount`, `context` |
| Line badge toggled | `line_toggled` | `lineId`, `selected`, `selectedLineCount` |
| Results successfully rendered | `results_viewed` | `requestId`, `dataMode`, `resultCount`, `completeMatchFound`, `bestSatisfactionCount`, `requestedCount` |
| User opens a route card / detail | `route_selected` | `requestId`, `itineraryId`, `satisfactionCount`, `requestedCount`, `isComplete` |
| Explanation disclosure expanded | `explanation_expanded` | `itineraryId`, `variant` |
| Error / no-route / unavailable state shown | `error_viewed` | `code`, `requestId?` |
| Lines edited after a prior search (OD preserved) | `lines_updated_rerun` | `selectedLineCount`, `preservedOd: true` |
| Thumbs feedback on results | `feedback_submitted` | `requestId`, `rating`, `hasComment`, optional `comment` |
| Geolocation permission outcome | `location_permission` | `outcome`, `mappedToFixtureOrigin` |

## Non-goals (MVP)

- No identity / account identifiers
- No session replay
- No network analytics beacon (console / fixture stub only)
- Feedback never includes OD coordinates or address free text — only `requestId` + rating/comment
