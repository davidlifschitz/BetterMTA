# BetterMTA Product Requirements Document

## 1. Problem
NYC commuters often know that a particular line or transfer pattern works better for them, but mainstream routing tools do not let them require lines and independently verify the fastest route satisfying those choices.

## 2. Target users
Primary: daily NYC subway commuters.
Secondary: transit enthusiasts and power users.

## 3. MVP jobs
- Enter origin and destination.
- View baseline routes.
- Select one or more subway lines before or after search.
- Compute the fastest route using every selected line when a valid, sensible route exists.
- When impossible, return routes using the maximum feasible number of selected lines.
- Show three ranked routes with familiar transit metrics.

## 4. Core workflow
1. User enters origin and destination.
2. User optionally selects lines.
3. System generates a baseline candidate set and a constraint-satisfying candidate set.
4. System validates timing against schedule and live data.
5. System ranks complete matches first, then maximal partial matches, then duration.
6. User edits selected lines and results update.

## 5. Functional requirements
### Search
- Current location, place, address, or station origin.
- Place, address, or station destination.
- Depart now, depart at, and arrive by.

### Line selection
- One-tap toggle for each subway service.
- Available before and after route search.
- Selected lines are required for the initial constrained search.

### Results
Each route shows:
- Total duration.
- Arrival time.
- Subway lines and order.
- Walking time.
- Expected waiting time.
- Transfers.
- Reliability indicator.
- Crowding indicator when data supports it.
- Required-line coverage.
- Brief explanation.

### Impossible constraints
- Never show a generic “no routes” response when a partial solution exists.
- Return up to three alternatives maximizing selected-line coverage.
- State which selected lines are missing.

### Preference learning
- Ask once whether BetterMTA may remember recurring line choices.
- After consent, infer recurring preferences and offer them—not silently force them.

## 6. Non-goals for public beta
- Turn-by-turn underground positioning.
- Bus, LIRR, Metro-North, ferry, or NJ Transit optimization.
- Fare optimization.
- Guaranteed crowding accuracy.
- Full parity with Google Maps place discovery.

## 7. Production definition: public beta
A stranger can use the mobile web app without assistance for subway-only NYC trips, receives clearly labeled live or degraded data, and can submit feedback. The service has monitoring, safe deployments, routing benchmarks, privacy controls, and documented fallback behavior.

## 8. Acceptance criteria
- Complete selected-line route ranks above any partial route.
- If no complete route is valid, maximal line coverage ranks first.
- Top three route results return within 2 seconds at p95 under beta load, excluding upstream outage fallback.
- First-time task-completion rate exceeds 80% in moderated testing.
- No critical accessibility failures in the core workflow.
- Every route response states data freshness or degraded mode.

## 9. Metrics
North star: percentage of completed searches where the user selects a BetterMTA route not present in the baseline top three.
Supporting: search completion, line-toggle usage, route start rate, repeat weekly use, routing disagreement rate, correction reports, p95 latency, and crash-free sessions.

## 10. Experiments
- A/B test brief explanations versus expanded decision breakdowns.
- Test line selection before search versus post-results emphasis.
- Test “Beat the default” comparison language versus neutral ranking.