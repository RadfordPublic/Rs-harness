# One-time setup: fetches rs-sdk, installs deps, restores saved bots,
# and optionally creates a new bot.   Usage: .\setup.ps1 [botname] [--demo]
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
# create-bot.ts edits bots/_template with "\n"-anchored replacements, which miss
# under autocrlf. Keep the template LF so --local writes the right ports.
Run git @('-C', 'rs-sdk', 'config', 'core.autocrlf', 'false')
Remove-Item rs-sdk\bots\_template\* -Force
Run git @('-C', 'rs-sdk', 'checkout', '--', 'bots/_template')
Push-Location rs-sdk; try { Run bun @('install') } finally { Pop-Location }
Push-Location rs-sdk\server\webclient; try { Run bun @('install') } finally { Pop-Location }
Run bun @('tools/bots-sync.ts', 'restore')

if ($args.Count -gt 0) {
    # New bots point at the local server unless --demo or --server= says otherwise.
    $botArgs = @($args | Where-Object { $_ -ne '--demo' })
    if (-not ($args | Where-Object { $_ -eq '--demo' -or $_ -eq '--local' -or $_ -like '--server=*' })) {
        $botArgs += '--local'
    }
    Push-Location rs-sdk; try { Run bun (@('bots/create-bot.ts') + $botArgs) } finally { Pop-Location }
    Run bun @('tools/bots-sync.ts', 'save')
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host 'Note: Claude Code not found. Install it: npm install -g @anthropic-ai/claude-code'
}
Write-Host 'Setup done. Start playing with: .\play.ps1'
