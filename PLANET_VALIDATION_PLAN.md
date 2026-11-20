# PLANET VALIDATION PLAN — EvoWorld Planet Engine

Piano di validazione con comandi reali, criteri verificabili e protocollo di misurazione. Nessun benchmark viene dichiarato prima di essere eseguito.

## 1. Ambiente di validazione

- Node usato per l'audit: `v22.14.0` da `C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64`.
- npm non è nel PATH: usare il `npm.cmd` assoluto della stessa installazione oppure anteporre la directory al PATH.
- Vitest: `4.1.12` (rilevato dalla baseline).
- Git: eseguibile GitHub Desktop `C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd\git.exe`.
- La riproducibilità esatta del progetto richiede Node 22: `E1_3_SCIENTIFIC_INTEGRITY_REPORT.md:84,131-134` documenta divergenze numeriche con Node 26.

Comando generico:

```powershell
$env:PATH = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:PATH
& 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64\npm.cmd' test -- <args>
```

## 2. Baseline registrata

Eseguita il 2026-11-20 su `planet/phase0-audit` partendo da `5672f12`, con tre audit paralleli attivi:

```text
Test Files  8 failed | 92 passed | 1 skipped (101)
Tests       14 failed | 1090 passed | 1 skipped (1105)
Duration    196.85 s
```

Fallimenti noti/preesistenti (`LEGGIMI.txt:11`, `CHANGELOG.md:14-22`):
- `tests/fauna180.test.ts` — 1
- `tests/reproduction.test.ts` — 2
- `tests/vibeGenomeV1110.test.ts` — 2

Timeout load-dependent nella baseline:
- `hydrology` 1, `livingBehavior` 1, `planet` 2, `settlementDefaults` 1, `vibeGenomeV1110` 1, `iv1/invariance` 3.

Riverifica mirata senza carico parallelo:

```powershell
npm test -- tests/planet.test.ts tests/hydrology.test.ts tests/seasons.test.ts tests/terrainColor.test.ts tests/biomeVegetation.test.ts --testTimeout=30000 --reporter=dot
```

```text
Test Files  5 passed (5)
Tests       76 passed (76)
Duration    36.02 s
```

Conclusione: la baseline planetaria è sana; i timeout non vanno trattati come regressioni finché non si ripetono a carico normale.

## 3. Layer di test

| Layer | Cosa valida | Dove | Milestone |
|---|---|---|---|
| L1 Unità fisiche | formule, unità, intervalli | `tests/planetEngineCore.test.ts` | M1 |
| L2 Invarianti | `g=GM/R²`, periodo Kepler, inverso quadrato, bilancio energia | `tests/planetEngineCore.test.ts` | M1 |
| L3 Superficie | ipsometria, sea level, continuità chunk, conservazione massa | `tests/planetEngineSurface.test.ts` | M2 |
| L4 Clima/idro | gradienti, serra, P-E-runoff, stagioni orbitali | `tests/planetEngineClimate.test.ts`, `tests/planetEngineHydrology.test.ts` | M3 |
| L5 Biombi/snapshot | assenza regole latitudinali, isteresi, compatibilità `Cell` | `tests/planetEngineBiomes.test.ts`, `tests/planetEngineSnapshot.test.ts` | M4 |
| L6 Render adapter | fallback invariante quando canali assenti | `tests/planetEngineRenderAdapter.test.ts` | M5 |
| L7 Persistence/eventi | schema v2, save→load→step, eventi deterministici | `tests/planetEngineEvents.test.ts`, `tests/planetEnginePersistence.test.ts` | M6 |
| L8 Performance | costi reali misurati, non soglie inventate | `scripts/planetEngine.benchmark.ts` | M7 |

## 4. Test M1 — criteri di accettazione

| Test | Criterio |
|---|---|
| gravità Terra-like | `PlanetCore.gravity` per `M=5.972e24 kg`, `R=6.371e6 m` in `[9.7, 9.9] m/s²` |
| periodo orbitale Terra-like | `Orbit.period` per `a=1 AU`, `M*=M_sun` in `[365, 366]` giorni, tolleranza 0.5% |
| flusso stellare | raddoppiando la distanza il flusso diventa `1/4` entro `1e-9` relativo |
| temperatura equilibrio | aumentando l'albedo la temperatura diminuisce monotonicamente |
| serra | aumentando `pCO2` la temperatura superficiale aumenta monotonicamente |
| determinismo | due istanze con lo stesso seed e stessa config producono gli stessi valori su 100 tick |
| indipendenza | `grep` sugli import dei nuovi file non trova `react`, `three`, `simulation/biology`, DOM |

Comando:

```powershell
npm test -- tests/planetEngineCore.test.ts --testTimeout=30000 --reporter=verbose
```

## 5. Test M2 — criteri di accettazione

- Per una config con inventario idrico crescente, `seaLevelM` è monotonicamente crescente.
- La maschera oceano è continua tra chunk confinanti: campionando la stessa coordinata da due chunk diversi si ottiene lo stesso valore.
- Erosione + sedimentazione: `|volumeBefore - volumeAfter - sedimentVolume| / volumeBefore < 1e-6`.
- La ripetizione con lo stesso seed dopo 100 step produce lo stesso hash della superficie.

