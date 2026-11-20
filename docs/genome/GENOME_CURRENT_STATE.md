# GENOME — Stato attuale del repository (GEN-0)

**Data:** 2026-11-20  
**Branch di audit:** `milestone/genome/gen0-audit`, creato da `main@5672f12296e484a4ba02ba2876e2f5e82d266cb1`  
**Baseline GEN-0:** commit `2234eec6bb18e0ff5822247346a90461001737fd`; PR #4 open, branch pubblicato su `origin`  
**Revisione:** Rev 1 dopo la review tecnica di PR #4.  
**Metodo:** lettura diretta del codice, verifica Git/API, baseline test eseguito. Nessuna modifica al codice di produzione.  
**Classificazioni:** `EXISTING_COMPLETE`, `EXISTING_NEEDS_EXTENSION`, `EXISTING_DEFECT`, `MISSING`, `BLOCKED`, `UNVERIFIED`.

---

## 1. Stato Git verificato

| Ref | Hash | Verifica |
|---|---|---|
| `main` / `origin/main` | `5672f12296e484a4ba02ba2876e2f5e82d266cb1` | uguali, working tree pulito all'inizio dell'audit |
| `milestone/genome/gen0-audit` | `2234eec…` | branch dedicato GEN-0; 1 commit, 7 file documentali, PR #4 open |
| `graphics/g3-renderer-integration` | `717da65c81329188dc3ce25f5e83dcdf405cd1be` | branch storico G, ancora presente su `origin`; uguale a `archive/g3.1` |
| `iv1-r1-approved` | tag `3a439ef…` → `dbb114ecf849b90c74cf776f171e27a45e427ead` | approvazione finale IV1 |
| PR #1 | `closed`, `merged=false`, head `8c48c7d…` | chiusa come *superseded*; 8 file conservati in `archive/g1-pr1-remote` |
| PR #2 | `closed`, `merged=true`, merge `d330c12…` | E1 in `main` |
| PR #3 | `closed`, `merged=true`, merge `dbb114e…` | integrazione finale E2+G3+IV1 in `main` |

Otto tag annotati verificati su `origin`: `archive/baseline-e1`, `archive/baseline-iv1-a`, `archive/e2.3.1`, `archive/g1-pr1-remote`, `archive/g3.1`, `archive/iv1-a-r1`, `archive/iv1-b-r1`, `iv1-r1-approved`.

Sequenza G verificata tramite antenati di `main`: G1 (`05be422`, `d54ad51`, `fab8c67`) → G2 (`5924b7f`, `170b6f7`) → G2.1 (`958a60e`, `0879a88`) → consolidamento (`14c6f1f`, `27995b0`) → G3 (`d89885c`, `873e0b4`, `60033d8`) → G3.1 (`ae5d2c7`, `717da65`) → merge finale (`dbb114e`). **Tutti i sistemi G principali sono già integrati in `main`.** Non vanno ricostruiti.

I soli 8 file presenti in `archive/g1-pr1-remote` ma **non** in `main`: `G2_review.patch`, `LEGGIMI.txt.originale-main`, `LEGGI_PRIMA_G2.txt`, `PR_G2.md`, `docs/graphics/G2_GEOMETRY_CONVENTIONS.md`, `docs/graphics/G2_REVIEW_REPORT.md`, `lib/anatomy/geometry.ts`, `tests/anatomyG2Review.test.ts`. Sono documentazione storica, patch superate e vecchia implementazione G2; non vengono reintrodotti.

---

## 2. Il genoma esistente (cosa c'è davvero)

Il sistema attuale è un **genoma vettoriale a 33 geni**, non un genoma mendeliano.

### Contratti centrali

