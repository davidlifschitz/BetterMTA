# Codex continuation handoff — BetterMTA P1 program

**Date:** 2026-08-03  
**Author:** Cursor conductor + Codex (Wave 4 completion)
**Audience:** Codex (or any agent) resuming P1  
**Status:** Wave 0–4 complete; **`READY_FOR_P1_CONTROLLED_ALPHA`**

**Full product roadmap (Stages A–H, deferred epics, milestones):**

[`.agents/handoffs/codex-full-roadmap-continuation.md`](./codex-full-roadmap-continuation.md) — use that when you need more than P1 Wave 4.

---

## 1. One-paragraph situation

BetterMTA controlled alpha is certified and running as a self-hosted Cloudflare Tunnel + Access stack. Product owner accepted **P1**: address/POI search, preferred-line maximization (not hard require-all), system-filled connectors, and BetterMTA-owned candidate coverage (ADR-0022/0023 + contracts `2026-07-31`). Waves 0–3 finished with independent reviews **PASS** and Critical/High cleared. Wave 4 completed on 2026-08-03: immutable P1 release `rel-20260803T183449Z-78c2ca507c3f` is healthy, local and protected-remote smoke pass, the preference regression passes, and rollback to the pre-P1 certified release was drilled successfully. Address/POI remains flag-off. **Do not merge to `main` unless the product owner asks.**

---

## 2. Repo / workspace

| Item | Value |
|---|---|
| GitHub | `davidlifschitz/BetterMTA` |
| Primary worktree | `/Users/thebiglipper/Developer/bettermta-integration-live` |
| Program branch | `agent/p1-address-preferred-lines` |
| **Program tip** | `78c2ca507c3f7e78063896ecb6ebb88bdded2e61` (`78c2ca5`) |
| `main` tip (at pause) | `54cc927` (P1 acceptance / findings merge; **does not** include Waves 0–3 implementation) |
| Orchestration style | Conductor chat + `cursor-grok-4.5-high-fast` subagents — **not Fable** |

Wave 1 feature branches / worktrees still exist (already merged into program branch; optional cleanup later):

- `/Users/thebiglipper/Developer/bettermta-p1-wave1-places` → `agent/p1-wave1-places` @ `371ab9e`
- `/Users/thebiglipper/Developer/bettermta-p1-wave1-routing` → `agent/p1-wave1-routing` @ `29712a9`
- `/Users/thebiglipper/Developer/bettermta-p1-wave1-frontend` → `agent/p1-wave1-frontend` @ `c271032`
- `/Users/thebiglipper/Developer/bettermta-p1-wave1-privacy` → `agent/p1-wave1-privacy` @ `feb57e7`
- `/Users/thebiglipper/Developer/bettermta-p1-wave1-qa` → `agent/p1-wave1-qa` @ `38cf1f7`

---

## 3. Product decision (locked)

**P1 accepted** from `docs/proposals/address-preferred-lines-fill-gaps.md`.

Authorizes:

1. Address / POI search (amend/supersede ADR-0013 → **ADR-0022**)
2. Preferred-line maximization + fill-the-gaps connectors → **ADR-0023**
3. BetterMTA-owned candidate orchestration beyond OTP natural top-N
4. Honest partial explanations; `insufficient_candidate_coverage` when budget exhausted
5. Feature-flagged rollout; privacy: no default precise-coordinate retention

**Explicitly out of scope (do not implement):** deferred epics D1–D6 in `docs/DEFERRED_BACKLOG.md` (bus/rail/NJ/PATH/ferry, maps, crowding, accounts, arrive-by, feedback/Postgres, elevator depth, Fly hosted beta, competitor claims).

**Ops residuals (not P1 product):** `FU-NPM-01`, `FU-ALPHA-01` (Mac logout/reboot — needs user approval), `FU-ALPHA-02` (GH monitor secrets).

---

## 4. Wave status

| Wave | Status | Notes |
|---|---|---|
| 0 Governance + contract lock | **DONE** | ADR-0022/0023; contracts version `2026-07-31`; lock merge `ab6e2e8` + gate typo `b9139fb` |
| 1 Parallel implementation | **DONE** | 1A places, 1B routing, 1C web, 1D privacy, 1E QA |
| 2 Integration | **DONE** | Merged into program branch; Ajv dedupe fix `81b4de6` |
| 3 Independent reviews | **DONE / PASS** | Gate: `docs/reviews/wave3-gate.md` (doc tip `f9e7481`; branch tip now `bbd1652` adds gate doc only) |
| 4 Controlled-alpha certification | **DONE / PASS** | `docs/alpha/P1_WAVE4_CERTIFICATION.md`; status `READY_FOR_P1_CONTROLLED_ALPHA` |

