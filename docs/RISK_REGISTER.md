# Risk Register

**Owner:** Conductor  
**Status:** Initial register for public-beta experiment  
**Last updated:** 2026-08-04 (Stage F candidates; current live release unchanged)

Severity: `critical` \| `high` \| `medium` \| `low`  
Likelihood: `high` \| `medium` \| `low`

| ID | Risk | Severity | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Parallel agents fork shared types/API | high | high | Conductor-owned `contracts/**`; ownership map; review gate before parallel start | Conductor |
| R2 | Custom router delays MVP | high | medium | ADR-0002 prefer OTP/mature engine; ranking layer separable | Routing |
| R3 | Stale realtime shown as live | critical | medium | `dataMode` required; UI labeling tests; stale alerts | Data + FE + QA |
| R4 | Preferred-line satisfaction accounting bugs | critical | medium | Property tests; satisfaction schema; benchmark invariants; ADR-0023 ranking order | Routing + QA |
| R5 | Place/geocode vendor gaps for NYC stations or addresses | high | medium | Station index authoritative (ADR-0022); geocoder abstraction; honest empty/`unknown_place`; feature flag | Backend |
| R6 | p95 > 2s under load | high | medium | Candidate budgets; caching keyed by snapshot; probes | Routing + API + Infra |
| R7 | GTFS route_id instability / shuttles break line mapping | high | medium | Versioned lineId mapping; quarantine unknowns | Data |
| R8 | Over-scope (accounts, multi-modal, AI) | high | medium | MVP scope lock ADR-0001 | Conductor |
| R9 | Accessibility failures in line picker | high | medium | a11y acceptance criteria; FE tests | Frontend + QA |
| R10 | Privacy leak via logs (precise coords) | high | medium | Log redaction policy; no default persistence | Backend + Infra |
| R11 | Benchmark becomes a false superiority claim | medium | medium | Corpus naming rules; no scraping ToS violations; evidence-only claims | QA |
| R12 | Feed licensing / attribution miss | high | low | DATA_SPEC attribution section; UI footer | Data + FE |
| R13 | Integration merge hell after parallel work | high | medium | Ownership paths; contract-first; integration sequence | Conductor + Integration |
| R14 | Arrive-by semantics ambiguous | medium | medium | Marked unresolved; routing ADR addendum required | Routing |
| R15 | Hosting cost overruns from OTP + realtime polling | medium | medium | Infra cost guardrails; snapshot polling bounds | Infra |
| R16 | Feature flags missing → unsafe ranking rollout | medium | medium | Flags for realtime/constraints/explanation variants | Infra + API |
| R17 | Empty results when partials exist | high | medium | PRD invariant + API fixtures for partial match | Routing + API + FE |
| R18 | Experiment analysis without enough volume | low | high | Keep instrumentation minimal; do not block launch | Backend + FE |
| R19 | Home power or ISP outage takes down controlled alpha | high | medium | ADR-0021 honesty; no SLA; pause invites during outages; later hosted beta separate | Infra + Integration |
| R20 | macOS sleep / lid-close / idle suspend stops origin | high | high | Keep host awake during alpha windows; document in runbook; do not claim always-on | Infra + Integration |
| R21 | Docker Desktop quit / crash / resource exhaustion | high | medium | Disk/CPU watch; compose health checks; restart runbook. Distinct-digest rollback proven 2026-07-31; keep ≥6 Gi free for rebuilds | Infra + Data |
| R22 | Cloudflare Tunnel or Access misconfiguration exposes origin or locks out testers | critical | low | Deny-by-default Access verified; approved/denied auth PASS; remote monitor PASS; secrets out of repo; LaunchAgent canonical runner | Infra |
| R23 | Self-hosted origin treated as cloud-grade / public-beta ready | high | medium | Status vocabulary: `READY_FOR_CONTROLLED_ALPHA` ≠ private/public beta; ADR-0021 honesty in handoff + gate report | Conductor + Integration |
| R24 | High/critical npm advisories on pinned deps (incl. Next.js `15.3.5` in `apps/web`; also `services/data`) while CI `dependency-audit` remains warning-only | high | medium | FU-NPM-01 draft PR #7 upgrades/remediates all six npm trees with CI PASS; risk remains open until owner merge and a separately approved deploy | Frontend + Infra + Integration |
| R25 | Geocode vendor privacy, cost, or attribution miss after ADR-0022 reopen | high | medium | Provider abstraction; no default precise-coord retention; attribution; authenticated bounded metrics; geocoder alert/runbook before flag-on; secrets out of repo | Backend + FE + Infra |
| R26 | Preferred-line candidate coverage gap (OTP top-N misses preferences → silent 0-of-N) | critical | high | Stage C adds topology-aware subsets/vias, exact live GTFS inverse binding, and honest exhaustion semantics; hard live subset passes, five soft live watch failures remain before deployment/recertification | Routing + API + QA |
| R27 | Rider confusion: “required” copy vs fill-gaps connectors / GS vs S labeling | medium | medium | FE copy + S/GS presentation (ADR-0023 note); partial-match banners; no runtime lineId rename | Frontend + Product |
| R28 | Process-local rate limits/metrics are treated as multi-replica durable, or geocode PlaceRef key lifecycle is mismanaged | high | medium | Stateless encrypted PlaceRefs now pass cross-replica/tamper/expiry/wrong-key tests; keep address flag off and API single-replica until the key is provisioned consistently, a shared rate limiter and aggregated observability are bound, and rotation/deploy evidence is recorded | Backend + Infra |
| R29 | Partial, stale, synthetic, or cross-commit evidence is mistaken for public-beta readiness | high | medium | Exact ten-gate allowlist; fail-closed `NOT_READY`; expected-commit and SHA-256 binding; bounded artifacts; structure-only checks include the limitations/header test surfaces but cannot assert readiness; owner reviews live evidence together | QA + Infra + Integration |
| R30 | Nonce-based CSP makes the Next.js shell request-rendered, increasing web capacity, latency, or cost versus a static shell | high | medium | Keep the policy small and app-owned; verify preview behavior, approved route-search/web load, p95, cache/CDN behavior, and capacity before public release; retain rollback evidence | Frontend + Infra + QA |

