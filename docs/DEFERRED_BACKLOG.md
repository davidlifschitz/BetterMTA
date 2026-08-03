# Deferred Work Inventory (post–P1 acceptance)

**Owner:** Conductor  
**Date:** 2026-07-31  
**Authority:** P1 accepted from `docs/proposals/address-preferred-lines-fill-gaps.md`.  
**Rule:** Record here; do **not** assign implementation agents during the P1 program unless separately authorized.

## Active program (authorized)

| Program | Scope | Branch |
|---|---|---|
| P1 | Address/POI, preferred-line maximization, candidate coverage, rider-facing S/GS | `agent/p1-address-preferred-lines` |

## Operational follow-ups (not P1 product)

| ID | Item | Status | Notes |
|---|---|---|---|
| FU-NPM-01 | Next.js / npm advisories | CANDIDATE | Draft PR #7 audits clean and all 8 CI jobs pass; pending owner review/merge; no automatic alpha redeploy |
| FU-GHA-01 | GitHub Actions Node runtime warning | OPEN | `checkout@v4` / `setup-node@v4` are forced from deprecated Node 20 to Node 24; verify and upgrade action majors separately |
| FU-ALPHA-01 | Mac logout/reboot drill | PENDING_USER | Explicit user approval |
| FU-ALPHA-02 | GH scheduled monitor secrets | OPEN | Optional before broader testers |

## Epic D1 — Additional transit modes

| Field | Value |
|---|---|
| Items | Bus, LIRR, Metro-North, ferry, NJ Transit, PATH |
| Governing authority | PRD §6 non-goals |
| Dependencies | Data feeds, routing graph modes, QA corpus, product decision per mode |
| Blast radius | High (data + routing + UI + contracts) |
| Acceptance evidence | Per-mode ADRs, fixtures, benchmarks |
| Decision to reopen | Explicit product ADR per mode |
| Sequence | **After** P1 proven in controlled alpha |

## Epic D2 — UX expansion

| Field | Value |
|---|---|
| Items | Interactive maps, crowding, accounts/profiles, arrive-by |
| Governing authority | ADR-0014, ADR-0015 |
| Dependencies | Arrive-by needs reverse search strategy; maps need tiles/vendor; accounts need auth/storage |
| Blast radius | Medium–high |
| Acceptance evidence | UX + a11y + privacy reviews |
| Decision to reopen | Amend/supersede ADR-0014/0015 |
| Sequence | After P1; arrive-by after routing stability |

## Epic D3 — Feedback and learning

| Field | Value |
|---|---|
| Items | Anonymous feedback transport, privacy review, Postgres when justified, preference memory/consent |
| Governing authority | ADR-0016, ADR-0017 |
| Dependencies | Privacy threat model; storage |
| Blast radius | Medium |
| Acceptance evidence | Privacy review + flag-gated ship |
| Decision to reopen | Privacy-reviewed transport ADR |
| Sequence | After P1 place/privacy path is settled |

## Epic D4 — Data and accessibility depth

| Field | Value |
|---|---|
| Items | Elevator-aware routing; SI/ferry Must-set; alert extensions |
| Governing authority | ADR-0020, DOMAIN_MODEL, DATA_SPEC |
| Dependencies | Authoritative feeds |
| Blast radius | Medium |
| Acceptance evidence | Corpus gates |
| Decision to reopen | Explicit QA/data ADR |
| Sequence | Parallelizable later; not blocking P1 |

## Epic D5 — Hosted platform

| Field | Value |
|---|---|
| Items | Fly (or other) private beta; leave self-hosted origin |
| Governing authority | ADR-0012, ADR-0021 |
| Dependencies | Availability/observability gates; cost |
| Blast radius | High (ops) |
| Acceptance evidence | Fly rollback drill, SLOs |
| Decision to reopen | Hosted go/no-go separate from P1 |
| Sequence | After controlled-alpha learning / Review 1+ |

## Epic D6 — Claims

| Field | Value |
|---|---|
| Items | Competitor quality / “beats Google” claims |
| Governing authority | Product rules / AGENTS.md |
| Dependencies | Benchmark evidence |
| Blast radius | Reputation |
| Acceptance evidence | Published benchmark methodology + results |
| Decision to reopen | Never without evidence |
| Sequence | N/A — permanently gated on evidence |
