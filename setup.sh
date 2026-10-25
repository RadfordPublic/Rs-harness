#!/usr/bin/env bash
# One-time setup: fetches rs-sdk, installs deps, restores saved bots,
# and optionally creates a new bot.   Usage: ./setup.sh [botname] [--demo]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found, installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

git submodule update --init --recursive
# create-bot.ts edits bots/_template with "\n"-anchored replacements, which miss
# under autocrlf. Keep the template LF so --local writes the right ports.
git -C rs-sdk config core.autocrlf false
rm -f rs-sdk/bots/_template/*
git -C rs-sdk checkout -- bots/_template
(cd rs-sdk && bun install)
(cd rs-sdk/server/webclient && bun install)
bun tools/bots-sync.ts restore

if [ $# -gt 0 ]; then
  # New bots point at the local server unless --demo or --server= says otherwise.
  bot_args=() target=--local
  for a in "$@"; do
    case "$a" in
      --demo) target= ;;
      --local|--server=*) target= ; bot_args+=("$a") ;;
      *) bot_args+=("$a") ;;
    esac
  done
  [ -n "$target" ] && bot_args+=("$target")
  (cd rs-sdk && bun bots/create-bot.ts "${bot_args[@]}")
  bun tools/bots-sync.ts save
fi

command -v claude >/dev/null 2>&1 || echo "Note: Claude Code not found. Install it: npm install -g @anthropic-ai/claude-code"
echo "Setup done. Start playing with: ./play.sh"
