# Report E — Verifica finale e prontezza all'integrazione

**Data:** 2026-11-18.
**Oggetto:** stato finale dell'intero stream G (G1, G1-b, G2.1, consolidamento) sui branch dedicati.
**Nessun merge eseguito.**

## 1. Classificazione globale

| Attività | Classificazione |
|---|---|
| Auditing del codice (non solo report) | **COMPLETATA** |
| Correzioni implementate e testate | **COMPLETATA** |
| Build + TypeScript | **COMPLETATA** |
| Test mirati automatici | **COMPLETATA** |
| Suite completa automatica | **COMPLETATA CON LIMITAZIONI** |
| Smoke browser manuale | **COMPLETATA CON LIMITAZIONI** |
| Benchmark CPU con misure reali | **COMPLETATA** |
| Prestazioni/FPS/GPU/mobile | **NON VERIFICATA** |
| PR #1 resa mergeable | **BLOCCATA** |
| Deliverable documentali e branch review | **COMPLETATA** |

## 2. Comandi finali (dopo l'ultima modifica al renderer)

| ID | Tipo | Comando | Exit | Risultato | Errori | Skip |
|---|---|---|---|---|---|---|
| E-01 | A | `npx vitest run tests/creatureVisualDescriptor.test.ts tests/creatureInstances.test.ts tests/graphicsConsolidation.test.ts --reporter=dot` | 0 | `3 files passed`, `29 passed (29)` | 0 | 0 |
| E-02 | A | `npx tsc --noEmit --pretty false` | 0 | nessun output | 0 | — |
| E-03 | C | `git diff --check` | 0 | nessun errore | 0 | — |
| E-04 | A | `npx next build` | 0 | `✓ Compiled successfully in 1950ms`, TypeScript `6.3s`, `3/3` pagine statiche in `1.382s` | 0 | — |
| E-05 | A | `npx vitest run --reporter=dot` | 1 | `7 failed files`, `64 passed files`, `1 skipped file (72)`; `11 failed`, `849 passed`, `1 skipped (861)` | §3 | 1 |
| E-06 | A | `npx vitest run tests/fauna180.test.ts tests/hydrology.test.ts tests/livingBehavior.test.ts tests/planet.test.ts tests/reproduction.test.ts tests/settlementDefaults.test.ts tests/vibeGenomeV1110.test.ts --reporter=dot` | 1 | `4 failed files`, `3 passed files`; `6 failed`, `112 passed (118)` | 6 residui; 5 timeout non riprodotti | 0 |
| E-07 | A | `npx vitest run tests/hydrology.test.ts --reporter=dot --testTimeout=30000` | 0 | `11 passed (11)` | 0 | 0 |
| E-08 | M | dev server `127.0.0.1:3100` + Chromium: caricamento, profili `auto/alto/2d/medio/alto`, 3 modalità camera, contatore eventi WebGL | N/A | 0 errori console; `webglcontextlost=0`, `webglcontextrestored=0`; sempre 1 canvas | 0 | — |

Nota su E-04: `tsc --noEmit` prima della generazione dei tipi Next produce ancora il noto `TS2304 LayoutProps` (exit 2). Dopo `next build` passa con exit 0: è un artifact dell'ambiente, non del codice G.

## 3. Errori della suite completa (E-05)

| File | n | Natura | Classificazione |
|---|---:|---|---|
| `tests/fauna180.test.ts` | 1 | `belly=1.0800000429` vs `1.0` atteso; funzione `addBellyGradient` non modificata | preesistente, deterministico |
| `tests/hydrology.test.ts` | 1 | timeout 5000 ms; passa con `--testTimeout=30000` (11/11) | timeout, non errore logico |
| `tests/livingBehavior.test.ts` | 1 | timeout 5000 ms; passa nel rerun E-06 | flaky |
| `tests/planet.test.ts` | 2 | timeout 5000 ms; passano nel rerun E-06 | flaky |
| `tests/reproduction.test.ts` | 2 | `offspring.length=0`, energia `200 < 200` atteso | preesistente, deterministico |
| `tests/settlementDefaults.test.ts` | 1 | timeout 5000 ms; passa nel rerun E-06 | flaky |
| `tests/vibeGenomeV1110.test.ts` | 3 | 2 asserzioni registry/PER-03 + 1 timeout 5000 ms | 2 preesistenti + 1 flaky |

Confronto: `main` baseline `10 failed | 769 passed | 1 skipped (780)`, G2.1 `10 failed | 830 passed | 1 skipped (841)`, consolidamento `11 failed | 849 passed | 1 skipped (861)`. L'aumento di test passati è spiegato dai nuovi test G; le failure restano nello stesso insieme, con variazioni di timeout tra run.

## 4. Smoke browser manuale (E-08)

- URL `http://127.0.0.1:3100/`, build di sviluppo, Chromium in-app, DPR 1.25.
- Profilo iniziale `auto` → `Completa`; canvas 3D `1000×700` CSS / `1250×875` backing store.
- Modalità camera `🌍 Dall'alto`, `🚶 Libera`, `🐾 Terza persona`: tutte attivabili, 0 errori console.
- Profilo `2d`: canvas `700×700` CSS / `640×640` backing store, `PlanetCanvas` attivo, 0 errori console.
- Cicli `alto → 2d → medio → alto` e `2d → alto → basso → alto`: sempre 1 canvas, nessun contesto perso.
- Warning server: `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.` (preesistente, non errore).
- Lo screenshot non è stato acquisibile perché la finestra desktop non era visibile; la verifica è quindi funzionale/DOM, non estetica.

## 5. Stato branch e deliverable

| Branch | Head | Stato |
|---|---|---|
| `graphics/g2-anatomy-hardening` | `0879a88` | pulito, pushato, non toccato |
| `graphics/g-consolidation` | `fab8c67` + modifiche locali documentali/ponte/benchmark | da committare e pushare dopo questo report |
| `Evoworld-git` (`research/e2-ecosystem-dynamics`) | — | 17 file dirty E2 intatti, non toccati |
| `main` | `d330c12` | non modificato |

Prima del commit finale sono stati rimossi: `scripts/_abUpdate.benchmark.ts` da entrambi i worktree, e `AGENTS.md`/`CLAUDE.md` generati automaticamente da `next dev`. Il worktree G2.1 è pulito.

## 6. Prontezza

**COMPLETATA CON LIMITAZIONI.** L'intero stream è pronto per review indipendente su branch dedicati. Non è pronto per merge automatico perché:

1. PR #1 è `mergeable=false` / `mergeable_state=dirty` per i 5 commit upload duplicati, e risanarla richiederebbe una riscrittura vietata.
2. La suite completa conserva failure preesistenti/flaky fuori dallo scope G.
3. Mancano misure GPU/FPS a frame sbloccato, popolazione forzata e test mobile reale.
4. La compatibilità G2→G1 è un contratto verificato, non una dimostrazione visiva end-to-end di tutti i body plan.

Nessuna di queste limitazioni è stata nascosta: ciascuna è classificata nella matrice tecnica `G_TECHNICAL_MATRIX.md`.
