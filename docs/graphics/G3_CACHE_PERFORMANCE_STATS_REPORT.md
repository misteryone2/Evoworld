# G3 — Cache anatomica, performance renderer, StatsPanel e audit scientifico

**Data:** 2026-11-19  
**Branch:** `graphics/g3-renderer-integration`  
**Commit di partenza:** `d89885c50b46558feff1bb9985b02c26acc2ad81` (working tree pulito)  
**Base:** `main` @ `d330c12`, 15 commit avanti. Nessun merge, PR, release o cancellazione di branch.

Report finale strutturato A–I. Integra i report G3 precedenti senza sostituirli.

---

## A. Stato iniziale

| Voce | Valore osservato |
|---|---|
| Branch / remote | `graphics/g3-renderer-integration`, `origin` agganciato |
| Commit iniziale | `d89885c` — `feat(graphics): auto-wire G2 anatomy into G3 renderer` |
| Working tree | pulito prima delle modifiche |
| Architettura G3 | canale MOR opzionale in `RenderFrame`, body plan `seeded-speculative` da `speculativeBodyPlanId(speciesId)`, provenienza `undetermined` |
| Pool | `GENERIC_RENDER_SLOTS` 6/12/2 = capacità iniziale; `RENDER_POOL_LIMITS` 32/64/16 = tetto con fallback `unsupported` |
| Baseline suite completa | `9 failed \| 909 passed \| 1 skipped (919)` — log `baseline-full-test.log` |
| Baseline benchmark (mediana/p95 ms, `updateCreatureInstances/g2-optimized`) | 100: `2.111/3.776`; 500: `10.249/14.619`; 1500: `30.871/39.061`; 3000: `65.240/75.482` |
| Baseline `syncFrame/regenerate` | 100: `50.287`; 500: `216.908`; 1500: `560.592`; 3000: `865.005` ms |
| Toolchain | build solo con `npx next build --webpack`; Turbopack abortisce per junction `node_modules` fuori root |

Tre audit background sono stati eseguiti prima di toccare il codice: cache anatomica, performance/pool, StatsPanel/anatomia/failure. Le conclusioni sono confluite nei paragrafi seguenti.

---

## B. Problemi trovati (P0–P3)

### P0 — Nessuno

Nessun difetto bloccante, perdita di dati o alterazione della biologia riscontrata.

### P1 — Correttezza

1. **Carnivoria assente dalla chiave cache.** `versionFor` includeva id, specie, taglia, maschera MOR e i tre geni MOR, ma non `organismsCarnivory`. Il valore entra in `partsPlanFromAnatomyDescriptor` come `geometry.aggression` e quindi in saturazione/tinta del renderer: con gene mutato il piano restava stale fino a un’altra invalidazione. Il percorso legacy, invece, tracciava già `aCarnivory`.
2. **Shortcut `sameArrays` cieco al contenuto.** Il confronto per reference/tick/array ignorava `organismsSize`, `organismsSpecies`, `organismsCarnivory` e le mutazioni in posto. Uno stesso frame con buffer riutilizzati, o una shallow copy con lo stesso tick, poteva servire piani vecchi indefinitamente.
3. **`syncFrame(null)` lasciava stato di identità.** `lastFrame`, tick, lunghezza e reference restavano precedenti: risincronizzando lo stesso frame il renderer restava bloccato su `no-g2-morphology` con cache vuota.
4. **`StatsPanel` crash con `averageGenome.ext`.** `averageGenome` produce i 13 tratti base come numeri e un campo `ext` come `Record<string, number>`. Il pannello chiamava `toFixed(2)` su ogni valore di `Object.entries`, incluso l’oggetto: `TypeError: value.toFixed is not a function`. È pre-esistente (blame: `425e5df`, 2026-08-09; `avg.ext` introdotto prima del branch point G3) e indipendente dagli organismi morti. Il vecchio riferimento a `StatsPanel.tsx:171` nei documenti è obsoleto: il file ha 84 righe.

### P2 — Diagnostica e costo evitabile

