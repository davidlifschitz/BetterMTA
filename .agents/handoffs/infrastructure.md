# Infrastructure workstream handoff

**Branch:** `agent/infrastructure`  
**Worktree:** `/Users/thebiglipper/Developer/bettermta-infrastructure`  
**Date:** 2026-07-30  
**Contract version consumed:** `2026-07-30`  
**Remediation pass:** verification findings HIGH 1–3, MEDIUM 4–9, LOW 10/12 applied

Distinguish: **implemented** / **tested** / **mocked (placeholder)** / **deferred** / **blocked**.

---

## 1. What was implemented

- **Implemented:** ADR-0005 platform **proposal** recommending Fly.io (~$25–45/mo beta; ~$55–85 with Managed Postgres), with Render / Railway / Vercel+workers comparison and citations.
- **Implemented:** CI workflow with always-on contracts validation, directory-guarded per-service jobs, dependency audit, infra YAML/JSON + Fly TOML validate job.
- **Implemented:** Env templates + secrets policy (placeholder names only).
- **Implemented:** Fly.toml templates for api/web/data wired to `/health/live` + `/health/ready` (api), deploy/rollback docs with replica ceilings and poller always-on guidance.
- **Implemented:** Observability conventions (log fields, metrics matching DATA_CONTRACT §10 + API percentiles, alert docs + `alerts.yaml` including DeployFailure stub + dual RealtimeStale exprs).
- **Implemented:** Feature flags skeleton (`flags.json` + README) with `result_count` default/max **3** (API contract).
- **Implemented:** `docs/SLOS.md` (proposed, unmeasured), `docs/RUNBOOKS.md` (incl. backup/restore/retention + launch checklist).
- **Implemented:** PLACEHOLDER `.github/workflows/deploy.yml` — `workflow_dispatch` only; inactive until ADR-0005 + apps/services merge.
- **Mocked (placeholder):** All deploy configs marked ready-to-activate; no live Fly apps; no metrics backend; no pager; deploy workflow refuses unless `ACTIVATE`.
- **Deferred:** Activating deploy-on-merge, preview app automation, Grafana dashboards, Managed Postgres final choice (recommend defer Postgres creation until feedback feature ships), on-call rota.
- **Blocked:** Activating production deploys until `apps/api`, `apps/web`, `services/data` (+ Dockerfiles) exist and conductor accepts ADR-0005.

---

## 2. Files changed

- `docs/proposals/infrastructure-adr-0005-platform.md`
- `docs/SLOS.md`
- `docs/RUNBOOKS.md`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `infra/README.md`
- `infra/fly/api.fly.toml`
- `infra/fly/web.fly.toml`
- `infra/fly/data.fly.toml`
- `infra/fly/DEPLOY.md`
- `infra/env/SECRETS_POLICY.md`
- `infra/env/api/.env.example`
- `infra/env/web/.env.example`
- `infra/env/data/.env.example`
- `infra/observability/log-fields.md`
- `infra/observability/metrics.md`
- `infra/observability/alerts.md`
- `infra/observability/alerts.yaml`
- `infra/flags/flags.json`
- `infra/flags/README.md`
- `infra/security/GUARDRAILS.md`
- `.agents/handoffs/infrastructure.md` (this file)

Conductor-owned paths were **not** modified. Orchestrator `.gitignore` edit may appear in `git status` — leave it.

---

## 3. Public interfaces and schemas

- Consumed (read-only): locked health/status endpoints and OpenAPI from conductor contracts.
- Produced: env var **names**, metric **names**, flag **keys**, Fly app naming — no HTTP schema changes.
- No edits to `contracts/**`.

---

## 4. Assumptions

