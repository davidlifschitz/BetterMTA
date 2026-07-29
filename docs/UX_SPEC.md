# BetterMTA UX Specification

## Design stance
Familiar enough to use immediately; differentiated at the moment the user chooses subway lines.

## Screen 1: Search
- BetterMTA wordmark.
- From and To fields.
- Time selector.
- Subway mode selected.
- Collapsed “Lines to use” row.
- Primary action: Find routes.

## Screen 2: Results
- Map above or behind a draggable results sheet.
- Three route cards.
- Baseline route marker where applicable.
- Persistent “Customize lines” control.

## Line picker
- Official service labels displayed as circular badges.
- One tap selects; second tap removes.
- Selected state uses an outer focus ring, not a changed line color.
- Summary text names selected lines.
- Update route action remains visible on small screens.

## Route card hierarchy
1. Duration and arrival time.
2. Line sequence.
3. Required-line coverage.
4. Walking, waiting, and transfers.
5. Reliability and crowding.
6. Optional explanation disclosure.

## Impossible state
Headline: “No sensible route uses all 3 selected lines.”
Subhead: “These options use the most selected lines while keeping the trip practical.”
Each card names used and omitted lines.

## Accessibility
- 44px minimum targets.
- Never rely on color alone.
- Screen-reader labels for line badges and selection state.
- Keyboard-compatible line picker.
- Reduced-motion behavior.
- Plain-language degraded-data notices.

## A/B test
Variant A: route cards only, one-sentence explanation.
Variant C: expanded breakdown explaining waiting, transfer, walking, live-data, and why alternatives ranked lower.