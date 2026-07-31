# Controlled-alpha releases (Phase 12A.8)

Immutable local release identifiers + one-action rollback for the self-hosted
Compose origin (ADR-0021). **Editing source and re-running Compose is not a
rollback** — rollback must switch retained image tags via release refs.

## What a release contains

Each release pins:

| Field | Source |
|---|---|
| BetterMTA commit SHA | `git rev-parse HEAD` |
| OTP version | graph manifest / pin `2.9.0` |
| Static dataset version | `services/data/var/data/static/active.json` (or placeholder) |
| OTP graph version | `services/otp/var/otp/graphs/active.json` (or placeholder) |
| Build timestamp | UTC ISO-8601 at generate/deploy time |
| Image tags | `bettermta-{data,otp,api,web}:<RELEASE_ID>` |

`RELEASE_ID` shape: `rel-<YYYYMMDDThhmmssZ>-<shortsha>`.

## Layout

| Path | Tracked? | Role |
|---|---|---|
| `current.env.example` / `previous.env.example` | yes | Templates only |
| `current.env` / `previous.env` | **no** (gitignored) | Host release pointers |
| `manifests/*.json` | **no** (gitignored) | Generated release / rollback records |
| `scripts/deploy-release.sh` | yes | Build/retag → manifest → preserve previous → up → smoke |
| `scripts/rollback-release.sh` | yes | Restore previous images → up → smoke → record |
| `scripts/generate-release-manifest.sh` | yes | Manifest generator |
| `scripts/smoke-post-deploy.sh` | yes | Local edge smoke + optional Access remote smoke |
| `../docker-compose.release.yml` | yes | Image overrides from env |

## Operate

```bash
cd /path/to/bettermta   # integration-live worktree

# Preferred when disk is tight (~<6Gi free): retag existing :local images
./deployments/scripts/deploy-release.sh --retag-only

# Full rebuild when disk allows
./deployments/scripts/deploy-release.sh

# Dry-run (no compose up; no env write except dry-run preview)
./deployments/scripts/deploy-release.sh --retag-only --dry-run

# Rollback to previous immutable tags
./deployments/scripts/rollback-release.sh

# Smoke only
./deployments/scripts/smoke-post-deploy.sh
```

Compose files used together:

```text
docker-compose.yml + docker-compose.alpha.yml + docker-compose.release.yml
```

After a release (or rollback) is live, day-to-day lifecycle should use
`../infra/alpha/scripts/start-alpha.sh` / `stop-alpha.sh`. Those scripts auto-detect
`deployments/current.env`: when present they source it and include
`docker-compose.release.yml` (same env-load pattern as `scripts/common.sh`); when
absent they keep alpha-only `:local` compose and print a NOTE. Stop never deletes
volumes (`down` without `-v`).

Failure behavior: deploy/rollback exit non-zero on smoke/readiness failure **without**
`docker compose down -v` and **without** deleting `previous.env`.
### Remote smoke

When all three are set, post-deploy smoke also hits the public hostname via
Access service token headers:

- `ALPHA_PUBLIC_BASE_URL`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Otherwise remote smoke is skipped with a clear message (local smoke still runs).

## Disk-safe drill (BLOCKED-for-disk hosts)

If free disk is under ~6Gi, refuse full `compose build` and use:

```bash
# 1) Seed "previous" release from :local
./deployments/scripts/deploy-release.sh --retag-only --skip-up
# 2) Seed "current" release (copies step-1 current → previous)
./deployments/scripts/deploy-release.sh --retag-only --skip-up
# 3) Prove rollback logic (env switch + image inspect; optional --skip-up)
./deployments/scripts/rollback-release.sh --dry-run
# Optional live switch without rebuild:
./deployments/scripts/rollback-release.sh
```

That proves image-tag rollback without multi-GB rebuild layers. On this host a live
retag recreate (`rollback-release.sh` without `--skip-up`) already switched running
containers from `:local` to `:rel-…` tags with edge smoke passing; a **distinct-digest**
rollback still needs enough disk for two real builds.

## Secrets

Never commit `deployments/*.env` (except `*.env.example`), Access tokens,
tunnel credentials, or hostnames. Manifests are version metadata only — still
kept gitignored as host-local state.