## Top watchlist for first integration

1. R3 data honesty  
2. R4 preferred-line satisfaction accounting  
3. R26 candidate coverage / silent 0-of-N  
4. R13 merge conflicts on shared files  

## Controlled-alpha watchlist (Phase 12A)

1. R20 host sleep / user logout (LaunchAgent RunAtLoad)  
2. R19 home power/internet  
3. R21 Docker/Colima resource pressure  
4. R23 over-claiming (do not equate controlled alpha with Fly private/public beta)  
5. R22 Access allowlist drift / token rotation hygiene  
6. R24 npm / Next.js advisory remediation (separate from alpha certification)  
7. R26 preferred-line candidate coverage (P1 routing waves; docs-only until implemented)  
8. R25 geocode privacy/attribution when address/POI flag enables

## Public-beta watchlist (Stage F)

1. R29 readiness evidence provenance and freshness
2. R6 route-search p95 under the approved workload
3. R9 core-flow accessibility, including human review
4. R24 dependency advisories before a public release
5. R11 claims discipline and reproducible benchmark evidence
6. R28 multi-replica operational correctness before scaling
7. R30 request-rendered web capacity and latency before public release

## Follow-ups (tracked, not blocking controlled alpha)

| ID | Item | Status | Notes |
|---|---|---|---|
| FU-NPM-01 | Remediate high/critical npm advisories (R24), including pinned Next.js `15.3.5` | **DRAFT_PR_READY** | Draft PR #7 targets `agent/p1-address-preferred-lines`; all local audits/gates and CI run `30843696023` pass. Do not couple owner merge to an alpha redeploy. |
| FU-GHA-01 | Upgrade GitHub-owned actions from deprecated Node 20 runtime | **DRAFT_PR_READY** | Stage C draft PR #8 uses `actions/checkout@v7` and `actions/setup-node@v7`; all eight jobs passed in run `30846000773`; close after owner merge. |
| FU-ALPHA-01 | Mac logout/reboot LaunchAgent recovery drill | **PENDING_USER** | Non-blocking residual under current certification; success = Colima + stack + LaunchAgent tunnel + Access + remote monitor without undocumented repair |
| FU-ALPHA-02 | Configure GitHub scheduled monitor secrets | **OPEN** | Optional for personal alpha window; helpful before adding other testers |
| FU-PUBLIC-BETA-01 | Capture and owner-review all ten Stage F evidence gates | **OPEN** | Harness/template exist, but hosted operation, load, preview, rollback, human a11y, incident rota, public TLS/headers, approvals, and publication evidence remain pending. |

Operating findings for Controlled Alpha Review 1: `docs/alpha/CONTROLLED_ALPHA_LOG.md`.

## Risk update protocol

Workstreams must update this register in handoffs when a new production risk is discovered. Do not delete closed risks; mark `Mitigation status: closed` in the handoff notes and leave a row footnote in a future conductor revision.
