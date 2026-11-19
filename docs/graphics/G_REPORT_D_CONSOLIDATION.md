# Report D — Consolidamento architetturale G1/G1-b + G2.1

**Branch:** `graphics/g-consolidation`, creato da `graphics/g2-anatomy-hardening@0879a88`.
**Head verificato:** `fab8c671fe4624cd0001249266c64ed1e2b11da9` (pre-commit dei nuovi documenti).
**Data verifica:** 2026-11-18.

## 1. Costruzione del branch

- `node_modules` copiato fisicamente (`robocopy`, exit 1 = successo); nessun junction/symlink, evitando `TurbopackInternalError`.
- Cherry-pick dei 7 commit G1/G1-b genuini, tutti senza conflitti:

| Originale | Su consolidamento | Contenuto |
|---|---|---|
| `cab45ec` | `05be422` | descriptor G1 |
| `8ae85b2` | `2907670` | drawing 2D |
| `5201dae` | `d54ad51` | materiali 3D |
| `0dcf17c` | `fbb03c3` | report G1 |
| `b35dcf4` | `a6e447c` | test marcati eseguiti |
| `61198eb` | `917b065` | smoke desktop |
| `efcf7b1` | `fab8c67` | refactor G1-b |

- **Esclusi** i 5 commit upload (`0f5db31`, `4cc99b9`, `468d431`, `9394f02`, `8c48c7d`) che duplicano file G2 già in `main`.
- Nessun merge, nessun force-push, nessuna modifica a `main`, PR #1 o branch altrui.

## 2. Sintesi attività

| Attività | Classificazione | Evidenza |
|---|---|---|
| Compatibilità generatore ↔ renderer | **COMPLETATA CON LIMITAZIONI** | ponte read-only + gate `anatomyRenderSupport()`; non riscrittura del renderer |
| Contratti dati (G1, G2.1, ponte) | **COMPLETATA** | immutabilità, fingerprint, serializzazione, test dedicati |
| Geometria / extents / clearance nel ponte | **COMPLETATA CON LIMITAZIONI** | `null` preservato; ogni altra misura è proiezione, non equivalenza |
| Update e rigenerazione | **COMPLETATA** | LOD 0–3 proiettabili; round-trip serializzazione |
| Materiali | **COMPLETATA** | `covering → materialClass`, roughness/sheen da armor/fur |
| LOD | **COMPLETATA** | 4 tier testati; nessuna clearance inventata |
| Ciclo di vita risorse | **COMPLETATA CON LIMITAZIONI** | code audit + smoke cicli; nessun heap compare |
| Prestazioni | **COMPLETATA CON LIMITAZIONI** | benchmark CPU reali; nessun miglioramento dimostrato |
| Regressioni | **COMPLETATA CON LIMITAZIONI** | suite completa con failure preesistenti/flaky, nessuna nuova |
| Duplicazione responsabilità / dipendenze circolari | **COMPLETATA** | ponte in `lib/visual` non importa generatori, renderer, simulazione o Three.js |
| Conflitti E-stream | **COMPLETATA** | documentati, checkout originale intatto (17 file dirty) |

## 3. Il ponte `anatomyVisualBridge.ts`

Nuovo modulo `lib/visual/anatomyVisualBridge.ts`, esportato da `lib/visual/index.ts`:

- `projectAnatomyToVisual(d)` restituisce un oggetto `Object.freeze` con morfologia, superficie, fingerprint, `groundClearance`, `groundClearanceStatus`, `maxLimbLength` e `renderSupport`.
- `anatomyRenderSupport(d)` dichiara esplicitamente quando il renderer instanziato G1 **non** può rappresentare fedelmente un body plan G2 (slot zampe/occhi/spine, simmetria, tipi di appendice non supportati, segmenti mancanti).
- `exactGeometry=true` solo per l'adattatore legacy `legacy-quadruped`.
- Nessun import da `three`, `components/**`, `simulation/**` o dai moduli generatori `anatomy/{generate,assemble,bodyPlan,lod,validate}`.
- Non entra nel loop caldo e non sostituisce `RenderFrame`: è un contratto per review e futuri consumer.

