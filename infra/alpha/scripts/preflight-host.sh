#!/usr/bin/env bash
# Phase 12A.5 — read-only macOS host preflight for controlled alpha.
# Reports power, sleep, disk, Docker, containers, tunnel process, local/public health.
# Does NOT change Energy Saver, sleep, pmset, caffeinate, or Docker settings.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

EDGE_LIVE_URL="${EDGE_LIVE_URL:-http://127.0.0.1:8088/health/live}"
PUBLIC_BASE="${ALPHA_PUBLIC_BASE_URL:-}"
# Access service token env names (secrets must never be printed):
#   CF_ACCESS_CLIENT_ID
#   CF_ACCESS_CLIENT_SECRET

section() { printf '\n== %s ==\n' "$1"; }
kv() { printf '%-28s %s\n' "$1" "$2"; }
warn() { printf 'WARN  %s\n' "$*"; }
note() { printf 'NOTE  %s\n' "$*"; }

echo "BetterMTA controlled-alpha host preflight (read-only)"
echo "repo: ${ROOT}"
echo "time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- Power source ---
section "Power source"
if command -v pmset >/dev/null 2>&1; then
  batt="$(pmset -g batt 2>/dev/null || true)"
  if [[ -n "$batt" ]]; then
    printf '%s\n' "$batt"
    if printf '%s' "$batt" | grep -qi "AC Power"; then
      kv "power_source" "AC Power (preferred)"
    elif printf '%s' "$batt" | grep -qi "Battery Power"; then
      kv "power_source" "Battery Power"
      warn "Prefer AC power during alpha testing windows"
    else
      kv "power_source" "see pmset -g batt above"
    fi
  else
    kv "power_source" "pmset -g batt returned empty"
  fi
else
  kv "power_source" "pmset unavailable (non-macOS or restricted)"
fi

# --- Sleep settings ---
section "Sleep settings (pmset -g)"
if command -v pmset >/dev/null 2>&1; then
  pmset -g 2>/dev/null || warn "pmset -g failed"
  note "This script does not change sleep settings"
else
  kv "sleep" "pmset unavailable"
fi

# --- Free disk ---
section "Free disk"
if df -h . >/dev/null 2>&1; then
  df -h . | awk 'NR==1 || NR==2 {print}'
  avail="$(df -g . 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -n "${avail:-}" ]]; then
    kv "free_disk_gi_approx" "${avail} Gi (df -g avail)"
    if [[ "$avail" =~ ^[0-9]+$ ]] && (( avail < 20 )); then
      warn "Low free disk (<20 Gi) — graph/image builds may fail"
    fi
  fi
else
  kv "free_disk" "df failed"
fi

# --- Docker availability ---
section "Docker"
if command -v docker >/dev/null 2>&1; then
  kv "docker_cli" "$(command -v docker)"
  if docker info >/dev/null 2>&1; then
    kv "docker_daemon" "reachable"
    mem_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null || true)"
    if [[ -n "${mem_bytes:-}" && "$mem_bytes" =~ ^[0-9]+$ ]]; then
      # Integer GiB display (observed ~12Gi on Colima/Desktop for OTP)
      mem_gi=$((mem_bytes / 1024 / 1024 / 1024))
      kv "docker_mem_total" "${mem_bytes} bytes (~${mem_gi} Gi)"
      if (( mem_gi < 10 )); then
        warn "Docker MemTotal ~${mem_gi} Gi — prefer ~12 Gi for OTP+stack (see HOST.md)"
      fi
    else
      # Fallbacks: Desktop settings / Colima status (best-effort, no secrets)
      kv "docker_mem_total" "not reported by docker info"
      if command -v colima >/dev/null 2>&1; then
        colima list 2>/dev/null | head -n 20 || true
      fi
    fi
    # Resource Saver / Desktop hints are not always queryable via CLI
    note "Confirm Resource Saver will not suspend Docker mid-window (Docker Desktop UI)"
  else
    kv "docker_daemon" "NOT reachable"
    warn "Start Docker Desktop or Colima before alpha bring-up"
  fi
else
  kv "docker_cli" "NOT found on PATH"
fi

