# G3 — Integration Report

**Branch:** `graphics/g3-renderer-integration` (da `graphics/g-final-consolidation` @ `27995b0`)  
**Data:** 2026-11-18  
**Obiettivo:** collegare automaticamente anatomia G2 → descriptor → render plan → Three.js, con fallback dichiarato, pool dinamici e QA finale.

---

## 1. Sintesi

L’integrazione è completa e verificabile end-to-end: la scena 3D non riceve più un descriptor passato a mano, lo deriva dal `RenderFrame` prodotto dalla simulazione. Il percorso legacy resta invariato come fallback e il contratto G-REV-02 (`planFromAnatomyDescriptor`) è preservato senza modificare le aspettative dei test esistenti.

Risultati principali:

- 18 nuovi test G3 verdi; test mirati esistenti verdi (41 + 41 + 16 + 4).
- Typecheck, lint e build verdi.
- Suite completa: `7 failed | 911 passed | 1 skipped (919)`. I 7 fallimenti sono tutti pre-esistenti in biologia/simulazione (`fauna180`, `hydrology`, `reproduction`, `settlementDefaults`, `vibeGenome`) e nessuno tocca il renderer. La baseline G_FINAL era `11 failed | 889 passed | 1 skipped (901)`.
- Browser reale: 0 fallback, 0 parti perse, WebGL2, 0 errori console durante il flusso nominale.

---

## 2. Architettura del flusso

```
World / buildRenderFrame()
  └─ copie dei 3 geni MOR registrati + maschera di presenza   (simulation/core/renderFrame.ts)
      └─ RenderFrame (campi opzionali)                        (types/index.ts)
          └─ createRuntimeAnatomyRenderSource().syncFrame(frame)
              ├─ cache per id + versione MOR, pruning           (lib/visual/runtimeAnatomyRenderSource.ts)
              ├─ body plan speculativo determinato da speciesId
              └─ derivePhenotype → generateAnatomyCached
                  └─ partsPlanFromAnatomyDescriptor()            (lib/visual/anatomyRenderPlan.ts)
                      └─ requiredSlots / support / fallbackReason
                          └─ configureGenericPools() + ensureGenericPool()
                              └─ updateCreatureInstances()       (planet3d/creatureInstancing.ts)
                                  └─ InstancedMesh generici (segment/appendage/eye)
```

### 2.1 Perché il canale MOR minimo

I soli 5 tratti legacy non codificano il body plan: dedurlo da essi convertirebbe arbitrariamente creature diverse in quadrupedi. Il frame ora trasporta solo copie di `bodyStature`, `furDensity`, `dermalArmor` e una maschera `organismsMorphologyPresence` (bit 1/2/4). Nessuna regola biologica, evolutiva o di persistenza è stata spostata nel renderer.

### 2.2 Origine del body plan

`speculativeBodyPlanId(speciesId)` sceglie un piano in modo deterministico. L’origine dichiarata è `seeded-speculative`, la provenienza anatomica resta `undetermined`. Il seed dell’organismo governa solo il jitter estetico: non altera la struttura.

### 2.3 Auto-wiring

`Planet3DView` crea la sorgente runtime in un `useRef`, la sincronizza con il frame reale nel loop (non con l’interpolazione visiva) e la registra in `SceneRefs`. `app/page.tsx` non passa più alcun prop manuale. Il prop `anatomyRenderSource` resta come override per test e casi speciali.

---

## 3. Fallback e assenza di perdite silenziose

| Condizione | Comportamento | Motivo esposto |
|---|---|---|
| Frame senza array MOR | legacy identico a G1 | `no-g2-morphology` |
| Gene MOR assente | legacy per quella creatura | `missing-morphology-genes` |
| Valore MOR non finito | legacy, nessun valore inventato | `invalid-morphology-data` |
| Descriptor con coordinate non finite | legacy, piano non usato | `non-finite-segment-data` / `non-finite-appendage-data` |
| Oltre il tetto effettivo | legacy, nessuna parte tagliata | `pool-capacity-exceeded:<key>:<n>` |
| Parte senza slot disponibile | contatore `droppedParts` | sempre 0 per anatomie supportate |

