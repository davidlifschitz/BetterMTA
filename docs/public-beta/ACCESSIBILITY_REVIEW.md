# Human accessibility review

**Current status:** `PENDING_HUMAN_REVIEW`

This is the Stage F review template, not completed accessibility evidence. Copy
it under the approved, gitignored `infra/public-beta/evidence/accessibility/`
root for a specific release. Do not commit a target hostname, reviewer contact
details, credentials, precise rider coordinates, or assistive-technology logs
that contain private data.

## Scope and prerequisites

- [ ] Record the full reviewed release commit: `____________________________`
- [ ] Record the automated artifact name: `_______________________________`
- [ ] Confirm the artifact commit equals the reviewed release commit.
- [ ] Confirm automated status is `AUTOMATED_PASS_HUMAN_PENDING` and the listed
      keyboard, mobile-target, and axe checks passed.
- [ ] Use an owner-approved candidate target. Record only its target class in
      this copy (`local`, `private-preview`, or `public-candidate`).
- [ ] Stop and record `BLOCKED` if the core flow cannot be completed without
      assistance or if a critical accessibility failure is found.

## Environment

| Field | Recorded value |
|---|---|
| Review ID | `pending` |
| Review date/time | `pending` |
| Reviewer | `pending` |
| Target class | `pending` |
| Release commit | `pending` |
| Automated artifact | `pending` |
| OS and browser | `pending` |
| Viewport / zoom | `pending` |
| Screen reader and version | `pending` |
| Reduced-motion setting | `pending` |

## Core flow

- [ ] Enter and select an origin and destination without instruction.
- [ ] Exercise location permission grant and denial; denial remains recoverable.
- [ ] Select and clear preferred lines before search; name, role, value, and
      selected state are understandable without relying on color.
- [ ] Submit a route search and understand result ordering, arrival/duration,
      line sequence, walking, waits, transfers, and preference satisfaction.
- [ ] Understand partial satisfaction and named omitted lines.
- [ ] Understand stale, schedule-only, unavailable, timeout, and no-route states.
- [ ] Reach and return from public-beta limitations without losing the trip.

## Keyboard

- [ ] Logical tab order follows the visual/core-flow order.
- [ ] Every interactive control has a visible focus indicator.
- [ ] Autocomplete options can be opened, traversed, selected, and dismissed.
- [ ] Preferred-line controls expose and change pressed state from the keyboard.
- [ ] No keyboard trap or hover-only critical action exists.
- [ ] Focus moves or remains predictably after submit, error, and result updates.

## Screen reader

- [ ] Page title, headings, landmarks, and form labels describe purpose/order.
- [ ] Origin/destination suggestions announce expansion, count/state, and choice.
- [ ] Permission, loading, freshness, error, and result updates are announced
      without excessive repetition.
- [ ] Preferred-line names and selected states are distinguishable.
- [ ] Route cards read in a useful order and include satisfaction/omission copy.
- [ ] Limitations and MTA attribution links have understandable names.

## Visual and motion

- [ ] Primary controls and line toggles meet the 44 px target expectation.
- [ ] Text and meaningful non-text contrast have no critical failure.
- [ ] The core flow remains usable at 200% zoom and narrow mobile width without
      clipped controls or required horizontal scrolling.
- [ ] Meaning is not conveyed by color alone.
- [ ] Reduced-motion preference does not hide content or block the core flow.
- [ ] Error, focus, selected, stale, and degraded states remain distinguishable.

## Findings

Severity definitions: `critical` blocks an essential task or makes content
unavailable; `high` causes a major barrier with no reasonable workaround;
`medium` has a workaround but materially harms use; `low` is localized polish.

| ID | Severity | Screen / step | Finding | Reproduction | Owner | Resolution |
|---|---|---|---|---|---|---|
| `pending` | `pending` | `pending` | `pending` | `pending` | `pending` | `open` |

## Sign-off

- Automated artifact commit match: `pending`
- Open critical findings: `pending`
- Open high findings accepted by owner: `pending`
- Reviewer result (`PASS`, `BLOCKED`): `PENDING_HUMAN_REVIEW`
- Reviewer/date: `pending`
- Release owner decision/date: `pending`

The accessibility gate remains open unless the retained review copy is bound to
the same release commit, records `PASS`, and has no open critical core-flow
failure. Automated axe results alone cannot satisfy this requirement.
