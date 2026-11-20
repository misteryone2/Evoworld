# PLANET CURRENT STATE — EvoWorld Planet Engine

Audit del 2026-11-20. Stato basato su codice, test e documenti realmente presenti nel repository. Nessuno stato è stato dedotto da assunzioni esterne.

## 1. Repository, branch, commit, working tree

| Elemento | Valore osservato |
|---|---|
| Repository | `Evoworld-g3`, worktree collegato a `C:/Users/matti/Documents/Progetto predefinito/Evoworld-git/.git/worktrees/Evoworld-g3` (`.git:1`) |
| Remote | `origin https://github.com/misteryone2/Evoworld.git` |
| Branch di partenza | `milestone/genome/gen0-audit` @ `5672f12`, uguale a `main` e `origin/main` |
| Branch di lavoro | `planet/phase0-audit`, creato da `5672f12` |
| Worktree operativo | `C:\Users\matti\Documents\Progetto predefinito\Evoworld-planet`, creato apposta per isolare Planet Engine da GENOME. Il worktree condiviso `Evoworld-g3` è nel frattempo tornato al branch `milestone/genome/gen0-audit` e contiene `docs/genome/` non tracciato, di competenza GENOME e non toccato. |
| Working tree | Pulito prima e dopo la creazione del branch (`git status --porcelain` vuoto) |
| Merge | Nessuno eseguito; `main` non modificato |
| Git | Non nel PATH; usato `C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd\git.exe` |
| Node/npm | Non nel PATH; usato Node `v22.14.0` da `C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64` |
| Dipendenze | `next 16.3.0`, `react 19.2.8`, `three ^0.185.1`, `vitest ^4.1.10` (`package.json:13-28`) |
| Guide Next 16 | Lette `node_modules/next/dist/docs/index.md`, `01-app/01-getting-started/02-project-structure.md`, `05-server-and-client-components.md`, `01-app/02-guides/lazy-loading.md:175-179` prima di prevedere modifiche al codice |

Nota: esistono altri worktree (`Evoworld-g-final`, `Evoworld-g2`, ecc.) con `AGENTS.md` propri. Non sono stati usati per questo progetto.

## 2. Mappa attuale del pianeta

```text
types/index.ts                     Cell, PlanetConfig, ViewportFrame, WorldSnapshot, protocollo worker
simulation/core/constants.ts       TICKS_PER_YEAR=400, DEFAULT_CHUNK_SIZE=32, CHUNK_ACTIVATION_HALO=1
simulation/core/random.ts          mulberry32 seedato
simulation/core/clock.ts           tempo di simulazione indipendente dal rendering
simulation/core/world.ts           orchestrazione, step, snapshot, popolazione
simulation/core/viewportFrame.ts   costruzione payload terrain texture su richiesta
simulation/core/renderFrame.ts     frame leggero per organismi/statistiche
simulation/planet/terrainNoise.ts  fBm per elevazione/acqua, potenziale vegetazione
simulation/planet/hydrology.ts     fiumi/laghi con convergenza locale
simulation/planet/seasons.ts       temperatura media annua + offset stagionale
simulation/planet/planet.ts        chunk, celle, update, catch-up, persistenza
simulation/planet/chunkActivity.ts chunk attivi in base agli organismi
workers/simulation.worker.ts       loop 30 Hz, comandi, snapshot, viewport
lib/useMultiverse.ts               gestione worker lato UI, richieste, timeout
lib/persistence.ts                 IndexedDB `evoworld`, store `sessions`
lib/terrainColor.ts                mappatura TerrainType -> RGB e overlay visivi
lib/sphereProjection.ts            proiezione torus -> sfera, sampling heightmap
lib/qualityProfile.ts              profili qualità e downgrade adattivo
components/simulation/Planet3DView.tsx   renderer Three.js
components/simulation/planet3d/*         cielo, sole, LOD, camera, creature, selezione
```

Il sottosistema pianeta è oggi **cinque file** (`terrainNoise.ts`, `hydrology.ts`, `seasons.ts`, `planet.ts`, `chunkActivity.ts`). Non esistono moduli dedicati a massa, gravità, atmosfera, geologia, precipitazioni o bilancio energetico.

## 3. Catena causale realmente implementata