| Contratto | File | Contenuto |
|---|---|---|
| `BaseGenome` | `types/index.ts:14-55` | 13 tratti legacy: `size`, `speed`, `metabolism`, `vision`, `fertility`, `lifespan`, `carnivory`, `preferredTemperature`, `temperatureTolerance`, `preferredWater`, `waterTolerance`, `evasion`, `huntingSkill` |
| `GeneMap` / `Genome` | `types/index.ts:57-67` | `Record<string, number>` opzionale `ext`; 20 geni estesi |
| `GeneDefinition` | `simulation/biology/geneRegistry.ts:22-38` | `id`, `key`, `category`, `description`, `min`, `max`, `defaultValue`, `mutationStdFraction`, `distanceWeight`, `hook` |
| `GENE_REGISTRY` | `geneRegistry.ts:150-158` | 33 def congelate, indici `GENE_BY_KEY` / `GENE_BY_ID`, `EXTENDED_GENES` |
| `Phenotype` | `geneExpression.ts:57-84` | 26 campi derivati (`upkeepExtra`, `defenseFactor`, `flockGain`, `maturityFraction`, …) |
| `Organism` | `types/index.ts:99-125` | `genome: Genome`, `brain: Float32Array` (119 pesi), energia, età, memoria |
| `SpeciesRecord` | `types/index.ts:196-213` | `speciesId`, `parentSpeciesId`, `originTick`, popolazione, `originGenomeSnapshot` |
| `WorldSnapshot` | `types/index.ts:300-333` | `organisms`, `randomState`, `speciesRegistry`, `genomeVersion?`, `advancedGenome?`, `geneEffects?` |

### Funzioni principali

- `randomGenome` / `inheritGenome` / `cloneWithMutation` — `simulation/biology/genome.ts:37-92`.
- `getGene`, `inheritExt`, `cloneExt`, `deriveGeneRandom`, `inheritGenomeV2`, `cloneGenomeWithMutationV2` — `genomeExt.ts:19-129`.
- `expressGenome`, `phenotypeOf` (cache `WeakMap`) — `geneExpression.ts:114-170`.
- `migrateGenome`, `migrateSnapshot` — `genomeMigration.ts:18-68`.
- `geneticDistance`, `areGeneticallyCompatible` — `genome.ts:168-216`; soglie 0,16 / 0,26.
- `attemptSpeciation` — `speciation.ts:157-211`.
- `Random` mulberry32 — `simulation/core/random.ts:9-62`; `Math.random()` assente dal motore.

### Eredità, mutazione, compatibilità

- Figlio = **media dei due genitori** + mutazione gaussiana per tratto; `ext` ereditato con la stessa logica (`genome.ts:65-77`, `genomeExt.ts:102-116`).
- Tassi: `MUTATION_RATE = 0,15`, `MUTATION_STD_FRACTION = 0,04` (`traitRanges.ts:66-70`).
- Cervello: per peso sceglie un genitore poi muta (`brain.ts:83-106`).
- Compatibilità solo genomica (`reproduction.ts:112`), non basata su `speciesId`; fallback asessuato 15% (`:142-151`).
- `inheritGenomeV2` / `cloneGenomeWithMutationV2` / `areGeneticallyCompatibleV2` esistono ma **non sono usate dal loop live**, che usa le funzioni legacy + `inheritExt` (documentato in `GENOMA-v1.11.0.md:105`).

### Cosa manca concettualmente

Alleli, loci, cromosomi, diploidia vera, ploidia estendibile, meiosi, gameti, ricombinazione mendeliana, dominanza/recessività/codominanza, epistasi, epigenetica e linkage **non esistono** nel codice. Pleiotropia e poligenia esistono solo come effetti di calcolo in `geneExpression.ts`, non come astrazioni. Conferma documentale: `docs/research/e2/E2_0_ENGINE_ECOLOGY_AUDIT.md:48`.

---

## 3. Fenotipo, anatomia e renderer G

