# Proposal: Address-to-address search + preferred lines that fill gaps

> **Disposition (2026-07-31):** **ACCEPTED — P1** by conductor/product owner. Authorizes ADR-0013 amendment, preferred-line semantics, and BetterMTA-owned candidate coverage. All other deferred epics (D1–D6) remain out of scope until separately authorized. Implementation proceeds only via the bounded multi-agent program (`agent/p1-address-preferred-lines`); Wave 0 contract lock must land before application code.  
> **Triggered by:** controlled-alpha solo findings (277 Park → Penn; 0-of-3 with preferred 2/7/GS). See `docs/alpha/CONTROLLED_ALPHA_LOG.md`.

**From:** Operator / Integration (controlled-alpha learning)  
**Date:** 2026-07-31  
**Status:** Accepted — **P1**  
**Impacts:** Product, Backend (places), Routing (candidate orchestration), Frontend (copy + place entry), Data (geocode adapter), Infra (vendor secrets / cost), Privacy

---

## Problem

The intended product experience is:

1. Enter **any origin address/place** and **any destination address/place**.
2. Optionally state **preferred subway lines**.
3. BetterMTA **fills the gaps** — walks, transfers, station access, and any unselected connecting services needed to make a practical trip.
4. Rank routes that honor preferences when feasible; otherwise maximize preference coverage and explain omissions.

What the certified alpha does today:

| Layer | Current behavior | Pain |
|---|---|---|
| Places | ADR-0013: station-index-first + browser geolocation; **address/POI deferred** | `277 Park` → 0 hits; pin/coord falls into weak OTP paths |
| Candidates | OTP natural itineraries (~few) + BetterMTA ranking outside OTP | Preferred lines often absent from the OTP top set → **0 of N** |
| Constraints | Selected lines are **hard required when feasible** (`PROJECT_CONTEXT`, PRD §5) | Riders must enumerate transfer pieces (e.g. GS/S) or over-constrain short trips |
| Scope | NYC subway only | NJ Transit / PATH / rail correctly out of MVP — but address entry still needed for NYC O/D |

PRD §5 already lists address origins/destinations. ADR-0013 and the live stack are narrower than the PRD.

Evidence (live reproduce, 2026-07-31):

- Coord≈Park Ave / 48 St → Penn + selected `2,7,GS` → bestSatisfaction **0** (B/D/M only).
- Grand Central → Penn + same lines → **7+2** (2/3; omits GS).

---

## Proposed product semantics

### A. Origins and destinations

- Accept **station**, **current location**, **street address**, and **POI/place name** as first-class inputs.
- Resolve to coordinates + display label; routing may snap to nearby stations internally.
- Keep contract `PlaceRef` shapes (`placeId` | `stationId` | `coordinate`); add geocode results as stable `placeId`s without breaking station IDs.
- Honest empty state when geocode fails; never silently substitute an unrelated station.

### B. Preferred lines (amend “required” wording)

Replace rider-facing “required lines” with **preferred lines**:

1. Prefer routes that use **as many selected lines as feasible**.
2. **Do not** require the rider to name every connector; the system may insert walks, transfers, and **unselected** lines to complete a trip.
3. When a complete preference match is infeasible, show maximal partial matches (unchanged invariant) and explain omissions.
4. Never rank a 0-of-N baseline above a feasible partial that uses some preferred lines when such candidates exist — **candidate generation must produce those partials**, not only OTP’s unconstrained top-N.

Hard-constraint language in `PROJECT_CONTEXT` / PRD should be updated to: *preferences are maximized; connectors may be filled by the system; impossibility is explained.*

### C. Fill-the-gaps candidate orchestration (routing)

OTP remains the substrate (ADR-0011). Soft OTP preferences alone stay insufficient. BetterMTA must add orchestration such that preferred lines appear in the candidate pool when topologically sensible, for example (implementation choice later):

- Multi-query OTP (unconstrained + prefer/avoid biases + via-station hints near preferred lines).
- Seeded transfers / via points derived from selected line geometries.
- Explicit coverage failure (`insufficient_candidate_coverage`) when budget is exhausted — not a silent 0-of-N that looks like “the subway ignores you.”

Ranking / satisfaction accounting outside OTP stays as today once candidates exist.

### D. UX copy

- Line picker: rider-facing **S** for 42 St Shuttle (keep internal `lineId` `GS`).
- Results: “Using your preferred lines” / “Couldn’t use all preferences; best feasible” — not “required” when connectors were auto-filled.
- Partial banner already exists; keep honesty about omitted preferences.

---

## Proposed decision options (conductor pick)

