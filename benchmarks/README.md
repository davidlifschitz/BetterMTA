# BetterMTA Benchmarks

QA-owned corpus, invariant runner, and release gates. See `docs/TESTING_STRATEGY.md`.

## Quick start

```bash
npm --prefix benchmarks/runner install
npm --prefix benchmarks/runner run validate-cases
npm --prefix benchmarks/runner run run-benchmarks
npm --prefix benchmarks/runner run self-test
npm --prefix benchmarks/runner run gate
```

## P1 acceptance suite (Wave 1E)

See [`docs/P1_ACCEPTANCE_MATRIX.md`](docs/P1_ACCEPTANCE_MATRIX.md).

```bash
# Hard P1 fixture/oracle subset (no soft/pending)
npm --prefix benchmarks/runner run gate -- --subset ../p1-ready-subset.json
```

## SUT selection

| Mode | How | Behavior |
|---|---|---|
| `fixture` (default) | `BETTERMTA_SUT=fixture` or omit; `--sut fixture` | Disk fixtures: conductor / QA / `recorded-responses/` |
| `live` | `BETTERMTA_SUT=live` or `--sut live` | HTTP `POST /v1/routes/search` for `classification=live` / `sut.kind=live`; other cases still use fixtures |

```bash
# Fixture corpus (CI default)
npm --prefix benchmarks/runner run run-benchmarks

# Live smoke (+ shadow report under benchmarks/reports/live-shadow-*.{json,txt})
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:8080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live

# Host-native API fallback
BETTERMTA_SUT=live BETTERMTA_LIVE_API_BASE=http://127.0.0.1:3080 \
  npm --prefix benchmarks/runner run run-benchmarks -- --sut live
```

`BETTERMTA_LIVE_API_BASE` defaults to `http://127.0.0.1:8080` (compose). Prefer compose; fall back to `:3080` for host-native.

Live PlaceRefs are sent as `{ placeId }` only (stationId mapped to `st:<id>`). No third-party scraping.

## Notes

- Tooling lives under `benchmarks/` only (no repo-root `package.json`).
- Conductor `contracts/**` are consumed read-only.
- Synthetic fixtures are never verified real-world outcomes.
- `recorded_data` uses captured responses under `fixtures/recorded-responses/` — never label synthetic as recorded.
- Internal name “Beat Google 100” is not a superiority claim.
- Gate emits `benchmarks/reports/release-gate-<timestamp>.md` (Fly BLOCKED / Google NOT_CLAIMED do not fail the gate alone).
