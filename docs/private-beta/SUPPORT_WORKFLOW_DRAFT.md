# BetterMTA private-beta support workflow — draft

**Status:** Operator draft; no support channel or cohort has been activated.
**Owner:** Product/operations owner, with engineering escalation.
**Privacy authority:** `PRIVACY_POLICY_DRAFT.md` and ADR-0017.

## Activation prerequisites

- Select an owner-controlled **private** support channel and backup contact outside Git.
- Publish the owner-approved privacy policy and support hours to invited riders.
- Configure log retention and alert delivery; do not claim either from checked-in rules.
- Confirm who can access support reports and operational logs.
- Keep in-product feedback disabled until ADR-0017 is reopened with a reviewed transport.
- Run the hosted preflight and rollback drill before expanding to 5–10 riders.

Public GitHub issues are not a trip-support intake channel. They can expose travel patterns
and cannot guarantee deletion. A public issue may describe a reproducible code defect only
after removing trip-specific and identity data.

## Safe intake

Ask for the minimum information needed:

1. BetterMTA request ID, if visible.
2. Approximate time window and timezone.
3. What the rider expected and what happened.
4. Selected subway line labels.
5. Station names only when the rider is comfortable sharing them.
6. Whether the issue repeats.

Never request a full home/work address, precise coordinate, access token, cookie, private
Fly/Access hostname, tester email, or screenshot containing sensitive location data. If a
rider sends one, restrict access, redact the working record, and delete the original when
the approved channel permits.

## Triage and response targets

Targets are proposed private-beta goals, not measured SLOs.

| Severity | Examples | Initial target | Required action |
|---|---|---:|---|
| SEV-0 | Privacy/security exposure; credentials; widespread dangerous route guidance | 30 min during staffed window | Stop cohort, restrict access, preserve minimal evidence, invoke incident owner |
| SEV-1 | Repeated invalid route; false preferred-line claim; widespread readiness/stale-data failure | 2 hours | Disable affected flag or rollback; open incident ledger; notify cohort |
| SEV-2 | One-off route defect, timeout cluster, accessibility blocker | 1 business day | Reproduce with request ID/fixture; assign owner and workaround |
| SEV-3 | Copy, feature request, isolated confusion | 3 business days | Backlog or answer; do not promise scope expansion |

## Operator procedure

1. Copy the shape from `SUPPORT_LOG_TEMPLATE.md` into the owner-restricted support
   ledger, then create one row there with a non-identifying case ID. Never record a live
   case in the repository template.
2. Remove unneeded personal/location data before copying anything into engineering tools.
3. Correlate by request ID and time window. Do not search by tester identity when request
   evidence is sufficient.
4. Classify data mode, feed age, selected-line satisfaction, candidate coverage, latency,
   and whether the report reproduces against current or retained inputs.
5. For invalid routes, follow `docs/RUNBOOKS.md` and preserve exact contract/runtime
   versions without retaining the rider's raw address.
6. For geocoder failures, disable `address_poi_enabled` before changing provider or
   retention behavior.
7. For SEV-0/SEV-1, freeze cohort expansion. Choose mitigation: flag-off, maintenance,
   or coordinated immutable-image rollback.
8. Verify recovery through health/readiness/status, a known station trip, and the relevant
   preferred-line/PlaceRef regression.
9. Close with rider-safe wording, record the evidence path and deletion date, and add a
   durable regression test when a product defect is confirmed.

## Stop and rollback conditions

- Any confirmed privacy leak, secret exposure, or support-channel misdelivery.
- Repeated invalid routes or incorrect claims that all preferred lines were used.
- Widespread stale/unavailable data presented as live.
- Sustained readiness failure, timeout/error spike, or uncontrolled provider cost.
- Address/POI tokens failing across replicas, resolving after expiry, or appearing in logs.

Rollback uses a pre-deploy four-image manifest and
`infra/fly/scripts/rollback-private-beta.sh`; it does not revert secrets, volumes, data,
or platform configuration. If configuration caused the incident, restore that separately
under owner control and verify again.

## Review cadence

- Review open SEV-0/1 daily and all cases weekly during private beta.
- Report counts and themes, not rider identities or raw trips.
- Reassess cohort size only after the weekly review finds no open privacy issue, no
  critical route defect, acceptable availability/latency, and sufficient support capacity.
