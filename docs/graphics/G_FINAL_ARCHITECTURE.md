# G Final — Architettura consolidata

## 1. Scopo e perimetro

Questo documento descrive l'architettura verificata di `graphics/g-final-consolidation` dopo il consolidamento finale dei flussi G1, G1-b, G2 e G2.1. La branca finale è basata su `graphics/g-consolidation` a `14c6f1fd32f3ed66cf8d5588d7dbcd8def67a1b3`.

Il consolidamento è **deliberatamente incrementale**: recupera il lavoro valido delle branche di flusso, applica le quattro correzioni obbligatorie (G-REV-01..04) e lascia invariati simulazione, biologia, salvataggio/caricamento e architetture non grafiche. Non è stata eseguita una riscrittura della history condivisa.

## 2. Base e provenance del lavoro recuperato

### 2.1 Base finale

- Base: `graphics/g-consolidation` @ `14c6f1fd32f3ed66cf8d5588d7dbcd8def67a1b3`.
- Branca finale: `graphics/g-final-consolidation`.
- La base contiene già il lavoro G2.1 (`958a60e`, `0879a88`) e il lavoro di consolidamento precedente.

### 2.2 Commit recuperati tramite cherry-pick

I seguenti commit del flusso G1/G1-b sono stati recuperati selettivamente nella history lineare della branca finale:

| Originale | Cherry-pick finale | Contenuto |
|---|---|---|
| `cab45ec` | `05be422` | Contratto read-only `CreatureVisualDescriptor` |
| `8ae85b2` | `2907670` | Disegno 2D procedurale con cost guards |
| `5201dae` | `d54ad51` | Materiali 3D organici, luce aggiuntiva, colore per individuo |
| `0dcf17c` | `fbb03c3` | Report G1 e coordinamento |
| `b35dcf4` | `a6e447c` | Aggiornamento report G1 |
| `61198eb` | `917b065` | Smoke test desktop e profiling |
| `efcf7b1` | `fab8c67` | Split di `Planet3DView` in moduli dedicati (G1-b) |

La verifica `git merge-tree --write-tree <padre> <commit>` restituisce zero conflitti per ciascun cherry-pick. I conflitti add/add descritti in `G_FINAL_MERGE_MATRIX.md` compaiono solo se si tenta un merge diretto delle punte divergenti, non nella sequenza selettiva usata qui.

### 2.3 Lavoro già presente nella base

- `958a60e` — G2.1 hardening di geometria, posizionamento e validazione.
- `0879a88` — report finale G2.1.

### 2.4 Commit esclusi

Esclusi i cinque commit duplicati/non necessari della sequenza `Add files via upload`/`Create assemble.ts` (`0f5db31`, `4cc99b9`, `468d431`, `9394f02`, `8c48c7d`). In particolare `8c48c7d` è la head della PR #1, che resta aperta e dirty: non è stata riscritta né riparata. Il contenuto valido di quella sequenza è già rappresentato dalla base consolidata e dai cherry-pick selettivi.

## 3. Architettura dei sottosistemi grafici

### 3.1 G1 — descriptor visivo read-only

`lib/visual/creatureVisualDescriptor.ts` espone un descrittore visivo derivato dai soli tratti visuali, senza mutare genoma, fenotipo o stato di simulazione. `buildCreatureVisualDescriptor` fornisce la proiezione G1 usata dal renderer e dal disegno 2D. La stabilità del colore per individuo usa `stableVariation01`/`hueShiftFromVariation`.

Il renderer 3D resta basato su mesh instanziate: torso, testa, occhi, coda, mascella, zampe, orecchie, spine e ombra. `components/simulation/planet3d/creatureInstancing.ts` rimane il loop caldo; `components/simulation/Planet3DView.tsx` orchestra scena, camera, input e ciclo di rendering.

### 3.2 G1-b — modularizzazione

Il refactor `efcf7b1` separa camera rig, costanti, creature instancing, selection ring, sky, sun e terrain sampling in `components/simulation/planet3d/`. Le modifiche finali a questi file sono strettamente mirate al supporto opzionale G2 (paragrafo 3.5); nessuna logica di simulazione è stata spostata o riscritta.

### 3.3 G2 — anatomia strutturata

`lib/anatomy/**` conserva il contratto additivo di G2.1:

- `ANATOMY_SCHEMA_VERSION = 1`;
- `validateAnatomy()` mantiene la forma e legarità preesistenti;
- `deserializeAnatomy()` e `migrateLegacy()` ora hanno un gate strutturale prima della migrazione (G-REV-01);
- `inspectAnatomy()` usa validazione difensiva senza lanciare eccezioni.

Il bridge `lib/visual/anatomyVisualBridge.ts` è read-only: converte un `AnatomyDescriptor` in un vocabolario visivo approssimato e dichiara esplicitamente quando il supporto è parziale tramite `renderSupport`. Non importa Three.js e non entra nel loop caldo.

### 3.4 G-REV-01, 03, 04 — validazione e robustezza

#### G-REV-01 — validatore/deserializzatore non-throw

- `checkAnatomyEnvelope()` controlla solo le condizioni strutturali che impedirebbero un accesso sicuro ai campi (oggetto nullo, array mancanti, tipi inattesi, valori non finiti dove usati come indici/dimensioni).
- `inspectAnatomy()` intercetta eventuali eccezioni e restituisce un report con `complete=false` invece di propagarle.
- `deserializeAnatomy()` esegue il gate **prima** di qualsiasi migrazione: input strutturalmente incompatibili vengono rifiutati senza correre il rischio di costruire un descriptor intermedio invalido.
- `migrateLegacy()` applica lo stesso gate e restituisce `complete=false` quando il payload legacy non è utilizzabile.