| Option | Address/POI | Preferred-line semantics | Candidate orchestration | Notes |
|---|---|---|---|---|
| **P0 — Docs only** | Stay deferred (ADR-0013) | No change | No change | Reject operator direction for alpha; document station-only workaround |
| **P1 — Alpha reopen (recommended)** | Amend ADR-0013: add address/POI provider for controlled alpha + public beta | Amend product text to preferred + fill gaps | Required follow-on routing epic | Matches PRD search bullets; privacy review for geocode vendor |
| **P2 — Routing-first** | Station-only until later | Preferred + fill gaps | Build orchestration first | Fixes 0-of-N for station O/D; still fails 277 Park |
| **P3 — Full reopen** | P1 + maps still deferred | P1 | P1 + via-line tooling | Largest scope; still no NJ/bus/rail |

**Recommendation:** **P1** — reopen address/POI for beta; redefine preferences; schedule candidate-orchestration as the next engineering milestone after Controlled Alpha Review 1 (before expanding tester cohort heavily).

---

## ADR / doc amendments if P1 accepted

1. **ADR-0013 supersession or amendment** — station index remains primary for subway stations; add approved geocode provider for address/POI; attribution + no default precise-coord retention (privacy).
2. **`PROJECT_CONTEXT.md` / `PRD.md`** — “required selections” → preferred maximization + system-filled connectors.
3. **`PRODUCT_PRINCIPLES.md`** — keep “Required means required” only for *feasible preference maximization*, or rephrase to avoid contradicting fill-the-gaps.
4. **New routing ADR or amendment to ADR-0011 consequences** — BetterMTA owns preferred-line candidate coverage; OTP alone is not enough.
5. **Contracts** — prefer additive optional place fields (`provider`, `attribution`, `formattedAddress`); avoid renaming `placeId`.

---

## Explicitly still deferred (unchanged by this proposal)

These remain out of scope unless a separate decision reopens them:

| Item | Authority | Status |
|---|---|---|
| Bus, LIRR, Metro-North, ferry, **NJ Transit**, PATH optimization | PRD §6 non-goals | Deferred / out of MVP |
| Turn-by-turn underground positioning | PRD §6 | Deferred |
| Fare optimization | PRD §6 | Deferred |
| Full Google Maps place-discovery parity | PRD §6 | Deferred |
| Arrive-by search | ADR-0014 | Deferred for beta |
| Interactive maps | ADR-0015 | Deferred for beta |
| Crowding indicators | ADR-0015 | Deferred for beta |
| Accounts / persistent profiles | ADR-0015 | Deferred for beta |
| Postgres in initial deploy | ADR-0016 | Deferred until feedback/feature needs it |
| Anonymous feedback UI/transport | ADR-0017 | Disabled until privacy-reviewed transport |
| Preference *memory* / auto-learning | PRD + ADR-0010 family | Consent scaffold later; learning later |
| SI / ferry QA Must-set membership | ADR-0020 | Deferred from Must set |
| Fly.io hosted private/public beta activation | ADR-0012 / ADR-0021 | Separate from self-hosted controlled alpha |
| Elevator / accessibility-aware routing depth | DOMAIN_MODEL / DATA_SPEC | Deferred |
| Mercury / NYCT alert extensions | DATA_SPEC | Deferred |
| Competitor “beats Google” claims | Product rules | Never without benchmark evidence |

### Controlled-alpha residuals (ops, not product scope)

| ID | Item | Status |
|---|---|---|
| FU-NPM-01 | Next.js / npm advisories | OPEN (maintenance branch) |
| FU-ALPHA-01 | Mac logout/reboot LaunchAgent drill | PENDING_USER |
| FU-ALPHA-02 | GitHub scheduled monitor secrets | OPEN (optional) |

### Open technical risks this proposal does **not** auto-close

- OTP candidate-diversity / coverage (R-class routing risk; needs orchestration epic).
- Self-hosted alpha availability (R19–R23).
- npm advisories (R24).

---

## Acceptance sketch (if P1 accepted)

1. Address or POI string (e.g. office address) resolves to a PlaceRef and can be used as origin/destination.
2. Selecting preferred lines that appear on a reasonable subway path yields **>0** satisfaction when topologically feasible — not B/D/M-only 0-of-N for Midtown office → Penn with 7+2 preferred.
3. Unselected walks/transfers/connectors may appear without forcing the user to toggle them.
4. Partial matches still explain omitted preferences.
5. Geocode vendor attribution + privacy rules documented; no precise coords in default logs.
6. Certification status unchanged until a new go/no-go; alpha may ship behind flags.

---

## Ask

Conductor / product owner choose **P0 / P1 / P2 / P3** at Controlled Alpha Review 1 (or sooner).  
If **P1**, authorize ADR-0013 amendment drafting and a routing epic for preferred-line candidate coverage before broadening the tester cohort.