1. **Quantizzazione non allineata.** La versione usava `round(raw*4096)`, mentre `generateAnatomyCached` usa `q3(normalizzato)`. Valori nello stesso bucket 1/4096 potevano generare descriptor diversi (o, al contrario, valori fuori range causavano rebuild inutili). Ora si hashano i bit Float32 esatti.
2. **Voce `unsupported` riutilizzata senza motivo.** Il fallback veniva registrato solo al momento della generazione: ai frame successivi `fallbackReason` restava null e il renderer riportava il generico `no-render-plan` invece di `pool-capacity-exceeded:appendage`.
3. **Size non finita non validata.** `NaN`/`Infinity` produceva `quantize = -1` senza contatore `invalid` né motivo di fallback.
4. **Pool sovradimensionati e zero-clearing.** `configureGenericPools` promuoveva ogni creatura al massimo slot del frame (fino a 32/64/16) e `clearGenericParts` scriveva 112 matrici nulle per creatura: fino a ~280 000 scritture e ~18 MB di upload inutili per frame a 2500 creature. Era la causa prevalente del delta G3 vs G2-current, non la fedeltà delle parti.
5. **Validazione ripetuta dei piani.** `isUsableAnatomyRenderPlan` ricostruiva un array di 29 numeri e decine di callback `.every` per creatura, pur lavorando su piani congelati e immutabili.
6. **Upload dell’intero buffer.** Tutti i 12 mesh instanziati erano marcati `needsUpdate` senza `addUpdateRange`, caricando l’intera capacità anche quando `count` era molto minore.

### P3 — Minori / documentali

- Chiave cache per solo id: id duplicati in frame sintetici si sovrascrivono; il comportamento resta documentato.
- `speciesId % 65535` in `renderFrame.ts` tronca l’identità di specie prima che la cache la veda.
- `stats()` è per-sync (si azzera a ogni `syncFrame`), non cumulativa: i test sono stati allineati a questa semantica.
- `planFor(id, tick)` accetta `tick` ma lo ignora intenzionalmente: il piano è indipendente dal tick.
- `NotFoundError: setPointerCapture` nella QA deriva da eventi pointer sintetici, non da input reale.

---

## C. Modifiche apportate

### C.1 Cache e sincronizzazione (`lib/visual/runtimeAnatomyRenderSource.ts`)

- `versionFor` ora include `organismsCarnivory` e usa i bit Float32 esatti tramite scratch `Float32Array`/`Uint32Array` riusati (zero allocazioni).
- Nuova `frameSignature`: FNV-1a sui soli 7 array che influenzano il piano G2 (id, specie, taglia, carnivoria, presenza, tre geni MOR). O(n) senza allocazioni (~0,13 ms a 10000 nel benchmark); rileva mutazioni in posto e frame parziali con lo stesso tick.
- Shortcut sostituito: si skippa solo se firma, tick, lunghezza e reference coincidono.
- `syncFrame(null)` azzera completamente identità, firma e contatori: il frame può essere risincronizzato.
- Validazione di `Number.isFinite(size)` con `stats.invalid++` e fallback `invalid-size-data`.
- `CacheEntry.unsupportedReason` conserva il motivo anche quando la voce viene riutilizzata.
- Reset esplicito dei contatori dopo `syncFrame(null)`.

### C.2 Ottimizzazioni renderer (`components/simulation/planet3d/creatureInstancing.ts`, `lib/visual/anatomyRenderPlan.ts`)

- `isUsableAnatomyRenderPlanCached`: `WeakMap<object, boolean>` per piani congelati; i piani esterni mutabili vengono ancora validati ogni volta, quindi il gate di sicurezza resta effettivo.
- Layout denso dei pool generici: le parti reali sono scritte da indice 0 con cursori per chiave; `mesh.count` copre solo le parti scritte. Nessuno zero-clearing per creatura; le istanze oltre `count` non vengono disegnate, quindi non c’è contaminazione tra anatomie.
- `flagInstanceUpdates` usa `clearUpdateRanges()` + `addUpdateRange(0, count*16)` (matrici) e `count*3` (colori): nuovo range aggiunto a ogni draw, nessun range residuo.
- `mesh.visible` è true solo per le chiavi con `count > 0` (draw call inutili skipped, es. occhi).
- `__proto__` di ottimizzazione: `configureGenericPools` rimane come capacità/tetto dichiarato; nessun limite rimosso, nessuna parte tagliata.

### C.3 StatsPanel (`components/ui/StatsPanel.tsx`, `lib/formatAverageGenome.ts`)

- Nuova funzione pure `formatAverageGenome(average)` che produce righe `{key, label, value}`: tratti base con `TRAIT_LABELS`, geni estesi con `id · key` dal registro (`MOR-01 · furDensity`, …, `COG-02 · neuralStability`).
- Valori non finiti vengono scartati; `null`/`undefined` producono lista vuota. Nessuna modifica a `averageGenome`, al registro geni o alla simulazione.

### C.4 Audit scientifico anatomico