- `lib/phenotype/derive.ts:18` legge **solo 4 geni**: `size`, `bodyStature`, `furDensity`, `dermalArmor`.
- `lib/phenotype/types.ts:12-21` distingue `gene-direct`, `gene-derived`, `undetermined`, `aesthetic` con `certainty` esplicita. Questa è la buona fondazione da preservare.
- `derive.ts:33-45` dichiara `undetermined`: `bodyPlan`, `symmetry`, `segmentation`, `appendageCount`, `limbCount`, `jointStructure`, `locomotionMode`, `sensoryOrgans`, `internalOrgans`, `eyeCount`.
- `RenderFrame` (`types/index.ts:405-425`) contiene già i tre canali MOR opzionali (`organismsBodyStature`, `organismsFurDensity`, `organismsDermalArmor`) più `organismsMorphologyPresence`. La vecchia proposta `organismsMorphology?: Float32Array` in `G2_MISSING_GENETIC_DATA.md:11-20` è quindi **superata**: è stata implementata come tre array separati + maschera.
- `docs/graphics/G3_FINAL_LIMITATIONS.md:11`: il body plan resta `seeded-speculative`, scelta di rendering e non verità biologica.
- La catena live è già genome-agnostica: `RenderFrame` → `buildRenderFrame` (copia MOR, `renderFrame.ts:100-127`) → `syncFrame` → `derivePhenotype` → `generateAnatomyCached` → `partsPlanFromAnatomyDescriptor` → `updateCreatureInstances` (`creatureInstancing.ts:306-318`).
- Punto di innesto minimo: `runtimeAnatomyRenderSource.ts:270-284`, dove `speculativeBodyPlanId(speciesId)` e `BODY_PLAN_CATALOG` scelgono il piano. `AnatomyInput` accetta già un `BodyPlanSpec` arbitrario (`generate.ts:18-27,184-319`) con validatore (`bodyPlan.ts:181-190`): **il generatore non va riscritto**.
- Contratti congelati da preservare: `ANATOMY_SCHEMA_VERSION = 1`, `MAX_APPENDAGES = 64`, fingerprint canonico, LOD 3→0, whitelist `MORPHOLOGICAL_GENE_IDS`, `GENERIC_RENDER_SLOTS = {6,12,2}`, `RENDER_POOL_LIMITS = {32,64,16}`, fallback dichiarato, adaptive opt-in senza scritture nella simulazione.
- `BodyPlanOrigin` supporta solo `"explicit" | "legacy-default" | "seeded-speculative"` (`anatomy/types.ts:12-15`): per un piano genetico serve un valore additivo di origine/provenienza, non un nuovo descriptor. La whitelist di provenienza va estesa solo con loci reali verificati (`anatomy/validate.ts:457-467`).
- G3.1 fornisce cache anatomica, dynamic pool, MOR, fallback e adaptive rendering; 185 test G3 + 115 E2, benchmark con `gpu: null`.
- Performance G3 post-ottimizzazione (baseline corrente): mediana `g2-current` a 3000 = 24,518 ms, a 10000 = 84,949 ms; `syncFrame/regenerate` a 10000 = 12804,251 ms (`G3_CACHE_PERFORMANCE_STATS_REPORT.md:112-136`). IV1-B-R1 su frame vivo: fase renderer a 10000 = 65,48→67,18 ms, speedup 0,97–1,34× (non 2,6–3,0×, perché il frame vivo rende `dirty` molte creature lontane: `REPORT.md:145-158`). GPU/FPS/upload/fill-rate restano `null`.

---

## 4. Simulazione, worker, persistence, UI

