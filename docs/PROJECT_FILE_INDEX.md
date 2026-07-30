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
- `ARCHITECTURE_DECISIONS.md` — locked ADRs (incl. ADR-0021 controlled alpha)
- `INTEGRATION_SEQUENCE.md`
- `ACCEPTANCE_CRITERIA.md`
- `RISK_REGISTER.md`
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
- `RELEASE_GATE_REPORT.md` — G01–G20 + CA gates; status vocabulary; final status still `BLOCKED` (not `READY_FOR_CONTROLLED_ALPHA`)
- `../infra/alpha/README.md` — controlled-alpha index (edge, host, tunnel, Access, scripts)
- `../infra/alpha/HOST.md` — Phase 12A.5 macOS operating requirements + preflight
- `../infra/alpha/TUNNEL.md` — Phase 12A.6 named Cloudflare Tunnel (interactive; secrets out of repo)
- `../infra/alpha/ACCESS.md` — Phase 12A.7 Access allowlist + OTP + service token procedures
- `../infra/alpha/cloudflared/config.template.yml` — tunnel ingress template (placeholders only)
- `../.agents/handoffs/integration-live.md` — integration-live + Phase 12A handoff

## Agent prompts
The `.agents/` directory contains shared context, conductor, routing, data, backend, frontend, infrastructure, benchmark, integration, single-agent, handoff, and review prompts. Workstream handoffs live under `../.agents/handoffs/`.

## Binary backups
The previously generated DOCX and PDF product packages are intentionally not committed through the GitHub text-file connector. Their source content is represented in the Markdown files above.
