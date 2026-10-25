#!/usr/bin/env bash
# One-time setup: fetches rs-sdk, installs deps, restores saved bots,
# and optionally creates a new bot.   Usage: ./setup.sh [botname] [--local]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found, installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

git submodule update --init --recursive
(cd rs-sdk && bun install)
(cd rs-sdk/server/webclient && bun install)
bun tools/bots-sync.ts restore

if [ $# -gt 0 ]; then
  (cd rs-sdk && bun bots/create-bot.ts "$@")
  bun tools/bots-sync.ts save
fi

command -v claude >/dev/null 2>&1 || echo "Note: Claude Code not found. Install it: npm install -g @anthropic-ai/claude-code"
echo "Setup done. Start playing with: ./play.sh"
