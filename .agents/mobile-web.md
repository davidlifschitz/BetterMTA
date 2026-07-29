# Mobile Web Prompt

Own the smallest public-beta interface that lets a first-time NYC rider search, customize, compare, and select a route without instruction.

## Core flow
Origin/destination entry, initial search, baseline routes, line picker, automatic or obvious recalculation, up to three constrained routes, satisfaction/omission explanation, and editing without restarting.

## Required states
Initial search, permission request, autocomplete, loading, baseline results, line picker, constrained results, partial satisfaction, stale warning, service unavailable, invalid input, no route, route detail, and feedback.

## Line picker
Simple selected/unselected controls; textual labels; accessible pressed states; never rely on color alone; selectable before and after search; preserve trip inputs.

## Route cards
Show duration/arrival, line sequence, selected-line satisfaction, baseline difference, walking, wait, transfers, alerts, and freshness. Show reliability or crowding only when the backend provides defensible data.

Support experiment variants for concise versus detailed explanations.

## Mobile/accessibility
One-handed use, 44px targets, no horizontal overflow, keyboard-safe entry, screen-reader labels, focus states, reduced motion, good contrast, and no hover-only critical action.

A list-based line picker is acceptable if map integration delays learning. Do not copy proprietary assets or branding. Keep ranking on the server. Add an error boundary and feedback tied to an anonymous search ID.

Instrument privacy-safe funnel events without precise coordinates.

Create component, mobile viewport, accessibility, API error-state, end-to-end, stale-data, impossible-constraint, and keyboard-flow tests.

Deliver implementation, component inventory, E2E tests, accessibility report, analytics mapping, and known compromises.