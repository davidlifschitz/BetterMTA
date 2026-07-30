# Controlled alpha — Cloudflare Access (Phase 12A.7)

**Owner:** Infrastructure  
**Related:** ADR-0021, `infra/alpha/TUNNEL.md`, `infra/alpha/HOST.md`  
**Hard rule:** Email OTP/PIN alone must **not** grant access. An **exact email allowlist** is mandatory. Deny by default.

## Security (non-negotiable)

- Maintain the tester allowlist **only in Cloudflare Zero Trust** (dashboard or account-scoped API). **Never** commit tester emails to this repo.
- Never commit Access application IDs, policy IDs, or service token **client ID / client secret**.
- Store service token secrets outside Git (password manager / host env / secret store).
- Agents must not ask you to paste Access secrets or allowlists into chat.

## Application shape

Create a **self-hosted** Cloudflare Access application that covers the alpha hostname served by the named tunnel (`TUNNEL.md`).

| Setting | Requirement |
|---|---|
| Application type | Self-hosted |
| Application domain | Exact `<ALPHA_HOSTNAME>` (and path `/` or equivalent covering the site) |
| Default | **Deny** — no public bypass |
| Identity | Email one-time PIN (OTP) as the login **method** |
| Authorization | **Exact email allowlist** policy (Include → Emails → listed addresses only) |
| Session duration | **Limited** (prefer short alpha sessions, e.g. hours not weeks; pick an explicit duration in Zero Trust) |
| Wildcards | **No** domain-wide `*@company.com` (or similar) unless explicitly approved in writing for a later phase |

### Allowlist + OTP (both required)

1. **OTP** proves control of an inbox at login time.
2. **Allowlist** decides whether that identity may enter.

OTP without an allowlist (or with an overly broad include rule) is **not** acceptable for controlled alpha. Prefer policies that **Include** only listed emails and do not add catch-all org rules.

## Automated health checks — Access service token

Browser testers use OTP + allowlist. Automated external health checks need a **separate** Access **service token** (not a user session).

1. In Zero Trust → Access → Service Auth (wording varies), create a service token for alpha health only.
2. Store **Client ID** and **Client Secret** outside Git.
3. Attach a policy that allows the service token for the same application (or a dedicated health path policy if you split apps — default: same app, Service Auth policy).
4. Prefer least privilege: health endpoints only if you can scope it; otherwise accept same-app token with tight operational control.

### Env vars for preflight / scripts (local shell only)

```bash
# Example names — set in your shell profile or a local env file that is gitignored
export ALPHA_PUBLIC_BASE_URL="https://<ALPHA_HOSTNAME>"
export CF_ACCESS_CLIENT_ID="<SERVICE_TOKEN_CLIENT_ID>"
export CF_ACCESS_CLIENT_SECRET="<SERVICE_TOKEN_CLIENT_SECRET>"
```

`infra/alpha/scripts/preflight-host.sh` performs a public `/health/live` check **only** when these are set; otherwise it prints `skipped`. Never echo the secret in logs you might paste into issues.

Example authenticated probe (operator machine):

```bash
curl -fsS \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
  "${ALPHA_PUBLIC_BASE_URL}/health/live"
```

## Procedures

### Add a tester

1. Zero Trust → Access → Applications → alpha app → Authentication / Policies.
2. Add the tester’s **exact email** to the allowlist include rule.
3. Share only the public hostname (not service tokens). Tester completes email OTP at first visit.
4. Do not add the email to any file in this repository.

### Remove a tester

1. Remove their email from the Access allowlist policy.
2. Optionally revoke active sessions (below).
3. Confirm they can no longer pass Access (expect login / deny).

### Revoke sessions

1. Zero Trust → Access → user / session management (or Identity → Users, depending on dashboard layout).
2. Revoke sessions for the affected identity or all app sessions if responding to a broader incident.
3. Ask the tester to close browsers; they must re-OTP if re-allowlisted later.

### Rotate service token

1. Create a new Access service token.
2. Update local env / automation with the new ID/secret.
3. Confirm preflight public health succeeds with the new token.
4. Revoke/delete the old token in Cloudflare.
5. Never commit either token.

### Read Access audit logs

1. Zero Trust → Logs → Access (or Audit logs — follow current Cloudflare UI).
2. Filter by application / time range for failed logins, policy denials, and service-token use.
3. Retain investigation notes outside the public repo if they contain emails.

### Emergency disable

If the alpha must go dark immediately:

1. **Disable or delete** the Access application policies / application (fail closed — no public origin).
2. Optionally **stop** `cloudflared` on the Mac (`TUNNEL.md`) so the hostname has no connector.
3. Optionally `./infra/alpha/scripts/stop-alpha.sh` to stop the origin stack (volumes preserved).
4. Do **not** open router ports as a workaround.
5. After incident: rotate tunnel credentials and Access service tokens if exposure is suspected; re-enable only with allowlist re-verified.

## Operator checklist (interactive)

- [ ] Self-hosted Access app on `<ALPHA_HOSTNAME>`
- [ ] Deny by default; no bypass for anonymous internet
- [ ] Exact email allowlist (Cloudflare only)
- [ ] Email OTP enabled as login method
- [ ] Limited session duration set
- [ ] No domain-wide wildcard without explicit approval
- [ ] Service token created for automation; secrets outside Git
- [ ] Spot-check: non-allowlisted email cannot enter; allowlisted email can after OTP
- [ ] Spot-check: service token can hit `/health/live`; revoked token cannot

## Gate status

CA04 / CA05 in `docs/RELEASE_GATE_REPORT.md` stay **PENDING** until you complete dashboard setup and capture remote smoke evidence. Documentation alone does not pass those gates.
