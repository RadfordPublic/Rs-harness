#!/usr/bin/env bash
# Opens a bot's browser game client so you can watch it play. Scripts and
# MCP execute_code drive whichever client is attached, so close any headless
# client (client.sh) for this bot first. Keep the tab open while it runs.
#   ./watch.sh <botname>
set -euo pipefail
bot="${1:?usage: ./watch.sh <botname>}"
env_file="$(dirname "$0")/rs-sdk/bots/$bot/bot.env"
[ -f "$env_file" ] || { echo "No bot.env for '$bot'. Create it with ./setup.sh $bot" >&2; exit 1; }

get() { grep -E "^$1=" "$env_file" | head -1 | cut -d= -f2- | tr -d '\r'; }
server="$(get SERVER)"
case "$server" in localhost*) origin="http://$server" ;; *) origin="https://$server" ;; esac
enc() { bun -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"; }
url="$origin/bot?bot=$(enc "$bot")&password=$(enc "$(get PASSWORD)")"

if command -v xdg-open >/dev/null; then xdg-open "$url"
elif command -v open >/dev/null; then open "$url"
else start "" "$url"; fi
echo "Opened the browser client for $bot ($origin)."