| Categoria | Cosa il codice supporta realmente |
|---|---|
| Geni ereditati/mutati | 33 geni scalari (13 legacy + 20 estesi). Solo 4 sono input morfologici: `size`, `furDensity`, `dermalArmor`, `bodyStature`. |
| Anatomia geneticamente derivata | Solo scala taglia, robustezza/raggio, copertura superficiale, pelo/armatura e conteggio piastre oltre soglia. |
| Da `speciesId`/catalogo | Body plan, segmenti, tipo/conteggio appendici, simmetria, articolazioni, modalità locomotiva strutturale. `speciesId` nasce da speciazione genetica, ma la mappa `speciesId → body plan` è un hash arbitrario, non un tratto evoluto. |
| Regole deterministiche | FNV/hash, `mulberry32` per jitter estetico, quantizzamento, cache, serializzazione canonica. Deterministico ≠ geneticamente causato. |
| Estetico | Jitter, hue shift, pattern/material placeholder, euristiche legacy speed/carnivory/evasion, gradiente ventre-dorso. |
| Simulato/approssimato | Coefficienti gene→fitness, proiezione G2→G1, fallback dichiarato per piani non supportati, idrologia locale. |

Non esiste alcun percorso in cui un gene MOR codifichi “quattro zampe”, “due occhi”, “simmetria radiale”, numero di segmenti od organi interni. Tutte le affermazioni di evoluzione del body plan sarebbero tecnicamente infondate.

### C.5 Test aggiunti/aggiornati

- `tests/g3CacheSync.test.ts` (nuovo, 13 test): reuse, carnivoria/taglia/MOR/specie/id, bit Float32, mutazione in posto, maschera MOR, parametri irrilevanti, recupero dopo null, size non finita, MOR assente.
- `tests/statsPanelGenome.test.ts` (nuovo, 4 test): oggetto `ext`, valori non finiti, `averageGenome` reale con ext, compatibilità v1.10 senza ext.
- `tests/g3EndToEnd.test.ts` e `tests/anatomyRendererIntegration.test.ts`: aspettative di `mesh.count` aggiornate al layout denso (conteggio parti visive, non capacità del pool). Nessuna assertion rimossa, nessun test disabilitato.

---

## D. Performance

Benchmark CPU Node ripetibile (`npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts`), stessi semi e modalità. Log: `after-benchmark.log` / `.json` in `%TEMP%\opencode\g3b-qa\`.

### D.1 `updateCreatureInstances` — mediana ms (p95, p99)

| Popolazione | legacy prima → dopo | g2-current prima → dopo | g2-optimized prima → dopo |
|---|---|---|---|
| 100 | 0.813 → 0.805 (2.20, 4.54) | 1.867 → 1.074 (1.85, 2.54) | 2.111 → **1.122** (2.51, 2.65) |
| 500 | 1.612 → 1.882 (3.13, 3.67) | 8.421 → 3.798 (6.95, 8.14) | 10.249 → **3.787** (5.70, 6.61) |
| 1500 | 6.514 → 5.186 (7.48, 8.35) | 25.987 → 10.524 (16.91, 21.86) | 30.871 → **12.956** (16.88, 18.59) |
| 3000 | 11.538 → 11.180 (15.83, 20.85) | 53.808 → 24.518 (34.32, 35.19) | 65.240 → **31.211** (40.16, 46.67) |
| 5000 | non misurato → 21.333 (31.21, 37.71) | non misurato → 45.099 (51.27, 57.17) | non misurato → **53.216** (58.14, 64.04) |
| 10000 | non misurato → 43.703 (49.06, 55.11) | non misurato → 84.949 (93.74, 96.54) | non misurato → **102.373** (122.22, 154.47) |

Miglioramento G3 ottimizzato: −47% a 100, −63% a 500, −58% a 1500, −52% a 3000. Anche G2-current migliora del 54–55% grazie alla validazione memoizzata: il delta G3−G2 resta il costo reale delle parti anatomiche aggiuntive, non più il padding.

### D.2 `syncFrame`

| Popolazione | warm prima → dopo (ms) | regenerate prima → dopo (ms) |
|---|---|---|
| 100 | ~0 → 0.022 | 50.287 → 52.239 |
| 500 | ~0.001 → 0.113 | 216.908 → 211.809 |
| 1500 | ~0 → 0.020 | 560.592 → 484.513 |
| 3000 | ~0 → 0.046 | 865.005 → 909.812 |
| 5000 | non misurato → 0.084 | non misurato → 2506.430 |
| 10000 | non misurato → 0.129 | non misurato → 12804.251 |

Il warm passa da O(1) a O(n) content signature: è il prezzo della correttezza su buffer riutilizzati e mutazioni in posto (0,13 ms a 10000, irrilevante rispetto ai ~102 ms del draw). La rigenerazione resta un evento raro; a 10000 è deliberatamente costosa perché ricostruisce tutti i descriptor MOR.

### D.3 Metriche di scena (browser proxy / Node)

- 12 draw call (9 legacy + 3 generici), 12 geometrie, 12 materiali in tutti gli scenari benchmark.
- Istanze disegnate a 3000: 93 569 (G3); a 10000: 311 908 — coerenti con le parti reali, non con la capacità massima dei pool.
- `creaturesDrawn = mapped`, `fallback = 0`, `droppedParts = 0`, `poolGrowth = []` in tutti gli scenari MOR.
- `poolCapacity` rimane `{segment:10, appendage:25, eye:2}` nei benchmark: i tetti 32/64/16 non sono mai stati abbassati né rimossi.
- `heapDeltaKB` è un indicatore grezzo (include GC): valori negativi sono possibili e non vanno letti come “allocazioni negative”.
- GPU: `fps`, `frameTimeMs`, `gpuBytes` restano `null` in Node. QA browser riporta `renderer.info.calls = 47`, `geometries = 22`, `textures = 8` (include acqua, terreno, cielo e nuvole). Nessuna misura GPU reale, fill-rate o upload è disponibile in questo ambiente.

---

## E. Test e verifiche

| Comando | Esito |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/g3CacheSync.test.ts tests/g3MorphologyFrame.test.ts tests/g3EndToEnd.test.ts tests/anatomyRendererIntegration.test.ts tests/statsPanelGenome.test.ts` | **41 passed** |
| `npx vitest run --reporter=verbose` (default timeout) | `13 failed \| 922 passed \| 1 skipped (936)` |
| `npx vitest run --testTimeout=30000 --reporter=verbose` | `6 failed \| 929 passed \| 1 skipped (936)` |
| `npm run lint` | exit 0 — **0 errori**, 33 warning pre-esistenti |
| `npx next build --webpack` | exit 0, 2 route statiche |