- ADR-0005 will be accepted as Fly.io (or conductor will redirect to Render; templates would need a follow-up).
- Services will live at `apps/api`, `apps/web`, `services/routing`, `services/data`, `benchmarks` per ownership map.
- Backend will enforce rate limits / 16 KiB payload cap and emit `requestId` + proposed metrics.
- Data will emit DATA_CONTRACT observability metrics and honor freshness thresholds.
- Postgres is optional for anonymous search; **recommend deferring Postgres creation until the feedback feature ships**.
- Estimated cost **~$25–45/mo** (Machines + Upstash + small PG + IPv4); **~$55–85/mo** with Fly Managed Postgres Basic.

---

## 5. Validation commands

```bash
cd /Users/thebiglipper/Developer/bettermta-infrastructure
npm --prefix contracts install
npm --prefix contracts run validate
node -e 'JSON.parse(require("fs").readFileSync("infra/flags/flags.json","utf8")); console.log("flags ok")'
node -e 'const y=require("./contracts/node_modules/js-yaml"); for (const f of [".github/workflows/ci.yml",".github/workflows/deploy.yml","infra/observability/alerts.yaml"]) { y.load(require("fs").readFileSync(f,"utf8")); console.log(f,"ok"); }'
python3 -c 'import pathlib,tomllib; [tomllib.loads(p.read_text()) or print("TOML OK",p) for p in sorted(pathlib.Path("infra/fly").glob("*.toml"))]'
git status --short
```

---

## 6. Validation results

| Check | Result |
|---|---|
| `npm --prefix contracts run validate` | **PASS** (must remain unchanged by infra) |
| `flags.json` JSON parse | **PASS** |
| `js-yaml` parse CI + deploy + alerts YAML | **PASS** |
| `python3 tomllib` parse `infra/fly/*.toml` | **PASS** |
| Live deploy / rollback drill | **Not run** — services absent (**Pending** launch checklist) |

---

## 7. Fixture or sample-data instructions

Infra does not ship product fixtures. Use `contracts/fixtures/**` for API/UI. Deploy templates must not point production at synthetic mode.

---

## 8. Known defects

- CI service jobs use `npm run | grep` to detect scripts — brittle if npm changes help output; acceptable until packages exist.
- `npm audit` step warns rather than hard-fails so empty tree stays green.
- Fly `data.fly.toml` process command `node dist/poller.js` remains a **PLACEHOLDER guess** — labeled in-file; data workstream must confirm entrypoint.
- Web health check uses `/` until frontend adds a dedicated health route.

---

## 9. Known limitations

- **Post-first-deploy rollback drill (E.4): Pending** — no live services yet; tracked in `docs/RUNBOOKS.md` launch checklist.
- **Deploy workflow is PLACEHOLDER** — `workflow_dispatch` only, fails closed until `ACTIVATE` + services + `FLY_API_TOKEN`.
- Alerts are docs/YAML sketches without a bound Alertmanager/Grafana (`DeployFailure` is an event-driven stub).
- Preview environments not automated.
- Error-tracking vendor not selected (DSN placeholder only).
- **Postgres:** recommend deferring creation until the feedback feature ships (anonymous search does not need it).

---

## 10. Decisions requiring conductor approval

1. Accept Fly.io as ADR-0005 (vs Render runner-up).
2. Self-managed Postgres Machine vs Managed Postgres from day one (**prefer defer until feedback ships**).
3. Whether `/health/ready` should fail when `maintenance_mode=true` (proposed yes for traffic drain).
4. Hard-fail vs warn for `npm audit` at release gate.
5. Rate-limit numeric defaults (30/60/min) — backend may counter-propose.

---

## 11. Exact next integration step

1. Conductor merges/closes ADR-0005 from this proposal into `ARCHITECTURE_DECISIONS.md`.
2. After `apps/api` lands with `/health/live` + `/health/ready`: create Fly app, set secrets from examples, `fly deploy -c infra/fly/api.fly.toml`, **run post-first-deploy rollback drill once** (E.4).
3. Wire backend metrics/log fields to `infra/observability/*` and mount `infra/flags/flags.json`.
4. Integration workstream: activate `deploy.yml` + synthetic probes + alert routing before public beta go/no-go.
5. Defer Postgres until feedback feature is scheduled; keep Redis/cache rebuildable-only.
