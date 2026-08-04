# Public-beta incident playbook

**Preparation state:** draft operating contract; not an active on-call rota.

Use this playbook only after an owner approves the public-beta operating model,
private incident channel, and named responders. Do not put rider locations,
credentials, protected hostnames, tester identities, or unredacted request
payloads into tickets or chat.

## 1. Detection

Open an incident from any of these signals:

- search failure or invalid-route reports exceed the release threshold;
- route API p95 exceeds 2,000 ms for the sustained alert window;
- readiness fails, a deploy fails, or public health checks fail;
- realtime age breaches the alert threshold or stale data is presented as live;
- selected-line accounting or route explanations contradict structured legs;
- frontend serious/critical errors spike;
- privacy, secret exposure, access-control, or uncontrolled-cost risk appears.

Record only UTC time, environment label, release ID, coarse symptom, safe
request ID when available, alert name, and reporter role.

## 2. Severity

| Severity | Definition | Initial action |
|---|---|---|
| SEV-0 | Privacy/credential exposure, materially unsafe route output, or widespread false live-data labeling | Stop rollout immediately; disable affected capability or service; begin credential/privacy procedure |
| SEV-1 | Public core flow unavailable, widespread invalid routes, readiness failure, or rollback-required deploy failure | Page the approved on-call owner; stop rollout; prepare rollback |
| SEV-2 | Material degradation with a safe workaround, sustained latency breach, or limited incorrect line claims | Freeze expansion; assign incident lead; mitigate within the agreed response window |
| SEV-3 | Localized defect with no safety/privacy impact and an honest workaround | Track, triage, and fix through the normal release process |

## 3. Roles

- **Incident commander:** the release owner on duty; owns severity, stop/go, and
  recovery decisions.
- **Operations lead:** inspects health, metrics, immutable release IDs, and
  rollback/restore actions.
- **Product/routing lead:** validates route correctness, selected-line claims,
  data freshness, and user-facing limitations.
- **Communications lead:** posts approved internal/public updates without
  protected data or unsupported claims.
- **Scribe:** maintains the UTC timeline and evidence inventory.

One person may hold multiple roles for an on-call-lite window, but incident
commander and action owner must always be explicit.

## 4. Stop conditions

Stop a rollout or cohort expansion immediately for:

- any topology-invalid route or materially incorrect selected-line claim;
- stale/synthetic/schedule data labeled live;
- a privacy or credential exposure;
- repeated readiness failures or an unbounded error-rate increase;
- sustained route p95 above 2,000 ms under the agreed workload;
- loss of rollback capability or uncertainty about the running image set;
- uncontrolled spend, runaway traffic, or more API replicas than the proven
  shared rate-limit architecture supports;
- public TLS/origin failure or critical core-flow accessibility regression.

Do not wait for a fixed number of reports when one report proves a critical
correctness, privacy, or data-honesty failure.

## 5. Response

1. Acknowledge, assign severity/roles, freeze rollout, and record UTC time.
2. Identify the exact release IDs and whether the four-service set is mixed.
3. Check liveness, readiness, status, feed age, request/error metrics, and the
   relevant benchmark or reproduction fixture.
4. Apply the narrowest safe feature disablement when it restores honesty.
5. If the release is implicated, use the recorded immutable-image manifest and
   guarded rollback command; never rebuild old source as a rollback substitute.
6. Verify data/API/web health and the core route smoke after rollback.
7. Rotate affected credentials through the approved secret path when exposure
   is suspected; never paste values into the incident record.
8. Preserve evidence, communicate status, and keep the incident open until the
   recovery criteria pass.

## 6. Communications

- Use only the owner-approved private incident/support channel until a public
  channel and message owner exist.
- State observed impact, affected capability, current mitigation, and next UTC
  update time. Distinguish confirmed facts from investigation.
- Do not name testers, expose locations/hostnames/tokens, blame providers, or
  claim comparative superiority.
- Public copy must say when realtime is stale/unavailable and when the product
  is operating in a reduced mode.

## 7. Recovery

The incident commander may resume a rollout only when:

- the exact running release set is recorded and healthy;
- readiness/status and public health checks pass;
- the triggering route/error/privacy condition is no longer reproducible;
- rollback remains available;
- latency/error/feed-age signals are within thresholds for the observation
  window;
- limitations and degraded-state copy are accurate;
- a follow-up owner and deadline are recorded for every residual risk.

Re-expansion is a separate decision from technical recovery.

## 8. Evidence

Retain a privacy-safe incident artifact containing:

- incident ID, severity, UTC timeline, environment label, release IDs;
- alert names and aggregate metric snapshots without protected origins;
- safe request IDs or sanitized fixture IDs;
- rollback manifest hash, action timestamps, and health/smoke results;
- decision owner, recovery criteria, residual risks, and follow-up actions.

Hash the final artifact before attaching it to release evidence. Store live
incident records in the approved restricted system, not this repository.
