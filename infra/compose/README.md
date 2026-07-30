# Compose helpers

Root `docker-compose.yml` is the prod-like local stack.

## data-proxy (socat)

`services/data` defaults `BETTERMTA_DATA_BIND_HOST` to `127.0.0.1`
(`listenInternalServer` in `internal-server.ts`). Other compose services cannot
reach that address on the Docker bridge, so compose keeps the loopback default.

The `data-proxy` sidecar shares the data container network namespace and listens
on `0.0.0.0:8082`, forwarding to `127.0.0.1:8081`.

- API / OTP updaters use `http://data:8082`
- Host mapping: `localhost:8081` → container `:8082` (proxy)
- Fly activate: set `BETTERMTA_DATA_BIND_HOST=0.0.0.0` (already in `infra/fly/data.fly.toml`)
  so private peers can reach `:8081` without socat.

## OTP graph volume

Mount `services/otp/var/otp/graphs` (contains `active.json` +
`<graphVersion>/graph.obj`). Not committed — build via `services/otp/scripts/`.

## Memory

OTP health requires Docker MemTotal ≳ 4 GiB (serve heap 2 g + overhead). Check:

```bash
docker info --format '{{.MemTotal}}'
```
