# Report A — G1: verifica creature visuals e PR #1

**Branch di riferimento:** `graphics/g1-creature-visuals` (PR #1), commit remoti `05be422…efcf7b1` applicati anche su `graphics/g-consolidation`.
**Base:** `main@d330c12f345ab26ab7405b908c729e2e2f6bcc22`.
**Data verifica:** 2026-11-18.
**Ambiente:** Windows, Node v22.14.0 portable (`%TEMP%\opencode\node-v22.14.0-win-x64`), Vitest 4.1.12, Next 16.3.0, Chromium in-app.

## 1. Sintesi

| Attività | Classificazione | Evidenza |
|---|---|---|
| Contratto `CreatureVisualDescriptor` read-only, puro e deterministico | **COMPLETATA** | 12 test dedicati + 29 test mirati finali; nessuna mutazione della simulazione |
| Drawing 2D dettagliato con guardie di costo | **COMPLETATA** | `drawCreature.ts`; smoke Mappa 2D; test `creatureShape` |
| Materiali 3D, fill light e colore per individuo | **COMPLETATA** | commit `d54ad51`; smoke 3D; test `creatureInstances` |
| Coerenza 2D↔3D della variazione cromatica | **COMPLETATA** | `stableVariation01`/`organismHueShift` condivisi; test ponte G2↔G1 |
| Coerenza geometrica 2D↔3D | **COMPLETATA CON LIMITAZIONI** | repertorio 3D instanziato chiuso; dettagli 2D non tutti riproducibili come geometria |
| Responsive / mobile reale | **NON VERIFICATA** | solo desktop 1000×700 CSS, DPR 1.25; canvas 2D 640×640 |
| Compatibilità UI esistente | **COMPLETATA** | build OK, API e callers invariati, smoke su vista pianeta e tab |
| Indagine PR #1 | **COMPLETATA** | causa conflitti identificata nei 5 commit upload G2 duplicati |
| Rendi PR #1 mergeable senza riscrivere commit | **BLOCCATA** | richiederebbe force-push/overwrite vietati dal mandato |
| FPS a frame sbloccato, popolazione forzata, GPU/mobile | **NON VERIFICATA** | cap 30 fps del loop, popolazione non forzata, GPU integrata |

## 2. Verifiche eseguite

Tipi: **A** = test automatico, **M** = check manuale/browser, **C** = check solo codice.

| ID | Tipo | Comando / azione | Exit | Risultato | Errori | Skip |
|---|---|---|---|---|---|---|
| A-01 | A | `npx vitest run tests/creatureVisualDescriptor.test.ts --reporter=dot` | 0 | `12 passed (12)` | 0 | 0 |
| A-02 | A | `npx vitest run tests/creatureVisualDescriptor.test.ts tests/creatureInstances.test.ts tests/creatureShape.test.ts --reporter=dot` | 0 | `3 files passed`, `29 passed (29)` | 0 | 0 |
| A-03 | A | `npx next build` | 0 | `✓ Compiled successfully`, TypeScript OK, `3/3` pagine statiche | 0 | — |
| A-04 | A | `npx tsc --noEmit --pretty false` (post-build) | 0 | nessun output | 0 | — |
| A-05 | A | `npx vitest run --reporter=dot` (G1 storico) | 1 | `687 passed`, `10 failed`, `1 skipped (698)` | 10 preesistenti/flaky | 1 |
| A-06 | M | `next dev` + Chromium, profilo **Completa**, vista dall'alto/libera/terza persona | N/A | canvas WebGL `1250×875` (`1000×700` CSS, DPR 1.25); nessun errore console; nessun `webglcontextlost` | 0 | — |
| A-07 | M | passaggio a **Mappa 2D** | N/A | canvas `640×640`, nessun errore console | 0 | — |
| A-08 | C | grep dipendenze/import su `lib/visual/**` e `simulation/**` | N/A | nessun import da `simulation/**`, Three.js o React nel descriptor; nessun file protetto modificato | 0 | — |

Gli errori dei test automatici A-05 non appartengono a G1: `fauna180` (belly `1.08` vs `1.0` atteso da test che usa funzione non toccata), `vibeGenomeV1110` (2), e failure flaky/timeouts in `planet`, `hydrology`, `reproduction`, `settlementDefaults`.

## 3. PR #1 — stato reale

Fonte: `https://api.github.com/repos/misteryone2/Evoworld/pulls/1` (letto il 2026-11-18).

- `state=open`, `merged=false`.
- `head.sha=8c48c7dac5c34ee2a14c9ee931803517222b0ea2`, `base.sha=c35c287bf2f83fea02de09ba41b33445d9ab2a3e`.
- `commits=12`, `changed_files=34`, `additions=5954`, `deletions=1207`.
- `mergeable=false`, `rebaseable=false`, `mergeable_state=dirty`.

**Causa confermata:** gli ultimi 5 commit del branch (`0f5db31`, `4cc99b9`, `468d431`, `9394f02`, `8c48c7d`) aggiungono file G2 già presenti in `main` (`lib/anatomy/**`, `lib/phenotype/**`, documentazione e test). I conflitti sono duplicazioni, non divergenze logiche. I 7 commit G1/G1-b genuini (`cab45ec`, `8ae85b2`, `5201dae`, `0dcf17c`, `b35dcf4`, `61198eb`, `efcf7b1`) sono stati cherry-pickati pulitamente su `graphics/g-consolidation`.

**Decisione:** non forzare, non riscrivere, non chiudere PR #1. La branch consolidata è il deliverable integrabile; PR #1 resta come documentazione storica e sorgente dei commit.

## 4. Limiti

- Nessun test su smartphone o emulatori; nessuna verifica di rotazione/zoom touch reale.
- Nessuna misura FPS a frame sbloccato; il loop è cap a ~30 fps.
- Nessun confronto visivo golden prima/dopo a parità di seed; il giudizio estetico richiede review umana.
- `PCFSoftShadowMap` produce un warning di deprecazione in Three.js (osservato nel log dev server); non è un errore e non è stato introdotto da G1.

## 5. Classificazione finale

**COMPLETATA CON LIMITAZIONI.** Il codice G1 è verificato, i test dedicati passano e la UI esiste, ma PR #1 non è mergeable per una causa esterna già nota e le verifiche mobile/GPU non sono state eseguite.
