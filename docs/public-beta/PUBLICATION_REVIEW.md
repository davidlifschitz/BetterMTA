# BetterMTA public-beta publication review

**Current status:** `PENDING_PUBLICATION_REVIEW`

This protocol is a human review record, not an approval or publication. The
automated claims scan and its CI artifact cannot authorize comparative copy,
public release, or a claims-discipline gate pass.

## Scope and prerequisites

- [ ] Record the full reviewed release commit: `____________________________`
- [ ] Record the CI claims artifact: `____________________________`
- [ ] Confirm the scan artifact and review target refer to the same commit.
- [ ] Confirm the reviewer has the publication inventory, benchmark methodology,
      limitations/attribution copy, and current risk register.
- [ ] Stop and record `BLOCKED` if any publishable surface, benchmark contract,
      attribution requirement, or limitation cannot be reviewed.

## Publication inventory

- [ ] Review the candidate `/limitations` route and planner-footer link.
- [ ] Review all publishable web copy under `apps/web/src`.
- [ ] Review `docs/public-beta/LIMITATIONS.md` as the source limitations copy.
- [ ] Confirm the explicit non-claim appears in both the source limitations
      document and the rendered `apps/web/src/app/limitations/page.tsx`.
- [ ] Confirm the rendered-page wording is actual JSX text inside the
      single `LimitationsPage` return, not unused JSX, a line/block comment, or
      test-only copy.
- [ ] Confirm no draft, fixture, internal-only, or unsupported surface is being
      presented as published public-beta copy.

## Claims classification

- Automated named-competitor scan: `PASS` only for the checked commit.
- Explicit public non-claim wording: present in the checked limitations copy.
- Route-set baseline wording such as `~N min faster than fastest baseline` is an
  internal constrained-route comparison, not a named-competitor claim.
- Comparative superiority claims are `NOT_AUTHORIZED` unless this review
  records the methodology, corpus, comparator treatment, and reproducible
  evidence for the exact statement.

## Benchmark evidence

- [ ] Review `benchmarks/README.md`.
- [ ] Review `benchmarks/docs/HUMAN_REVIEW.md`.
- [ ] Review `benchmarks/docs/CI_QUALITY_GATES.md`.
- [ ] Confirm each methodology path is a regular, nonempty, non-symlink file
      with the required headings/markers.
- [ ] Confirm any comparative statement is supported by the applicable corpus,
      invariant checks, human review, and reproducible methodology.
- [ ] Confirm internal benchmark names are not used as public superiority claims.

## Limitations and attribution

- [ ] Confirm NYC subway-first scope and unsupported modes are stated clearly.
- [ ] Confirm stale, schedule-only, synthetic, unavailable, and incomplete
      information is labeled honestly.
- [ ] Confirm the explicit non-claim wording and MTA attribution/disclaimer are
      accurate for the proposed release.
- [ ] Confirm no precise trip locations, preference history, secrets, private
      endpoints, or tester identities appear in public copy or evidence.

## Findings

Record only observed findings for the reviewed commit. Do not infer approval from
the automated scan.

- Status: `PENDING`
- Open findings: `__________________________________________________________`
- Required corrections: `___________________________________________________`
- Reviewer notes: `__________________________________________________________`

## Sign-off

- Claims reviewer: `____________________________`  Date: `________________`
- Product owner: `______________________________`  Date: `________________`
- Legal/attribution reviewer, if required: `________________`  Date: `________`
- Publication decision: `PENDING` / `APPROVED` / `BLOCKED`
- Comparative claims authorization: `NOT_AUTHORIZED` until explicitly recorded
  above for the exact release and statement.
