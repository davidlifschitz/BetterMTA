# Stage C ops and quality hardening handoff

## 1. What was implemented

- Closed Wave 3 routing residuals: topology-aware preferred subsets and via hubs, exact live GTFS inverse mapping, honest hard-budget semantics, and empty exhausted-search classification.
- Closed frontend residuals: combobox options are removed from the page Tab order and coverage-failure copy uses rider language.
- Added explicit address/POI Docker/Compose/Fly build defaults, all flag-off.
- Added an authenticated, privacy-bounded Prometheus exporter plus geocoder failure alert/runbook.
- Upgraded GitHub-owned checkout/setup actions to Node-24-based v7 releases.
- Refreshed the live benchmark corpus: public station PlaceRefs, one new hard Bronx case, two-case Stage C live subset, and preserved soft routing gaps.
- FU-NPM-01 remains isolated in draft PR #7 with all six npm audits and CI green; it is not merged or deployed by this branch.

## 2. Files changed

- Routing: `services/routing/src/orchestration/**`, `services/routing/src/otp-provider/provider.ts`, `services/routing/src/search.ts`, and their tests.
- API: live adapters/binding, config/app registration, `src/metrics/prometheus.ts`, `src/routes/internal/metrics.ts`, and tests.
- Web: `PlaceSuggest`, error UI copy/tests, `apps/web/Dockerfile`.
- Ops: GitHub workflows, Compose/Fly/env templates, observability rules/docs, `docs/PLACE_PROVIDER.md`, `docs/RUNBOOKS.md`.
- QA/docs: six live benchmark cases, `benchmarks/live-stage-c-subset.json`, routing spec, Wave 3 gate, backlog/risk/roadmap handoffs.

## 3. Public interfaces and schemas

- No public `/v1` contract or schema version changed.
- New internal route: `GET /internal/metrics`, registered only when `BETTERMTA_METRICS_TOKEN` is set and protected by bearer authentication.
- Local API routing binding adds optional `lineIdToGtfsRouteIds(lineId)`; the production routing package already supported it.
- New secret name only: `BETTERMTA_METRICS_TOKEN`; no value is committed.

## 4. Assumptions

- Current controlled alpha remains one API replica with address/POI disabled.
- The active data catalog is authoritative for both directions of GTFS route mapping.
- `budgetExhausted` means a configured query/candidate ceiling stopped generation; merely completing the planned families is not a budget hit.
- Soft live benchmark failures are learning evidence, not permission to weaken feasibility expectations.

## 5. Validation commands

```bash
npm --prefix services/routing test
npm --prefix services/routing run typecheck
npm --prefix services/routing run build
npm --prefix apps/api test
npm --prefix apps/api run typecheck
npm --prefix apps/web test
NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL= NEXT_PUBLIC_FLAG_FEEDBACK=false NEXT_PUBLIC_FLAG_ADDRESS_POI=false npm --prefix apps/web run build
npm --prefix apps/web run verify:no-fixtures
npm --prefix benchmarks/runner run validate-cases
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 npm --prefix benchmarks/runner run gate -- --subset ../live-stage-c-subset.json
docker-compose -f docker-compose.yml -f docker-compose.alpha.yml config --format json
git diff --check
```

## 6. Validation results

- Routing: 84 passed + 1 intentional skip; typecheck/build passed.
- API: 112 passed + 1 intentional skip; typecheck passed.
- Web: 81 passed; clean live build passed; fixture scan CLEAN.
- Data: 65 passed + 2 intentional skips; build passed. Contracts validation and API build passed.
- Fixture benchmark self-test/full gate passed; infra YAML/JSON/TOML and Compose parsing passed.
- Benchmarks: 48 cases schema-valid; hard live subset 2/2 passed, 0 soft, `rankingPasses=4`.
- Full live observation: no hard failures; five soft failures (three GCT/Penn satisfaction gaps, Queens OTP timeout, Far Rockaway/Yankee 1-of-3).
- Draft PR #8 run `30846000773`: all eight jobs passed (`contracts-validate`, `apps-api`, `apps-web`, `services-routing`, `services-data`, `benchmarks`, `dependency-audit`, `infra-config-validate`). This executes and validates the Node-24-based GitHub-owned action releases.

## 7. Fixture or sample-data instructions

- Fixture/release gates continue to use `benchmarks/release-subset.json` and `benchmarks/p1-ready-subset.json`.
- Use `benchmarks/live-stage-c-subset.json` only with `BETTERMTA_SUT=live` and a live BetterMTA API base.
- Soft live watch cases intentionally remain outside merge-blocking subsets.
- Metrics endpoint tests use an injected test token and fake/aggregate metrics only.

## 8. Known defects

- Certified alpha still misses practical preferred-line combinations in five soft live watch cases; Stage C code has not been deployed or recertified.
- Queens E+F observation timed out once at the API hard timeout.

## 9. Known limitations

- `pl_geo_*` resolution and metrics remain process-local.
- No Prometheus/Grafana/Fly scrape backend, rule manager, or pager is active.
- Address/POI remains flag-off; current live release and rollback pointers are untouched.
- FU-ALPHA-01 requires explicit logout/reboot approval. FU-ALPHA-02 requires operator-owned monitor secrets.

## 10. Decisions requiring conductor approval

- Merge Stage C into the P1 program branch and later into `main`.
- Merge FU-NPM-01 draft PR #7 and separately decide whether/when to redeploy.
- Enable address/POI, expand the tester cohort, provision Fly, load alert rules, or configure external notification channels.
- Choose the Stage D shared/multi-instance geocode PlaceRef resolution design.

## 11. Exact next integration step

Draft PR #8 (`codex/stage-c-wave3` → `agent/p1-address-preferred-lines`) is green and intentionally unmerged. The exact next step is owner review/merge into the P1 branch when wanted; do not merge to `main` or deploy as part of that review. In parallel, begin read-only Stage D infrastructure preparation and request an owner decision before activation, cohort expansion, address flag-on, or external secret configuration.