```text
seed + coordinate
  ├─> elevazione fBm                         terrainNoise.ts:77-88
  ├─> acqua fBm + bias elevazione            terrainNoise.ts:91-95
  ├─> temperatura media annua (lat, elev, hash) seasons.ts:45-47
  └─> fertilità hash                         terrainNoise.ts:130-136

elevazione + acqua -> oceans/mountain structurali   terrainNoise.ts:99-103
elevazione -> idrologia locale (fiumi/laghi)        hydrology.ts:112-187
acqua + fiumi/laghi -> waterAvailability            hydrology.ts:247-261
temperatura + waterAvailability + fertilità -> vegetationPotential   terrainNoise.ts:132-136
temperatura annuale + waterAvailability + vegetation -> bioma        planet.ts:157-162,222
tick -> offset stagionale -> temperature corrente + regrowth         planet.ts:344-369
```

La catena **non** è `elevazione -> acqua -> temperatura -> ...`: l'acqua non influenza la temperatura. La catena documentata in `planet.ts:198-201` (`ELEVATION → WATER → CLIMATE → BIOME → VEGETATION`) è inoltre invertita nell'ordine finale: il codice calcola prima vegetazione (`:211-220`) e poi bioma (`:222`).

## 4. Audit per punto richiesto

### 4.1 Repository, branch, commit, working tree

Vedi §1. Branch dedicato creato; `main` intatto; nessun merge.

### 4.2 Struttura attuale del pianeta

`Planet` è una classe con chunk lazili (`planet.ts:70-85`), 5 file in `simulation/planet/`, contratti in `types/index.ts:142-187`. Non ha dipendenze da React/DOM; questo vincolo è esplicitamente documentato in `types/index.ts:1-8`.

### 4.3 Generazione della superficie

Elevazione da tre layer fBm: continentale, ridged con land mask, dettaglio (`terrainNoise.ts:77-88`). La normalizzazione usa `ELEVATION_REDISTRIBUTION_POWER = 1.35` (`:74`). È morfologia procedurale, non geofisica: non ci sono placche, orogenesi, erosione o sedimentazione.

### 4.4 Terrain e heightmap

`Cell.elevation` è `0..1`, fissato alla generazione (`types/index.ts:143`). `ViewportFrame.elevation` è un canale `Float32Array` a risoluzione limitata (`types/index.ts:371-380`) usato per displacciare i vertici della sfera e per appoggiare creature (`lib/sphereProjection.ts:39-70`). La mappa è equirettangolare: il mondo simulato è toroidale e la proiezione sulla sfera comprime i poli (`lib/sphereProjection.ts:1-16`, `Planet3DView.tsx:127-130`).

### 4.5 Oceani e acqua

`Cell.water` è un campo fBm con bias di elevazione, fissato alla generazione (`terrainNoise.ts:91-95`). Oceano = `water > 0.65` (`terrainNoise.ts:99-103`). Fiumi/laghi sono un'approssimazione locale di convergenza, esplicitamente non un accumulo globale sorgente-mare (`hydrology.ts:23-40,128-154`). Nel renderer l'acqua è una sfera trasparente a raggio fisso `PLANET_RADIUS + 0.004` (`Planet3DView.tsx:315-333`): **non esiste un livello del mare simulato**, e `Cell.water` non è nemmeno presente in `ViewportFrame` (`types/index.ts:361-402`).

### 4.6 Atmosfera e shader

Non esiste modello atmosferico. L'atmosfera visiva è un dome a gradiente (`planet3d/sky.ts:15-39`), fog in modalità superficie, luce emisferica e tone mapping ACES (`Planet3DView.tsx:239-243,268-271,510-511`). Non ci sono shader di scattering, composizione, pressione, vento o umidità. Le nuvole sono sprite con conteggio/vento costanti (`sky.ts:9-13`, `Planet3DView.tsx:453-469,594-605`).

### 4.7 Biomoi

Sette tipi fissi (`types/index.ts:136`). Ocean/mountain strutturali; gli altri cinque sono rule-based soglie su temperatura annuale, disponibilità d'acqua e vegetazione (`planet.ts:157-162`). Non sono puramente latitudinali e possono cambiare nel tempo tramite vegetazione; la stabilità stagionale è deliberata perché si usa la media annua, non la temperatura istantanea (`planet.ts:344-353`, `tests/seasons.test.ts:104-117`). Non sono però emergenti da suolo, ciclo idrologico, CO₂ o dinamica atmosferica.

