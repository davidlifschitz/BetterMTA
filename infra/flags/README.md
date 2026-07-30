# Feature flags

**Owner:** Infrastructure (config skeleton)  
**Runtime consumers:** Backend (authoritative), Frontend (display), Data/Routing (behavior)  
**Source of defaults:** `infra/flags/flags.json`

## Flags

| Flag | Default | Owner | Safe disable |
|---|---|---|---|
| `realtime_enabled` | `true` | data | `false` → schedule_only, labeled |
| `constraints_enabled` | `true` | routing | `false` → baseline-only ranking path |
| `explanation_variant` | `standard` | frontend | `concise` |
| `result_count` | `3` (max `3`) | backend | lower toward `1` under load |
| `maintenance_mode` | `false` | infrastructure | `true` takes product offline safely |
| `candidate_strategy` | `default` | routing | `default` or `baseline_only` |

## Resolution order (proposed)

1. Platform/env override (`FEATURE_FLAGS_JSON`) — emergency
2. Remote config store (optional later) — experiments
3. `flags.json` defaults baked or mounted into api/web

## Rules

- Flags must not silently change conductor ranking semantics beyond documented safe-disable behavior.
- Changing defaults for production requires a PR to this file plus owner acknowledgement in the deploy notes.
- `maintenance_mode=true` should make `/health/ready` fail **or** return an explicit permitted maintenance degraded mode — backend must document which; prefer failing ready for traffic drain while keeping `/health/live` up for process checks.
- UI must never present `synthetic` fixtures as live; flags do not override that honesty rule.

## PLACEHOLDER

No remote flag service is provisioned yet. Until backend mounts this file or env override, treat flags as documentation + future wiring.