### Wave 3 review remediations already landed

| Issue | Fix commit |
|---|---|
| A H1 Midtown-only topology | `6117a00` |
| D High LinePicker focus trap | `e71efc4` |
| B High OTP knobs + sequential latency | `d58051b` |
| P1 #14 GS→S test enabled | `08f8b84` |

---

## 5. What shipped on the program branch (implemented)

### Contracts (`2026-07-31`) — locked; do not invent semantics
- Additive place fields: `provider`, `providerPlaceId`, `formattedAddress`, `attribution`
- Optional route `candidateCoverage` (`adequate` \| `degraded` \| `exhausted`)
- Error `insufficient_candidate_coverage` fixture
- Explanation fact `connector_filled`
- Preserve `placeId` / `stationId` / `coordinate` PlaceRef; internal `lineId` **GS** stays GS

### Runtime (flag-default **OFF**)
- **Places (1A):** `GeocoderProvider` + Nominatim adapter + fake CI adapter; `address_poi_enabled` / env docs in `docs/PLACE_PROVIDER.md`, `infra/env/api/.env.example`, `infra/flags/flags.json`
- **Routing (1B + B remediations):** multi-family orchestration, citywide topology, coverage fail-closed, concurrent non-baseline OTP queries, GraphQL body unit tests
- **Web (1C + D remediation):** unified place search behind `NEXT_PUBLIC_FLAG_ADDRESS_POI`, preferred-line copy, GS→**S** UI, coverage-failure UI, LinePicker Tab trap
- **Privacy (1D):** redaction/hashing helpers, bounded metrics, privacy tests
- **QA (1E):** `benchmarks/docs/P1_ACCEPTANCE_MATRIX.md`, `npm --prefix benchmarks/runner run gate-p1`

### Live alpha (host) — P1 controlled-alpha images
- Current release: `rel-20260803T183449Z-78c2ca507c3f` at commit `78c2ca5`
- Compose healthy on loopback edge; authenticated remote live+ready smoke passes
- Rollback pointer: certified pre-P1 release `rel-20260731T155125Z-cert-distinct`
- Address/POI remains flag-off; no Access allowlist expansion

---

## 6. Wave 4 certification result

1. Wave 3 gate confirmed **PASS**.
2. Contracts, routing, API, web, live-build isolation, and P1 fixture gates passed.
3. Immutable P1 release built and deployed from commit `78c2ca5`.
4. Local edge smoke passed: 8 passed, 0 failed.
5. Authenticated remote Access smoke passed without logging protected values.
6. GCT to Penn with preferred `7`, `2`, `GS` uses 2 of 3, explains the omission, and repeats deterministically.
7. Address/POI remains flag-off; the two address-origin live cases are documented as unavailable rather than claimed passing.
8. Rollback drill restored the pre-P1 certified release and passed smoke; intended P1 candidate was then restored.
9. Certification record: `docs/alpha/P1_WAVE4_CERTIFICATION.md`.
10. Program branch pushed; **not merged to `main`**.

### Wave 4 constraints
- No secrets/hostnames/tester emails in Git or logs
- Prefer `pgrep -x cloudflared` for presence
- Flags default **off** until evidence supports enablement
- Not public/private beta / not cloud-grade
- Do not broaden Access allowlist automatically

---

## 7. Medium residuals (non-blocking for Wave 4 start; fix before flag-on)

From `docs/reviews/wave3-gate.md`:

- A M1: `docs/ROUTING_ENGINE_SPEC.md` hard-constraint prose lag  
- A M2: empty drafts → `no_transit_path` vs coverage exhaustion  
- A M3: `pl_geo_*` resolve process-local only  
- B M1–M4: subset lex bias; joint topology; GTFS binding; budgetExhausted meaning  
- D M1–M2: PlaceSuggest option tab order; coverage-failure rider copy  
- E M1–M3: web Dockerfile missing `NEXT_PUBLIC_FLAG_ADDRESS_POI` ARG; geocode outage runbook/alert; metrics exporters PLACEHOLDER  

---

## 8. Key documents to read first

