# Codex continuation handoff — BetterMTA full roadmap

**Date:** 2026-08-05
**Audience:** Codex (or any agent) taking over the whole product trajectory  
**Primary worktree:** `/Users/thebiglipper/Developer/bettermta-stage-f-claims-evidence`
**Repo:** `davidlifschitz/BetterMTA`

This is the **full-program** handoff. Completed P1 Wave 4 evidence lives in `.agents/handoffs/p1-codex-continuation.md` and `docs/alpha/P1_WAVE4_CERTIFICATION.md`.

---

## 0. What you are inheriting (now)

| Layer | State |
|---|---|
| Product status | **`READY_FOR_P1_CONTROLLED_ALPHA`** (P1 Wave 4 certified 2026-08-03) |
| Live origin | Self-hosted macOS + Docker/Colima + Cloudflare Tunnel + Access (ADR-0021) |
| Live images | Immutable P1 release `rel-20260803T183449Z-78c2ca507c3f`; rollback points to pre-P1 certified release |
| Integration lineage on `main` | Through PR #3–#6 docs/findings; **`main` does not yet contain P1 Waves 0–4 code** |
| Active program branch | `codex/stage-f-claims-evidence` (stacked on the Stage F privacy/support-evidence candidate) |
| Immediate unfinished work | Prove commit-bound claims-discipline scan mechanics in CI, then complete same-commit human publication review before any copy or comparative statement is authorized; every hosted/live gate and all Fly activation, secrets, scaling, and cohort changes remain owner-gated |

**Hard rules (always):**
- Do not silently change confirmed product/ADR decisions; propose reopenals.
- Shared contracts have one owner; additive changes only unless conductor locks a bump.
- No competitor “beats Google” claims without benchmark evidence.
- No secrets/hostnames/Access tokens/tester emails in Git or casual logs.
- Narrow public-beta scope: no accounts/native apps/AI chat/social unless ADR reopens.
- Prefer mature OTP substrate; differentiation stays in BetterMTA ranking/orchestration.

---

## 1. Product north star

**Promise:** *You know the subway. Your navigation app should listen to you.*

Riders enter origin/destination, select **preferred** subway lines, and get ranked practical routes that maximize those preferences, with walks/transfers/unselected connectors filled in (ADR-0022/0023 after P1).

**Target production definition:** public beta — mobile web, subway-first NYC, honest live/stale/schedule labeling, monitored, safely deployable — **not** Google Maps parity.

Read first: `docs/PROJECT_CONTEXT.md`, `docs/PRD.md`, `docs/PRODUCT_PRINCIPLES.md`, `AGENTS.md`.

---

## 2. Status vocabulary (do not blur)

| Status | Meaning |
|---|---|
| `BLOCKED` | Not ready for remote cohort |
| `READY_FOR_CONTROLLED_ALPHA` | Historical Phase 12A cert — self-hosted Tunnel+Access (ADR-0021). Not cloud-grade |
| `READY_FOR_P1_CONTROLLED_ALPHA` | **Current live cert** — preferred coverage certified on alpha; address/POI remains flag-off |
| `READY_FOR_PRIVATE_BETA` | Hosted Fly private cohort (ADR-0012) |
| `READY_FOR_PUBLIC_BETA` | Narrow public MVP + required gates |

Controlled alpha ≠ private beta ≠ public beta.

---

## 3. Historical delivery (already done)

### Scaffold / conductor / Step 2
- Milestone 0 scaffold (mobile UI, fixtures, API boundary).
- Conductor package: architecture, domain, API/data contracts, ADRs, ownership.
- Parallel agent workstreams integrated: data, routing, backend, frontend, infra, benchmark-QA → `agent/integration-live`.

### Step 3 live stack (Phases ~1–11)
- OTP 2.9.0 substrate (ADR-0011); production adapters; GTFS + GTFS-RT path.
- Docker Compose stack; Fly TOML prepared but **not activated** (G17 BLOCKED).
- Benchmarks / release-gate harness; fixture lockout for live web builds.
- Many G01–G20 rows PASS/PARTIAL; Fly rollback/alerts still PENDING/BLOCKED.

