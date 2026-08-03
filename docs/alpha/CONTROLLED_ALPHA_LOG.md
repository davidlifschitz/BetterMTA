# Controlled Alpha Log

**Purpose:** Structured evidence for **Controlled Alpha Review 1** — real-use findings during controlled-alpha operation and learning.  
**Status:** Active (solo operating window)  
**Certification:** `READY_FOR_CONTROLLED_ALPHA` (unchanged by ordinary product bugs)  
**Do not** put hostnames, Access credentials, tester emails, precise coordinates, or secrets in this file.

## How to use

1. Run searches through the protected Cloudflare URL (allowlisted operator first).
2. Append one row per noteworthy observation (successes that teach as well as failures).
3. Prefer PlaceRefs or non-sensitive station names over raw lat/lon.
4. Classify without changing the certification status for ordinary product bugs.
5. Link follow-ups to issue IDs or residual IDs (`FU-*`, `R*`) when known.

### Field definitions

| Field | Purpose |
|---|---|
| Date/time | When the observation occurred (local or UTC; be consistent) |
| Build/release | Which version was running (`deployments/current.env` release id / image tags; if unknown, note `certified-alpha` + date) |
| Search scenario | PlaceRefs or non-sensitive description |
| Selected lines | Constraint being tested |
| Outcome | Success, partial, failure, or confusing |
| Data mode | Live, stale, or schedule-only |
| Latency | Approximate response time |
| Classification | Product, routing, data, UI, or operations |
| Severity | Blocking, major, minor, or observation |
| Follow-up | Issue or action taken |

### Severity guide

| Severity | Meaning |
|---|---|
| Blocking | Cannot complete a normal search; Access/tunnel/origin down; data honesty broken |
| Major | Wrong line-satisfaction ranking, empty when partials exist, severe UX confusion |
| Minor | Awkward copy, mild latency, recoverable UI friction |
| Observation | Useful signal; no immediate defect claim |

### Classification guide

| Classification | Examples |
|---|---|
| Product | Constraint intent vs. ranked result feel; explanation clarity |
| Routing | Satisfaction accounting; OTP candidate diversity; ranking order |
| Data | Stale/degraded realtime; feed gaps; PlaceRef resolution |
| UI | Autocomplete, mobile usability, labeling honesty |
| Operations | Tunnel/Colima downtime; disk; restart recovery |

## Operating context (do not redeploy casually)

- Certified alpha left running after PR #3 merge (`90b6462`) and PR #4 residual tracking (`aee63e1`).
- Dependency remediation (`FU-NPM-01`) and packaging merges must **not** auto-rebuild/redeploy this stack.
- Next formal milestone is **Controlled Alpha Review 1** (not another deployment phase).

## Residual work (official on `main`)

| ID | Item | Status |
|---|---|---|
| FU-NPM-01 | Dependency / Next.js advisories | OPEN (separate maintenance branch) |
| FU-ALPHA-01 | Mac logout/reboot recovery drill | PENDING_USER |
| FU-ALPHA-02 | Optional GitHub scheduled-monitor secrets | OPEN |

## Findings log

