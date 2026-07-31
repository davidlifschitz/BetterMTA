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

## Install as macOS service

```bash
sudo cloudflared service install
# Uses the system/config path cloudflared expects after install;
# ensure the installed config matches the template ingress (no secrets in Git).
```

Useful controls (exact labels may vary slightly by version):

```bash
sudo launchctl list | grep -i cloudflared || true
# Restart / stop via launchctl or:
sudo cloudflared service uninstall   # only when intentionally removing
```

Prefer documenting the UUID/name in your private ops notes, not in the repo.

## Logs / restart

```bash
# If running in foreground: logs are stdout/stderr
# If installed as a service, check Console.app or launchd log paths for cloudflared

# Restart connector (service):
sudo launchctl kickstart -k system/com.cloudflare.cloudflared 2>/dev/null || true
# Or stop+start the foreground `cloudflared tunnel run` process
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