### Phase 12A — controlled alpha (DONE)
- ADR-0021 self-hosted Cloudflare path.
- Edge `127.0.0.1:8088`, named tunnel LaunchAgent, Access deny-default + allowlist.
- Immutable release/rollback; remote validation; reliability drills (Mac logout/reboot **PENDING_USER**).
- Merged to `main` via PR #3 (`90b6462`); residuals PR #4; alpha log PR #5; P1 acceptance docs PR #6.
- Go decision: **`READY_FOR_CONTROLLED_ALPHA`**.

### Controlled-alpha learning (started)
- Solo findings in `docs/alpha/CONTROLLED_ALPHA_LOG.md` (GS vs S; Park→Penn 0-of-3; address+preferred-lines direction).
- Next formal learning milestone: **Controlled Alpha Review 1** (after enough real-use evidence; may wait until P1 ships).

### P1 program (complete — see §5)
- Decision ACCEPTED; Waves 0–4 complete; status `READY_FOR_P1_CONTROLLED_ALPHA`.

---

## 4. Classic roadmap milestones (from `docs/ROADMAP.md`) mapped to reality

| Roadmap milestone | Intent | Current mapping |
|---|---|---|
| **M0** Scaffold | UI + prototype API | **Done** |
| **M1** Static routing proof | GTFS graph + constrained search + golden cases | **Largely done** via OTP + routing library + benchmarks (not a custom graph search) |
| **M2** Real-time routing | GTFS-RT, freshness, safe degrade | **Largely done** in live stack; honesty labeling required forever |
| **M3** Product beta | Maps, geocoding, baseline comparison, analytics, feedback, preference learning, probes | **Partial** — geocode/preferred lines = **P1**; maps/feedback/learning/accounts still deferred (D2/D3) |
| **M4** Public beta production | Load/SLO, CI/CD preview+rollback, privacy/support, a11y, incident playbook, public URL | **Partial** — runner-local preview proven; automated a11y, incident, privacy/support, and claims-discipline evidence prepared; human/operational/publication approvals and every hosted/live gate remain open; **Fly private/public path not activated** |
| **M5** Differentiation | Live reroute, delay handling, crowding/reliability, beat-default discovery, more modes | **Future** — after public-beta quality bar; modes = D1 |

Treat `ROADMAP.md` as directional; ADR-locked deferrals override its older wording (e.g. “required-line state search”).

---

## 5. Active program: P1 (detail)

**Branch tip:** `agent/p1-address-preferred-lines` @ `78c2ca5`  
**Deep handoff:** `.agents/handoffs/p1-codex-continuation.md`

| Wave | Status |
|---|---|
| 0 ADR/contracts lock (ADR-0022/0023, contracts `2026-07-31`) | Done |
| 1 Places / routing / web / privacy / QA | Done |
| 2 Integration | Done |
| 3 Independent reviews | **PASS** (`docs/reviews/wave3-gate.md`) |
| 4 Immutable deploy + alpha cert | **PASS** — `docs/alpha/P1_WAVE4_CERTIFICATION.md` |

**P1 outcome label:** `READY_FOR_P1_CONTROLLED_ALPHA`.  
Address/POI remains default **off** pending owner flag-on decision. Do not merge to `main` without owner ask.

---

## 6. Full forward roadmap (recommended sequence)

Use this as the default order unless product owner reorders.

```text
DONE → P1 Wave 4 certification
DONE → Controlled Alpha Review 1 (hold expansion; keep learning)
DONE*→ Ops harden implementation (owner-gated drills/secrets and merges carried explicitly)
    → Small tester cohort (2–3) under Access
    → Epic D5 prep: Fly private beta path (or keep alpha longer)
    → READY_FOR_PRIVATE_BETA gates
    → Epic D2/D3 selectively (maps / arrive-by / feedback) as needed for M3/M4
    → READY_FOR_PUBLIC_BETA
    → Epic D1 modes + M5 differentiation (one mode/ADR at a time)
    → Epic D6 claims only with published benchmarks
```

