# Controlled alpha — performance evidence (Phase 12A.12 + final certification)

**Local sample date:** 2026-07-30  
**Remote Access sample date:** 2026-07-31 (final certification)  
**Not a competitor benchmark.** Do **not** claim Google / Apple / Citymapper superiority (G20).  
**Not a general SLO** from these small samples.

## A. Local edge sample (historical)

| Field | Value |
|---|---|
| Endpoint | `POST /v1/routes/search` through edge `http://127.0.0.1:8088` |
| Case | Carroll St → Bryant Park, line `F` |
| PlaceRefs | `st:F21` → `st:D16` |
| n | 15 |
| HTTP errors | 0 |
| p50 | 42 ms |
| p95 | 1170 ms |
| max | 1467 ms |
| `dataMode` | live ×15 |

## B. Authenticated remote sample through Cloudflare Access (certification)

| Field | Value |
|---|---|
| Path | Public base URL + Access service-token headers |
| Case | Same PlaceRefs / line `F` |
| n | 15 sequential |
| HTTP failures | **0** |
| p50 | **138 ms** |
| p95 | **641 ms** |
| max | **2700 ms** |
| `dataMode` distribution | live ×15 |

### Capacity snapshot (during remote sample)

| Container | CPU% | Memory |
|---|---|---|
| web | ~0% | ~106 MiB |
| api | ~2% | ~36 MiB |
| otp | ~33% | ~1.47 GiB / 3.5 GiB limit |
| data | ~138% (burst) | ~1.86 GiB |
| edge | ~0% | ~12 MiB |
| data-proxy | ~2% | ~3 MiB |

| Host disk | ~14 GiB avail (Data volume; ~94% used) |
| Tunnel err lines (last 200 log lines) | 36 historical ERR-ish lines in LaunchAgent stderr (not correlated with sample failures; sample had 0 HTTP failures) |

## Residual product risk (unchanged)

OTP currently may issue one eight-itinerary plan family without line-biased variants. Multi-line diversity remains an open product/engine risk — not closed by this sample.

## Limitations

- Single OD / single line / single host.  
- No concurrent load; not G15 beta-load closure.  
- Remote sample includes Access + Tunnel RTT; still not an SLO.  
- No competitor comparison.
