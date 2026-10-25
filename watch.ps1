# Opens a bot's browser game client so you can watch it play. Scripts and
# MCP execute_code drive whichever client is attached, so close any headless
# client (client.ps1) for this bot first. Keep the tab open while it runs.
#   .\watch.ps1 <botname>
param([Parameter(Mandatory)][string]$Bot)
$envFile = "$PSScriptRoot\rs-sdk\bots\$Bot\bot.env"
if (-not (Test-Path $envFile)) { throw "No bot.env for '$Bot'. Create it with .\setup.ps1 $Bot" }

$cfg = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}
$server = $cfg['SERVER']
$origin = if ($server -match '^localhost') { "http://$server" } else { "https://$server" }
$url = "$origin/bot?bot=$([uri]::EscapeDataString($Bot))&password=$([uri]::EscapeDataString($cfg['PASSWORD']))"
Start-Process $url
Write-Host "Opened the browser client for $Bot ($origin)."