### Stage A — Finish P1 on controlled alpha (**DONE**)

**Result:** Preferred-line coverage shipped safely to controlled alpha; address/POI remains flag-off pending the separate enablement decision.

1. Wave 4 completed: local gates → immutable images → deploy → protected remote monitor → rollback drill → restored candidate.
2. Medium residuals remain scheduled before **flag-on** (wave3-gate list).
3. Program branch pushed; PR/merge to `main` remains an owner decision.
4. Controlled-alpha evidence continues in `docs/alpha/CONTROLLED_ALPHA_LOG.md`.

**Exit achieved:** `READY_FOR_P1_CONTROLLED_ALPHA`; rollback points to the pre-P1 certified images.

### Stage B — Controlled Alpha Review 1 (**DONE**)

**Goal:** Decide next phase from real use, not more deploy theater.

Evaluate:
- Failures / confusing UI / line-satisfaction bugs / OTP diversity gaps
- Uptime (tunnel, Colima, disk, realtime freshness)
- Whether to expand testers, improve routing further, or jump to hosted beta

**Exit options (pick one primary):**
- Routing-quality epic (candidate diversity, subset search, live OTP validation)
- Broader controlled alpha (more allowlisted emails)
- Start **D5** Fly private-beta migration
- Hold and keep learning

**Decision:** Hold and keep learning. Keep the solo P1 controlled alpha, hold cohort/Fly expansion, and advance Stage C hardening. Evidence and R19–R27 reassessment: `docs/alpha/CONTROLLED_ALPHA_REVIEW_1.md`.

### Stage C — Ops & quality harden (parallelizable)

| ID | Work | Notes |
|---|---|---|
| FU-ALPHA-01 | Mac logout/reboot LaunchAgent recovery | Needs **explicit user approval** |
| FU-ALPHA-02 | GitHub scheduled monitor secrets | Optional; soft workflow |
| FU-NPM-01 | Next.js / npm advisories | Separate maintenance branch; no auto-redeploy on merge |
| Wave3 Mediums | Spec lag, Docker FE flag ARG, geocode runbook, PlaceSuggest a11y, etc. | Before flag-on / private beta |
| Benchmarks | Live SUT corpus refresh; keep SI/ferry Must-set deferred (ADR-0020) until reopened |

**Stage C candidate result (2026-08-03):** Draft PR #8 is green across all eight CI jobs (run `30846000773`). The API has an authenticated privacy-safe metrics exporter; backend/pager activation remains Stage D. The hard live subset passes 2/2; five soft live cases preserve real candidate-diversity/timeout gaps. FU-NPM-01 is ready as draft PR #7 with green CI. FU-ALPHA-01 still needs explicit approval; FU-ALPHA-02 still needs operator-owned secrets and remains optional. The process-local geocode-resolution residual recorded at this point has a tested Stage D implementation candidate below, but that candidate is not merged or deployed. No live redeploy, flag-on, cohort expansion, Fly activation, or `main` merge occurred.

### Stage D — Private beta (hosted) — Epic D5 + M4 subset

**Authority:** ADR-0012 Fly; ADR-0021 alpha honesty until migrated.

Work:
- Activate Fly apps (or chosen host) with secrets out of Git
- Production observability/SLOs/alerts (G19)
- One-action Fly rollback drill (G18)
- Rate limits / multi-instance place-resolve story (P1 A M3)
- Privacy policy + support workflow draft
- Cohort 5–10 → expand carefully

**Stage D preparation candidate (2026-08-04; not activated):** Green draft PR #9 on `codex/stage-d-private-beta-prep` adds expiring AES-256-GCM geocode PlaceRefs that resolve across API replicas sharing one key, fail closed on tamper/expiry/wrong-key, and refuse production address/POI boot without that key. Stable place-query/provider hashes and encrypted PlaceRefs are excluded or redacted from operational logs. Fly preparation now has strict public-origin validation, a read-only normal/initial preflight, prior-image manifest capture, guarded image-based rollback, exact one-Machine caps, serialized deployment, deterministic operator tests, and deploy-workflow manifest retention; current Fly guidance no longer uses a special releases-rollback command. Draft privacy/support documents are present but unpublished and unapproved. No Fly authentication, app creation, secrets, deployment, scaling, live change, flag-on, or cohort expansion occurred. The product remains `READY_FOR_P1_CONTROLLED_ALPHA`, not `READY_FOR_PRIVATE_BETA`.