| Date/time | Build/release | Search scenario | Selected lines | Outcome | Data mode | Latency | Classification | Severity | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-31T12:40-04:00 | rel-20260731T155125Z-cert-distinct | Operator commute framing: Midtown office (~277 Park) → Penn Station (NYC), then onward NJ home | Expected rider set: 7, **S** (42 St Shuttle), 1/2/3 | Confusing — picker has no badge labeled **S**; 42 St Shuttle appears as **GS**. Lines **1/2/3/7 are present**. NJ Transit / PATH not in catalog (subway-only MVP). | n/a (picker) | n/a | UI / Product | major | Label GS as rider-facing **S** (keep `lineId` GS for GTFS); optional alias search. NJ out of scope — document. Do not change certification. |
| 2026-07-31T12:42-04:00 | rel-20260731T155125Z-cert-distinct | ~277 Park (coordinate/address-like origin) → 34 St-Penn; selected **2, 7, GS** | 2, 7, GS | Failure/confusing — UI: “0 of 3 lines”, B/D/M only, ~19 min walk, omits all selected. Reproduced: place search `277 Park` → **0 hits**; coord≈Park/48th → OTP baseline only **D/M/B** (bestSatisfactionCount **0**). Same lines from **Grand Central-42 St → 34 St-Penn (128)** → **7+2** (2/3, omits GS). | live (itineraries schedule-labeled in UI) | ~22 min shown | Routing / Data | major | OTP natural-candidate diversity gap (open risk). Address/POI place search gap. Prefer station PlaceRefs (GCT). Don’t require GS+7+2 together for this OD — 7+2 is the practical pair. Product follow-up: constrained candidate generation / better origin resolution. |
| 2026-07-31T12:46-04:00 | rel-20260731T155125Z-cert-distinct | Product direction from operator: any address → any address; user states preferred lines; app fills gaps (walks/transfers/unselected connectors) | preferred lines (not full line enumeration) | Product gap vs current alpha — today: ADR-0013 deferred address/POI geocode (station-index-first); OTP natural candidates + hard selected-line maximization can yield **0-of-N** when preferred lines aren’t in the OTP top set. PRD already lists address origins/destinations; implementation is narrower. | n/a | n/a | Product | blocking (for intended UX) | **P1 ACCEPTED.** Wave 0A docs: ADR-0022 (places), ADR-0023 (preferred lines / candidate coverage). Runtime/certification unchanged until later waves behind flags. |

## P1 acceptance notes (docs / semantics only)

**Certification:** `READY_FOR_CONTROLLED_ALPHA` — **unchanged**. These notes do not authorize redeploy or claim a new go/no-go.

| Topic | Accepted semantics | Alpha implication until implementation waves |
|---|---|---|
| Places | Station index authoritative; address/POI via geocoder abstraction; attribution; no default precise-coord retention; honest failure; feature-flagged (ADR-0022) | Live alpha remains station-index + geolocation; `277 Park`-style queries still miss until flag-on geocode ships |
| Preferences | Selected lines = preferred lines; maximize coverage; unselected connectors allowed; complete > partial > tie-breakers (ADR-0023) | Rider-facing “required” copy and hard-require framing are obsolete in docs; runtime ranking/copy still reflect pre-P1 behavior until FE/routing waves |
| Candidate coverage | BetterMTA owns coverage; OTP substrate; exhausted budget → `insufficient_candidate_coverage`; explain omissions (ADR-0023) | 0-of-N from OTP top-N remains an open product/routing risk (**R26**); not fixed by docs alone |
| S / GS | Rider-facing **S**; internal `lineId` `GS` | Presentation debt (**R27**); no lineId rename in Wave 0A |
| Out of scope | D1–D6 deferred backlog unchanged | Do not reopen bus/NJ/maps/accounts/etc. under P1 |

Proposal authority: `docs/proposals/address-preferred-lines-fill-gaps.md` (disposition ACCEPTED — P1).

| 2026-08-03T14:37-04:00 | rel-20260803T183449Z-78c2ca507c3f | GCT (`st:723`) → 34 St–Penn (`st:128`) | 7, 2, GS (rider-facing S) | Success — best constrained route uses 2 of 3 preferred lines, explains the omitted shuttle, and repeats with stable fingerprint order | live | Live corpus completed in under 4 seconds for 48 cases | Routing / Operations | observation | P1 Wave 4 certified `READY_FOR_P1_CONTROLLED_ALPHA`; address/POI remains flag-off; rollback to pre-P1 release drilled and candidate restored |

## Review checkpoint — Controlled Alpha Review 1

Evaluate before expanding beyond the initial solo / 2–3 tester cohort:

- [x] Real-use findings reviewed (this log) — product direction accepted as P1; ops residuals unchanged
- [ ] Operational uptime / tunnel interruptions noted
- [ ] Route quality and OTP candidate-diversity cases catalogued
- [ ] Tester feedback (if any) summarized
- [ ] Open risks (`R19`–`R27`, `FU-*`) reassessed
- [ ] Decision recorded: routing-quality work / broader alpha / cloud migration / private-beta prep

**Decision (product semantics):** P1 accepted — address/POI + preferred-line fill-gaps + BetterMTA candidate coverage (ADR-0022/0023). Implementation via `agent/p1-address-preferred-lines` waves; certification unchanged.  
**Decision (ops / cohort expansion):** _pending Review 1_