### Failure della suite completa — classificazione

| Test | Errore | Causa | Origine | Prova / azione |
|---|---|---|---|---|
| `anatomyRendererIntegration` | `expected 6 to be 12` | Aspettativa di `mesh.count` legata al vecchio layout a stride | **Introdotta** dalla ottimizzazione, solo aspettativa | Aggiornata al conteggio delle parti visive; test mirato verde. Nessuna assertion rimossa. |
| `fauna180` | `1.0800000429153442` vs `1` | Costante di sfumatura `1.08` dal 2026-08-09 vs test stale | Pre-esistente | Non toccata: correggerla cambierebbe un’aspettativa visiva fuori dal percorso G3. |
| `hydrology` (default timeout) | timeout 5 s | Chunk 4096² con 500 ms embedded; passa con timeout esteso | Pre-esistente | Con `--testTimeout=30000` non compare. |
| `planet.test.ts` ×2 (default timeout) | timeout 5 s | fBm/contiguità su 512–1024² sotto carico | Pre-esistente | Con timeout esteso non compaiono. |
| `livingBehavior` (default timeout) | timeout 5 s | Loop probabilistico under load | Pre-esistente/flaky | Con timeout esteso non compare. |
| `settlementDefaults` | timeout 5 s / 120 s | 20 tick + snapshot/restore; 1500 tick sincroni | Pre-esistente | Semantica corretta by construction; resta 1 failure con timeout esteso. |
| `reproduction` ×2 | `0 > 0`, `200 < 200` | Fixture con energia 100 < soglia 130 | Pre-esistente | Test stale; regole biologiche non modificate. |
| `vibeGenomeV1110` ×2 | regex `/social/`, `/move/` | Il catalogo contiene `socialTolerance` e `movementCostFactor`, richiesti dalla specifica | Pre-esistente | Contraddizione test/specifica documentata in `docs/GENOMA-v1.11.0.md`. |
| `vibeGenomeV1110` mutazione (default timeout) | timeout 5 s | 33 × 10 000 iterazioni | Pre-esistente | Con timeout esteso non compare. |

Nessuna failure appartiene al renderer G3 dopo l’aggiornamento dell’aspettativa di layout. La baseline della sessione precedente riportava 9 failure con composizione diversa (`settlementDefaults` vs `planet.test.ts`, 3 `vibeGenome`): la variazione è attribuita a timeout/carico; la classificazione qui usa i log riprodotti in questa sessione.

---

## F. QA browser e mobile

