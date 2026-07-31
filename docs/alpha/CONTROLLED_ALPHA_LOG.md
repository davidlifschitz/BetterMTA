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
| _solo window start — append rows below_ | | | | | | | | | |

<!-- Example row (delete when real findings exist):
| 2026-07-31T13:00-04:00 | certified-alpha | Carroll St → Bryant Park | F | Success / complete match | stale | ~2.1s | Observation | observation | — |
-->

## Review checkpoint — Controlled Alpha Review 1

Evaluate before expanding beyond the initial solo / 2–3 tester cohort:

- [ ] Real-use findings reviewed (this log)
- [ ] Operational uptime / tunnel interruptions noted
- [ ] Route quality and OTP candidate-diversity cases catalogued
- [ ] Tester feedback (if any) summarized
- [ ] Open risks (`R19`–`R24`, `FU-*`) reassessed
- [ ] Decision recorded: routing-quality work / broader alpha / cloud migration / private-beta prep

**Decision (fill at review):** _pending_