`GENERIC_RENDER_SLOTS` (6/12/2) ora è la capacità iniziale, non più un tetto di perdita. `RENDER_POOL_LIMITS` (32/64/16) è il tetto dichiarato: superarlo rende il piano `unsupported`, non tronca le parti.

La crescita usa headroom del 25% arrotondato a 64 istanze, riutilizza geometria e materiale e chiama `InstancedMesh.dispose()` solo per i buffer di istanza. Il cleanup esplicito copre anche i pool cresciuti a runtime.

---

## 4. Modifiche ai file

| File | Modifica |
|---|---|
| `types/index.ts` | 4 campi opzionali MOR in `RenderFrame` |
| `simulation/core/renderFrame.ts` | +26 righe: copia dei geni MOR con maschera di presenza |
| `lib/visual/runtimeAnatomyRenderSource.ts` | **nuovo** — cache, pruning, stats, fallback |
| `lib/visual/anatomyRenderPlan.ts` | piano generico G3, `requiredSlots`, limiti effettivi |
| `components/simulation/Planet3DView.tsx` | auto-wiring, sync, snapshot QA dev-only, cleanup |
| `components/simulation/planet3d/creatureInstancing.ts` | pool dinamici, `droppedParts`, `poolGrowth` |
| `components/simulation/planet3d/types.ts` | nuovi campi statistiche renderer |
| `scripts/graphicsConsolidation.benchmark.ts` | 3 modalità comparabili + metriche scenario |
| `tests/g3EndToEnd.test.ts` | **nuovo** — 16 test anatomie/fallback/pool/cache |
| `tests/g3MorphologyFrame.test.ts` | **nuovo** — 2 test regressione canale MOR |
| `eslint.config.mjs` | **nuovo** — config ESLint 9, 0 errori |

`simulation/**` è toccato solo nel punto di costruzione del frame: biologia, evoluzione, persistence, salvataggi e caricamenti sono invariati.

---

## 5. Matrice test G3

I 16 casi end-to-end coprono: bipede, quadrupede, multi-segmento, appendici differenti, simmetria bilaterale, radiale, radiale multi-braccio, asimmetria, parti convenzionali mancanti, corpo segmentato senza zampe, appendici a ventaglio, crescita pool oltre 12 appendici, cache (reuse/rigenerazione/pruning), MOR assente/corrotto, descriptor invalido, superamento capacità.

Ogni caso verifica:
- `plan.support.supported === true` per anatomie valide;
- `plan.parts.length === segmenti + appendici` (nessuna perdita);
- fingerprint del descriptor uguale a quello della sorgente;
- `mapped = 1`, `legacy = 0`, `fallback = 0`, `droppedParts = 0`;
- che il piano non è il quadrupede legacy di default.

---

## 6. Comandi e risultati

```text
npx next typegen                          exit 0
npx tsc --noEmit                          exit 0
npm run lint                              exit 0  — 0 errori, 33 warning pre-esistenti
npx next build --webpack                  exit 0  — 2 route statiche
npx vitest run tests/g3EndToEnd.test.ts
               tests/g3MorphologyFrame.test.ts   18 passed
npx vitest run tests/anatomyRendererIntegration... 41+41+16+4 passed
npm test                                  7 failed | 911 passed | 1 skipped (919)
```

Il build con Turbopack predefinito fallisce per un limite ambientale: la junction `node_modules` punta fuori dalla root del filesystem (`Symlink [project]/node_modules is invalid`). La modalità webpack, supportata da Next 16, completa il build senza errori. La junction è un workaround locale e non è deliverable.

---

## 7. Compatibilità

- Nessun merge, push, commit su altri branch, chiusura PR o release eseguiti.
- Nessuna modifica a `main`, PR esistenti o branch di altri filoni.
- Nessuna dipendenza aggiunta: `npm install` non è stato usato (l’installazione fallisce con `Cannot read properties of null (reading 'edgesOut')`).
- I documenti G_FINAL restano validi come baseline; questo report li integra senza riscriverli.
