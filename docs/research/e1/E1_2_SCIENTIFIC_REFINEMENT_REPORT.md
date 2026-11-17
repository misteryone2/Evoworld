# E1.2 — Scientific Validation Refinement

**Branch:** `research/e1-ecosystem-qa` (base `origin/main` `db86444`)  
**Stato:** PR #2 aggiornata, **non integrata in `main`**.  
**Fasi distinte:** E1.0 (`9cfb12a`), E1.1 (`a60148b`), E1.2 (questo commit). I risultati delle fasi precedenti sono conservati in `E1_VALIDATION_REPORT_E1_0.md` e `E1_VALIDATION_REPORT_E1_1.md`.

## 1. Correzioni metodologiche applicate

| Criticità E1.1 | Soluzione E1.2 | File |
|---|---|---|
| Confronti genetici potevano includere `a == b` e coppie ripetute | ID distinti ordinati; coppie `i < j`; enumerazione completa se `N(N-1)/2 <= 120`, altrimenti stride coprimo con punto di partenza da `hash32` | `tools/e1/metrics.ts` |
| Tassi del tick del cull usavano la popolazione post-perturbazione | Nuovi campi `populationAtStart`, `populationAfterStep`, `eventDenominator`; `birthRate/deathRate/predationPressure` usano sempre la popolazione a inizio step | `tools/e1/metrics.ts`, `tools/e1/runner.ts` |
| Cull basato su indice dell'array (sensibile all'ordine) | Selezione stratificata per specie con quota `ceil(n_species/5)`, maior remainder e hash `tick|speciesId|id`; RNG del motore intoccato | `tools/e1/initialConditions.ts` |
| Cull senza verifica dei conteggi | `PerturbationReport` con totali e per-species; assertion su rimossi + conservati e sulla popolazione ricostruita | `tools/e1/initialConditions.ts`, `tools/e1/runner.ts` |
| S09/S10 presentati come estremi globali | Metadati `setupInfo.habitat` con griglia campionata, passo, numero di candidate e `globalExtremesClaimed: false` | `tools/e1/initialConditions.ts`, `docs/research/e1/E1_EXPERIMENTS.md` |
| Posizione e risorse non separabili | S13/S14: stesse posizioni di S09/S10 con vegetazione iniziale scambiata; confronto 2×2 | `tools/e1/scenarios.ts`, `tools/e1/statistics.ts` |
| Output non verificato a livello filesystem | `tools/e1/experiment.ts` + `tests/e1/e1_integration.test.ts` | `tools/e1/experiment.ts`, `tests/e1/e1_integration.test.ts` |
| Una sola coppia di seed | Fase E1.2 con 12 seed × 7 scenari e statistiche descrittive | `scripts/e1_ecosystem.phase2.experiment.ts`, `tools/e1/statistics.ts` |

Nessuna modifica a `simulation/**`, genetica, mutazioni, ereditarietà, selezione, riproduzione, renderer, G1/G1-b, G2 o formati di salvataggio. Le regole biologiche non sono state cambiate per ottenere risultati migliori: sono cambiate solo misurazione, selezione delle condizioni iniziali, perturbazione esplicita e analisi statistica.

## 2. Verifiche eseguite

Toolchain: Node portable `v22.14.0`, Vitest `4.1.12`, TypeScript `5.9.3`, Next.js `16.3.0`. Working directory: `C:\Users\matti\Documents\Progetto predefinito\Evoworld-git`.

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"

npx tsc --noEmit --incremental false
npx vitest run tests/e1/e1_metrics.test.ts tests/e1/e1_integration.test.ts
npx next build

$env:E1_PHASE2_SEEDS="1,2,3,4,5,6,7,8,9,10,11,12"
$env:E1_PHASE2_TICKS="900"; $env:E1_PHASE2_SAMPLE_EVERY="50"
$env:E1_PHASE2_OUT="C:\Users\matti\AppData\Local\Temp\e1-phase2-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts

npx vitest run
```

### 2.1 Statica, test E1 e build

- `npx tsc --noEmit --incremental false`: **exit 0**, **9.08 s**.
- `npx vitest run tests/e1/e1_metrics.test.ts tests/e1/e1_integration.test.ts`: **25/25 test passati** (19 metriche + 6 integrazione), **3.35 s** di test (5.91 s parete).
- `npx next build`: **exit 0**, **12.61 s** (compilazione, TypeScript e 3 pagine statiche generate).
- L'avviso Vite su `configLoader: 'native'` / ESM in CommonJS è pre-esistente e non blocca.

I 25 test includono: coppie genetiche senza self/duplicate, enumerazione completa e campionamento coprimo, contesto pre/post cull e tassi sul denominatore del tick, cull stratificato esatto/invariante a ordine/genoma/RNG, assenza di bias sistematico su gruppi genetici in 60 tick, metadati habitat e controlli S13/S14, creazione reale di JSON e directory, `E1_OUT`, percorso predefinito portabile e riproducibilità dell'output scientifico.

### 2.2 Esperimento E1.2 (dati reali)

- **Avvio:** 2026-11-17 18:18:05.
- **Comando:** `npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts` con `E1_PHASE2_SEEDS=1,2,3,4,5,6,7,8,9,10,11,12`, `E1_PHASE2_TICKS=900`, `E1_PHASE2_SAMPLE_EVERY=50`.
- **Esito:** Test Files 1 passed (1), Tests 1 passed (1), **651.18 s** totali (649.14 s di test), **exit 0**.
- **Corse:** 12 seed × 7 scenari = **84**, 900 tick ciascuna, campione ogni 50 tick. `TICKS_PER_YEAR = 400` → 2.25 anni simulati.
- **Output:** `C:\Users\matti\AppData\Local\Temp\e1-phase2-results.json` (2,245,891 byte; `timing.totalElapsedMs = 649105`). Non committato.

### 2.3 Suite completa (confronto con `main`)

Eseguite in sequenza, senza carico concorrente:

| Esecuzione | File | Test | Durata |
|---|---|---|---|
| Branch E1.2 (`research/e1-ecosystem-qa`) | 64 (5 failed, 58 passed, 1 skipped) | **9 failed / 730 passed / 1 skipped** (740) | 80.23 s |
| `origin/main` `db86444` (worktree pulito) | 62 (5 failed, 56 passed, 1 skipped) | **8 failed / 706 passed / 1 skipped** (715) | 77.73 s |

- La differenza di **+2 file e +25 test** è esattamente `tests/e1/e1_metrics.test.ts` (19 test) e `tests/e1/e1_integration.test.ts` (6 test), entrambi passati al 100%.
- I fallimenti comuni a branch e `main` sono gli stessi già classificati in E1.1: `fauna180` (1), `hydrology` (1 timeout), `reproduction` (2), `vibeGenomeV1110` (3). Sono **preesistenti** e non introdotti da E1.
- Il branch mostra un fallimento aggiuntivo in `tests/planet.test.ts` (`mountains preferentially form on elevated/continental terrain`, timeout 5000 ms). Verificato in isolamento due volte per parte: **24/24 passati sia sul branch sia su `main`** (8.17–8.38 s per file). È quindi un timeout **dipendente dal carico**, non una differenza deterministica.
- `tests/settlementDefaults.test.ts`, flakes di timeout osservato in E1.1, in questa esecuzione è passato su entrambi.
- Nessuna modifica a `simulation/**`, genetica, mutazioni, ereditarietà, selezione, riproduzione, renderer, G1/G1-b, G2 o formati di salvataggio.

## 3. Risultati della fase E1.2

### 3.1 Statistiche per scenario (popolazione finale, 12 seed)

IC95: t di Student con 11 gradi di libertà, deviazione standard campionaria. `sd` è la deviazione standard tra seed, non quella dentro una corsa.

| Scenario | n | Media | SD | Min | Max | IC95 | Estinzione | Speciazione |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| S01 baseline | 12 | 22.5833 | 8.6493 | 14 | 42 | [17.0878, 28.0789] | 0/12 | 0/12 |
| S06 misto | 12 | 35.4167 | 11.0656 | 20 | 59 | [28.3859, 42.4474] | 0/12 | 0/12 |
| S08 cull 80% | 12 | 5.7500 | 2.7675 | 1 | 11 | [3.9916, 7.5084] | 0/12 | 0/12 |
| S09 habitat povero | 12 | 14.9167 | 5.4682 | 6 | 26 | [11.4423, 18.3910] | 0/12 | 0/12 |
| S10 habitat ricco | 12 | 21.1667 | 4.5092 | 17 | 32 | [18.3016, 24.0317] | 0/12 | 0/12 |
| S13 pos. povera / ris. ricca | 12 | 16.9167 | 5.5671 | 11 | 31 | [13.3795, 20.4538] | 0/12 | 0/12 |
| S14 pos. ricca / ris. povera | 12 | 19.0000 | 5.0990 | 10 | 26 | [15.7602, 22.2398] | 0/12 | 0/12 |

**Tasso di estinzione:** 0/84 in tutti gli scenari a 900 tick. **Frequenza di speciazione:** 0/84, con media 0 eventi per corsa: in questo orizzonte e con questi seed non è stato osservato alcun evento, coerente con il fatto che E1.1 ne avesse osservato uno solo a 2700 tick (S12, seed 11). Nessun evento viene inferito.

### 3.2 Distribuzione delle popolazioni finali

| Scenario | 0 | 1–9 | 10–24 | 25–49 | 50–99 | ≥100 |
|---|---:|---:|---:|---:|---:|---:|
| S01 | 0 | 0 | 9 | 3 | 0 | 0 |
| S06 | 0 | 0 | 2 | 9 | 1 | 0 |
| S08 | 0 | 10 | 2 | 0 | 0 | 0 |
| S09 | 0 | 2 | 9 | 1 | 0 | 0 |
| S10 | 0 | 0 | 10 | 2 | 0 | 0 |
| S13 | 0 | 0 | 11 | 1 | 0 | 0 |
| S14 | 0 | 0 | 11 | 1 | 0 | 0 |

### 3.3 Confronto habitat (2×2)

Vegetazione occupata finale media: S09 0.3051, S10 0.3437, S13 0.3390, S14 0.3498 (deviazioni tra seed 0.1159 / 0.0691 / 0.1007 / 0.1003).

| Contrasto | Δ popolazione finale | Interpretazione |
|---|---:|---|
| S13 − S09 (risorse a pari posizione povera) | +2.0000 | effetto risorsa |
| S10 − S14 (risorse a pari posizione ricca) | +2.1667 | effetto risorsa |
| S14 − S09 (posizione a pari risorse povere) | +4.0833 | effetto posizione |
| S10 − S13 (posizione a pari risorse ricche) | +4.2500 | effetto posizione |

S10 supera S09 di 6.25 individui finali in media, ma gli IC95 si sovrappongono parzialmente: il risultato è una tendenza descrittiva, non una prova di causalità. Entrambi i fattori contribuiscono, con effetto posizione circa doppio rispetto all'effetto risorsa in questa configurazione. Le celle restano quelle della griglia campionata: non sono estremi globali.

### 3.4 Confronto con/senza perturbazione

- Popolazione finale senza cull (S01): media 22.5833; con cull (S08): media 5.7500; Δ = **−16.8333**.
- Estinzione: 0/12 in entrambi.
- Al tick 450 (12 osservazioni): popolazione a inizio step media 25.25, dopo step 25.25, rimossi in media 19.8333 (min 15, max 27), conservati 5.4167; in tutti i campioni `eventDenominator == max(1, populationAtStart)`.
- Dopo il cull la popolazione passa da ~5 sopravvissuti a 5.75 finali: **non si osserva recupero demografico** in 450 tick, senza che sia stata modificata alcuna regola biologica.

### 3.5 Copertura della distanza genetica

Il metodo dichiara sempre le coppie confrontate. Nei campioni finali: S01 120/630 e S06 120/666 (campione coprimo), S08 55/55, S09 78/78, S13 105/105 (enumerazione completa). Le popolazioni piccole usano quindi tutte le coppie; quelle grandi usano 120 coppie uniche e deterministiche.

## 4. Limiti

- Il campione genetico sistematico non è uno stimatore aleatorio: non produce intervalli di confidenza validi per la distanza media e può essere sensibile a pattern nell'ordine degli ID.
- Le celle S09/S10/S13/S14 provengono da una griglia campionata: non sono estremi globali e `occupiedVegetation` resta una misura condizionata alle celle occupate.
- Gli IC95 con 12 seed usano la t di Student e presuppongono indipendenza e approssimata normalità: sono descrittivi, non prove di significatività.
- La speciazione è inferita dalla crescita del conteggio storico di specie esposto dal registry; non è una misura diretta di fitness.
- `getStats()` non separa morte per fame e per vecchiaia, né espone successo riproduttivo per coppia: queste quantità restano non misurabili senza modifiche al motore, non eseguite.
