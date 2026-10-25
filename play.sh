#!/usr/bin/env bash
# Launches Claude Code inside rs-sdk/ (where its CLAUDE.md and the rs-agent
# MCP server live), then saves your bots back into this repo on exit.
#   ./play.sh                       interactive session
#   ./play.sh "train woodcutting on mybot"   start with a prompt
cd "$(dirname "$0")"
bun tools/bots-sync.ts restore >/dev/null
(cd rs-sdk && claude "$@")
bun tools/bots-sync.ts save