**Exit:** `READY_FOR_PRIVATE_BETA` with evidence — still not public.

### Stage E — Product beta depth — Epics D2 / D3 (M3 remainder)

Reopen **only with ADRs**:

| Epic | Items | Gate |
|---|---|---|
| D2 | Interactive maps; crowding; accounts/profiles; **arrive-by** (ADR-0014/0015) | UX + a11y + privacy reviews |
| D3 | Anonymous feedback transport; Postgres when justified; preference memory/consent (ADR-0016/0017) | Privacy-reviewed transport first |

Sequence suggestion: arrive-by after routing stable; feedback before preference memory; maps when geocode attribution UX is solid.

### Stage F — Public beta — M4 completion

- Load test + p95 SLO evidence
- CI/CD preview + production rollback proven
- Accessibility review (no critical core-flow failures)
- Incident playbook + on-call lite
- Public URL + TLS + clear limitations copy
- Narrow scope still: subway-first NYC; no AI chat/social/native apps

**Stage F readiness candidate (2026-08-04; mechanics only):** Green draft PR #10 on
`codex/stage-f-readiness-harness` adds a bounded privacy-safe route-search load
probe, an exact ten-gate fail-closed evidence validator, live-mode fixture
exclusion fixes, Playwright keyboard/mobile/axe coverage in CI, draft incident
operations, and limitations copy. Structure checks and synthetic validator
tests are green; none of the pending hosted/private-beta, production load,
preview, live rollback, human accessibility, on-call, public TLS/headers,
approval, or publication evidence has been claimed. See
`.agents/handoffs/stage-f-readiness-harness.md` and
`docs/public-beta/READINESS.md`.

**Stage F public-surface candidate (2026-08-04; local only):** The stacked
`codex/stage-f-public-surface` branch adds a discoverable `/limitations` route,
planner-footer link, per-request nonce CSP, baseline security headers, and
production E2E/structure checks. It does not approve or publish the copy, prove
the public edge/TLS, establish HSTS policy, close preview/load capacity, or
change `NOT_READY`. Request rendering is tracked as R30 until approved
preview/load evidence exists. See `.agents/handoffs/stage-f-public-surface.md`.

**Stage F public-origin verifier candidate (2026-08-04; local only):** The
further stacked `codex/stage-f-public-origin-verifier` branch adds a bounded,
commit-bound verifier for authorized web/API origins. It checks runtime TLS,
security headers, CSP nonce rotation, limitations discoverability, and API
health/status while omitting target identity and response bodies from output.
Local tests do not close the public-origin gate; approved remote, public
DNS/CDN, and independent external-monitor evidence remain pending under R31.
See `.agents/handoffs/stage-f-public-origin-verifier.md`.

**Stage F production-container preview candidate (2026-08-04; runner-local):**
The further stacked `codex/stage-f-preview-container` branch builds the real web
Dockerfile in CI, starts the immutable image on loopback, runs the existing 14
mocked-live core-flow/header/accessibility checks against it, scans served
chunks for fixture markers, and retains commit/image-bound privacy-safe
evidence. PR #13 CI run `30956573677` passed 10/10 jobs and the audited preview
artifact matches commit `9f10e50`; it records passing smoke with no production
mutation or external reachability. This does not create or validate a
hosted/public preview, contact Fly, prove edge/CDN/external behavior, or change
`NOT_READY`; R32 preserves that distinction. See
`.agents/handoffs/stage-f-preview-container.md`.

