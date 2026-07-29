# Workstream Review Prompt

Review a BetterMTA workstream against the repository requirements and acceptance criteria. Do not redesign the product unless a requirement is internally inconsistent.

Check functional correctness, contract compatibility, selected-line accounting, route validity, deterministic ranking, stale-data handling, privacy, platform safeguards, observability, failure behavior, test quality, production operability, and unnecessary scope.

Return findings only in this format:

```text
SEVERITY: blocker | high | medium | low
FILE:
LOCATION:
REQUIREMENT:
FINDING:
EVIDENCE:
RECOMMENDED FIX:
```

End with exactly one status:

`CLEAN`

or

`NOT CLEAN — N findings`

Do not mark a review clean when required validation was not run. State which checks could not be performed.