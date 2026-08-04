# Public-beta incident tabletop drill

**Current status:** `PENDING_OWNER_APPROVAL_AND_DRILL`

This is the Stage F tabletop template, not completed incident evidence and not
an active on-call rota. Copy it under the approved restricted evidence root for
a specific release. Do not commit responder contact details, channel names,
protected hostnames, credentials, tester identities, rider locations, request
payloads, or private monitoring links.

## Scope and prerequisites

- [ ] Record the full reviewed release commit: `____________________________`
- [ ] Record the CI incident-readiness artifact: `__________________________`
- [ ] Confirm the artifact commit equals the reviewed release commit and its
      status is `PLAYBOOK_PASS_ROTA_DRILL_PENDING`.
- [ ] Release owner approves the operating window, scenario, stop thresholds,
      and evidence-retention location.
- [ ] Record only the approved environment class (`private-preview` or
      `public-candidate`), never its hostname.
- [ ] Confirm the restricted incident channel is reachable without recording
      its name here.
- [ ] Stop and record `BLOCKED` if the rota, channel, rollback target, safe test
      method, or release identity is missing.

## Environment and roles

| Field | Recorded value |
|---|---|
| Drill ID | `pending` |
| UTC date/time | `pending` |
| Environment class | `pending` |
| Release commit | `pending` |
| Incident-readiness artifact | `pending` |
| Incident commander assigned | `pending` |
| Operations lead assigned | `pending` |
| Product/routing lead assigned | `pending` |
| Communications lead assigned | `pending` |
| Scribe assigned | `pending` |
| Restricted channel reachable | `pending` |

Record roles by approved internal identifier in the restricted copy. Do not
commit names, email addresses, phone numbers, handles, or channel identifiers.

## Scenario

- [ ] Choose one bounded scenario: route correctness, stale-live labeling,
      sustained p95/error breach, readiness failure, accessibility regression,
      or suspected privacy/credential exposure.
- [ ] Define the injected signal without live rider data or uncontrolled load.
- [ ] Record the expected severity and objective stop condition.
- [ ] Record the prior immutable-image manifest that would be used if rollback
      is part of the scenario; do not execute it without separate authorization.
- [ ] Define success, blocked, and abort criteria before the drill begins.

## Timeline

| UTC time | Role | Safe event or decision | Evidence reference |
|---|---|---|---|
| `pending` | `pending` | `pending` | `pending` |

Record acknowledgement, severity assignment, role assignment, rollout freeze,
diagnosis, mitigation choice, recovery checks, and close/continue decision.

## Stop and rollback decisions

- [ ] The incident commander recognized the applicable stop condition.
- [ ] Cohort expansion was treated as frozen until recovery sign-off.
- [ ] The exact running release set and mixed-version state were identified.
- [ ] The correct prior immutable-image manifest and guarded command were found.
- [ ] Rollback execution was either separately authorized and evidenced, or
      explicitly simulated with no production mutation.
- [ ] The candidate restore decision remained separate from rollback success.

## Recovery

- [ ] Liveness, readiness, status, feed age, and core route smoke criteria were
      named and evaluated at the appropriate layer.
- [ ] The trigger was no longer reproducible, or the drill recorded `BLOCKED`.
- [ ] Latency/error/freshness observation thresholds were applied as approved.
- [ ] Limitations and degraded-state copy remained accurate.
- [ ] Residual risks have an owner and deadline in the restricted record.
- [ ] Re-expansion was treated as a separate release-owner decision.

## Communications and privacy

- [ ] Initial and follow-up messages separate confirmed facts from hypotheses.
- [ ] Messages include impact, mitigation, and next UTC update time.
- [ ] No protected origin, secret, responder contact, tester identity, precise
      location, payload, or unsupported competitor claim was recorded.
- [ ] Public copy, if separately approved, states stale/unavailable realtime and
      reduced-mode behavior honestly.
- [ ] The final artifact is stored in the approved restricted system and hashed
      before release-evidence attachment.

## Findings

| ID | Severity | Finding | Evidence | Owner | Resolution |
|---|---|---|---|---|---|
| `pending` | `pending` | `pending` | `pending` | `pending` | `open` |

`critical` means a stop condition, unsafe evidence handling, unavailable core
flow, or inability to identify/restore the release safely. A critical finding
blocks the incident-response gate.

## Sign-off

- Artifact commit match: `pending`
- Rota approved for the operating window: `pending`
- Restricted channel reachable: `pending`
- Stop/rollback thresholds accepted: `pending`
- Open critical findings: `pending`
- Drill result (`PASS`, `BLOCKED`): `PENDING_OWNER_APPROVAL_AND_DRILL`
- Incident commander/date: `pending`
- Release owner decision/date: `pending`

The incident-response gate remains open unless a retained restricted copy is
bound to the same release commit, records `PASS`, names an approved rota and
reachable private channel, applies accepted stop/rollback thresholds, and has
no open critical finding. CI playbook evidence alone cannot satisfy the gate.
