# Public-beta privacy and support approval

**Current status:** `PENDING_OWNER_LEGAL_AND_OPERATIONAL_APPROVAL`

This is the Stage F approval template, not a published privacy policy, active
support channel, retention proof, or legal determination. Copy it into the
approved restricted evidence store for a specific release. Do not commit
support contacts, responder identities, channel names, protected hostnames,
credentials, tester/rider identities, precise locations, request payloads, or
private provider configuration.

## Scope and prerequisites

- [ ] Record the full reviewed release commit: `____________________________`
- [ ] Record the CI privacy/support artifact: `_____________________________`
- [ ] Confirm the artifact commit equals the release commit and its status is
      `CONTROLS_PASS_APPROVAL_CHANNEL_PENDING`.
- [ ] Record only the approved environment class (`private-preview` or
      `public-candidate`), never its hostname.
- [ ] Owner identifies the policy reviewer, operations owner, support owner,
      and restricted evidence store outside Git.
- [ ] Stop and record `BLOCKED` if deployed provider, retention, access,
      deletion, or support configuration cannot be verified.

## Deployed configuration

| Field | Recorded value |
|---|---|
| Approval ID | `pending` |
| UTC review time | `pending` |
| Environment class | `pending` |
| Release commit | `pending` |
| Privacy/support artifact | `pending` |
| Address/POI feature state | `pending` |
| Feedback transport state | `pending` |
| Error-tracking class/state | `pending` |
| Ordinary log retention | `pending` |
| Incident evidence retention | `pending` |
| Support-hours class | `pending` |

Record exact contacts, provider accounts, endpoints, credentials, and access
lists only in the restricted operating system.

## Policy and providers

- [ ] The policy scope matches the enabled product: no accounts, profiles,
      payments, advertising, or feedback transport unless separately approved.
- [ ] An effective date and support route are present in the publishable copy.
- [ ] Every active hosting/network, transit-data, geocoder, analytics, and
      error-tracking provider is accurately disclosed with appropriate terms.
- [ ] Processing purposes, optional location/address behavior, PlaceRef/cache
      lifetimes, and rider choices match the deployed configuration.
- [ ] The policy does not claim retention, deletion, security, or provider
      behavior that has not been verified in the target environment.

## Retention and deletion

- [ ] Deployed ordinary-log retention matches the approved limit.
- [ ] Incident-evidence retention matches the approved limit and restricted
      access policy.
- [ ] Aggregate counters exclude raw trip input, precise coordinates, IPs,
      encrypted PlaceRefs, and rider identifiers.
- [ ] A bounded deletion request can be located by safe request ID/time window,
      completed where practicable, and recorded without retaining the original.
- [ ] Caches and PlaceRefs expire as documented; no durable rider-history store
      or hidden feedback store is active.
- [ ] Retention/deletion evidence is attached by restricted reference and hash.

## Support operations

- [ ] The owner-controlled private support channel and backup route are
      reachable; their identifiers are not copied here.
- [ ] Support hours, severity targets, primary response owner, engineering
      escalation, and privacy authority are approved.
- [ ] The restricted ledger uses non-identifying case IDs and the committed
      support-log shape.
- [ ] Intake asks only for the minimum safe fields and never requests a full
      address, precise coordinate, token, cookie, private origin, tester email,
      or unrestricted screenshot.
- [ ] SEV-0/1 stop, incident, flag-disable, immutable-image rollback, recovery,
      rider response, deletion, and review-cadence procedures are understood.

## Privacy and access controls

- [ ] Runtime privacy tests pass for raw address/query/vendor/coordinate/secret
      redaction, opaque PlaceRef exclusion, and selected-line counts without IDs.
- [ ] Operational logs follow the forbidden-fields contract and deployed access
      is least privilege.
- [ ] Deployment keys and provider credentials use the approved secret path;
      no values appear in evidence.
- [ ] Address/POI remains disabled unless provider attribution, key lifecycle,
      rate limiting, and deployed retention/observability are approved.
- [ ] A confirmed privacy leak, secret exposure, or support misdelivery freezes
      expansion and invokes the incident workflow.

## Findings

| ID | Severity | Finding | Evidence | Owner | Resolution |
|---|---|---|---|---|---|
| `pending` | `pending` | `pending` | `pending` | `pending` | `open` |

An inaccurate public policy, unenforced retention claim, inaccessible deletion
path, unapproved support intake, protected-data leak, or missing response owner
is critical and blocks the privacy/support gate.

## Sign-off

- Artifact commit match: `pending`
- Owner policy approval: `pending`
- Legal/privacy review disposition: `pending`
- Deployed retention enforcement verified: `pending`
- Private support channel reachable: `pending`
- Response owner and backup assigned: `pending`
- Open critical findings: `pending`
- Result (`PASS`, `BLOCKED`): `PENDING_OWNER_LEGAL_AND_OPERATIONAL_APPROVAL`
- Product/operations owner and date: `pending`
- Release owner decision and date: `pending`

The privacy/support gate remains open unless a retained restricted copy is bound
to the same release commit, records `PASS`, verifies deployed retention and
deletion behavior, records owner/legal disposition, confirms the private
support path and response owners, and has no open critical finding. CI controls
evidence alone cannot satisfy the gate.