**Stage F accessibility-evidence candidate (2026-08-04; automated only):** The
further stacked `codex/stage-f-accessibility-evidence` branch writes a
commit-bound artifact only after the existing keyboard/mobile/axe suite passes
and adds a same-commit human review protocol. Automated output remains
`AUTOMATED_PASS_HUMAN_PENDING` and `eligibleForGatePass: false`; no human review
or gate passage is claimed. Initial PR #14 CI run `30957843171` passed 10/10 and
its artifact matched implementation commit `c27602b`; the authoritative latest
head audit is retained in PR #14 comments. R33 preserves this distinction. See
`.agents/handoffs/stage-f-accessibility-evidence.md`.

**Stage F incident-evidence candidate (2026-08-04; playbook mechanics only):**
The further stacked `codex/stage-f-incident-evidence` branch writes a
commit-bound artifact after incident playbook structure passes and adds a
restricted same-commit tabletop protocol. Automated output remains
`PLAYBOOK_PASS_ROTA_DRILL_PENDING` and `eligibleForGatePass: false`; no rota,
channel, threshold approval, tabletop, live incident action, or gate passage is
claimed. The authoritative latest-head audit is retained in PR #15 comments.
R34 preserves this distinction. See
`.agents/handoffs/stage-f-incident-evidence.md`.

**Stage F privacy/support-evidence candidate (2026-08-04; controls mechanics
only):** The further stacked `codex/stage-f-privacy-support-evidence` branch
writes a commit-bound artifact after the draft policy, support workflow, ledger
shape, runtime privacy controls/tests, and approval protocol pass structure
validation. Automated output remains
`CONTROLS_PASS_APPROVAL_CHANNEL_PENDING` and `eligibleForGatePass: false`; no
policy publication, deployed retention/deletion proof, support activation,
response-owner assignment, or gate passage is claimed. The authoritative
latest-head audit is retained in PR #16 comments. R35 preserves this
distinction. See `.agents/handoffs/stage-f-privacy-support-evidence.md`.

**Stage F claims/publication-readiness candidate (2026-08-05; automated claims
discipline only):** The further stacked `codex/stage-f-claims-evidence` branch
scans only `apps/web/src` and `docs/public-beta/LIMITATIONS.md` with a
deny-by-default named-competitor policy. It verifies regular, nonempty,
non-symlink benchmark methodology files with stable markers; requires the
explicit non-claim in both canonical limitations files; and rejects comparative
variants, unexpected named-competitor references, and symlink evasion with
fixed non-reflecting errors. It preserves fixed neutral MTA attribution/
implementation copy, the internal route-set phrase `~N min faster than fastest
baseline`, and `next/font/google`; straight and curly contraction forms of the
non-claim are accepted. CI checks out and records the same pull-request-head or
push commit expression, then writes
`AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING` claims evidence with
`comparativeClaimsStatus: not_authorized` and `eligibleForGatePass: false`.
`docs/public-beta/PUBLICATION_REVIEW.md` remains
`PENDING_PUBLICATION_REVIEW`; no comparative claim, publication, gate passage,
deployment, or cohort change is claimed. R36 preserves the distinction and
scanner-coverage risk. See `.agents/handoffs/stage-f-claims-evidence.md`.

The parent claims handoff records the final PR #17 audit evidence as a
same-commit review of the retained `public-beta-claims-<run-id>` artifact: the
fixed scan/result contract remains
`AUTOMATED_SCAN_PASS_PUBLICATION_REVIEW_PENDING`,
`comparativeClaimsStatus: not_authorized`, `eligibleForGatePass: false`, and
`productionMutation: false`. That parent audit is not publication approval and
is inherited only as claims-discipline context by later Stage F slices.

