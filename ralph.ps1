# Ralph Loop - Autonomous AI Development Loop
# Runs Crush iteratively until all stories in prd.json are complete.
#
# Usage: .\ralph.ps1 [-MaxIterations 10]

param(
    [int]$MaxIterations = 100
)

Write-Host "`n=== RALPH LOOP ===" -ForegroundColor Cyan
Write-Host "Max iterations: $MaxIterations`n"

for ($i = 1; $i -le $MaxIterations; $i++) {
    # Check if any stories remain
    $prd = Get-Content prd.json -Raw | ConvertFrom-Json
    $remaining = $prd.userStories | Where-Object { -not $_.passes }
    
    if (-not $remaining) {
        Write-Host "`nAll stories complete!" -ForegroundColor Green
        break
    }
    
    $next = $remaining | Sort-Object priority | Select-Object -First 1
    $total = $prd.userStories.Count
    $done = ($prd.userStories | Where-Object { $_.passes }).Count
    
    Write-Host "[$i/$MaxIterations] Progress: $done/$total" -ForegroundColor Blue
    Write-Host "Story: $($next.id) - $($next.title)" -ForegroundColor Yellow
    Write-Host ""
    
    # Run Crush for one story
    crush run "Do the next incomplete story from prd.json per CLAUDE.md instructions. Exit when done with ONE story."
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nCrush exited with error. Stopping." -ForegroundColor Red
        break
    }
    
    Start-Sleep 2
}

# Final stats
$prd = Get-Content prd.json -Raw | ConvertFrom-Json
$done = ($prd.userStories | Where-Object { $_.passes }).Count
$total = $prd.userStories.Count
Write-Host "`nFinal: $done/$total stories complete" -ForegroundColor Cyan
