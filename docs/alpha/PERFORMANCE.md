# Controlled alpha — local edge latency sample (Phase 12A.12)

**Date:** 2026-07-30  
**Scope:** Bounded **local** sample via edge `http://127.0.0.1:8088` only.  
**Not a competitor benchmark.** Do **not** claim Google / Apple / Citymapper superiority (G20).

## Method

| Field | Value |
|---|---|
| Endpoint | `POST /v1/routes/search` through edge |
| Case | Carroll St → 42 St-Bryant Pk, line `F` |
| PlaceRefs | `st:F21` → `st:D16` (no coordinates shipped) |
| Samples | **15** sequential requests (~0.3 s apart) |
| Stack | Alpha compose after 12A.11 rollback recreate |
| Status during sample | `dataMode=live`, static `mta-subway-c9c3366cdd16`, rtAge ~40 s |

## Results

| Metric | Value |
|---|---|
| n | 15 |
| HTTP errors | **0** (15× 200) |
| p50 latency | **42 ms** |
| p95 latency | **1170 ms** |
| max latency | **1467 ms** |
| min latency | **40 ms** |
| mean latency | **267 ms** |
| `dataMode` | **live** on all 15 |
| Static version | `mta-subway-c9c3366cdd16` on all 15 |

Per-sample latencies (ms): 1043, 53, 47, 548, 41, 42, 40, 1467, 473, 46, 40, 40, 41, 41, 41.

Fast samples (~40 ms) are consistent with warm/cache hits after the first slower search; slower samples (0.5–1.5 s) reflect cold or partial-miss path through OTP/API. This is **not** a load test and **not** G15 beta-load closure.

## Coherence / honesty spot-check

Immediately after the sample:

```text
MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh
→ 6 passed, 0 failed; dataMode=live
→ route smoke constrained=3 baseline=3 complete=True
→ status.staticDatasetVersion == route.staticDatasetVersion
```

## Limitations

- Single OD / single line / single host — not multi-OD diversity.  
- No concurrent load; no Access/Tunnel RTT.  
- Host disk was tight (~3 Gi free); sample avoided builds.  
- G15 (route search p95 under beta load) remains **not closed** for public beta.  
- No comparison to any third-party journey planner.

## Related

- Reliability drills: `docs/alpha/RELIABILITY_DRILLS.md`  
- Gate report: `docs/RELEASE_GATE_REPORT.md` (G15 / G20)  
- Prior live smoke latency (Phase 9): ~2107 ms Carroll→Bryant on compose `:8080`
