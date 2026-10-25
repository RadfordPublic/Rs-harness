# Runs your own game server: engine (http://localhost:8888) + gateway
# (ws://localhost:7780). The gateway opens in its own window; close both to stop.
# Bots must be created with --local:   .\setup.ps1 mybot --local
$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\rs-sdk\server"

# Browser client bundle (the engine serves webclient\out); build once.
if (-not (Test-Path webclient\out)) {
    Push-Location webclient; try { bun run build } finally { Pop-Location }
}

Start-Process powershell -WorkingDirectory "$PWD\gateway" -ArgumentList '-NoExit', '-Command', 'bun install; bun run gateway'

# rs-sdk ships modified game content, so the upstream checksum check must be off.
# NODE_TICKRATE (ms per tick, default 400) can be lowered for faster gameplay.
$env:BUILD_VERIFY = 'false'
Set-Location engine
bun run start
