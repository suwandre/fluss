# scripts/run-loop.ps1
# Full builder+reviewer automation loop.
# Claude Code (backed by GLM via z.ai) runs both roles headlessly.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-loop.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-loop.ps1 -MaxCycles 5

param(
    [int]$MaxCycles = 999
)

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Log($msg, $color = "White") {
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Host "[$ts] $msg" -ForegroundColor $color
}

function Get-HeadCommit { git rev-parse HEAD }
function Get-HeadMsg    { git log -1 --pretty="%s" }

function Test-IncompleteTasks {
    $content = Get-Content "tasks/TASKS.md" -Raw
    return $content -match '\- \[ \]'
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Log "ERROR: 'claude' not found. Run: npm install -g @anthropic-ai/claude-code" "Red"
    exit 1
}

Log "Builder+Reviewer loop starting (GLM via Claude Code)" "Cyan"
Log "Repo: $repo" "Gray"
Log "Press Ctrl+C to stop." "Gray"
Write-Host ""

$cycle = 0

while ($cycle -lt $MaxCycles) {

    if (-not (Test-IncompleteTasks)) {
        Log "All tasks complete. Loop done." "Green"
        break
    }

    $cycle++
    $sep = "=" * 50
    Write-Host $sep -ForegroundColor DarkGray
    Log "Cycle $cycle - Builder starting..." "Green"

    $beforeCommit = Get-HeadCommit

    claude -p "Builder role. Work on next task."

    if ($LASTEXITCODE -ne 0) {
        Log "Builder exited with error ($LASTEXITCODE). Stopping." "Red"
        break
    }

    $afterCommit = Get-HeadCommit

    if ($afterCommit -eq $beforeCommit) {
        Log "Builder ran but made no commit. Stopping - check output above." "Yellow"
        break
    }

    Log "Builder committed: $(Get-HeadMsg)" "Green"
    Write-Host ""

    Log "Cycle $cycle - Reviewer starting..." "Cyan"

    claude -p "Reviewer role. Check the latest commit."

    if ($LASTEXITCODE -ne 0) {
        Log "Reviewer exited with error ($LASTEXITCODE). Continuing anyway." "Yellow"
    }

    $reviewMsg = Get-HeadMsg
    if ($reviewMsg -match "^fix:") {
        Log "Reviewer found issues - fixed: $reviewMsg" "Yellow"
    } else {
        Log "Reviewer: LGTM" "Green"
    }

    Write-Host ""
}

Log "Loop finished after $cycle cycle(s)." "Cyan"
