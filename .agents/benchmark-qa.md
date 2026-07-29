# Benchmark and QA Prompt

Own BetterMTA route quality, regression testing, and the internal “Beat Google 100” benchmark. The benchmark name is not a claim of universal superiority, and third-party products must not be scraped in violation of their terms.

## Dataset
Create 100 NYC trip cases across boroughs, peak/off-peak periods, local/express choices, one to three selected lines, transfers, detours, incompatible lines, planned changes, realtime delays, station complexes, and supported accessibility cases.

Each case includes a stable ID, origin, destination, departure scenario, selected lines, expected feasibility, minimum satisfaction, invariant assertions, human-review notes, static version, and realtime fixture version.

Prefer invariants over one exact itinerary when multiple answers are valid.

## Automated assertions
Verify origin/destination alignment, chronological legs, nonnegative durations, valid transfers, real dataset legs, accurate selected-line counts, accurate omissions, deterministic ranking, satisfaction ordering, tie ordering, and freshness metadata.

## Human review
Ask whether each result is physically valid, practical, constraint-correct, understandable, missing an obvious route, and preferable to the baseline for that scenario.

## Release gates
Zero known topology-invalid benchmark routes, zero constraint-accounting errors, deterministic repeats, no severe mobile regressions, agreed performance tolerance, and no misleading stale-data presentation.

Add fuzz or property testing for generated places and selected-line sets.

Deliver schema, seed dataset or documented assembly process, runner, reports, thresholds, human-review workflow, CI integration, and coverage gaps.