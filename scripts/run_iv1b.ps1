<#
.SYNOPSIS
IV1-B — esegue il benchmark integrato G3.1 + E2.3.1 e scrive dataset/graphic/report.

Tutti i percorsi sono relativi alla root del repository. Richiede Node 22 e Vitest 4.
Nessuna modifica al codice di produzione: il benchmark è infrastruttura isolata.
#>
$ErrorActionPreference = "Stop"

$gitCmd = "C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd"
$nodeCmd = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64"
$env:PATH = "$gitCmd;$nodeCmd;$env:PATH"
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = "true"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== IV1-B integrated performance benchmark ==="
Write-Host ("Branch: " + (& git rev-parse --abbrev-ref HEAD))
Write-Host ("HEAD:   " + (& git rev-parse --short HEAD))
Write-Host ("Node:   " + (& node --version))
Write-Host ("Start:  " + (Get-Date -Format "o"))
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& npx vitest run --config vitest.bench.config.ts scripts/iv1bIntegrated.benchmark.ts --reporter=verbose
$exit = $LASTEXITCODE
$sw.Stop()

Write-Host ""
Write-Host ("End:       " + (Get-Date -Format "o"))
Write-Host ("Elapsed:   " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + " s")
Write-Host ("Vitest:    " + $exit)
Write-Host ("Dataset:   docs/research/iv1b/dataset.raw.json")
exit $exit