**Perché è una limitazione:** il renderer G1 ha un repertorio chiuso di mesh instanziate (torso, testa, occhi, coda, mascella, 4 zampe, orecchie, spine, ombra). I body plan G2 più esotici vengono segnalati come non supportati invece di essere falsamente dichiarati equivalenti.

## 4. Verifiche eseguite

| ID | Tipo | Comando | Exit | Risultato | Errori | Skip |
|---|---|---|---|---|---|---|
| D-01 | A | `npx vitest run tests/creatureVisualDescriptor.test.ts tests/creatureInstances.test.ts tests/creatureAnatomy.test.ts tests/creatureShape.test.ts tests/bodyAnimation.test.ts tests/animationLod.test.ts tests/anatomyG2.test.ts tests/anatomyG2Geometry.test.ts tests/phenotypeG2.test.ts --reporter=dot` | 0 | `9 files passed`, `158 passed (158)` | 0 | 0 |
| D-02 | A | `npx vitest run tests/graphicsConsolidation.test.ts --reporter=verbose` (prima correzione) | 1 | 1 test su 8 fallito | assunzione errata `bodyLength = legacy*2`; corretto il test | 0 |
| D-03 | A | `npx vitest run tests/graphicsConsolidation.test.ts --reporter=dot` (finale) | 0 | `1 file passed`, `8 passed (8)` | 0 | 0 |
| D-04 | A | `npx tsc --noEmit --pretty false` (pre-build) | 2 | solo `LayoutProps` mancante | 1 (tipi Next) | — |
| D-05 | A | `npx next build` | 0 | `✓ Compiled successfully in 16.5s`, TypeScript `12.5s`, `3/3` statiche | 0 | — |
| D-06 | A | `npx tsc --noEmit --pretty false` (post-build) | 0 | nessun output | 0 | — |
| D-07 | A | `npx vitest run --reporter=dot` (prima del ponte) | 1 | `13 failed`, `839 passed`, `1 skipped (853)` | failure fuori scope/flaky | 1 |
| D-08 | A | `npx vitest run --reporter=dot` (finale) | 1 | `11 failed`, `849 passed`, `1 skipped (861)` | §5 del Report E | 1 |
| D-09 | A | `npx vitest run tests/fauna180.test.ts tests/hydrology.test.ts tests/livingBehavior.test.ts tests/planet.test.ts tests/reproduction.test.ts tests/settlementDefaults.test.ts tests/vibeGenomeV1110.test.ts --reporter=dot` | 1 | `6 failed`, `112 passed (118)` | 6 residui; 5 timeout flaky risolti | 0 |
| D-10 | A | `npx vitest run tests/hydrology.test.ts --reporter=dot --testTimeout=30000` | 0 | `11 passed (11)` | solo timeout a 5 s, non errore logico | 0 |
| D-11 | A | `npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts --reporter=dot` | 0 | benchmark CPU completato | 0 | 0 |
| D-12 | M | smoke Chromium `127.0.0.1:3100`, 3D + 2D + cicli profili/camera | N/A | 0 errori console, 0 `webglcontextlost`, sempre 1 canvas | 0 | — |
| D-13 | C | `git diff --check` | 0 | nessun errore | 0 | — |
| D-14 | C | controllo checkout originale e branch G2.1 | N/A | `Evoworld-git` branch E2 con 17 file dirty intatti; G2.1 pulito | 0 | — |

## 5. Regressioni

Nessun test G1/G1-b/G2.1/ponte è fallito. Le failure della suite completa sono tutte fuori dallo scope G o flaky:

- deterministiche preesistenti: `fauna180` belly (1), `reproduction` (2), `vibeGenomeV1110` (2);
- timeouts a 5 s che passano isolatamente o con timeout esteso: `hydrology`, `livingBehavior`, `planet` (2), `settlementDefaults`, `vibeGenomeV1110` mutation.

## 6. Classificazione finale

**COMPLETATA CON LIMITAZIONI.** Il branch è coerente, testato e pronto per review indipendente. La compatibilità G2→G1 è dichiarata e verificata come contratto, non come identità visiva; le prestazioni non migliorano; la suite completa conserva failure esterne allo scope.
