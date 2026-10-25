#!/usr/bin/env bash
# Runs your own game server: engine (http://localhost:8888) + gateway
# (ws://localhost:7780). Ctrl+C stops both. Bots must be created with --local:
#   ./setup.sh mybot --local
set -euo pipefail
cd "$(dirname "$0")/rs-sdk/server"

# Browser client bundle (the engine serves webclient/out); build once.
[ -d webclient/out ] || (cd webclient && bun run build)

(cd gateway && bun install >/dev/null && bun run gateway) &
GATEWAY=$!
trap 'kill $GATEWAY 2>/dev/null' EXIT

# rs-sdk ships modified game content, so the upstream checksum check must be off.
# NODE_TICKRATE (ms per tick, default 400) can be lowered for faster gameplay.
cd engine && BUILD_VERIFY=false bun run start
