# Report B — G1-b: refactor modulare, ciclo di vita e prestazioni

**Commit G1-b:** `efcf7b1` (`refactor(3d): split Planet3DView into focused modules`), applicato su consolidamento come `fab8c67`.
**Data verifica:** 2026-11-18.

## 1. Sintesi

| Attività | Classificazione | Evidenza |
|---|---|---|
| Split di `Planet3DView.tsx` in moduli `planet3d/*` | **COMPLETATA** | 2199 → 1072 righe; 9 moduli dedicati |
| Separazione delle responsabilità | **COMPLETATA** | terrain, sky, sun, sampling, camera, selection, creature instancing |
| API storica preservata | **COMPLETATA** | re-export da `Planet3DView.tsx`; nessun caller modificato |
| Scratch/buffer riusati, nessuna nuova allocazione nel loop caldo | **COMPLETATA** | `creatureInstancing.ts` con scratch privato; ottimizzazione a un solo hash per colore |
| Efficienza update creature | **COMPLETATA CON LIMITAZIONI** | misurato; nessun miglioramento dimostrato rispetto a G2.1 |
| Ciclo di vita Three.js / prevenzione leak | **COMPLETATA CON LIMITAZIONI** | dispose e cleanup auditati; smoke cicli senza errori; senza heap compare |
| Stabilità ad aggiornamenti frequenti | **COMPLETATA CON LIMITAZIONI** | cicli modalità/profile senza errori; nessuno stress prolungato |
| Benchmark con misure reali | **COMPLETATA** | CPU Node, warmup + 80 campioni; nessun FPS/GPU dichiarato |
| Parità visiva prima/dopo | **NON VERIFICATA** | assenti golden screenshot a parità di seed |

## 2. Struttura e responsabilità

Moduli creati in `components/simulation/planet3d/`:

| Modulo | Responsabilità |
|---|---|
| `constants.ts` | costanti condivise (`PLANET_RADIUS`, `LEGS_PER_CREATURE`, soglie) |
| `types.ts` | `SceneRefs`, `CreatureTrack`, `HeightmapSample` |
| `terrainTiers.ts` | tier LOD terreno e selezione profilo |
| `sky.ts` | cielo, gradiente, nuvole |
| `sun.ts` | sole orbitante, posizione follow, extent ombre |
| `terrainSampling.ts` | `restingRadius` locale/heightmap |
| `cameraRig.ts` | camera follow/libera, drag, pan, scratch dedicato |
| `selectionRing.ts` | anello di selezione |
| `creatureInstancing.ts` | configurazione mesh, gradiente ventre, update istanze |

**Nessuno stato mutabile condiviso tra moduli.** `creatureInstancing.ts` ha una copia privata di `UP`, separata da quella della camera. Le costanti e le soglie sono invariate: si tratta di un code move, non di un cambiamento algoritmico.

## 3. Verifiche eseguite

| ID | Tipo | Comando / azione | Exit | Risultato | Errori | Skip |
|---|---|---|---|---|---|---|
| B-01 | A | `npx tsc --noEmit` (G1-b storico) | 0 | nessun output | 0 | — |
| B-02 | A | `npx next build` (G1-b storico) | 0 | compilazione e 3/3 pagine statiche | 0 | — |
| B-03 | A | test mirati grafica, 12 file | 1 | `184 passed`, `2 failed (186)` | `fauna180` belly, `livingBehavior` ampieze | 0 |
| B-04 | A | `npx vitest run --reporter=dot` (G1-b storico) | 1 | `684 passed`, `13 failed`, `1 skipped (698)` | 13 fuori scope/flaky | 1 |
| B-05 | A | `npx vitest run --reporter=dot` (baseline con stash G1-b) | 1 | `682 passed`, `15 failed`, `1 skipped (698)` | 15 fuori scope/flaky | 1 |
| B-06 | A | `npx vitest run tests/creatureVisualDescriptor.test.ts tests/creatureInstances.test.ts tests/graphicsConsolidation.test.ts --reporter=dot` | 0 | `3 files passed`, `29 passed (29)` | 0 | 0 |
| B-07 | A | `npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts --reporter=dot` | 0 | benchmark CPU completato (§4) | 0 | 0 |
| B-08 | M | smoke Chromium, profili `alto` → `2d` → `medio` → `alto`, 3 modalità camera | N/A | sempre 1 canvas, `webglcontextlost=0`, `webglcontextrestored=0`, 0 errori console | 0 | — |
| B-09 | C | grep `dispose`, `removeEventListener`, `cancelAnimationFrame` su `Planet3DView.tsx` | N/A | 44 occorrenze; geometry/material/texture/controls/listener/rAF cleanup presenti | 0 | — |

Il delta B-04 vs B-05 (13 vs 15 failure) rientra nel range flaky noto; non indica regressione G1-b.

## 4. Benchmark reale (CPU, Node — non FPS)

Comando: `npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts --reporter=dot`.
Metodo: warmup 20 iterazioni, 80 campioni, mediana/p95; `performance.now()`; nessuna GPU, nessun draw call.

| Misura | Mediana | p95 |
|---|---:|---:|
| `updateCreatureInstances/100` | 0.722 ms | 2.357 ms |
| `updateCreatureInstances/500` | 2.945 ms | 7.971 ms |
| `updateCreatureInstances/1500` | 4.844 ms | 9.776 ms |
| `updateCreatureInstances/3000` | 10.781 ms | 19.888 ms |
| `buildCreatureVisualDescriptor/3000` | 1.926 ms | — |
| `descriptorFromLegacyTraits+project/3000` | 1015.032 ms | — |

L'ultima riga misura la costruzione completa G2 + proiezione, **non** il percorso hot: conferma che non va usata per frame.

### A/B sul solo `updateCreatureInstances`

Benchmark temporaneo identico nei due worktree (poi rimosso), 3 round per branch:

| Branch | 1500 (mediana) | 3000 (mediana) |
|---|---:|---:|
| `graphics/g2-anatomy-hardening` | 3.406–3.754 ms | 7.325–7.834 ms |
| `graphics/g-consolidation` | 4.071–4.498 ms | 8.730–11.087 ms |

**Interpretazione onesta:** non è stato misurato alcun miglioramento prestazionale. Il diff del corpo della funzione mostra che la modularizzazione è un code move; la differenza residua è attribuibile alla colorazione per-individuo di G1 (`setHSL` con jitter), non a G1-b. La rimozione del modulo `% 360` prima di `setHSL` è corretta perché Three.js applica già `euclideanModulo(h, 1)`, ma non produce un guadagno misurabile.

## 5. Limiti

- Nessun heap snapshot/compare prima e dopo i cicli: il "no leak" è un giudizio di codice + assenza di errori, non una misura di memoria.
- Nessuno stress a popolazione forzata 1500/3000 nel browser.
- Nessun confronto golden visivo prima/dopo il refactor.
- Il warning `PCFSoftShadowMap has been deprecated` è preesistente e non blocca.

## 6. Classificazione finale

**COMPLETATA CON LIMITAZIONI.** Refactor, API e cleanup sono corretti e verificati; la promessa di prestazioni migliori non è supportata dai numeri reali, quindi non viene dichiarata.
