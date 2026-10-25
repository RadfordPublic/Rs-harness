# Shares your running server (server.ps1) with friends over Tailscale, at
# https://<your-pc>.<tailnet>.ts.net. The engine relays /gateway, so only port
# 8888 is exposed. Doesn't touch the server itself; safe while bots are playing.
#   .\share.ps1           friends on your tailnet (they install Tailscale)
#   .\share.ps1 -Public   anyone with the link (Tailscale Funnel, no install)
#   .\share.ps1 -Stop     stop sharing
param([switch]$Public, [switch]$Stop)
$ErrorActionPreference = 'Stop'

$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $ts) { $ts = 'C:\Program Files\Tailscale\tailscale.exe' }
if (-not (Test-Path $ts)) { throw 'Tailscale not found. Install it: winget install Tailscale.Tailscale' }

$status = & $ts status --json | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw "Tailscale isn't signed in. Run: tailscale up" }
$hostName = $status.Self.DNSName.TrimEnd('.')

if ($Stop) {
    & $ts funnel --https=443 off 2>$null
    & $ts serve --https=443 off 2>$null
    Write-Host 'Stopped sharing.'
    return
}

# First run may print a link to enable HTTPS certificates for your tailnet.
$mode = if ($Public) { 'funnel' } else { 'serve' }
& $ts $mode --bg 8888
if ($LASTEXITCODE -ne 0) { throw "tailscale $mode failed (exit $LASTEXITCODE)" }

Write-Host ''
Write-Host "Sharing http://localhost:8888 at https://$hostName"
Write-Host "  Play in a browser:  https://$hostName/rs2.cgi"
Write-Host "  Friends' bots:      .\setup.ps1 theirbot --server=$hostName"
if (-not $Public) { Write-Host '  Friends need Tailscale and an invite to your tailnet (or share this machine with them).' }
