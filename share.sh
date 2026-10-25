#!/usr/bin/env bash
# Shares your running server (server.sh) with friends over Tailscale, at
# https://<your-pc>.<tailnet>.ts.net. The engine relays /gateway, so only port
# 8888 is exposed. Doesn't touch the server itself; safe while bots are playing.
#   ./share.sh            friends on your tailnet (they install Tailscale)
#   ./share.sh --public   anyone with the link (Tailscale Funnel, no install)
#   ./share.sh --stop     stop sharing
set -euo pipefail

command -v tailscale >/dev/null 2>&1 || { echo "Tailscale not found. Install it: https://tailscale.com/download" >&2; exit 1; }
status=$(tailscale status --json)
echo "$status" | grep -q '"BackendState": *"Running"' || { echo "Tailscale isn't signed in. Run: tailscale up" >&2; exit 1; }
host=$(echo "$status" | grep -m1 '"DNSName"' | sed -E 's/.*"DNSName": *"([^"]*)\.?".*/\1/; s/\.$//')

case "${1:-}" in
  --stop)
    tailscale funnel --https=443 off 2>/dev/null || true
    tailscale serve --https=443 off 2>/dev/null || true
    echo "Stopped sharing."; exit 0 ;;
  --public) mode=funnel ;;
  *) mode=serve ;;
esac

# First run may print a link to enable HTTPS certificates for your tailnet.
tailscale "$mode" --bg 8888

echo
echo "Sharing http://localhost:8888 at https://$host"
echo "  Play in a browser:  https://$host/rs2.cgi"
echo "  Friends' bots:      ./setup.sh theirbot --server=$host"
[ "$mode" = funnel ] || echo "  Friends need Tailscale and an invite to your tailnet (or share this machine with them)."