### 4.8 Sistema climatico

Temperatura media annua: `32 - |lat|*40 - elev*10 + hash*2` (`seasons.ts:45-47`). Offset stagionale: ampiezza `12`, seno con fase fissa, simmetria emisferica (`seasons.ts:22,35-38`). `TICKS_PER_YEAR = 400` (`constants.ts:5`). Non esistono irraggiamento stellare, albedo, effetto serra, pressione, circolazione, precipitazioni o umidità.

### 4.9 Rotazione, orbita, illuminazione

Non implementati come modello. La rotazione visiva è `OrbitControls.autoRotate` (`Planet3DView.tsx:260-261`). Il sole è un vettore costante `[6,4,8]` (`planet3d/sun.ts:3`) riposizionato rispetto all'osservatore in modalità follow/free per evitare la notte (`sun.ts:24-30`, `Planet3DView.tsx:590-591`). Non ci sono inclinazione assiale, orbita, giorno/notte o terminator fisico.

### 4.10 Rendering Three.js

`MeshStandardMaterial` con `DataTexture` per colore/roughness/metalness, sfera displacciata, oceano trasparente, nove `InstancedMesh` per creature più pool generici, scena locale, nuvole e cielo (`Planet3DView.tsx:223-469`). LOD a tre livelli (320×160, 640×320, 1024×512) in `planet3d/terrainTiers.ts:21-25`. Il payload arriva su richiesta tramite `requestViewport` (`types/index.ts:335-402`, `workers/simulation.worker.ts:163-171`).

### 4.11 Worker e simulazione

Protocollo in `types/index.ts:464-485`; loop a 30 Hz con accumulatore e tetto 200 tick (`workers/simulation.worker.ts:9-12,84-104`); `safeStep` ferma il loop ed emette `error` (`:72-82`). UI in `lib/useMultiverse.ts:108-169`. **Non esistono test del protocollo worker**. `requestViewport` è fire-and-forget senza correlation id e l'ultima risposta vince (`useMultiverse.ts:119-122,293-295`).

### 4.12 Persistence

`WorldSnapshot` contiene config, chunk materializzati, organismi, RNG, registro specie e metadati genome (`types/index.ts:300-333`; `world.ts:488-501`). Ogni chunk salva `cells` e `lastActiveTick` (`types/index.ts:290-298`). `Cell` include `riverFlow`, `isLake`, `seasonalOffset`: tutti persistono nei chunk materializzati. Il ripristino usa `Planet.fromChunkSnapshot` o migrazione legacy densa (`world.ts:503-536`, `planet.ts:556-597`). IndexedDB è in `lib/persistence.ts:16-96`. Non esiste versione schema né test end-to-end save→load→step del pianeta.

### 4.13 Performance

Meccanismi presenti: chunk 32 con halo 1 e chunk attivi daiorganismi (`constants.ts:8-24`, `chunkActivity.ts:39-67`), generazione lazy (`planet.ts:235-313`), catch-up chiuso per chunk dormienti (`:396-486`), LOD/qualità adattiva (`terrainTiers.ts`, `qualityProfile.ts`), cache species/anatomy, frame tipizzati. **Nessun chunk eviction** (`scripts/worldScale.benchmark.ts:33-50`).

Metriche reali presenti nei documenti:

- `docs/graphics/G3_PERFORMANCE_REPORT.md:24-31`: medie CPU di `updateCreatureInstances` a 100/500/1500/3000 creature, rispettivamente `0.932/2.867/8.365/17.022 ms` (legacy), `2.459/11.684/35.540/69.529 ms` (G2-current), `2.809/14.019/42.292/80.056 ms` (G2-optimized).
- `docs/graphics/G3_PERFORMANCE_REPORT.md:35-40`: rigenerazione `syncFrame` `70.122/218.074/561.879/857.498 ms` alle stesse popolazioni.
- `docs/graphics/G3_PERFORMANCE_REPORT.md:83-96`: draw call browser 12/23/26-46 per basso/medio/alto; heap JS 121.9 MB; FPS GPU non misurati.
- `docs/research/iv1b/REPORT.md:85-92`: costi tick con sink scientifico attivo, da `3.54 ms` a 100 organismi a `3407.47 ms` a 10000; configurazione diversa da quella di produzione (sink NULL).