1. `docs/proposals/address-preferred-lines-fill-gaps.md` (P1 ACCEPTED)  
2. `docs/ARCHITECTURE_DECISIONS.md` — **ADR-0022**, **ADR-0023** (and ADR-0011/0013 superseded note)  
3. `docs/reviews/wave3-gate.md`  
4. `docs/DEFERRED_BACKLOG.md`  
5. `docs/PLACE_PROVIDER.md`  
6. `benchmarks/docs/P1_ACCEPTANCE_MATRIX.md`  
7. `docs/alpha/CONTROLLED_ALPHA_LOG.md` (solo findings: GS vs S; Park→Penn 0-of-3; product direction)  
8. `.agents/handoffs/p1-wave2-integration.md`, `.agents/handoffs/routing.md`, `.agents/handoffs/p1-wave1-places.md`  
9. `AGENTS.md` + `docs/PROJECT_CONTEXT.md`  

---

## 9. Validation commands (baseline green at Wave 2/3)

```bash
cd /Users/thebiglipper/Developer/bettermta-integration-live
git checkout agent/p1-address-preferred-lines
git pull --ff-only origin agent/p1-address-preferred-lines

cd contracts && npm ci && npm run validate
cd ../services/routing && npm ci && npm test && npm run typecheck && npm run build
cd ../../apps/api && npm ci && npm test   # also typecheck if script exists
cd ../web && npm ci && npm test
# live isolation: rm -rf .next then production build + verify:no-fixtures
npm --prefix ../../benchmarks/runner ci
npm --prefix ../../benchmarks/runner run gate-p1
```

Host alpha (do not disturb casually):

```bash
# edge smoke / compose — use existing infra/alpha scripts
# remote monitor only with host Access service-token env (never commit)
```

---

## 10. Feature flags

| Flag | Default | Where |
|---|---|---|
| `address_poi_enabled` / flags JSON | **false** | API / `infra/flags/flags.json` |
| `BETTERMTA_GEOCODER_PROVIDER` | `none` (Nominatim when enabled) | API env |
| `NEXT_PUBLIC_FLAG_ADDRESS_POI` | unset/false | Web (Docker ARG gap = E M1) |

Certified alpha behavior today = station-index-first until flags turned on intentionally.

---

## 11. Security / privacy rules for Codex

- Never commit or print: Cloudflare tunnel UUID/creds, Access client id/secret, tester emails, OTP codes, public hostname in new docs if project policy forbids it  
- Place/route logs: use privacy helpers (hash query, coarse grid); no raw address/precise coords in normal logs  
- Secrets only under host private paths (`~/.config/bettermta/`, etc.)

---

## 12. Decisions requiring product owner / conductor

- Whether to **enable** address/POI flags on the live alpha after Wave 4  
- Whether to **merge** `agent/p1-address-preferred-lines` → `main` (and PR style: merge commit preferred for history)  
- Whether to expand Access allowlist beyond solo operator  
- Mac logout/reboot drill (`FU-ALPHA-01`) — explicit user approval  
- Reopening any D1–D6 epic  

---

## 13. Suggested Codex continuation prompt

```text
Continue BetterMTA from Stage B / Controlled Alpha Review 1 using `.agents/handoffs/codex-full-roadmap-continuation.md`.

Worktree: /Users/thebiglipper/Developer/bettermta-integration-live
Branch tip: agent/p1-address-preferred-lines @ 78c2ca5

P1 Waves 0–4 are DONE. Status is READY_FOR_P1_CONTROLLED_ALPHA; address/POI remains flag-off.

Constraints: no merge to main; no flag enablement or Access expansion without owner approval; no secrets in git/logs; deferred D1–D6 stay out of scope until explicitly reopened.

Goal: complete Controlled Alpha Review 1 from real evidence, then advance the approved roadmap stage.
```

---

## 14. Distilled inventory

| Layer | State |
|---|---|
| Implemented | P1 code + contracts on program branch |
| Tested | Unit/integration/gate-p1; immutable P1 deploy; local and protected-remote smoke; live GCT preferred-line regression; rollback drill |
| Mocked / fake | Geocoder `fake` adapter for CI; routing Midtown fixture scenario |
| Deferred | D1–D6; flag-on production enablement; Fly hosted beta |
| Blocked / paused | Address/POI live cases remain flag-off; cohort expansion and `main` merge require owner decisions |
| Known defects | Medium residuals in wave3-gate.md; `FU-NPM-01`; address-origin live adapter cases unavailable while flag-off |

---

**End of handoff.** Prefer updating this file when Wave 4 completes or status changes.
