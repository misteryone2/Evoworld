# E1 — strumenti indipendenti di validazione

Questa cartella contiene solo helper di misurazione e orchestrazione per gli esperimenti E1. **Non modifica il motore**: chiama `World.step()`, legge stato pubblico e scrive condizioni iniziali nei soli snapshot.

## File

| File | Ruolo |
|---|---|
| `metrics.ts` | `sampleState()` / `accumulate()`; `wrapCellCoord()` allineata a `Planet.wrapCoord()` (`Math.floor` + wrap toroidale); coppie genetiche uniche (`sampleGeneticPairs`, `hash32`), eventi pre/post perturbazione, vegetazione su celle distinte |
| `initialConditions.ts` | Setup dichiarativi (erbivori, carnivori, misto, habitat campionato, S13/S14 a risorse scambiate) e cull deterministico stratificato: quota totale `ceil(N/5)` ripartita per maggiori resti |
| `runner.ts` | `createWorld()` / `createWorldWithInfo()` e `runScenario()`: step loop deterministico, contesto pre/post e report perturbazione |
| `scenarios.ts` | 12 scenari S01–S12 della fase 1, più S13/S14 e `buildPhase2Scenarios()` per la fase E1.2 |
| `experiment.ts` | `resolveOutputPath()`, `writeExperimentOutput()`, `collectResults()`, `stripVariableData()` |
| `statistics.ts` | Media/SD/min/max/IC95, distribuzioni finali, tassi; **confronti appaiati per seed** (`pairedDifference`, `seedValues`) con differenze individuali, IC95 t e seed mancanti/duplicati dichiarati |
| `dataset.ts` | Dataset canonico gzip + manifest con SHA-256, provenance (commit/timestamp) e controllo di portabilità (nessun percorso assoluto o dato personale) |
| `comparison.ts` | Confronto prima/dopo: solo i campi spaziali possono cambiare; ogni differenza non spaziale è un errore |

Entry point: `scripts/e1_ecosystem.experiment.ts` (fase 1), `scripts/e1_ecosystem.phase2.experiment.ts` (fase 2), `scripts/e1_dataset.experiment.ts` (dataset), `scripts/e1_compare.experiment.ts` (confronto). Test: `tests/e1/*.test.ts`. Documentazione: `docs/research/e1/`.

## Comandi

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
Set-Location "C:\Users\matti\Documents\Progetto predefinito\Evoworld-git"

# test rapidi dell'harness
npx vitest run tests/e1/e1_metrics.test.ts tests/e1/e1_integration.test.ts

# fase 1: 12 scenari × seed
$env:E1_TICKS="900"; $env:E1_LONG_TICKS="2700"; $env:E1_SEEDS="11,12"; $env:E1_SAMPLE_EVERY="50"
# facoltativo: di default e1-results.json viene scritto in os.tmpdir()
$env:E1_OUT="C:\Users\matti\AppData\Local\Temp\e1-results-e1.1.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts

# fase 2: 12 seed × 7 scenari, con report statistico
$env:E1_PHASE2_SEEDS="1,2,3,4,5,6,7,8,9,10,11,12"
$env:E1_PHASE2_TICKS="900"; $env:E1_PHASE2_SAMPLE_EVERY="50"
$env:E1_PHASE2_OUT="C:\Users\matti\AppData\Local\Temp\e1-phase2-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts
```

Variabili d’ambiente: fase 1 — `E1_TICKS`, `E1_LONG_TICKS`, `E1_SEEDS` (CSV), `E1_SAMPLE_EVERY`, `E1_SCENARIOS` (CSV di ID), `E1_OUT`; fase 2 — `E1_PHASE2_SEEDS`, `E1_PHASE2_TICKS`, `E1_PHASE2_SAMPLE_EVERY`, `E1_PHASE2_OUT` (con fallback su `E1_OUT`).

## Regole

- Aggiungere uno scenario significa modificare **solo** `tools/e1/scenarios.ts` (e, se serve un nuovo setup, `initialConditions.ts`), mai `simulation/**`.
- Le perturbazioni sono rimozioni esplicite di organismi a un tick stabilito; non cambiano le regole biologiche. La selezione è stratificata per specie e deterministica via `hash32(tick, speciesId, id)`: non consuma l’RNG del motore e dichiara conteggi esatti.
- `getStats().births/deaths/predationKills` sono per tick: l’harness li accumula in `cumulative*` e passa gli eventi del tick a `sampleState()` prima di eventuali ricostruzioni da snapshot. I tassi usano la popolazione a inizio tick, non quella dopo il cull.
- `World.fromSnapshot()` conserva `advancedGenome`/`geneEffects` ma azzera altri flag interni non serializzati: `initialConditions.ts` verifica le due opzioni usate da E1 e fallisce se cambiano.
- I contatori cumulativi risiedono nel runner, fuori dal `World`: la perturbazione S08 non può azzerarli.
- `peekCell()` non materializza chunk; non sostituirlo con `getCell()` nelle metriche. `getCell()` è usato solo in `prepareSwap()` e nei test spaziali per materializzare i chunk prima della lettura.
- E1.3: `wrapCellCoord()` usa `Math.floor(value) % size` con wrap dei negativi, identico a `Planet.wrapCoord()`. I centri di cella `(x+0.5, y+0.5)` devono quindi mappare alla cella `x,y`, non a `x+1,y+1`.
- I confronti tra scenari con gli stessi seed usano `pairedDifference()` (differenze per seed e IC95); `meanDifference` resta solo una statistica descrittiva di gruppo e non va presentata come prova causale.
- Il cull conserva in totale `ceil(N/5)` organismi; la quota di ciascuna specie deriva dai maggiori resti, non da `ceil(n_species/5)`.
- Il dataset scientifico è distribuito come `.json.gz` con manifest: `payloadSha256` copre il payload canonico, `sourceSha256` identifica i sorgenti E1.3 usati.
- La vegetazione è mediata su celle geografiche distinte (wrap toroidale), non sul numero di organismi; le celle S09/S10/S13/S14 provengono da una griglia campionata, non da estremi globali.
- Nessun risultato va riportato senza seed, durata e comando che lo ha prodotto.
