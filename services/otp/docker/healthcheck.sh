#!/usr/bin/env bash
# Bash /dev/tcp probe — no curl/apt required in the OTP image.
set -euo pipefail
exec 3<>/dev/tcp/127.0.0.1/8080
printf 'GET /otp/actuators/health HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
# Read status line + a bit of body; require HTTP 200 and "UP"
resp="$(timeout 4 cat <&3 || true)"
exec 3<&- || true
exec 3>&- || true
echo "$resp" | head -n 1 | grep -q ' 200 '
echo "$resp" | grep -q '"status"[[:space:]]*:[[:space:]]*"UP"'
