# PLANET IMPLEMENTATION PLAN — EvoWorld Planet Engine

Piano per milestone verificabili. Ogni milestone produce un commit atomico su `planet/phase0-audit` (o su un branch figlio dedicato), con diff rivisto prima del commit. Nessun merge in `main` senza autorizzazione.

## Regole operative

1. Non modificare `simulation/biology/**`, `lib/anatomy/**`, `lib/phenotype/**`, `lib/visual/**`, `components/species/**`.
2. Non riscrivere moduli esistenti funzionanti; aggiungere adapter e estensioni additive.
3. Ogni modulo nuovo dichiara il proprio tag (`PHYSICAL_MODEL`, `APPROXIMATION`, `SIMULATION_HEURISTIC`, `VISUAL_EFFECT`) nel commento intestatario.
4. Ogni milestone ha test headless eseguiti con Node `v22.14.0`.
5. Se una milestone richiede toccare un file GENOME/GRAFICA, si ferma e si chiede autorizzazione.

## M0 — Audit e documentazione (in corso / completata con questo commit)

**Obiettivo**: stabilire uno stato verificabile senza modificare il comportamento.

Consegne:
- `PLANET_CURRENT_STATE.md`
- `PLANET_GAP_ANALYSIS.md`
- `PLANET_ARCHITECTURE.md`
- `PLANET_IMPLEMENTATION_PLAN.md`
- `PLANET_VALIDATION_PLAN.md`
- `PLANET_RISK_REGISTER.md`

Exit criteria:
- Branch dedicato creato da `main` (`5672f12`).
- Working tree pulito prima delle modifiche.
- Baseline test registrata: 1090 pass / 14 fail / 1 skip; riverifica planetaria 76/76 pass.
- Nessun file di simulazione o rendering modificato.

**Commit**: `docs(planet): add Phase 0 audit and architecture`.

## M1 — Planetary Core deterministico (prima implementazione autonoma)

**Obiettivo**: creare il nucleo fisico indipendente, testabile senza rendering, senza collegarlo ancora al vecchio `Planet`.

File nuovi:
- `simulation/planetEngine/contracts.ts`
- `simulation/planetEngine/units.ts`
- `simulation/planetEngine/deterministic.ts`
- `simulation/planetEngine/core/PlanetCore.ts`
- `simulation/planetEngine/core/Orbit.ts`
- `simulation/planetEngine/core/Stellar.ts`
- `simulation/planetEngine/core/EnergyBudget.ts`
- `simulation/planetEngine/core/invariants.ts`
- `simulation/planetEngine/runtime/PlanetEngine.ts` (facciata minima)
- `tests/planetEngineCore.test.ts`

Contenuto:
- `PlanetCore`: massa, raggio, gravità `g=GM/R²`, rotazione `Ω=2π/T`, obliquità.
- `Orbit`: elemento orbitali, `T=2π√(a³/G(M*+M))`, anomalia media, distanza stella, declinazione.
- `Stellar`: flusso `L/(4πd²)`.
- `EnergyBudget`: insolazione globale, albedo configurabile derivato da superficie, temperatura di equilibrio, delta serra parametrico.
- `invariants`: validazione intervalli e relazioni.
- `deterministic`: hash/derived stream senza `Math.random()`.

Exit criteria:
- `npm test -- tests/planetEngineCore.test.ts` verde.
- `npx tsc --noEmit` verde.
- Nessun import da `react`, `three`, `simulation/biology`, DOM.
- Due istanze con lo stesso seed producono gli stessi valori.
- Test espliciti: gravità Terra-like ~9.81 m/s², periodo orbitale Terra-like ~365.25 giorni, inverso quadrato del flusso.

**Commit**: `feat(planet-engine): add deterministic planetary core`.

## M2 — Geologia e superficie fisica

**Obiettivo**: trasformare l'elevazione da fBm astratto in superficie con vincoli fisici e ipsometria.

File nuovi:
- `simulation/planetEngine/geology/Interior.ts`
- `simulation/planetEngine/geology/Tectonics.ts`
- `simulation/planetEngine/geology/Volcanism.ts`
- `simulation/planetEngine/geology/SurfaceEvolution.ts`
- `simulation/planetEngine/surface/Hypsometry.ts`
- `simulation/planetEngine/surface/Continents.ts`
- `simulation/planetEngine/surface/Coastlines.ts`
- `tests/planetEngineSurface.test.ts`

Exit criteria:
- Livello del mare calcolato da inventario idrico + ipsometria, non da soglia `water>0.65`.
- Continuità dei chunk: lo stesso seed produce lo stesso confine costiero indipendentemente dall'ordine di accesso.
- Erosione/sedimentazione conservano la massa entro tolleranza numerica documentata.
- Nessuna modifica a `simulation/planet/terrainNoise.ts`.

**Commit**: `feat(planet-engine): add geology and physical surface`.

## M3 — Atmosfera, clima, idrosfera

**Obiettivo**: chiudere la catena stella→clima→acqua→superficie.

File nuovi:
- `simulation/planetEngine/atmosphere/Composition.ts`
- `simulation/planetEngine/atmosphere/Greenhouse.ts`
- `simulation/planetEngine/atmosphere/Circulation.ts`
- `simulation/planetEngine/climate/Insolation.ts`
- `simulation/planetEngine/climate/TemperatureField.ts`
- `simulation/planetEngine/climate/Humidity.ts`
- `simulation/planetEngine/climate/Precipitation.ts`
- `simulation/planetEngine/climate/ClimateZones.ts`
- `simulation/planetEngine/hydrology/Inventory.ts`
- `simulation/planetEngine/hydrology/SeaLevel.ts`
- `simulation/planetEngine/hydrology/WaterCycle.ts`
- `simulation/planetEngine/hydrology/Drainage.ts`
- `tests/planetEngineClimate.test.ts`
- `tests/planetEngineHydrology.test.ts`

