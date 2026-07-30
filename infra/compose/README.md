# Compose helpers

Root `docker-compose.yml` is the prod-like local stack.

## data-proxy (socat)

`services/data` currently binds the internal HTTP server to `127.0.0.1` only
(`listenInternalServer` in `internal-server.ts`). Other compose services cannot
reach that address on the Docker bridge.

The `data-proxy` sidecar shares the data container network namespace and listens
on `0.0.0.0:8082`, forwarding to `127.0.0.1:8081`.

- API / OTP updaters use `http://data:8082`
- Host mapping: `localhost:8081` → container `:8082` (proxy)
- Proper fix (data workstream): bind `0.0.0.0` or `BETTERMTA_INTERNAL_HOST` and
  drop the sidecar.

## OTP graph volume

Mount `services/otp/var/otp/graphs` (contains `active.json` +
`<graphVersion>/graph.obj`). Not committed — build via `services/otp/scripts/`.

## Memory

OTP health requires Docker MemTotal ≳ 4 GiB (serve heap 2 g + overhead). Check:

```bash
docker info --format '{{.MemTotal}}'
```
