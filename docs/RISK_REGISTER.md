# Risk Register

**Owner:** Conductor  
**Status:** Initial register for public-beta experiment  
**Last updated:** 2026-07-31 (Phase 12A final certification → `READY_FOR_CONTROLLED_ALPHA`)

Severity: `critical` \| `high` \| `medium` \| `low`  
Likelihood: `high` \| `medium` \| `low`

| ID | Risk | Severity | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Parallel agents fork shared types/API | high | high | Conductor-owned `contracts/**`; ownership map; review gate before parallel start | Conductor |
| R2 | Custom router delays MVP | high | medium | ADR-0002 prefer OTP/mature engine; ranking layer separable | Routing |
| R3 | Stale realtime shown as live | critical | medium | `dataMode` required; UI labeling tests; stale alerts | Data + FE + QA |
| R4 | Selected-line accounting bugs | critical | medium | Property tests; satisfaction schema; benchmark invariants | Routing + QA |
| R5 | Place/geocode vendor gaps for NYC stations | high | medium | Station-first search; fixture places; explicit unknown_place | Backend |
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

## Top watchlist for first integration

1. R3 data honesty  
2. R4 constraint accounting  
3. R2 engine decision latency  
4. R13 merge conflicts on shared files  

## Controlled-alpha watchlist (Phase 12A)

1. R20 host sleep / user logout (LaunchAgent RunAtLoad)  
2. R19 home power/internet  
3. R21 Docker/Colima resource pressure  
4. R23 over-claiming (do not equate controlled alpha with Fly private/public beta)  
5. R22 Access allowlist drift / token rotation hygiene
## Risk update protocol

Workstreams must update this register in handoffs when a new production risk is discovered. Do not delete closed risks; mark `Mitigation status: closed` in the handoff notes and leave a row footnote in a future conductor revision.
