<#
.SYNOPSIS
IV1-B-R1 — esegue il benchmark integrato G3.1 + E2.3.1 e scrive dataset/graphic.

Tutti i percorsi sono relativi alla root del repository. Richiede Node 22 e Vitest 4.
Nessuna modifica al codice di produzione: il benchmark e infrastruttura isolata.

R1: i riferimenti di tempo/CPU/heap e i contatori evento sono acquisiti DOPO il
warm-up. Ogni run separa `warmup.*`, la finestra misurata e `totals.*`.
Il writer e sintetico (nessun I/O su disco): i dati non misurano persistenza reale.

Override: IV1B_OUT, IV1B_POPULATIONS, IV1B_SEEDS, IV1B_TICKS, IV1B_WARMUP_TICKS.
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
Write-Host ("Dataset:   " + ($env:IV1B_OUT ?? "docs/research/iv1b") + "\dataset.raw.json")
exit $exit