- Dev server avviato con `npx next dev --webpack` (Turbopack inutilizzabile per la junction `node_modules`).
- Nuovo mondo generato in qualità `Completa` (`alto`), 86 organismi, anno 2.
- Snapshot dev `window.__EVOWORLD_G3__.snapshot()`:
  - `anatomySource`: `entries 72`, `generated 0`, `reused 72`, `invalid 0`, `unsupported 0`, `pruned 1`;
  - `renderStats`: `drawn 72`, `mapped 72`, `legacy 0`, `fallback 0`, `droppedParts 0`, `fallbackReasons []`, `sourceReason null`;
  - `rendererInfo`: `calls 47`, `geometries 22`, `textures 8`.
- Uscita dalla modalità immersiva: `StatsPanel` renderizza 13 tratti base + 20 geni estesi con etichette `MOR-01 · furDensity`, …, `COG-02 · neuralStability`; nessun `TypeError`. Questo chiude il bug QA storico.
- WARNING console: `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.` — pre-esistente, non funzionale.
- ERROR console: solo riconnessioni HMR `ws://localhost:3000/_next/hmr` dopo che il dev server è stato terminato dal timeout dell’ambiente: artefatto della sessione, non errore applicativo.
- `NotFoundError: setPointerCapture` non riprodotto con questo percorso; resta attribuito a pointer sintetici.
- **Mobile reale non verificabile:** l’override di `innerWidth/innerHeight` non attiva il breakpoint in modalità immersiva (`visualViewport.width` resta 912). Procedura riproducibile: avviare `npx next dev --webpack`, aprire su dispositivo touch o DevTools con device emulation, generare un mondo, entrare e uscire dalla modalità immersiva, verificare `StatsPanel` e il canvas; ripetere con qualità `Leggera`/`Bilanciata`/`Completa`.
- Screenshot nativo e heap snapshot non trasferibili in questo ambiente (finestra non visibile; heap > 5 MiB).

---

## G. Problemi residui

1. Sei failure pre-esistenti con timeout esteso (fauna180, reproduction ×2, settlementDefaults, vibeGenome ×2). Vanno trattate in un branch dedicato, non dentro G3.
2. Nessuna misura GPU/FPS reale: il benchmark Node e il solo `renderer.info` del browser non coprono upload, fill-rate o frame time GPU.
3. Mobile reale non verificato; la procedura è preparata ma non eseguita su dispositivo.
4. `node_modules` è una junction non deliverable; `npm install --no-package-lock --no-audit --no-fund` fallisce con `Cannot read properties of null (reading 'edgesOut')`. Nessuna dipendenza aggiunta.
5. Build e dev richiedono `--webpack`; Turbopack resta inutilizzabile per la junction.
6. `speciesId % 65535`, id duplicati e semantiche per-sync di `stats()` restano comportamenti documentati, non corretti in questo intervento.
7. La rigenerazione della cache a 10000 organismi è ~12,8 s: accettabile come evento raro, ma andrebbe spostata fuori dal percorso interattivo se si introducessero popolazioni così elevate nella UI.

---

## H. Commit e stato Git

- Commit di partenza: `d89885c50b46558feff1bb9985b02c26acc2ad81`.
- Commit di questa sessione: `ce861041e1f05d47e422919cd1724196d1b3be97` — `fix(graphics): harden G3 anatomy cache, optimize render pools, fix StatsPanel`.
- Nessun merge, PR, release, checkout di `main` o cancellazione di branch.
- Nessuna modifica a `simulation/**` in questa sessione: biologia, evoluzione, predazione, riproduzione, mortalità, genetica e salvataggi invariati. Unica eccezione storica G3: le copie MOR in `renderFrame.ts`, già committate prima di questa sessione.

---

## I. Stato finale e raccomandazione

Il filone G3 è completo per quanto riguarda correttezza cache, sincronizzazione RenderFrame, ottimizzazione CPU della rappresentazione grafica, pool/fallback, StatsPanel e audit scientifico. Le correzioni sono mirate e verificabili: la cache ora invalid su ogni parametro che entra nel piano, rileva mutazioni in posto e si riprende dopo un frame nullo; il renderer disegna le stesse parti anatomiche con meno scritture e upload; il pannello genome esteso non crasha più.

**Raccomandazione:** mantenere il branch `graphics/g3-renderer-integration` così com’è, senza merge automatico. Aprire un branch separato per le sei failure pre-esistenti (fixture `reproduction`, regex `vibeGenome`, costante `fauna180`, timeout `settlementDefaults`) con accordo esplicito sugli expected values. Prima di qualsiasi futuro aumento di popolazione interattiva, misurare FPS/upload su GPU reale e verificare il layout mobile su dispositivo fisico.