**Stage F load-evidence candidate (2026-08-05; synthetic mechanics only):** The
further stacked `codex/stage-f-load-evidence` branch requires a full lowercase
release commit, validates the complete canonical `/v1/status` response before
and after load, refuses status/route redirects, bounds fixture and serialized
request bodies at 1 MiB, hashes only stable bounded privacy-safe snapshot
identity fields, measures latency across every request with finite monotonic
percentiles, and fails closed on missing/malformed/degraded or changed status.
CI runs the real probe against a deterministic loopback fixture for 100
measured requests, serializes in-process runs before output mutation, passes
explicit absolute child cwd/script paths, resolves and anchors the real output
parent by device/inode, repairs verified cwd-anchor changes after callbacks,
completes and validates an exact-inventory sibling stage, synchronously
revalidates bounded no-follow JSON through the writer’s canonical validator and
deep cross-file projection equality immediately before publication, and
publishes it with one final directory-entry rename, writing only `probe.json`
and `result.json`. CI passes an absolute `$GITHUB_WORKSPACE` output path while
uploading only those two files. Non-empty final output entries are atomically
quarantined and an empty real output directory is established before no-follow
quarantine cleanup. Parent renames/replacements are fixed failures cleaned inside
the anchored original parent; same-UID external kernel-level races between
final validation and rename remain a documented pure-Node residual boundary.
The writer emits `SYNTHETIC_LOCAL_PASS_BETA_LOAD_PENDING` with
`probeClass: synthetic-local`, `dataSnapshotStatus: synthetic`,
`eligibleForGatePass: false`, `betaCapacityEvidence: false`, and
`productionMutation: false`. No approved target, real snapshot, hosted
capacity, load/p95 gate passage, deployment, or status change is claimed. R37
preserves this distinction. See `.agents/handoffs/stage-f-load-evidence.md`.

**Exit:** `READY_FOR_PUBLIC_BETA`.

### Stage G — Differentiation & modes — M5 + Epic D1

One mode or capability per ADR:
- Bus / LIRR / Metro-North / ferry / **NJ Transit** / PATH — each needs data + routing + QA plan
- Live rerouting, better delay handling, crowding/reliability, beat-default discovery
- Elevator-aware routing / alert extensions (D4) as data allows

### Stage H — Claims — Epic D6

Never claim superiority vs Google/Apple/Citymapper without published methodology + corpus results. North-star metric remains: share of completed searches where user picks a BetterMTA route not in baseline top three (`PRD` §9).

---

## 7. Deferred epic registry (do not silently start)

Full tables: `docs/DEFERRED_BACKLOG.md`.

| Epic | Summary | Sequence relative to P1 |
|---|---|---|
| D1 | Extra transit modes | After P1 proven |
| D2 | Maps, crowding, accounts, arrive-by | After P1; routing stable |
| D3 | Feedback, Postgres, preference memory | After place/privacy path settled |
| D4 | Elevator routing, SI/ferry Must-set, alerts | Parallel later |
| D5 | Hosted private beta (Fly) | After Alpha Review 1+ |
| D6 | Competitor claims | Evidence-gated forever |

---

## 8. Architecture anchors (do not fork casually)

| Topic | Authority |
|---|---|
| OTP substrate | ADR-0011 |
| Fly for hosted beta | ADR-0012 |
| Places station + address/POI | **ADR-0022** (supersedes ADR-0013) |
| Preferred lines / coverage | **ADR-0023** |
| Arrive-by deferred | ADR-0014 |
| Maps/crowding/accounts deferred | ADR-0015 |
| No Postgres until needed | ADR-0016 |
| Feedback disabled until privacy transport | ADR-0017 |
| Live fail-closed | ADR-0018 |
| SI/ferry Must-set deferred | ADR-0020 |
| Self-hosted controlled alpha | ADR-0021 |
| Contracts | `contracts/**` version **`2026-07-31`** on P1 branch |

---

## 9. Live alpha ops facts (host)

- Compose services behind loopback edge; Tunnel via **user** LaunchAgent `com.bettermta.cloudflared-alpha` (KeepAlive + RunAtLoad).
- Access: deny-default, exact-email allowlist, service-token for monitors.
- Release pins under `deployments/current.env` / `previous.env` (**gitignored**).
- Disk: keep headroom (~≥15 Gi preferred); Colima trim; don’t delete active volumes/immutable tags.
- Availability best-effort (power/ISP/sleep/login).

Secrets stay in `~/.config/bettermta/` and Cloudflare local config — never copy into the repo.

---

## 10. Full workspace inventory (host, 2026-08-04)

All BetterMTA git worktrees share one repo root (`bettermta`). Prefer the active
stacked Stage F worktree for this readiness stream. Older Step-2 / Wave-1 trees
are historical — do not resume feature work there unless explicitly reopening
that stream.

