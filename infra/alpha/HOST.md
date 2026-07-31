# Controlled alpha — macOS host requirements (Phase 12A.5)

**Owner:** Infrastructure  
**Related:** ADR-0021, `infra/alpha/README.md`, `infra/alpha/TUNNEL.md`, `infra/alpha/ACCESS.md`  
**Scope:** Operating requirements for the self-hosted macOS + Docker Compose origin. No secrets.

Availability for controlled alpha depends on **home power, home internet, Docker, and the Mac staying awake**. This is not cloud-grade HA — document that honesty to testers.

## Preflight (read-only)

```bash
./infra/alpha/scripts/preflight-host.sh
```

The script **reports** power, sleep, disk, Docker, containers, tunnel process presence, and local/public health. It does **not** change Energy Saver, sleep, or other privileged settings. Public health runs only when `ALPHA_PUBLIC_BASE_URL` and Access service-token env vars are set; otherwise it prints `skipped`.

## Operating requirements

### Docker at login

- Docker Desktop (or Colima + Docker CLI) must start for the **deployment user** at login.
- Prefer Docker Desktop → Settings → General → **Start Docker Desktop when you log in**.
- Confirm with `docker info` after a fresh login before a tester window.

### Docker VM memory / disk

- OTP + data + api + web need substantial RAM. Observed working allocation on this project: **~12 GiB** Docker/Colima MemTotal (Phase 8–9 smoke after Colima `--memory 12`).
- Smaller allocations (~2 GiB) fail OTP serve. Prefer **≥12 GiB** memory for alpha windows.
- Leave enough **host free disk** for images, volumes, GTFS static trees, and OTP `graph.obj` (multi‑GB). Preflight reports free disk; treat low free space as a blocker before graph rebuilds.

### Resource Saver

- Docker Desktop **Resource Saver** must **not** suspend the VM mid-window and surprise-kill OTP/API.
- During an alpha testing window: disable Resource Saver, or set a long idle threshold that will not fire during the session.
- Confirm in Docker Desktop → Settings → Resources (wording varies by Desktop version).

### Power and sleep

During an active testing window the Mac must stay powered and awake:

| Check | Guidance |
|---|---|
| Power source | Prefer AC power; avoid battery-only alpha windows |
| Display / system sleep | Prevent sleep for the window (Energy Saver / Battery settings) |
| `caffeinate` | Recommended during the window (see manual settings below) |
| Lid | Prefer open lid or clamshell with external power + display if that is your known-good setup |

Preflight prints `pmset -g` / battery info when available. It does **not** run `caffeinate` or change `pmset`.

### Network reconnection recovery

After Wi‑Fi or ISP blips:

1. Confirm local edge: `curl -fsS http://127.0.0.1:8088/health/live`
2. Confirm Docker still healthy: `docker-compose -f docker-compose.yml -f docker-compose.alpha.yml ps`
3. Confirm `cloudflared` is running (see `TUNNEL.md`); restart the tunnel service if the connector dropped
4. Re-check public health only via Access (service token or browser OTP) — never open router ports

Compose services use `restart: unless-stopped`; tunnel may need a service restart after prolonged offline periods.

### Docker volumes persist

- Alpha tear-down uses `down` **without** `-v` (`stop-alpha.sh`) so bind-mounted **data** and **OTP graphs** persist.
- Do not delete `services/data/var/data/**` or `services/otp/var/otp/graphs/**` casually between windows.
- Rebuilds are expensive; keep prior `active.json` targets until the new graph validates.

### Automatic macOS updates

- Automatic updates must **not** reboot mid-window.
- Prefer: System Settings → General → Software Update → defer/disable automatic download+install/restart for the testing day, or complete updates before the window.
- Preflight cannot enforce this; operators must verify manually.

### Dedicated macOS user (preferred)

- Prefer a dedicated local macOS user for alpha (Docker login item, cloudflared service, limited personal files).
- Reduces accidental exposure of personal home directories and conflicting Desktop/Colima configs.

### Do not broadly expose home directories to Docker

- Do **not** grant Docker Desktop full access to personal `~/Documents`, Photos, or unrelated home trees “just in case.”
- Compose already bind-mounts project paths under the repo (`services/*/var/...`). Keep file sharing limited to what the stack needs.
- Never mount credential stores or `~/.cloudflared/*.json` into application containers.

## Manual settings that remain required

Preflight is read-only. Before each alpha window, the operator should still:

1. **Plug in AC power** (or accept battery risk consciously).
2. **Disable or extend sleep** — System Settings → Battery / Energy Saver: prevent display/system sleep for the window; optionally `caffeinate -dims &` (or equivalent) for the session.
3. **Confirm Docker starts at login** and is running (`docker info`).
4. **Confirm Docker memory ~≥12 GiB** and Resource Saver will not interrupt the window.
5. **Confirm Software Update** will not force a reboot during the window.
6. **Confirm free disk** is adequate for images + graphs.
7. **Start alpha stack** (`./infra/alpha/scripts/start-alpha.sh`) and **tunnel** (`TUNNEL.md`) only when ready for testers. After a release deploy, prefer these start/stop scripts — they auto-pick `deployments/current.env` + `docker-compose.release.yml` so image pins are preserved (alpha-only compose would silently use `:local`).
8. **Confirm Access allowlist** is current (`ACCESS.md`) — never commit tester emails.

## Related scripts

| Script | Role |
|---|---|
| `scripts/preflight-host.sh` | Read-only host / Docker / tunnel / health report |
| `scripts/start-alpha.sh` | Compose up + wait + edge smoke (release pins when `deployments/current.env` exists) |
| `scripts/stop-alpha.sh` | Compose down (volumes preserved; same release-pin selection as start) |
| `scripts/smoke-edge.sh` | Local edge HTTP smoke (no Cloudflare) |