- `World` possiede planet, organismi, tick, RNG, ID allocator, `speciesRegistry`, statistiche e flag sperimentali (`world.ts:45-106`). Il tick è: chunk attivi → ambiente → aging/upkeep/movement → collisioni → alimentazione → predazione → morte → riproduzione → bookkeeping/speciazione (`world.ts:190-358`).
- Fondatori: `seedPopulation()` usa `createRandomOrganism` + `founderExt(deriveGeneRandom(...))` (`world.ts:159-188`). Nati: `reproduceOrganisms()` costruisce genome/brain, chiama `createOrganism`, assegna `ext` con `inheritExt`/`cloneExt` (`reproduction.ts:120-171`). `STARTING_ENERGY = 50` (`organism.ts:7-35`).
- Riproduzione: soglia 130, costo 55, maturazione modulata da `REP-02`, tentativo `fertility * 0.05`, partner nel raggio 4 con bucket spaziali, compatibilità per distanza (non `speciesId`), fallback asessuato 15% (`reproduction.ts:13-151`).
- Non esiste un campo `fitness` su `Organism` né un selection engine esplicito: la selezione è emergente da fitness ambientale (`environment.ts:43-71`), alimentazione (`feeding.ts:220-228`), predazione (`predation.ts:30-99`), riproduzione e morte. `speciesAnalysis` è observability pura (`speciesAnalysis.ts:6-10`).
- `World.toSnapshot()` / `fromSnapshot()` (`:488-530`) scrivono e ripristinano `genomeVersion`, `advancedGenome`, `geneEffects` e `randomState`; migrazione v1→v2 idempotente con default per i geni mancanti (`genomeMigration.ts:13-68`), invocata al load (`world.ts:511-518`).
- Worker: `WorkerCommand` (`init`, `setSpeed`, `reset`, `requestSnapshot`, `loadSnapshot`, `requestOrganismDetail`, `requestViewport`, `setPerformance`) e `WorkerEvent` (`frame`, `ready`, `snapshot`, `error`, `organismDetail`, `viewportFrame`) in `types/index.ts:464-485`; loop a 30 Hz, `MAX_TICKS_PER_FRAME = 200`, frame throttlati (`simulation.worker.ts:9-22,84-179`). `app/page.tsx` usa `useMultiverse()`; `useSimulation()` è il percorso monopianeta semplificato.
- `RenderFrame` è il payload worker→UI: typed array per organismo + MOR opzionali + speciesTree/statistiche (`renderFrame.ts:85-165`); i canali MOR sono copie di sola lettura, non entrano nello snapshot. Il dettaglio completo è on-demand via `requestOrganismDetail`.
- Genome serializzabile via structured clone: `ext` contiene solo numeri, `brain` è `Float32Array`; la cache fenotipica `WeakMap` e il `WeakSet` di `markExtInert` sono fuori dal genoma e ricostruiti al load (`geneExpression.ts:149-169`, `world.ts:515-518`). `lib/persistence.ts` usa IndexedDB con `DB_VERSION = 1` e store generico; non serve bump per un nuovo gene in `ext`.
- Hook fenotipici già collegati: metabolismo (`organism.ts:104-115`), nicchia (`environment.ts:43-71`), alimentazione (`feeding.ts:100-106,220-228`), predazione (`predation.ts:30-60,159-166`), movimento (`movement.ts:100-105`), collisioni (`collision.ts:4-9`), comportamento (`behavior.ts:90-110,97-217`), riproduzione (`reproduction.ts:81-87`).
- UI: `StatsPanel` + `lib/formatAverageGenome.ts` mostrano correttamente 13 tratti e `ext.*` (`statsPanelGenome.test.ts`); `OrganismInspector` mostra solo i 13 `TRAIT_LABELS`; `SpeciesPanel`, `SpeciesDetail`, `SpeciesGenetics`, `SpeciesHabitat` leggono `RenderFrame`/`SpeciesGenomeStats` ma non espongono i 20 geni estesi. `SaveLoadPanel` non legge direttamente il genoma.

### Limitazioni di scala documentate (non rieseguite in GEN-0)

