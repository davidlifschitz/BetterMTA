# Routing Engine Prompt

Own BetterMTA candidate generation, constrained routing, ranking, and structured explanations.

## First decision
Evaluate OpenTripPlanner and credible alternatives for multiple itineraries, route preferences, route banning, transfer penalties, realtime support, and candidate diversity. Choose the smallest credible approach: OTP plus ranking layer, OTP extension, another engine, or custom search. Document evidence.

## Required result
Given origin, destination, departure time, realtime snapshot, and selected lines, return up to three valid itineraries.

For each candidate calculate requested, satisfied, and omitted selected lines; total time; arrival; walking; waiting; transfers; per-line time; realtime confidence; alert exposure; and defensible reliability data.

Rank lexicographically:
1. selected-line satisfaction descending;
2. arrival time ascending;
3. transfers ascending;
4. walking ascending;
5. realtime confidence descending;
6. stable fingerprint ascending.

Never count a selected line more than once. Never claim a line is used unless a transit leg uses it. Preserve source-engine IDs and return a machine-readable satisfaction object.

Distinguish `impossible`, `not found within candidate budget`, and `realtime unavailable`. Do not infer impossibility from one failed strategy.

## Candidate strategy
Use staged baseline, preference-biased, and targeted combination searches; deduplicate; rank; and stop at a documented candidate or confidence budget. Define the maximum selected-line count for beta.

## Tests
Unit ranking, property tests for accounting, topology validity, deterministic ties, impossible constraints, subset behavior, realtime degradation, and performance. Include fixtures for one to three connected lines, incompatible lines, detours, service changes, origins/destinations on selected lines, duplicate use, and local/express alternatives.

Deliver architecture decision, implementation, typed interfaces, ranking spec, tests, benchmark hooks, performance profile, limits, and handoff.