# BetterMTA Project File Index

## Start here
- `CONDUCTOR_PACKAGE.md` — locked contracts index for parallel workstreams (after merge).
- `PROJECT_CONTEXT.md` — persistent product context and confirmed decisions.
- `PRD.md` — current product requirements.
- `WORKSTREAM_OWNERSHIP.md` — who owns which files.
- `PARALLEL_WORKSTREAMS.md` — recommended parallel workstreams and deliverables.
- `../AGENTS.md` — root rules for coding agents.
- `../.agents/README.md` — specialist prompt index.

## Conductor-locked contracts
- `SYSTEM_ARCHITECTURE.md`
- `DOMAIN_MODEL.md`
- `API_CONTRACT.md`
- `DATA_CONTRACT.md`
- `ARCHITECTURE_DECISIONS.md` — locked ADRs (incl. ADR-0021 controlled alpha; ADR-0022 places; ADR-0023 preferred lines)
- `INTEGRATION_SEQUENCE.md`
- `ACCEPTANCE_CRITERIA.md`
- `RISK_REGISTER.md`
- `DEFERRED_BACKLOG.md` — post-P1 deferred epics D1–D6 (do not implement in P1)
- `WORKSTREAM_OWNERSHIP.md`
- `CONDUCTOR_PACKAGE.md`
- `../contracts/**` — OpenAPI, JSON Schema, TypeScript types, fixtures

## Product documents
- `VISION.md`
- `PRODUCT_PRINCIPLES.md`
- `PRD.md`
- `UX_SPEC.md`
- `ROADMAP.md`

## Engineering and readiness
- `TECHNICAL_DESIGN.md` — directional design; API paths superseded by `API_CONTRACT.md`
- `PRODUCTION_CHECKLIST.md`
- `RUNBOOKS.md` — local compose bring-up, controlled-alpha pointer (`infra/alpha/`), drills, cost, go/no-go
- `RELEASE_GATE_REPORT.md` — G01–G20 + CA gates; status vocabulary; Phase 12A outcome `READY_FOR_CONTROLLED_ALPHA`
- `alpha/REMOTE_VALIDATION.md` — Phase 12A.10 remote validation evidence
- `alpha/CONTROLLED_ALPHA_LOG.md` — solo/tester operating findings for Controlled Alpha Review 1
- `alpha/P1_WAVE4_CERTIFICATION.md` — immutable P1 deploy, preference regression, protected smoke, and rollback evidence
- `alpha/CONTROLLED_ALPHA_REVIEW_1.md` — first P1 learning review, R19–R27 reassessment, and Stage C decision
- `alpha/RELIABILITY_DRILLS.md` — restart drills + residuals (`FU-ALPHA-01`, etc.)
- `alpha/PERFORMANCE.md` — authenticated remote latency sample
- `../infra/alpha/README.md` — controlled-alpha index (edge, host, tunnel, Access, scripts)
- `../infra/alpha/HOST.md` — Phase 12A.5 macOS operating requirements + preflight
- `../infra/alpha/TUNNEL.md` — Phase 12A.6 named Cloudflare Tunnel (interactive; secrets out of repo)
- `../infra/alpha/ACCESS.md` — Phase 12A.7 Access allowlist + OTP + service token procedures
- `../deployments/README.md` — Phase 12A.8 immutable release IDs + deploy/rollback
- `../docker-compose.release.yml` — release image-tag overrides for alpha compose
- `../infra/alpha/cloudflared/config.template.yml` — tunnel ingress template (placeholders only)
- `../docs/proposals/address-preferred-lines-fill-gaps.md` — ACCEPTED P1: address/POI + preferred lines fill gaps (ADR-0022/0023)
- `../.agents/handoffs/integration-live.md` — integration-live + Phase 12A handoff
- `../.agents/handoffs/fu-npm-01.md` — Stage C dependency-advisory maintenance candidate and validation evidence

## Agent prompts
The `.agents/` directory contains shared context, conductor, routing, data, backend, frontend, infrastructure, benchmark, integration, single-agent, handoff, and review prompts. Workstream handoffs live under `../.agents/handoffs/`.

## Binary backups
The previously generated DOCX and PDF product packages are intentionally not committed through the GitHub text-file connector. Their source content is represented in the Markdown files above.
