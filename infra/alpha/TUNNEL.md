# Controlled alpha — Cloudflare Tunnel (Phase 12A.6)

**Owner:** Infrastructure  
**Related:** ADR-0021, `infra/alpha/HOST.md`, `infra/alpha/ACCESS.md`, `infra/alpha/cloudflared/config.template.yml`  
**Hard constraint:** Named tunnel only. **No** Quick Tunnel. **No** router port forwarding.

## Security (non-negotiable)

- Never commit tunnel UUID, hostname, credentials JSON, certificates, or Access tokens.
- Real config lives **outside** the repo, e.g. `~/.cloudflared/config.yml` or `/etc/cloudflared/config.yml`.
- This repo ships only `infra/alpha/cloudflared/config.template.yml` with placeholders:
  - `<TUNNEL_UUID>`
  - `<LOCAL_CREDENTIAL_FILE>`
  - `<ALPHA_HOSTNAME>`
- The operator must perform **interactive** Cloudflare login and dashboard actions. Agents must not ask you to paste credentials into chat.

## Target ingress (template)

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: <LOCAL_CREDENTIAL_FILE>
ingress:
  - hostname: <ALPHA_HOSTNAME>
    service: http://127.0.0.1:8088
  - service: http_status:404
```

Origin is the alpha edge Caddy on loopback (`infra/alpha/README.md`). Nothing else should be published on `0.0.0.0` for alpha.

## Install cloudflared (macOS)

```bash
# Homebrew (preferred)
brew install cloudflared

cloudflared --version
```

Or download the official Cloudflare package for macOS and place `cloudflared` on `PATH`.

## Authenticate (interactive — you must do this)

```bash
cloudflared tunnel login
```

This opens a browser to select the Cloudflare account/zone and writes a cert under `~/.cloudflared/` (local only; never copy into Git).

## Create a named tunnel

```bash
cloudflared tunnel create <TUNNEL_NAME>
```

Note the printed **tunnel UUID** and credentials path locally (password manager / secure notes — **not** the repo). Example credential path shape (do not commit):

```text
~/.cloudflared/<TUNNEL_UUID>.json
```

## Create DNS route

Point a hostname in your Cloudflare zone at the named tunnel:

```bash
cloudflared tunnel route dns <TUNNEL_NAME> <ALPHA_HOSTNAME>
```

Or create the CNAME in the Cloudflare dashboard to the tunnel target Cloudflare documents for named tunnels. Confirm the hostname in DNS before testers arrive.

## Install local config (outside repo)

```bash
mkdir -p ~/.cloudflared
cp infra/alpha/cloudflared/config.template.yml ~/.cloudflared/config.yml
# Edit ~/.cloudflared/config.yml — replace placeholders only on this machine
```

Validate placeholders are gone:

```bash
grep -E '<TUNNEL_UUID>|<LOCAL_CREDENTIAL_FILE>|<ALPHA_HOSTNAME>' ~/.cloudflared/config.yml && \
  echo "ERROR: placeholders remain" || echo "placeholders replaced"
```

## Validate ingress / config

```bash
cloudflared tunnel ingress validate --config ~/.cloudflared/config.yml
```

## Test ingress match

```bash
cloudflared tunnel ingress rule --config ~/.cloudflared/config.yml https://<ALPHA_HOSTNAME>/health/live
# Expect the http://127.0.0.1:8088 rule
```

Ensure the alpha edge is up first (`./infra/alpha/scripts/start-alpha.sh` or compose up).

## Start tunnel manually

```bash
# With default config path (preferred — uses credentials-file from local config):
cloudflared tunnel run <TUNNEL_NAME>

