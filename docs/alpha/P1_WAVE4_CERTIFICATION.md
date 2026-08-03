# P1 Wave 4 controlled-alpha certification

**Date:** 2026-08-03  
**Status:** `READY_FOR_P1_CONTROLLED_ALPHA`  
**Branch:** `agent/p1-address-preferred-lines`  
**Commit:** `78c2ca507c3f7e78063896ecb6ebb88bdded2e61`  
**Release:** `rel-20260803T183449Z-78c2ca507c3f`

## Certified scope

- Preferred-line maximization and BetterMTA-owned candidate orchestration on the protected controlled alpha.
- System-filled connectors and structured preferred-line omission explanations.
- Rider-facing `S` label for internal line id `GS`.
- Address/POI implementation remains feature-flagged off on this release. This certification does not authorize flag enablement or cohort expansion.

## Evidence

| Gate | Result |
|---|---|
| Conductor contracts | PASS; all contract fixtures, OpenAPI paths, types, and shared documents validated |
| Routing | PASS; 80 tests passed, 1 intentional skip; typecheck and build passed |
| API | PASS; 109 tests passed, 1 intentional skip; typecheck passed |
| Web | PASS; 79 tests passed, including `GS` to `S`; production live build passed |
| Fixture isolation | PASS; `verify:no-fixtures` found zero fixture markers in the live build |
| P1 fixture gate | PASS; 12 cases, 125 assertions passed, 0 failed |
| Immutable deployment | PASS; release manifest generated and all P1 services healthy |
| Local edge smoke | PASS; 8 passed, 0 failed |
| Protected remote smoke | PASS; authenticated `/health/live` and `/health/ready` returned 200 |
| Preference regression | PASS; GCT to Penn with `7`, `2`, `GS` returned a practical 2-of-3 route with omission explanation and stable order |
| Rollback drill | PASS; restored `rel-20260731T155125Z-cert-distinct`, passed smoke, then restored the intended P1 candidate |

The final live corpus run produced 48 cases: 32 pass, 2 fail, and 14 soft; 441 assertions passed, 2 failed, and 82 were skipped. Both failures are address-origin cases that require address/POI resolution while the release flag remains off. The station-based P1 live case has no failed assertions.

## Defect found and fixed during certification

The first P1 candidate exposed unstable live itinerary fingerprints. Walk fingerprints included OTP-derived `legId`, whose query UUID changes on every request. Commit `78c2ca5` removes that volatile identifier while retaining duration, distance, out-of-system state, leg order, and itinerary-level content in the fingerprint. The regression was reproduced RED, fixed GREEN, verified by the full routing suite, and then verified on the immutable deployed release.

## Rollback and boundaries

- `deployments/previous.env` points to the certified pre-P1 release.
- Volumes were preserved throughout deploy and rollback operations.
- Address/POI flags remain off; enablement still requires a product-owner decision.
- The Access allowlist was not changed.
- The program branch was pushed but not merged to `main`.
- This status is controlled alpha only, not private beta, public beta, or cloud-grade certification.

## Known residuals

- The two live address-origin benchmark cases remain unavailable while address/POI is off.
- Web dependency audit reports four advisories (two high, two critical); remediation remains `FU-NPM-01` and is not bundled into this release.
- Medium/Low Wave 3 residuals remain tracked in `docs/reviews/wave3-gate.md` and must be reassessed before address/POI flag-on.
- Mac logout/reboot recovery remains `FU-ALPHA-01` and requires explicit user approval.

