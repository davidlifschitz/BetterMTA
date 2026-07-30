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

## Notes

- Tooling lives under `benchmarks/` only (no repo-root `package.json`).
- Conductor `contracts/**` are consumed read-only.
- Synthetic fixtures are never verified real-world outcomes.
- Internal name “Beat Google 100” is not a superiority claim.
