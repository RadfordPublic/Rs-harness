# Launches Claude Code inside rs-sdk\ (where its CLAUDE.md and the rs-agent
# MCP server live), then saves your bots back into this repo on exit.
#   .\play.ps1                                 interactive session
#   .\play.ps1 "train woodcutting on mybot"    start with a prompt
Set-Location $PSScriptRoot
bun tools/bots-sync.ts restore | Out-Null
Push-Location rs-sdk
try { claude @args } finally { Pop-Location }
bun tools/bots-sync.ts save
