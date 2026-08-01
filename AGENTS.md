# BetterMTA Agent Instructions

## Required context

Before changing the product or implementation, read:

1. `docs/PROJECT_CONTEXT.md`
2. `docs/PRD.md`
3. `docs/PRODUCT_PRINCIPLES.md`
4. the relevant specialist prompt under `.agents/`

## Product invariant

Given an origin, destination, and selected subway lines, BetterMTA should use every selected line when feasible. When that is not feasible, it should rank routes that use the maximum feasible number of selected lines. Within the same satisfaction level, rank primarily by expected arrival time, then deterministic tie-breakers.

## Workstream rules

- Do not silently change confirmed product decisions.
- Shared contracts have one owner; propose changes rather than editing incompatible assumptions into another layer.
- Keep static GTFS, realtime ingestion, candidate generation, ranking, API, and presentation separable.
- Clearly label mocked, synthetic, stale, or unavailable data.
- Never claim BetterMTA beats another product without benchmark evidence.
- Prefer mature GTFS routing infrastructure before writing a custom routing substrate.
- Keep the public-beta scope narrow: no accounts, native apps, AI chat, social features, or unsupported prediction systems.

## Validation

For substantive changes, run the most relevant unit, integration, contract, benchmark, accessibility, and build checks. Report commands, results, remaining limitations, and production risks.

## Handoffs

Use `.agents/handoff.md` at the end of a workstream and `.agents/review.md` when reviewing another workstream.

## Cursor Cloud specific instructions

This repository is currently documentation/specification-only. There is no application code, dependency manifest (`package.json`, `pyproject.toml`, `requirements.txt`, etc.), test suite, linter config, or build system committed yet. All tracked files are Markdown docs plus `LICENSE` and a (Python-oriented) `.gitignore`.

Consequences for environment setup:

- There is nothing to install, lint, test, build, or run. No dependency-refresh/update script is needed until source code and a manifest are added.
- The prototype/scaffold described in `docs/TECHNICAL_DESIGN.md` (Next.js mobile web client + routing service) is a plan, not present in this repo.
- When code is first added, revisit setup: the intended stack is Next.js (App Router) for the client/BFF and a separate routing service; `.gitignore` suggests Python may be used for data/routing tooling. At that point add the appropriate package manager install step as the update script and document run/test/lint commands here.