- Mondo lazy per chunk, ma **nessun chunk eviction**: chunk materializzati e snapshot possono tendere al costo dense-grid (`worldScale.benchmark.ts:33-50`).
- `world.step()` resta superlineare: 3,54 ms a 100 organismi, 65,13 a 1.500, 228,74 a 3.000, 779,54 a 5.000, 3407,47 a 10.000; esponente `b ≈ 1,496` (`docs/research/iv1b/TABLES.md:75-104`).
- Observability completa a 10.000 aggiunge fino a +1696,92 ms/tick e 961 MB RSS (`docs/research/iv1b/REPORT.md:128-141,188-201`).
- Anatomia G2 non cacheata: ~1041 ms per costruire i descriptor; G2 cached 60,133 ms vs legacy 12,083 ms a 3.000 creature (`G_FINAL_PERFORMANCE_REPORT.md:20-32,58-70`).
- GPU/FPS/upload/fill-rate **non misurati**; i valori storici sono `null` (`G3_FINAL_LIMITATIONS.md:29`, `G_FINAL_PERFORMANCE_REPORT.md:64-70`) ⇒ `UNVERIFIED`.
- Campionamento per indice in `lib/renderSampling.ts:18-34`: una morte a 3.000 creature cambia 1.495 delle 1.500 disegnate; difetto noto e documentato (`LIMITE-CAMPIONAMENTO-POPOLAZIONE.md:1-21`).

---

## 5. Test e baseline

| Fase | File / conteggio | Esito |
|---|---|---|
| Suite completa `main@5672f12` (integrazione, 2026-11-19) | 101 file, 1105 test | 1098 passati, 1 skipped, 6 failed deterministici |
| E2 + G3 | 30 file | 300/300 |
| IV1-A | 10 test + esperimento 60 run/45 confronti/0 divergenze; payload `82e1bb79…` | verde |
| IV1-B | 33/33, dataset v2 120 run | verde |
| `tsc --noEmit`, `next build --webpack` | — | exit 0 |
| Baseline GEN-0 con 4 agenti paralleli (2026-11-20) | 22 failed, 16 timeout, hook IV1-A 300 s | carico artificiale, solo tempi più lunghi |
| Baseline GEN-0 quiescente (2026-11-20, `gen0-baseline-quiescent.log`) | 22 failed, 17 timeout, 252,56 s, EXIT=1 | **baseline di riferimento**; stessi 22 failure senza agenti |

I failure deterministici e i 17 timeout della corsa quiescente sono elencati in `GENOME_VALIDATION_PLAN.md` §2. **Nessun test è stato modificato e nessun timeout è stato aumentato.**

---

## 6. Classificazione dei componenti