### 10.1 Active / primary

| Absolute path | Branch / HEAD | Tip | Role |
|---|---|---|---|
| `/Users/thebiglipper/Developer/bettermta-stage-f-claims-evidence` | `codex/stage-f-claims-evidence` | current branch tip | **Primary for this slice.** Claims scan, pending publication-readiness evidence, and human publication review protocol candidate |
| `/Users/thebiglipper/Developer/bettermta-stage-f-privacy-support-evidence` | `codex/stage-f-privacy-support-evidence` | parent tip | Parent privacy/support readiness evidence and approval protocol candidate; final parent CI audit remains in draft PR #16 comments |
| `/Users/thebiglipper/Developer/bettermta-stage-f-incident-evidence` | `codex/stage-f-incident-evidence` | `894e7ed` | Parent incident playbook-readiness evidence candidate; draft PR #15 green and artifact audited |
| `/Users/thebiglipper/Developer/bettermta-stage-f-accessibility-evidence` | `codex/stage-f-accessibility-evidence` | `2c49984` | Parent automated accessibility evidence candidate; draft PR #14 green and artifact audited |
| `/Users/thebiglipper/Developer/bettermta-stage-f-preview-container` | `codex/stage-f-preview-container` | `9f10e50` | Parent runner-local production-container preview candidate; draft PR #13 green and artifact audited |
| `/Users/thebiglipper/Developer/bettermta-stage-f-origin-verifier` | `codex/stage-f-public-origin-verifier` | `cebb79c` | Parent Stage F public-origin verifier candidate |
| `/Users/thebiglipper/Developer/bettermta-stage-f-public-surface` | `codex/stage-f-public-surface` | `f0d77e3` | Parent Stage F public limitations/header candidate |
| `/Users/thebiglipper/Developer/bettermta-stage-f-readiness` | `codex/stage-f-readiness-harness` | `b20834d` | Parent Stage F evidence harness candidate |
| `/Users/thebiglipper/Developer/bettermta-integration-live` | `codex/stage-d-private-beta-prep` | `48f701b` | Stage D private-beta preparation candidate; live compose lineage |
| `/Users/thebiglipper/Developer/bettermta` | `main` | `cd7f860` | Bare/main checkout — **local `main` can lag `origin/main`**; remote tip at handoff was `54cc927` (PR #6). Prefer syncing before using as source of truth |

### 10.2 Step-2 specialist worktrees (pre-integration; largely superseded)

| Absolute path | Branch | Tip | Original role |
|---|---|---|---|
| `/Users/thebiglipper/Developer/bettermta-backend` | `agent/backend` | `6b6cbdf` | Fixture-backed API / v1 contract service |
| `/Users/thebiglipper/Developer/bettermta-benchmark-qa` | `agent/benchmark-qa` | `b056721` | Corpus, invariants, gate, self-test |
| `/Users/thebiglipper/Developer/bettermta-conductor` | detached @ `ec88dc6` (`agent/conductor`) | `ec88dc6` | Early conductor package lock; remote branch gone — historical |
| `/Users/thebiglipper/Developer/bettermta-data` | `agent/data` | `9bf495d` | GTFS ingest, realtime freshness, line mapping |
| `/Users/thebiglipper/Developer/bettermta-frontend` | `agent/frontend` | `c088a07` | Mobile web fixture-mode UI |
| `/Users/thebiglipper/Developer/bettermta-infrastructure` | `agent/infrastructure` | `99ab8f3` | Compose / deploy / ops scaffolding |
| `/Users/thebiglipper/Developer/bettermta-routing` | `agent/routing` | `294500a` | Routing engine / OTP orchestration slice |

These were merged into the integration lineage; **do not open new feature work here** unless reconstructing history. Useful only for archaeology or recovering an unmerged commit.

### 10.3 P1 Wave-1 slice worktrees (merged into program branch; prune-safe)

| Absolute path | Branch | Tip | Slice |
|---|---|---|---|
| `/Users/thebiglipper/Developer/bettermta-p1-wave1-places` | `agent/p1-wave1-places` | `371ab9e` | Places / geocode provider |
| `/Users/thebiglipper/Developer/bettermta-p1-wave1-routing` | `agent/p1-wave1-routing` | `29712a9` | Preferred-line / coverage orchestration |
| `/Users/thebiglipper/Developer/bettermta-p1-wave1-frontend` | `agent/p1-wave1-frontend` | `c271032` | Address UI / LinePicker |
| `/Users/thebiglipper/Developer/bettermta-p1-wave1-privacy` | `agent/p1-wave1-privacy` | `feb57e7` | Place privacy / retention |
| `/Users/thebiglipper/Developer/bettermta-p1-wave1-qa` | `agent/p1-wave1-qa` | `38cf1f7` | P1 acceptance matrix / QA |

All already integrated into `agent/p1-address-preferred-lines`. Safe to ignore or `git worktree remove` after confirming no unique uncommitted work.

### 10.4 Non-git sibling directory

| Absolute path | Role |
|---|---|
| `/Users/thebiglipper/Developer/bettermta-artifacts` | Local artifacts only (e.g. `gtfs_subway.zip`); **not** a git worktree |

### 10.5 Branch tips to remember (not separate worktrees)

| Ref | Tip (at handoff) | Notes |
|---|---|---|
| `origin/main` | `54cc927` | Certified-alpha docs + P1 acceptance (PRs #3–#6); **no** P1 Waves 0–3 implementation |
| `agent/integration-live` | (historical Step 3) | May lag `main`; superseded as primary by integration-live → P1 program branch |
| `agent/p1-address-preferred-lines` | `78c2ca5` | P1 program tip; Stage A complete |

### 10.6 Default rule for new agents

1. Continue the named active workstream in its primary worktree; for this handoff use `/Users/thebiglipper/Developer/bettermta-stage-f-claims-evidence` on `codex/stage-f-claims-evidence`.
2. Do not create more long-lived specialist worktrees without a parallelization plan and merge owner.
3. Refresh this inventory with `git -C /Users/thebiglipper/Developer/bettermta worktree list` if the host layout may have changed.

---

## 11. Suggested Codex kickoff (full roadmap)

```text
You are continuing BetterMTA. Read `.agents/handoffs/codex-full-roadmap-continuation.md` first,
then `.agents/handoffs/p1-codex-continuation.md` for completed P1 Wave 4 evidence.

Primary worktree: /Users/thebiglipper/Developer/bettermta-stage-f-claims-evidence
Active branch: codex/stage-f-claims-evidence (stacked Stage F candidate)
Live alpha: READY_FOR_P1_CONTROLLED_ALPHA on immutable P1 images; rollback points to the pre-P1 certified release.

Immediate mission: finish and audit the claims/publication-readiness artifact,
then obtain same-commit human publication review before authorizing copy or any
comparative statement. Do not treat a green automated scan as publication
approval, structure proof as operational approval, or runner-local proof as
hosted/public proof.
Do not implement D1–D6 unless explicitly authorized.
Do not merge to main unless the product owner asks. No competitor claims without benchmarks.
No Fable orchestration unless requested — prefer focused agents with non-overlapping ownership.
```

---

## 12. Immediate vs later (one screen)

**Do next**
1. Review the stacked Stage F readiness/public-surface/origin/preview/accessibility/incident/privacy-support/claims candidates
2. Capture owner-authorized hosted, load, rollback, human-a11y, incident-tabletop, privacy/support, publication, and public-edge evidence
3. Keep `FU-NPM-01` separate; execute `FU-ALPHA-01` only with explicit logout/reboot approval

**Do not do next**
- Bus/NJ Transit/PATH “just because”
- Fly activation without private-beta go/no-go
- Accounts, maps, feedback UI without ADR reopen
- Merging P1 to `main` + redeploying alpha without Wave 4 evidence
- Squashing away release history on big integration PRs

---

**End of full roadmap handoff.** Update this file when stage exits change (P1 cert, Review 1 decision, private-beta go).
