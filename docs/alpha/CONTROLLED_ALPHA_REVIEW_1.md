# Controlled Alpha Review 1

**Date:** 2026-08-03  
**Input status:** `READY_FOR_P1_CONTROLLED_ALPHA`  
**Primary decision:** **Hold and keep learning**  
**Next roadmap stage:** Stage C — ops and quality hardening

## Decision

Keep the current P1 controlled alpha running for the solo operator. Do not expand the Access cohort and do not start Fly private-beta migration yet. Advance Stage C hardening while collecting more live P1 route evidence.

This decision does not revoke `READY_FOR_P1_CONTROLLED_ALPHA`: the immutable P1 release, protected edge, preferred-line path, and rollback are certified. It limits expansion because evidence for address/POI flag-on, multi-user operations, and broader live route quality is not yet strong enough.

## Evidence reviewed

### Product and routing

- Four controlled-alpha findings are recorded: one UI/product major, one routing/data major, one product blocking gap that led to P1, and one successful P1 routing/operations observation.
- The final live corpus run produced 48 cases: 32 pass, 2 fail, and 14 soft; 441 assertions passed, 2 failed, and 82 were skipped.
- GCT to Penn with preferred `7`, `2`, `GS` passes 2-of-3 satisfaction, omission explanation, and deterministic repeat order.
- The two failed live cases require coordinate/address resolution while address/POI remains flag-off.
- Candidate coverage for the reviewed GCT request was adequate, but the budget was exhausted; broader live candidate-diversity evidence is still warranted.

### Operations and freshness

- The P1 data, OTP, API, web, and edge containers were healthy with zero restarts after the final deploy.
- The tunnel LaunchAgent was running, had one launch, and had never exited at review time.
- Authenticated protected-edge `/health/live` and `/health/ready` checks passed.
- `/v1/status` reported `dataMode=live`, the expected static dataset, a realtime snapshot, and no degradation.
- Disk headroom was 12 GiB: above the 6 GiB release-script refusal threshold, but below the preferred 15 GiB operating headroom.
- The rollback drill restored the pre-P1 certified release, passed smoke, and then restored the intended P1 candidate.

### Tester signal

- Evidence is from the solo operator and automated local/protected checks.
- No external tester feedback has been collected for P1, so cohort expansion would outrun the current evidence.

## Risk reassessment

| Risk | Review 1 assessment | Action |
|---|---|---|
| R19 power/ISP outage | Open; self-hosted availability remains best-effort | Preserve controlled-alpha honesty; no SLA claim |
| R20 sleep/logout | Open, high likelihood | Keep awake during alpha; `FU-ALPHA-01` still requires explicit approval |
| R21 Docker/disk exhaustion | Open; 12 GiB is below preferred headroom | Stage C disk and restart hardening; retain images and volumes needed for rollback |
| R22 Tunnel/Access exposure or lockout | Mitigated for current solo use | Deny-default Access and authenticated remote smoke remain required |
| R23 cloud-grade confusion | Mitigated by status vocabulary | Continue labeling as controlled alpha only |
| R24 dependency advisories | Open, high | Execute `FU-NPM-01` on a maintenance branch with full rebuild/isolation checks |
| R25 geocode privacy/cost/attribution | Open while feature is flag-off | Complete runbook, attribution, and privacy gates before flag-on |
| R26 preferred-line coverage gap | Partially mitigated | Expand live corpus and validate more topology/subset cases in Stage C |
| R27 required/fill-gaps and GS/S confusion | Mitigated in tested UI | Keep copy and rider-facing `S` regression coverage |

## Follow-up disposition

- `FU-ALPHA-01`: pending explicit user approval for logout/reboot recovery drill.
- `FU-ALPHA-02`: optional GitHub scheduled-monitor configuration remains open.
- `FU-NPM-01`: open and selected for Stage C maintenance.
- Wave 3 Medium/Low residuals: reassess and close or explicitly carry before address/POI flag-on or private beta.
- Benchmarks: refresh live SUT cases so flag-off address cases are classified honestly and station/topology coverage expands.

## Exit

Controlled Alpha Review 1 is complete. The primary exit option is **Hold and keep learning**, with immediate progression to Stage C hardening. Cohort expansion, Fly migration, address/POI flag-on, and merge to `main` remain separate decisions.

