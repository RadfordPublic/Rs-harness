# Headless game client for one bot. Standalone scripts (bun bots/<name>/x.ts)
# need this running; MCP execute_code opens a browser client by itself.
#   .\client.ps1 <botname>
param([Parameter(Mandatory)][string]$Bot)
Set-Location "$PSScriptRoot\rs-sdk\server\webclient"
bun src/lite/runner.ts $Bot