Non sono state trovate misure di buildViewportFrame, upload GPU, FPS reali, latenza IndexedDB o costi `postMessage`.

### 4.14 Sistemi già funzionanti

- Generazione deterministica seedata di elevazione/acqua/idrologia.
- Chunk lazy e deterministici, indipendenti dall'ordine di visita.
- Stagionalità stabile della temperatura e.Label dei biomi non oscillanti d'inverno.
- Regrowth della vegetazione con equivalenti chiusi per chunk dormienti.
- Viewport su richiesta a risoluzione limitata e heightmap condivisa.
- Protocollo worker, loop, snapshot e persistenza IndexedDB esistenti.
- LOD e profili qualità con downgrade misurato.

### 4.15 Sistemi mancanti

Massa/raggio/gravità reali; inclinazione assiale; orbita; irraggiamento stellare; bilancio energetico; albedo; effetto serra; pressione/composizione atmosferica; circolazione/venti; precipitazioni/umidità; ciclo dell'acqua; suolo; erosione; sedimentazione; tettonica; vulcanismo; eventi geologici; livello del mare simulato; nuvole/wind coupling; illuminazione/terminator física; Environment Snapshot.

### 4.16 Sistemi semplificati

Tutti quelli in §4.15 che hanno un surrogato: fBm instead of geologia, sinusoide instead of orbita/energia, convergenza locale instead of drenaggio globale, rule-based biome instead of emergenza, sprite clouds instead of atmosfera, fixed sun instead of illuminazione, fixed ocean shell instead of water level.

### 4.17 Sistemi che non devono essere riscritti

- `simulation/core/random.ts` e la strategia seedata.
- Architettura chunk/lazy/dormancy di `Planet` e `chunkActivity.ts`.
- `World` orchestration e protocollo worker esistente, salvo estensioni additive.
- `Planet3DView.tsx` e la pipeline Three.js: va fatta consumare nuovi dati, non sostituita.
- `simulation/biology/*` e `lib/anatomy|phenotype|visual/*`: territorio GENOME/GRAFICA, non toccare.
- `lib/persistence.ts` come storage: estendere lo schema in modo versionato, non riscrivere IndexedDB.

## 5. Classificazione

| Sistema | Stato | Evidenza |
|---|---|---|
| Chunk/lazy terrain/dormancy | EXISTING_COMPLETE | `planet.ts:42-69,235-313,396-543`; `tests/planet.test.ts:146-201` |
| Determinismo same-runtime | EXISTING_COMPLETE | `random.ts:1-15`; `terrainNoise.ts:13-25`; `tests/hydrology.test.ts:9-44` |
| Stagionalità e stabilità bioma | EXISTING_COMPLETE | `seasons.ts:22-47`; `tests/seasons.test.ts:91-117` |
| Classificatore biome attuale | EXISTING_COMPLETE (nel proprio set di regole) | `planet.ts:157-162` |
| Viewport/heightmap/LOD renderer | EXISTING_COMPLETE | `viewportFrame.ts:28-80`; `terrainTiers.ts:21-43`; `Planet3DView.tsx:1052-1148` |
| Worker loop/error boundary | EXISTING_COMPLETE | `workers/simulation.worker.ts:9-12,72-104,173-179` |
| Snapshot/legacy migration | EXISTING_COMPLETE | `world.ts:488-536`; `planet.ts:556-597` |
| Indic correspondence | EXISTING_COMPLETE | `persistence.ts:16-96` |
| Biology-facing Cell per fitness | EXISTING_COMPLETE | `environment.ts:56-70`; `GENOMA-v1.11.0.md:27,37-40` |
| Morfologia/elevazione | EXISTING_NEEDS_EXTENSION | `terrainNoise.ts:59-103` |
| Idrologia locale | EXISTING_NEEDS_EXTENSION | `hydrology.ts:23-40,128-154` |
| Vegetazione/biome integration | EXISTING_NEEDS_EXTENSION | `terrainNoise.ts:132-136`; `planet.ts:355-369` |
| Protocollo viewport/snapshot | EXISTING_NEEDS_EXTENSION | `types/index.ts:464-485`; `useMultiverse.ts:119-122,293-295` |
| LOD/adaptive payoff | EXISTING_NEEDS_EXTENSION | `iv1b/REPORT.md:32,156` |
| Documentazione causale | EXISTING_DEFECT | `planet.ts:198-201`; `types/index.ts:130-131` |
| Pending promise cleanup | EXISTING_DEFECT | `useMultiverse.ts:199-209,269-271,361-363` |
| Legacy `useSimulation.ts` | EXISTING_DEFECT | `useSimulation.ts:6,24-32`, unused |
| Ocean surface | EXISTING_DEFECT | `Planet3DView.tsx:315-333`; no water in viewport |
| Clouds/wind | EXISTING_DEFECT | `sky.ts:9-13`; no wind source |
| Atmosfera/scattering | MISSING | `sky.ts:15-39` solo cosmetico |
| Massa/gravità/orbita/tilt/stella/serra | MISSING | nessun campo o modulo |
| Precipitazioni/umidità/ciclo acqua/suolo | MISSING | `types/index.ts:142-170` |
| Erosione/tettonica/vulcanismo/eventi | MISSING | `E1_SCIENTIFIC_AUDIT.md:68-72` |
| Environment Snapshot | MISSING | nessun contratto trovato |
| Chunk eviction | MISSING | `worldScale.benchmark.ts:46-50` |
| Torus -> sfera fedele | BLOCKED | `sphereProjection.ts:1-16`; richiede griglia sferica |
| GPU/FPS/mobile profiling | BLOCKED | Node-only, `G3_PERFORMANCE_REPORT.md:93-98` |
| Save→resume equivalenza pianeta | UNVERIFIED | `tests/world.test.ts:77-87` shallow |
| Planet-switch testura in surface mode | UNVERIFIED | `Planet3DView.tsx:671,997-1004` |
| Validità scientifica/calibrazione | UNVERIFIED | nessuna unità SI o dataset di calibrazione |

