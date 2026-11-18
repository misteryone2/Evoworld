# G Final — Matrice di merge e provenance

## 1. Branca finale

- Branca: `graphics/g-final-consolidation`.
- Base: `graphics/g-consolidation` @ `14c6f1fd32f3ed66cf8d5588d7dbcd8def67a1b3`.
- Metodo: cherry-pick selettivi e applicazione mirata delle correzioni G-REV-01..04.
- Non eseguiti: merge delle punte divergenti, force-push, riscritture, modifica di `main`, chiusura PR o publish.

`origin/graphics/g-consolidation` e `origin/graphics/g2-anatomy-hardening` sono registrate come remote. Non esiste una remote `graphics/g2-1-final`: il lavoro G2.1 è presente nella base tramite `958a60e`/`0879a88`. La branch locale `graphics/g2-anatomy-hardening` punta a `0879a88`.

## 2. Matrice dei commit G1/G1-b

Tutti i cherry-pick elencati sono stati verificati senza conflitti applicando il commit sul proprio genitore con `git merge-tree --write-tree <padre> <commit>` (zero conflitti per ciascuno).

| Commit originale | Data | Cherry-pick | Azione | Rationale |
|---|---|---|---|---|
| `cab45ec` | 2026-11-16 | `05be422` | Recuperato | Aggiunge il contratto read-only `CreatureVisualDescriptor` e i relativi test; necessario per G1. |
| `8ae85b2` | 2026-11-16 | `2907670` | Recuperato | Disegno 2D procedurale con cost guards; necessario per la completezza del flusso G1. |
| `5201dae` | 2026-11-16 | `d54ad51` | Recuperato | Materiali 3D organici e colore per individuo; richiesto dal flusso G1. |
| `0dcf17c` | 2026-11-16 | `fbb03c3` | Recuperato | Report G1 e aggiornamento coordinamento. |
| `b35dcf4` | 2026-11-16 | `a6e447c` | Recuperato | Aggiornamento report G1; documenta test e baseline eseguiti. |
| `61198eb` | 2026-11-16 | `917b065` | Recuperato | Registra smoke test desktop e profiling. |
| `efcf7b1` | 2026-11-17 | `fab8c67` | Recuperato | Split G1-b di `Planet3DView` in moduli; mantenuto perché la base lo contiene già. |

## 3. Matrice G2/G2.1

| Commit | Stato nella finale | Azione | Rationale |
|---|---|---|---|
| `958a60e` | Già in `14c6f1f` | Nessun cherry-pick | G2.1 hardening già consolidato nella base. |
| `0879a88` | Già in `14c6f1f` | Nessun cherry-pick | Report G2.1 già consolidato nella base. |

## 4. Commit esclusi

| Commit | Azione | Rationale |
|---|---|---|
| `0f5db31` | Escluso | Upload duplicato/non incrementale rispetto al contenuto già consolidato. |
| `4cc99b9` | Escluso | Upload duplicato nella stessa sequenza. |
| `468d431` | Escluso | `Create assemble.ts` già presente nella base consolidata. |
| `9394f02` | Escluso | Upload duplicato nella stessa sequenza. |
| `8c48c7d` | Escluso | Head della PR #1 (open/dirty). Non riscritta né riparata; il contenuto valido è già altrove. |

## 5. Conflitti osservati e risoluzione

### 5.1 Conflitti di cherry-pick

Nessuno. Ogni cherry-pick G1/G1-b è stato applicato sul rispettivo genitore con zero conflitti.

### 5.2 Conflitti di merge diretto (non eseguiti)

Un controllo diagnostico `git merge-tree --write-tree 14c6f1f 8c48c7d` mostra 12 conflitti add/add:

- `components/simulation/planet3d/creatureInstancing.ts`
- `docs/graphics/G2_ARCHITECTURE.md`
- `docs/graphics/G2_FINAL_REPORT.md`
- `docs/graphics/G2_MISSING_GENETIC_DATA.md`
- `lib/anatomy/assemble.ts`
- `lib/anatomy/bodyPlan.ts`
- `lib/anatomy/generate.ts`
- `lib/anatomy/types.ts`
- `lib/anatomy/validate.ts`
- `lib/visual/creatureVisualDescriptor.ts`
- `lib/visual/index.ts`
- `tests/anatomyG2.test.ts`

Un controllo analogo su `14c6f1f` ed `efcf7b1` mostra 3 conflitti add/add: `creatureInstancing.ts`, `creatureVisualDescriptor.ts`, `lib/visual/index.ts`.

Questi conflitti sono il risultato di history divergenti che aggiungono gli stessi percorsi. **Non sono stati risolti tramite merge diretto**: la strategia finale è cherry-pick sequenziale, che li evita, più le modifiche mirate G-REV. Il controllo è riportato solo come evidenza del motivo per cui non è stato tentato un merge di branch tip.

## 6. Stato PR

| PR | Stato | Head | Base | Azione finale |
|---|---|---|---|---|
| #1 — G1 creature visuals | `open`, `mergeable=false`, `rebaseable=false`, `mergeable_state=dirty` | `8c48c7dac5c34ee2a14c9ee931803517222b0ea2` | `c35c287bf2f83fea02de09ba41b33445d9ab2a3e` | Non toccata; nessun force-push o riscrittura. |
| #2 — E1 ecosystem QA | `closed`, merged | `edd31c10dc3e1e2a53b0bde5f4dec0da2bc37c90` | vedere API GitHub | Non riaperta, non modificata. |

I dati PR sono stati letti dalle API `https://api.github.com/repos/misteryone2/Evoworld/pulls/1` e `/pulls/2`. `gh` CLI non è disponibile nell'ambiente.

## 7. Modifiche finali nella branca

Rispetto alla base `14c6f1f`, la branca finale contiene solo:

- modifiche mirate a `lib/anatomy/{generate,serialize,validate}.ts` per G-REV-01/03/04;
- nuovo `lib/visual/anatomyRenderPlan.ts` ed export da `lib/visual/index.ts`;
- modifiche mirate a `components/simulation/Planet3DView.tsx`, `components/simulation/planet3d/creatureInstancing.ts`, `components/simulation/planet3d/types.ts` per G-REV-02;
- nuovi test `tests/anatomyReview.test.ts` e `tests/anatomyRendererIntegration.test.ts`;
- estensione di `scripts/graphicsConsolidation.benchmark.ts` con le righe G2;
- cinque documenti `docs/graphics/G_FINAL_*`.

Non risultano modifiche a `simulation/**`, biologia, salvataggio/caricamento, persistence o architetture non grafiche.

## 8. Verifica finale della provenance

- `git branch --contains 958a60e` → `graphics/g-consolidation`, `graphics/g-final-consolidation`, `graphics/g2-anatomy-hardening`.
- `git branch --contains cab45ec` → solo `graphics/g1-creature-visuals` (prima del cherry-pick); nella finale il contenuto è presente tramite `05be422`.
- `git status --short --branch` prima del commit finale: branca `graphics/g-final-consolidation`, tracking `origin/graphics/g-consolidation`, con le sole modifiche elencate al paragrafo 7.
