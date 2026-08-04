#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: validate-public-origin.sh NAME VALUE" >&2
  exit 2
fi

name="$1"
value="$2"
case "$name" in
  *[!A-Z0-9_]*)
    echo "Public-origin field name is invalid" >&2
    exit 2
    ;;
esac

command -v python3 >/dev/null 2>&1 || {
  echo "BLOCKED: Python 3 is required for public-origin validation" >&2
  exit 1
}

PUBLIC_ORIGIN_NAME="$name" PUBLIC_ORIGIN_VALUE="$value" python3 <<'PY'
import ipaddress
import os
from urllib.parse import urlsplit

name = os.environ["PUBLIC_ORIGIN_NAME"]
value = os.environ["PUBLIC_ORIGIN_VALUE"]

def blocked() -> None:
    raise SystemExit(f"BLOCKED: {name} must be a non-localhost HTTPS origin")

try:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    _ = parsed.port
except ValueError:
    blocked()

if (
    parsed.scheme.lower() != "https"
    or not host
    or parsed.username is not None
    or parsed.password is not None
    or parsed.path not in ("", "/")
    or parsed.query
    or parsed.fragment
):
    blocked()

if host == "localhost" or host.endswith(".localhost"):
    blocked()

try:
    address = ipaddress.ip_address(host)
except ValueError:
    address = None

if address is not None and (address.is_loopback or address.is_unspecified):
    blocked()
PY