I controlli semantici (duplicati, enum non validi, coerenza dei riferimenti) restano alla normale validazione: non sono stati promossi a crash gate per evitare cambi di comportamento non necessari.

#### G-REV-03 — simmetria radiale geometrica

La validazione radiale non si limita al campo `angle` metadata: verifica posizioni effettive, direzioni, spaziatura angolare geometrica (incluso il gap di avvolgimento) e raggio dell'host. Un gruppo dichiarato simmetrico ma con raggi o direzioni discordanti viene segnalato come invalido.

#### G-REV-04 — appendici bilateralmente dispari

Politica adottata per i gruppi con numero dispari di elementi:

- `center-line`: esclude esattamente un elemento mediano;
- `staggered`: esclude esattamente l'ultimo elemento indicizzato e valida tutte le coppie adiacenti rimanenti con offset Z di un passo;
- `omit`: emette solo coppie.

Il generatore (`lib/anatomy/generate.ts`) fa condividere ai gruppi `staggered` gli stessi bucket di jitter, così la validazione e la generazione usano la stessa regola. Il validatore non accetta più una coppia arbitraria ignorando l'ultimo elemento.

La suite `tests/anatomyReview.test.ts` copre 34 casi avversariali generati da 2 matrici di corruzione da 12 elementi più 10 casi dedicati, per input malformati/non finiti, versioni legacy incomplete, corruzione semantica, geometrie radiali raggruppate, disallineamento radiale e corruzione di coppie dispari.

### 3.5 G-REV-02 — integrazione reale del renderer G2

#### Contract

`lib/visual/anatomyRenderPlan.ts` introduce:

- `GENERIC_RENDER_SLOTS` (`segment: 6`, `appendage: 12`, `eye: 2`);
- `CreaturePartInstance`, `AnatomyRenderGeometry`, `AnatomyRenderPlan`;
- `CreatureAnatomyRenderSource` con `id` e `planFor(organismId, tick)`;
- `isUsableAnatomyRenderPlan()`;
- `planFromAnatomyDescriptor()`.

Il piano è una struttura pura, immutabile e senza Three.js. La sorgente è un **canale laterale opzionale lato renderer**: non entra in `RenderFrame`, worker, salvataggi, persistence o simulazione. Il percorso predefinito resta il fallback legacy.

#### Renderer

`updateCreatureInstances()` accetta un ottavo argomento opzionale `sourceOverride`. Ogni frame:

1. risolve la sorgente da override o `refs.renderSource`;
2. richiede un piano e lo accetta solo se `isUsableAnatomyRenderPlan()`;
3. applica geometria, posa e colore del piano ai pool generici limitati;
4. azzera e conta i pool quando la sorgente manca o il piano non è utilizzabile;
5. aggiorna `CreatureRendererStats` (`drawn`, `mapped`, `legacy`, `fallback`, `unsupported`, `fallbackReasons`).

`bodyMesh` rimane il proxy di selezione/picking; il raycast non cambia. I piani non supportati o invalidi non generano geometria inventata: il renderer ricade sulla geometria legacy e registra il motivo. La cache della traccia resta tipizzata legacy e resta `null` sul percorso G2.

`Planet3DView` crea tre pool instanziati generici (`segment`, `appendage`, `eye`) con slot limitati, gestisce la rimozione della sorgente e ne dispone geometry/materiali in cleanup. I mesh generici partono invisibili.

La suite `tests/anatomyRendererIntegration.test.ts` verifica: consumo della geometria G2, fallback legacy bit-identico senza sorgente, fallback per piano unsupported/invalido con reason, conteggi e mapping dei pool generici, assenza di mutazioni a descriptor/piano/sorgente/frame/typed array.

## 4. Confini di responsabilità

| Componente | Responsabilità | Non fa |
|---|---|---|
| `lib/anatomy/**` | Validazione, serializzazione, generazione, assemblaggio | Non tocca renderer o simulazione |
| `lib/visual/anatomyRenderPlan.ts` | Piano di rendering puro e gate di usabilità | Non importa Three.js, non calcola pose |
| `lib/visual/anatomyVisualBridge.ts` | Proiezione read-only G2→vocabolario G1 | Non entra nel loop caldo |
| `components/simulation/planet3d/creatureInstancing.ts` | Hot loop, pose, pool legacy e generici | Non modifica genoma o frame |
| `components/simulation/Planet3DView.tsx` | Scena, sorgente opzionale, cleanup | Non cambia picking né contratto `RenderFrame` |
| `simulation/**` | Resta invariato | Nessuna modifica in questa branca |

## 5. Compatibilità

- Il salvataggio/caricamento non cambia formato.
- `ANATOMY_SCHEMA_VERSION = 1` resta invariato.
- `validateAnatomy()` mantiene la firma e la semantica pubblica; vengono aggiunti solo controlli interni di robustezza.
- Senza `anatomyRenderSource`, l'output del renderer è bit-identico al percorso legacy (verificato dai test).
- Con sorgente G2, la simulazione continua a vedere solo i tratti legacy già presenti in `RenderFrame`.

## 6. Decisioni architetturali chiave

1. **Additività** — G2 è un'opzione lato renderer, non una sostituzione del modello di simulazione.
2. **Nessuna geometria inventata** — se il piano non è supportato o non è finito, si usa il fallback legacy e si registra il motivo.
3. **Hot loop guardato** — i piani devono essere precalcolati e memorizzati nella sorgente; il benchmark `descriptorFromLegacyTraits+project/3000` mostra perché la costruzione live è inaccettabile.
4. **Validazione difensiva mirata** — il gate strutturale blocca solo ciò che può causare crash, lasciando i controlli semantici al validatore normale.
5. **Nessuna riscrittura condivisa** — la PR #1 resta aperta/dirty e la PR #2 resta chiusa/mergeata.
