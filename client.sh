#!/usr/bin/env bash
# Headless game client for one bot. Standalone scripts (bun bots/<name>/x.ts)
# need this running; MCP execute_code opens a browser client by itself.
#   ./client.sh <botname>
set -e
cd "$(dirname "$0")/rs-sdk/server/webclient"
exec bun src/lite/runner.ts "$1"