## 6. Test M3 — criteri di accettazione

- A parità di atmospheric forcing, `T(equatore) > T(45°) > T(polo)`.
- A parità di latitudine, quota maggiore => temperatura minore.
- Raddoppio `pCO2` => `T_surface` maggiore.
- A parità di temperatura, umidità maggiore => precipitazione media maggiore.
- Il bilancio idrico si chiude: `ocean + ice + vapor + soil + runoff` varia solo di `P - E` entro tolleranza.
- Con obliquità 0 le differenze stagionali di insolazione sono ~0; con obliquità >0 compaiono e i due emisferi sono sfalsati di 6 mesi.

## 7. Test M4 — criteri di accettazione

- Nessuna stringa o costante del classificatore usa latitudine come decisione diretta.
- Due punti con stessa temperatura/precipitazione/umidità ma latitudini diverse possono avere bioma diverso solo se gli altri campi differiscono.
- L'isteresi mantiene lo stesso bioma per perturbazioni sotto soglia.
- `toLegacyCell()` produce `temperature`, `water`, `elevation`, `seasonalOffset` nelle stesse unità attese da `simulation/biology/environment.ts:56-70`.
- Test di non regressione: `environmentalFitness(genome, toLegacyCell(...))` non lancia e restituisce valori finite per 1000 campioni.

## 8. Test M5 — criteri di accettazione

- Con i nuovi canali assenti, `Planet3DView` usa esattamente i valori precedenti: test sul transfer function, non screenshot.
- Con `seaLevelM` presente, la maschera oceano della texture corrisponde a `elevationM < seaLevelM`.
- Con `windU/windV` presenti, il drift delle nuvole usa quei valori; con canali assenti usa `CLOUD_WIND` storico.
- Con irraggiamento presente, l'intensità della luce è una funzione monotonicamente crescente del flusso.

## 9. Test M6 — criteri di accettazione

- Snapshot v1 carica e converte a v2 senza perdere chunk materializzati.
- `save -> load -> 100 step` produce lo stesso state hash di `200 step` senza interruzione.
- Ogni `requestViewport` ha un id; una risposta tardiva con id obsoleto viene ignorata.
- Su reset/load non restano promise pending: test con due richieste simultanee.

## 10. Protocollo di misurazione performance

1. Registrare data, commit, Node version, OS, CPU, RAM, modalità (test/benchmark).
2. Eseguire 5 warming + 20 misure; riportare mediana e p95.
3. Non usare `Date.now()` per misure sub-millisecond; usare `performance.now()`.
4. Non confrontare misure con carico parallelo attivo.
5. Distinguere:
   - `PHYSICAL_MODEL`: costo del modello;
   - adapter: costo della conversione;
   - rendering: costo GPU/lato client.
6. Se una misura non è possibile in Node (FPS, upload GPU, heap browser), riportarla come `UNVERIFIED`, non come 0.

Comando previsto (da creare in M7):

```powershell
npm run benchmark -- --config vitest.bench.config.ts scripts/planetEngine.benchmark.ts
```

## 11. Matrice success criteria ↔ validazione

| Criterio di successo | Evidenza |
|---|---|
| 1. Pianeti coerenti | M1 invariants + M2 sea level + M3 energy budget |
| 2. Superficie geologicamente plausibile | M2 geologia/erosione/ipsometria |
| 3. Clima e idrosfera causalmente coerenti | M3 test gradienti, serra, bilancio idrico |
| 4. Biommi in funzione dei dati ambientali | M5 classifier test, assenza dipendenza latitudine diretta |
| 5. Evoluzione nel tempo | M2/M3 step + M6 eventi |
| 6. Dati utilizzabili dal simulatore biologico | M4 snapshot compatibile con `environmentalFitness` |
| 7. Performance accettabili | M7 benchmark misurati + regression guard |
| 8. Deterministico con seed | test determinism in tutte le milestone |
| 9. Testabile senza rendering | import graph check + test Node-only |
| 10. Integrabile con GENOME | contratto `EnvironmentSnapshot` + adapter, zero modifiche a moduli GENOME |

## 12. Comandi di verifica finale

```powershell
# Test mirati Planet Engine
npm test -- tests/planetEngineCore.test.ts tests/planetEngineSurface.test.ts tests/planetEngineClimate.test.ts tests/planetEngineHydrology.test.ts tests/planetEngineBiomes.test.ts tests/planetEngineSnapshot.test.ts --testTimeout=30000 --reporter=dot

# Suite completa
npm test -- --reporter=dot

# Typecheck
npx tsc --noEmit

# lint
npm run lint

# build (solo a integrazione approvata)
npm run build
```

La suite completa deve mantenere il numero di fallimenti preesistenti o migliorarlo; nuovi fallimenti fuori dal perimetro planetario vanno segnalati a Pandora, non corretti di nascosto.