Exit criteria:
- Temperatura diminuisce con latitudine e altitudine a parità di altri fattori.
- Aumento CO₂ aumenta temperatura superficiale.
- Aumento irraggiamento aumenta evaporazione e poi precipitazione media.
- Bilancio idrico: `d inventories/dt = P - E - runoff`, chiuso entro tolleranza.
- Stagioni coerenti con inclinazione e fase orbitale, non con tabella fissa.

**Commit**: `feat(planet-engine): add atmosphere climate and hydrology`.

## M4 — Biommi emergenti e Environment Snapshot

**Obiettivo**: sostituire le soglie statiche con idoneità continua e fornire contratto stabile a GENOME senza toccare i suoi moduli.

File nuovi:
- `simulation/planetEngine/biomes/classifier.ts`
- `simulation/planetEngine/biomes/stability.ts`
- `simulation/planetEngine/snapshot/EnvironmentSnapshot.ts`
- `simulation/planetEngine/snapshot/legacyAdapter.ts`
- `simulation/planetEngine/snapshot/schema.ts`
- `tests/planetEngineBiomes.test.ts`
- `tests/planetEngineSnapshot.test.ts`

Exit criteria:
- Nessuna regola `latitude < X => biome`.
- Il bioma dipende da temperatura, precipitazione, umidità, altitudine, suolo e stabilità.
- Isteresi evita oscillazioni rapide tra biomi.
- `toLegacyCell()` soddisfa `environmentalFitness()` senza modificare `environment.ts`: test di confronto sullo stesso input.
- `water` legacy resta l'asse grezzo, non `waterAvailability`.

**Commit**: `feat(planet-engine): add emergent biomes and environment snapshot`.

## M5 — Integrazione renderer (solo dopo validazione M1-M4)

**Obiettivo**: far consumare al rendering i dati del motore, non generarne di indipendenti.

Modifiche additive:
- `types/index.ts`: campi opzionali in `ViewportFrame` (`seaLevelM`, `humidity`, `precipitation`, `windU`, `windV`, `iceFraction`, `irradiance`).
- `simulation/core/viewportFrame.ts`: riempimento dei nuovi canali quando il motore è attivo.
- `lib/terrainColor.ts`: transfer functions addizionali, mantenendo quelle vecchie.
- `components/simulation/Planet3DView.tsx`: oceano cloud/light guidati dai canali, fallback ai valori attuali se assenti.
- `workers/simulation.worker.ts`: esposizione dei campi su richiesta.
- `tests/planetEngineRenderAdapter.test.ts`

Exit criteria:
- Con canali assenti, il rendering attuale è bit-per-bit invariante.
- Con canali presenti, oceano/nuvole/sole/ice leggono i dati del motore.
- Nessun nuovo calcolo climatico lato renderer.

**Commit**: `feat(planet-engine): wire viewport adapter to renderer`.

## M6 — Dinamica, eventi e persistence versionata

**Obiettivo**: evoluzione temporale e salvataggi robusti.

File nuovi / modifiche:
- `simulation/planetEngine/dynamics/events.ts`
- `simulation/planetEngine/dynamics/evolution.ts`
- `simulation/planetEngine/snapshot/schema.ts` (estensione)
- `workers/simulation.worker.ts` (comandi opzionali)
- `lib/useMultiverse.ts` (correlation id per viewport)
- `tests/planetEngineEvents.test.ts`
- `tests/planetEnginePersistence.test.ts`

Exit criteria:
- Eventi deterministici con seed e cooldown.
- Snapshot `schemaVersion=2` con migrazione da `1`.
- Save→load→step produce lo stesso stato di una simulazione non interrotta.
- Nessuna promise pending non risolta su reset/caricamento.

**Commit**: `feat(planet-engine): add dynamics and versioned snapshots`.

## M7 — Performance, LOD e chiusura validazione

**Obiettivo**: misurare e proteggere le prestazioni reali.

Attività:
- Cache per chunk e campi derivati.
- Eviction LRU deterministico.
- Benchmark di `buildViewportFrame`, `PlanetEngine.step()` e dimensione snapshot.
- Aggiornamento `PLANET_VALIDATION_PLAN.md` con numeri misurati.
- Test di non regressione sulle prestazioni solo dopo aver definito baseline reali.

**Commit**: `perf(planet-engine): add cached fields and measured benchmarks`.

## Sequenza autonoma consentita

Dopo il commit M0, proseguo con M1 senza attendere ulteriori istruzioni perché:
- non tocca moduli GENOME o rendering;
- è interamente headless e testabile;
- non richiede decisioni di progetto nuove oltre a quelle già fissate in `PLANET_ARCHITECTURE.md`.

M5 e M6 richiedono revisione prima dell'integrazione perché attraversano confini condivisi.

## Tracciabilità commit

Ogni commit dovrà riportare nel messaggio: milestone, modulo toccato e test eseguiti. Esempio:

```text
feat(planet-engine): add deterministic planetary core

M1: mass/radius/gravity/orbit/stellar/energy budget.
Tests: tests/planetEngineCore.test.ts, tsc --noEmit.
No changes to GENOME or rendering.
```