# Or explicit:
cloudflared tunnel --config ~/.cloudflared/config.yml run <TUNNEL_NAME>
```

Prefer **credentials-file** in local config over `cloudflared tunnel run --token ...`.
Token-on-argv can appear in process listings (`ps` / `pgrep -lf`). Alpha preflight
intentionally does **not** print cloudflared argv for that reason.

Leave this running in a dedicated terminal during bring-up, or install as a service (next).

## Canonical runner (Phase 12A certification): user LaunchAgent

**Canonical alpha tunnel runner on this host:** a **user-level** LaunchAgent that runs the named tunnel with **credentials-file** config (not legacy `--token` argv).

Do **not** install a second official `cloudflared service install` LaunchDaemon alongside this agent (duplicate connectors cause flapping / 502s).

| Item | Value |
|---|---|
| Label | `com.bettermta.cloudflared-alpha` |
| Plist | `~/Library/LaunchAgents/com.bettermta.cloudflared-alpha.plist` |
| Program | `cloudflared tunnel --config ~/.cloudflared/config.yml run <TUNNEL_NAME>` |
| Auth mode | credentials-file (from local `config.yml`) |
| KeepAlive | `true` |
| RunAtLoad | `true` (starts at user login) |
| Logs | `~/.config/bettermta/logs/tunnel-launchd.out.log` / `tunnel-launchd.err.log` |

### Presence-only inspection

```bash
pgrep -x cloudflared >/dev/null && echo "cloudflared running" || echo "cloudflared not running"
# Exactly one intended process after restart:
pgrep -x cloudflared | wc -l
# Do NOT use pgrep -lf / full ps argv (credential paths can appear).
```

### Restart

```bash
launchctl kickstart -k "gui/$(id -u)/com.bettermta.cloudflared-alpha"
```

### Bootstrap / reload plist (after editing)

```bash
launchctl bootout "gui/$(id -u)/com.bettermta.cloudflared-alpha" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.bettermta.cloudflared-alpha.plist
```

### Removal

```bash
launchctl bootout "gui/$(id -u)/com.bettermta.cloudflared-alpha" 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.bettermta.cloudflared-alpha.plist
```

### Log inspection

```bash
tail -n 50 ~/.config/bettermta/logs/tunnel-launchd.err.log
# Redact UUIDs/hostnames before sharing logs outside the host.
```

Availability still depends on **user login** (RunAtLoad), host awake, power, and network — see ADR-0021 honesty.

## Optional: official macOS system service

Only if you intentionally replace the LaunchAgent (not in addition to it):

```bash
sudo cloudflared service install
# Uses the system/config path cloudflared expects after install;
# ensure the installed config matches the template ingress (no secrets in Git).
```

Useful controls (exact labels may vary slightly by version):

```bash
sudo launchctl list | grep -i cloudflared || true
sudo cloudflared service uninstall   # only when intentionally removing
```

Prefer documenting the UUID/name in your private ops notes, not in the repo.

## Logs / restart (generic)

```bash
# Foreground run: logs are stdout/stderr
# LaunchAgent: see canonical runner section above
# System service: Console.app / launchd paths for cloudflared
```

Confirm locally after restart (presence only — do **not** use `pgrep -lf` /
`ps` full argv; tokens or credential paths can appear in process listings.
Preflight detects presence the same way and intentionally omits argv):

```bash
pgrep -x cloudflared >/dev/null && echo "cloudflared running" || echo "cloudflared not running"
curl -fsS http://127.0.0.1:8088/health/live
```

Public URL checks require Access (see `ACCESS.md`); unauthenticated browser hits should not reach the origin as an open site.

## Revoke / rotate credentials

1. In Cloudflare Zero Trust / Tunnel dashboard, **delete or rotate** the tunnel credentials for the named tunnel (or delete and recreate the tunnel if compromised).
2. Remove local credential JSON and update `credentials-file` in the **local** config only.
3. Re-run `cloudflared tunnel create` / download new credentials if recreated.
4. Restart `cloudflared`.
5. Rotate Access service tokens separately (`ACCESS.md`) if they may have been exposed.
6. Never commit old or new credential files.

## Operator checklist (interactive)

- [ ] Cloudflare account access
- [ ] `cloudflared tunnel login` completed on the host
- [ ] Named tunnel created (not Quick Tunnel)
- [ ] DNS route for `<ALPHA_HOSTNAME>`
- [ ] Local config from template with real values **outside** Git
- [ ] `ingress validate` + rule test
- [ ] Tunnel running (manual or service)
- [ ] Access application covering the hostname (`ACCESS.md`) before inviting testers

## What this phase does **not** do

- Does not create a real tunnel from CI or agent automation
- Does not store hostnames/UUIDs in the repo
- Does not bypass Cloudflare Access
