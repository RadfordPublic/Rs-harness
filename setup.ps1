# One-time setup: fetches rs-sdk, installs deps, restores saved bots,
# and optionally creates a new bot.   Usage: .\setup.ps1 [botname] [--local]
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $argv failed (exit $LASTEXITCODE)" }
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host 'bun not found, installing...'
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
}

Run git @('submodule', 'update', '--init', '--recursive')
Push-Location rs-sdk; try { Run bun @('install') } finally { Pop-Location }
Push-Location rs-sdk\server\webclient; try { Run bun @('install') } finally { Pop-Location }
Run bun @('tools/bots-sync.ts', 'restore')

if ($args.Count -gt 0) {
    Push-Location rs-sdk; try { Run bun (@('bots/create-bot.ts') + $args) } finally { Pop-Location }
    Run bun @('tools/bots-sync.ts', 'save')
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host 'Note: Claude Code not found. Install it: npm install -g @anthropic-ai/claude-code'
}
Write-Host 'Setup done. Start playing with: .\play.ps1'
