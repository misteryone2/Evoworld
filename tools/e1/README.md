# E1 — strumenti indipendenti di validazione

Questa cartella contiene solo helper di misurazione e orchestrazione per gli esperimenti E1. **Non modifica il motore**: chiama `World.step()`, legge stato pubblico e scrive condizioni iniziali nei soli snapshot.

## File

| File | Ruolo |
|---|---|
| `metrics.ts` | Definizioni osservazionali e `sampleState()` / `accumulate()` / `sampledGeneticDistance()` |
| `initialConditions.ts` | Setup dichiarativi (erbivori, carnivori, misto, habitat, vecchi/deboli) e perturbazioni esplicite (cull) tramite snapshot |
| `runner.ts` | `createWorld()` e `runScenario()`: step loop deterministico e serie di campioni |
| `scenarios.ts` | Tabella dei 12 scenari S01–S12 e costruzione combinazioni seed × durata |

Entry point: `scripts/e1_ecosystem.experiment.ts`. Test: `tests/e1/e1_metrics.test.ts`. Documentazione: `docs/research/e1/`.

## Comandi

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
Set-Location "C:\Users\matti\Documents\Progetto predefinito\Evoworld-git"

# test rapidi dell'harness (configurazione predefinita)
npx vitest run tests/e1/e1_metrics.test.ts

# esperimento completo, 12 scenari × seed
$env:E1_TICKS="900"; $env:E1_LONG_TICKS="2700"; $env:E1_SEEDS="11,12"; $env:E1_SAMPLE_EVERY="50"
$env:E1_OUT="C:\Users\matti\AppData\Local\Temp\opencode\e1-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
```

Variabili d’ambiente supportate: `E1_TICKS`, `E1_LONG_TICKS`, `E1_SEEDS` (CSV), `E1_SAMPLE_EVERY`, `E1_SCENARIOS` (CSV di ID, filtro opzionale), `E1_OUT`.

## Regole

- Aggiungere uno scenario significa modificare **solo** `tools/e1/scenarios.ts` (e, se serve un nuovo setup, `initialConditions.ts`), mai `simulation/**`.
- Le perturbazioni sono rimozioni esplicite di organismi a un tick stabilito; non cambiano le regole biologiche.
- `getStats().births/deaths/predationKills` sono per tick: l’harness li accumula in `cumulative*`.
- `World.fromSnapshot()` azzera alcuni flag sperimentali: gli setup che li usano devono essere eseguiti in un unico processo, come fa il runner.
- `peekCell()` non materializza chunk; non sostituirlo con `getCell()` nelle metriche.
- Nessun risultato va riportato senza seed, durata e comando che lo ha prodotto.