# --- Active containers ---
section "Active containers"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -n 40; then
    :
  else
    warn "docker ps failed"
  fi
  if command -v docker-compose >/dev/null 2>&1 && \
     [[ -f docker-compose.yml && -f docker-compose.alpha.yml ]]; then
    echo "--- alpha compose ps ---"
    docker-compose -f docker-compose.yml -f docker-compose.alpha.yml ps 2>/dev/null || \
      note "alpha compose ps unavailable (stack may be down)"
  fi
else
  kv "containers" "skipped (Docker unavailable)"
fi

# --- Tunnel status (detect only; no secrets) ---
section "Tunnel status (detect only)"
if pgrep -x cloudflared >/dev/null 2>&1 || pgrep -f '[c]loudflared' >/dev/null 2>&1; then
  kv "cloudflared_process" "running"
  # Detect only — never print tokens, JWTs, credential paths, or UUIDs from argv.
  # Summarize mode flags without dumping the full command line.
  modes=""
  if pgrep -lf cloudflared 2>/dev/null | grep -Eq -- '--token|tunnel run'; then
    modes="tunnel-run"
  fi
  if pgrep -lf cloudflared 2>/dev/null | grep -Eq 'service|launchd|com\.cloudflare'; then
    modes="${modes:+$modes,}service-like"
  fi
  kv "cloudflared_mode_guess" "${modes:-present (argv redacted)}"
  note "Full cloudflared argv intentionally omitted (tokens/credentials may appear in ps)"
else
  kv "cloudflared_process" "not running"
  note "Named tunnel start/service install: see infra/alpha/TUNNEL.md"
fi
if command -v cloudflared >/dev/null 2>&1; then
  kv "cloudflared_cli" "$(cloudflared --version 2>/dev/null | head -n 1 || echo present)"
else
  kv "cloudflared_cli" "not on PATH"
fi

# --- Local health ---
section "Local health"
live_code="$(curl -sS -o /tmp/bettermta-preflight-live.body -w '%{http_code}' --max-time 5 \
  "${EDGE_LIVE_URL}" 2>/dev/null || true)"
if [[ "${live_code:-000}" == "200" ]]; then
  kv "local_health_live" "PASS http ${live_code} (${EDGE_LIVE_URL})"
else
  kv "local_health_live" "FAIL/down http ${live_code:-000} (${EDGE_LIVE_URL})"
  note "Bring up with ./infra/alpha/scripts/start-alpha.sh when ready"
fi

# --- Public health (Access service token required) ---
section "Public health (Access)"
if [[ -n "$PUBLIC_BASE" && -n "${CF_ACCESS_CLIENT_ID:-}" && -n "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
  # Do not print base URL if it might be considered sensitive; show host-stripped form
  public_url="${PUBLIC_BASE%/}/health/live"
  pub_code="$(curl -sS -o /tmp/bettermta-preflight-public.body -w '%{http_code}' --max-time 15 \
    -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
    -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
    "${public_url}" 2>/dev/null || true)"
  if [[ "${pub_code:-000}" == "200" ]]; then
    kv "public_health_live" "PASS http ${pub_code} (ALPHA_PUBLIC_BASE_URL/health/live via Access token)"
  else
    kv "public_health_live" "FAIL http ${pub_code:-000} (token set; check tunnel/Access/origin)"
  fi
else
  kv "public_health_live" "skipped"
  note "Set ALPHA_PUBLIC_BASE_URL + CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET to enable"
fi

# --- Manual settings remaining ---
section "Manual settings still required (not auto-changed)"
cat <<'EOF'
1. AC power preferred for the testing window.
2. Prevent sleep: Energy Saver / Battery settings; optionally run: caffeinate -dims
3. Docker Desktop (or Colima) starts at login for the deployment user.
4. Docker VM memory ~≥12 Gi; Resource Saver must not interrupt mid-window.
5. Adequate free disk for images + OTP graphs + static data.
6. macOS Software Update will not reboot mid-window.
7. Prefer a dedicated macOS user; do not broadly expose personal home dirs to Docker.
8. Named Cloudflare Tunnel + Access allowlist configured outside Git (TUNNEL.md / ACCESS.md).
9. Start origin: ./infra/alpha/scripts/start-alpha.sh — then start/ensure cloudflared.

See: infra/alpha/HOST.md
EOF

section "Done"
echo "Preflight complete (read-only). No system settings were modified."