| Componente | Classificazione | Note |
|---|---|---|
| `types/index.ts` — `BaseGenome`, `Genome`, `Organism`, `SpeciesRecord`, `WorldSnapshot` | `EXISTING_COMPLETE` | contratti usati e testati |
| `traitRanges.ts`, `geneRegistry.ts` | `EXISTING_COMPLETE` | 13+20 geni, costanti nominate |
| `genome.ts`, `genomeExt.ts`, `geneExpression.ts`, `genomeMigration.ts` | `EXISTING_COMPLETE` / `EXISTING_DEFECT` | completi per il modello vettoriale; distanza V2 sotto-tarata (`GENOMA-v1.11.0.md:75-78`) |
| Wiring live di `validateGenome` / API V2 | `EXISTING_NEEDS_EXTENSION` | API esistenti ma non usate dal loop |
| `reproduction.ts` motore | `EXISTING_COMPLETE` | innesto reale; i failure sono nelle fixture di test |
| `tests/reproduction.test.ts` | `EXISTING_DEFECT` | energia 100 < soglia 130 |
| `tests/vibeGenomeV1110.test.ts` | `EXISTING_DEFECT` | 2 failure per regex errate + test tautologici documentati |
| `speciation.ts` | `EXISTING_NEEDS_EXTENSION` | meccanismo presente, taratura V2 da rivedere |
| `plantGenome.ts` come modulo puro | `EXISTING_COMPLETE` | 17 tratti, non collegato alla simulazione |
| Piante evolvevoli nella simulazione | `MISSING` | `plantGenome.ts:4-9` |
| `lib/phenotype/*`, `derive.ts` | `EXISTING_NEEDS_EXTENSION` | 4 geni su 33; 10 characteristics `undetermined` |
| `lib/visual/*`, bridge anatomia G2/G3 | `EXISTING_NEEDS_EXTENSION` | ricevono solo 3 MOR; body plan non genetico |
| Anatomia geneticamente determinata completa | `MISSING` | `G2_MISSING_GENETIC_DATA.md:1-9,22-23` |
| Renderer G3.1, cache, MOR, pool, fallback, adaptive | `EXISTING_COMPLETE` | preservare, non riscrivere |
| Chunk eviction | `MISSING` | dichiarata come futura, non implementata (`worldScale.benchmark.ts:39-50`) |
| Campo `fitness` globale / selection engine | `MISSING` | selezione emergente; `speciesAnalysis` observability pura |
| `lib/persistence.ts` (IndexedDB) | `EXISTING_COMPLETE` | structured clone generico, non legato allo schema genome |
| `workers/simulation.worker.ts` + contratti `types/index.ts:464-485` | `EXISTING_NEEDS_EXTENSION` | nessun messaggio genome-specifico |
| `simulation/core/world.ts`, `renderFrame.ts` | `EXISTING_NEEDS_EXTENSION` | wiring presente; nuovi hook da aggiungere solo dopo checkpoint |
| UI `StatsPanel` + `formatAverageGenome` | `EXISTING_COMPLETE` | 13 tratti + `ext.*`, test dedicato |
| `OrganismInspector`, pannelli `components/species/*` | `EXISTING_NEEDS_EXTENSION` | non mostrano i 20 geni estesi |
| Save/load e RNG deterministico | `EXISTING_COMPLETE` | migrazione idempotente, IV1-A verificato |
| `simulation/biology/phenotype.ts` | `EXISTING_DEFECT` | file vuoto obsoleto, nessun import (`phenotype.ts:1-4`) |
| `lib/renderSampling.ts` | `EXISTING_DEFECT` | churn massivo noto e documentato |
| Genome Engine mendeliano (alleli/loci/ploidia/meiosi/…) | `MISSING` | nessuna evidenza nel codice |
| Piante come individui evolventi | `MISSING` | `plantGenome.ts:4-9` |
| GPU/FPS e performance sul branch corrente | `UNVERIFIED` | non misurati / non rieseguiti |
| Root cause failure `fauna180`, `hydrology`, `planet` | `UNVERIFIED` | non indagata in GEN-0; fuori perimetro |
| Verifica branch remoto da subagent con PATH git errato | `BLOCKED` | problema locale, risolto dal controllo diretto di questa sezione |

---

## 7. Punti di integrazione genetica (da dove partire)

1. **Registry geni** (`geneRegistry.ts`): estendere con metadati di locus/allelo senza rompere i 33 ID esistenti.
2. **Genoma** (`types/index.ts` + `genome.ts` + `genomeExt.ts`): aggiungere una struttura di loci opzionale, mantenendo `ext` e i 13 campi legacy per compatibilità.
3. **Riproduzione** (`reproduction.ts`): sostituire il blending con gameti/meiosi in una modalità esplicita, lasciando il blending come fallback.
4. **Espressione** (`geneExpression.ts` + `lib/phenotype/derive.ts`): risolvere gli alleli prima di calcolare `Phenotype` e `PhenotypeProfile`.
5. **Sviluppo** (nuovo modulo): stadi ontogenetici che modulino il fenotipo senza toccare il genoma.
6. **Body plan** (`lib/anatomy/bodyPlan.ts`): alimentare il piano da loci anatomici reali solo quando esistono; fino ad allora mantenere `undetermined` / `speculative`.

Ogni punto che tocca contratti condivisi richiede il checkpoint di `GENOME_ARCHITECTURE.md` §13.
