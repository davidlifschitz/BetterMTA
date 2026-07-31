# Proposal note: Live HTTP SUT + shadow reports (Phase 9)

**Owner:** Benchmark / QA  
**Status:** Implemented in QA-owned paths (no contract change)  
**Date:** 2026-07-30

## Summary

Added `LiveSystemUnderTest` (`POST /v1/routes/search`) selectable via `BETTERMTA_SUT=live|fixture` and `--sut`. Recorded NYC responses live under `benchmarks/fixtures/recorded-responses/` with `classification=recorded_data`. Live smoke uses `classification=live`. Shadow reports and a 20-item release-gate markdown checklist are QA artifacts only.

## Contract impact

None. PlaceRefs sent as `{ placeId }` only, matching existing request schema.

## Honesty rules

- Never label synthetic fixtures as `recorded_data`.
- Google/Apple/Citymapper superiority remains **NOT_CLAIMED**.
- Fly deploy gates remain **BLOCKED/PENDING** and do not fail the merge gate alone.
