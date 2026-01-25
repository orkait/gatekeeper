# Ralph Loop - Autonomous AI Development Loop
# Runs Claude or Crush iteratively until all stories in prd.json are complete.
#
# Usage: 
#   .\ralph.ps1                      # uses claude by default
#   .\ralph.ps1 -CLI crush           # use crush instead
#   .\ralph.ps1 -Silent              # hide output
#   .\ralph.ps1 -MaxIterations 10    # limit iterations

param(
    [int]$MaxIterations = 100,
    [switch]$Silent,
    [ValidateSet("claude", "crush")]
    [string]$CLI = "claude"
)

$separator = "=" * 60

Write-Host "`n$separator" -ForegroundColor Cyan
Write-Host "  RALPH LOOP - Autonomous AI Development" -ForegroundColor Cyan
Write-Host "$separator" -ForegroundColor Cyan
Write-Host "  CLI:            $CLI"
Write-Host "  Max iterations: $MaxIterations"
Write-Host "  Verbose:        $(-not $Silent)"
Write-Host "  PRD:            prd.json"
Write-Host "$separator`n" -ForegroundColor Cyan

for ($i = 1; $i -le $MaxIterations; $i++) {
    # Check if any stories remain
    $prd = Get-Content prd.json -Raw | ConvertFrom-Json
    $remaining = $prd.userStories | Where-Object { -not $_.passes }
    
    if (-not $remaining) {
        Write-Host "`n$separator" -ForegroundColor Green
        Write-Host "  ALL STORIES COMPLETE!" -ForegroundColor Green
        Write-Host "$separator`n" -ForegroundColor Green
        break
    }
    
    $next = $remaining | Sort-Object priority | Select-Object -First 1
    $total = $prd.userStories.Count
    $done = ($prd.userStories | Where-Object { $_.passes }).Count
    
    Write-Host "$separator" -ForegroundColor Blue
    Write-Host "  ITERATION $i/$MaxIterations | Progress: $done/$total complete" -ForegroundColor Blue
    Write-Host "$separator" -ForegroundColor Blue
    Write-Host "  Story ID:    $($next.id)" -ForegroundColor Yellow
    Write-Host "  Title:       $($next.title)" -ForegroundColor Yellow
    Write-Host "  Priority:    $($next.priority)" -ForegroundColor DarkGray
    Write-Host "  Description: $($next.description)" -ForegroundColor DarkGray
    
    if ($next.acceptanceCriteria) {
        Write-Host "  Criteria:" -ForegroundColor DarkGray
        foreach ($c in $next.acceptanceCriteria) {
            Write-Host "    - $c" -ForegroundColor DarkGray
        }
    }
    Write-Host "$separator`n" -ForegroundColor Blue
    
    # Run CLI for one story
    $prompt = "Do the next incomplete story from prd.json per CLAUDE.md instructions. Exit when done with ONE story."
    
    if ($Silent) {
        Write-Host "[Running $CLI silently...]" -ForegroundColor DarkGray
        if ($CLI -eq "claude") {
            claude --print $prompt *> $null
        } else {
            crush run $prompt *> $null
        }
    } else {
        Write-Host "[$CLI Output]`n" -ForegroundColor Magenta
        if ($CLI -eq "claude") {
            claude --print $prompt
        } else {
            crush run $prompt
        }
        Write-Host ""
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n$CLI exited with error (code: $LASTEXITCODE). Stopping." -ForegroundColor Red
        break
    }
    
    # Show completion
    $prd = Get-Content prd.json -Raw | ConvertFrom-Json
    $story = $prd.userStories | Where-Object { $_.id -eq $next.id }
    if ($story.passes) {
        Write-Host "Story $($next.id) marked COMPLETE" -ForegroundColor Green
    } else {
        Write-Host "Story $($next.id) NOT marked complete - may need manual review" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Start-Sleep 2
}

# Final stats
$prd = Get-Content prd.json -Raw | ConvertFrom-Json
$done = ($prd.userStories | Where-Object { $_.passes }).Count
$total = $prd.userStories.Count
Write-Host "$separator" -ForegroundColor Cyan
Write-Host "  FINAL: $done/$total stories complete" -ForegroundColor Cyan
Write-Host "$separator`n" -ForegroundColor Cyan