## 6. Baseline test eseguita

Comando: `npm test -- --reporter=dot` con Node `v22.14.0`, 2026-11-20, con tre audit paralleli in esecuzione.

```text
Test Files  8 failed | 92 passed | 1 skipped (101)
Tests       14 failed | 1090 passed | 1 skipped (1105)
Duration    196.85 s
```

Fallimenti:

- 5 noti/preesistenti da `LEGGIMI.txt:11` e `CHANGELOG.md:14-22`: `fauna180` (1), `reproduction` (2), `vibeGenomeV1110` (2).
- 9 timeout a 5000 ms: `hydrology` (1), `livingBehavior` (1), `planet` (2), `settlementDefaults` (1), `vibeGenomeV1110` mutazione (1), `iv1/invariance` (3).

I timeout sono compatibili con il carico concorrente e non sono stati classificati come difetti senza riverifica mirata.

Riverifica mirata senza carico parallelo:

```text
npm test -- tests/planet.test.ts tests/hydrology.test.ts tests/seasons.test.ts tests/terrainColor.test.ts tests/biomeVegetation.test.ts --testTimeout=30000 --reporter=dot
Test Files  5 passed (5)
Tests       76 passed (76)
Duration    36.02 s
```

Quindi i test planetari non hanno fallito nella riverifica; i timeout della baseline vanno trattati come load-dependent, non come difetti del pianeta. Vedi `PLANET_VALIDATION_PLAN.md`.

## 7. Dipendenze e API rilevanti

- API interne: `Planet.getCell/peekCell/sampleBaseline/update/getMaterializedChunks/fromChunkSnapshot/fromLegacyDenseCells`; `computeElevationAt/computeWaterAt/classifyBaseAt/computeVegetationPotential`; `hydrologyAt/computeChunkHydrology/computeWaterAvailability`; `annualMeanTemperature/seasonalTemperatureOffset/seasonForTick`; `buildViewportFrame`; `buildRenderFrame`; `World.toSnapshot/fromSnapshot`.
- Contratti TypeScript: `Cell`, `PlanetConfig`, `TerrainType`, `ViewportFrame`, `RenderFrame`, `WorldSnapshot`, `WorkerCommand`, `WorkerEvent`.
- Nessuna dipendenza esterna di simulazione: solo TypeScript, Three.js lato render e Vitest per i test.

## 8. Limiti di questa audit

- Non sono stati eseguiti `next build`, ESLint o prove browser/telefono in questa fase.
- Le metriche citate sono state lette dai documenti del repository; non sono state rigenerate salvo la baseline test.
- Lo stato `UNVERIFIED` indica assenza di evidenza, non assenza di funzionalità.
