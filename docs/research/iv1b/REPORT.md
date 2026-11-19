# IV1-B-R1 — Performance integrata: Adaptive Rendering (G3.1) + Observability (E2.3.1)

**Branch:** `validation/iv1-b-r1-benchmark-corrections` · **Esecuzione R1:** 2026-11-19, 18:00–21:10 CET · **Dataset:** [`dataset.raw.json`](dataset.raw.json) (v2, 120 run) · **Dataset originale:** [`dataset.raw.v1.json`](dataset.raw.v1.json) · **Tabelle:** [`TABLES.md`](TABLES.md) · **Analisi:** [`analysis.json`](analysis.json) · **Protocollo:** [`EXPERIMENTAL_CONFIG.md`](EXPERIMENTAL_CONFIG.md)

---

## 0. Correzioni R1 — leggere prima del resto

La versione IV1-B originale conteneva due difetti di misurazione, ora corretti:

| Difetto | IV1-B (v1) | IV1-B-R1 (v2) |
|---|---|---|
| Riferimenti di misura | `heapBefore`, `cpuBefore`, `wallStart` presi **prima** del warm-up | presi **dopo** il warm-up; `warmup.*`, finestra misurata e `totals.*` sono campi separati |
| Metriche interessate | `wallMs`, `cpuMs`, `heapGrowthKB` includevano 5 tick di warm-up | `measuredWallMs`, `measuredCpuMs`, `heapGrowthMeasuredKB` escludono il warm-up |
| Contatori evento | cumulativi (warm-up + misurazione), non separabili | delta della sola finestra misurata |
| Costo/evento a 10 000 | dichiarato `6,4 µs` da `71 106 eventi/tick` — **non riproducibile** | **5,889 µs** misurati nella finestra R1; con i soli dati v1 l'aritmetica corretta darebbe 363 000,58 eventi/tick e **1,264 µs** |
| Writer | descritto come «writer no-op che cronometra writeBatch» | dichiarato esplicitamente **sintetico**: property scan in memoria, nessuna persistenza su disco |

Il valore `71 106` non compare in nessuna aggregazione del dataset grezzo e non è stato possibile ricostruirlo: è un errore aritmetico, non una misura alternativa. Non è stato sostituito con un valore scelto arbitrariamente: la matrice è stata **rieseguita** con contatori della sola finestra misurata. Le differenze tra i numeri assoluti di v1 e v2 riflettono inoltre un ambiente sensibilmente più lento e più rumoso durante il rerun (§3), quindi **i confronti v1 ↔ v2 non sono validi**: tutte le conclusioni di questo report usano esclusivamente i dati R1.

---

## 1. Sintesi esecutiva

Tutti i numeri seguenti sono **misurati** nella sessione R1 (120 run = 6 popolazioni × 4 configurazioni × 5 seed; 5 tick di warm-up esclusi + 20 misurati).

| Risultato | Evidenza misurata R1 |
|---|---|
| L'observability resta il costo dominante | Extra `world.step()` (O − B): **+12,54 ms/tick a 100** → **+1 696,92 ms/tick a 10 000**. |
| Il rapporto relativo non è monotono | O/B = 4,54× (100), 3,45× (500), 2,59× (1 500), 2,98× (3 000), 1,25× (5 000), 1,50× (10 000): la variabilità alta (SD fino al 66%) impedisce un'interpretazione di scala semplice. |
| Nessuna interazione sistematica riproducibile | Scarto additivo `I − (R + O − B)` tra −859 e −0,1 ms/tick; rapporto moltiplicativo 0,76–1,02. Valori dentro la dispersione dei run alle popolazioni alte. |
| L'adaptive rendering resta poco efficace con frame vivo | Speedup della fase render = **0,97–1,34×** (mediana ≈1,14×); a 10 000 è 0,97×. Con `syncFrame()` per tick le creature lontane vengono invalidate `dirty`: 11 saltate su 3 724. |
| Il collo di bottiglia eventi è strutturale | `RESOURCE_REGENERATION` + `RESOURCE_DEPLETION` = **97,4–98,9%** degli eventi in ogni popolazione. |
| Integrità eventi | **0 eventi persi**, `attempted = recorded + sampled`, `flushErrors = 0`, `droppedParts = 0` in tutte le 120 run. |
| Scala | Esponente `b` di `t = a·N^b`: tick baseline **1,496**, rendering **1,521**, observability **1,237**, integrated **1,216**; fase render ≈1,15. |

**Conclusione operativa:** nel percorso caldo l'observability completa è il costo principale e il suo costo unitario misurato va da 1,3 a 5,9 µs/evento a seconda della popolazione e della variabilità del run. L'adaptive rendering, nel carico realistico con `syncFrame()` a ogni tick, non riproduce i guadagni misurati su frame statici e non modifica in modo coerente la produzione di eventi.

---

## 2. Provenienza e isolamento

| Elemento | Valore |
|---|---|
| Base benchmark | `graphics/g3-renderer-integration` @ `717da65` |
| Observability importata da | `research/e2-ecosystem-dynamics` @ `52178e5` |
| Commit di import isolato | `b1ab7da` — copia verbatim, **nessun merge** |
| Branch benchmark originale | `benchmark/iv1-b-integrated-performance` (`ad0a807`) |
| Branch R1 | `validation/iv1-b-r1-benchmark-corrections` |
| `main` | `d330c12` — **non toccato** |

Nessuna logica biologica o di rendering è stata modificata. Le modifiche R1 riguardano solo infrastruttura di misurazione (`scripts/iv1bMetrics.ts`, `scripts/iv1bIntegrated.benchmark.ts`, `scripts/iv1bAnalyze.mjs`), test e documentazione. Non sono stati eseguiti merge né PR.

---

## 3. Ambiente e avvertenza sulle sessioni

| Voce | Valore |
|---|---|
| CPU | 13th Gen Intel Core i7-1365U, 12 thread logici, 1,80 GHz base |
| Memoria | 16 GB (circa 4 GB liberi all'avvio della sessione R1) |
| OS | Windows 11 Pro 64 bit, build 10.0.26300 |
| Node | v22.14.0 (portable), `win32` / `x64` |
| Vitest | 4.1.12 |
| GPU / FPS | **non misurati** — benchmark in Node, senza `WebGLRenderer` |

La sessione R1 è risultata circa 3–6× più lenta della sessione IV1-B originale a parità di popolazione (es. 10 000 baseline: 3 407 ms/tick contro 2 397 ms/tick) e con maggiore dispersione. Le cause esatte (throttling, contention, stato del sistema) **non sono state misurate**. Tutte le configurazioni R1 sono comunque state eseguite sulla stessa macchina, nella stessa toolchain e con ordine ruotato, quindi i confronti interni a R1 restano validi. I log `r1-benchmark.log` e `r1-resume.log` documentano che la prima esecuzione è stata interrotta dopo 100 run e che la popolazione 10 000 è stata completata con `IV1B_RESUME=1`.

---

## 4. Protocollo e finestre

- **Popolazioni:** 100, 500, 1 500, 3 000, 5 000, 10 000.
- **Configurazioni:** `baseline` (OFF/OFF), `rendering` (ON/OFF), `observability` (OFF/ON), `integrated` (ON/ON).
- **Seed:** 7, 11, 31, 47, 59 → 5 run/cella; ordine ruotato `CONFIGS[(i + seedIndex) % 4]`.
- **Tick:** 5 warm-up esclusi + 20 misurati, separati esplicitamente (§0).
- **Finestra misurata:** da dopo il warm-up fino dopo il flush finale; `measuredWallMs`, `measuredCpuMs`, contatori evento e delta heap usano tutti questa finestra.
- **Sink:** `scientific_full`, `snapshotEveryTicks: 0`, `flushEveryEvents: 5000`, `releaseAfterFlush: true`, writer sintetico.
- **Pianeta/setup:** 64²…400² costante per popolazione, setup `mixed`, genoma avanzato e gene effects attivi; popolazione iniziale identica nelle 4 configurazioni (spread = 0).

---

## 5. Tempo per tick e latenza

| N | baseline (ms) | rendering | observability | integrated | O/B | I/B |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 3,54 | 3,33 | 16,07 | 15,14 | 4,54× | 4,28× |
| 500 | 12,75 | 12,44 | 44,03 | 43,64 | 3,45× | 3,42× |
| 1 500 | 65,13 | 67,86 | 168,93 | 162,40 | 2,59× | 2,49× |
| 3 000 | 228,74 | 212,95 | 682,63 | 485,84 | 2,98× | 2,12× |
| 5 000 | 779,54 | 629,48 | 977,39 | 790,31 | 1,25× | 1,01× |
| 10 000 | 3 407,47 | 4 352,17 | 5 104,40 | 5 190,23 | 1,50× | 1,52× |

`R/B` va da 0,81 a 1,28: le fasi sono separate e il renderer non dovrebbe alterare `world.step()`. Le deviazioni a 5 000 e 10 000 sono attribuibili alla variabilità della sessione, non a un effetto misurato del rendering.

| N | P95/mean (observability) | P99/mean (observability) | SD tick/mean (observability) |
|---:|---:|---:|---:|
| 100 | 1,39 | 2,02 | 21% |
| 500 | 1,29 | 1,60 | 13% |
| 1 500 | 1,43 | 1,56 | 21% |
| 3 000 | 2,44 | 3,02 | 61% |
| 5 000 | 1,74 | 2,00 | 39% |
| 10 000 | 2,59 | 3,42 | 66% |

Oltre 3 000 organismi la coda è molto lunga e la dispersione tra seed è elevata: differenze inferiori al ~50% non sono distinguibili dal rumore.

---

## 6. Observability e riconciliazione eventi

Tutti i valori della tabella sono **delta della finestra misurata** (5 seed × 20 tick = 100 tick).

| N | eventi registrati | persi | eventi/tick | eventi/s | flush writer sintetico (ms/run) | buffer max (KB, stimato) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 672 642 | 0 | 6 726 | 387 061 | 15,02 | 2 686,5 |
| 500 | 1 699 923 | 0 | 16 999 | 354 728 | 32,72 | 2 639,1 |
| 1 500 | 4 762 963 | 0 | 47 630 | 267 491 | 96,44 | 2 727,4 |
| 3 000 | 9 328 930 | 0 | 93 289 | 157 632 | 293,06 | 2 706,1 |
| 5 000 | 15 283 554 | 0 | 152 836 | 158 126 | 365,78 | 2 760,2 |
| 10 000 | 28 816 637 | 0 | 288 166 | 63 767 | 778,67 | 2 773,4 |

**Buffer:** `retainedMax` è misurato (4 499–4 852 eventi); `bufferKB` è una **stima** (`retainedMax × 582 B/evento`, media E2.3.1 §N.9), marcata `bufferBytesIsEstimate: true` nel dataset.

**Writer:** `flushMs` misura un **writer sintetico** che scorre gli eventi e conta le proprietà in memoria. Non c'è scrittura su disco, né fsync: questi numeri **non sono un throughput di persistenza reale**.

**Composizione misurata:** a 10 000 organismi `RESOURCE_REGENERATION` 51,2% + `RESOURCE_DEPLETION` 46,2% = **97,4%**; `RESOURCE_CONSUMPTION` 2,3%, `HUNT_ATTEMPT` 0,3%, `DEATH` 0,1%. La proporzione è simile in tutte le popolazioni.

### Costo per evento (R1)

Numeratore: extra step per tick `O − B` della stessa cella. Denominatore: eventi/tick della stessa cella, stessa finestra, stessi seed.

| N | overhead step (ms/tick) | eventi/tick | µs/evento |
|---:|---:|---:|---:|
| 100 | 12,54 | 6 726 | 1,864 |
| 500 | 31,27 | 16 999 | 1,840 |
| 1 500 | 103,80 | 47 630 | 2,179 |
| 3 000 | 453,89 | 93 289 | 4,865 |
| 5 000 | 197,85 | 152 836 | 1,295 |
| 10 000 | 1 696,92 | 288 166 | 5,889 |

Il costo unitario non è costante: il valore a 10 000 è quasi 5× quello a 5 000, coerente con la forte degradazione delle code (§5). Il confronto con ~1,9 µs misurati da E2.3.1 per `record()` isolato **non è più presentato come prova di un moltiplicatore**: i carichi e le sessioni sono diversi.

---

## 7. Adaptive rendering

| N | render baseline (ms) | render adaptive (ms) | speedup | updated | skipped | culled | near | far | droppedParts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0,86 | 0,68 | 1,27× | 37 | 34 | 4 | 8 | 66 | 0 |
| 500 | 2,12 | 1,88 | 1,13× | 253 | 31 | 17 | 24 | 277 | 0 |
| 1 500 | 6,45 | 6,18 | 1,04× | 706 | 18 | 54 | 56 | 722 | 0 |
| 3 000 | 13,70 | 11,98 | 1,14× | 1 257 | 41 | 88 | 91 | 1 296 | 0 |
| 5 000 | 27,74 | 20,75 | 1,34× | 1 941 | 6 | 119 | 150 | 1 916 | 0 |
| 10 000 | 65,48 | 67,18 | 0,97× | 3 481 | 11 | 233 | 292 | 3 433 | 0 |

Il frame viene sincronizzato a ogni tick (`syncFrame()`), quindi l'identità del piano cambia e la maggior parte delle creature `far` resta `dirty`: a 10 000 sono 3 433 `far` ma solo 11 `skipped`. Ciò spiega lo speedup modesto rispetto ai 2,6–3,0× del benchmark G3.1 su frame statici: **cambia il carico di lavoro, non la logica**.

La fase renderer resta una frazione piccola del tempo totale (65 ms su ~5 200 ms/tick a 10 000, ≈1,3%): anche un raddoppio dello speedup non cambierebbe il tick a popolazione alta.

---

## 8. Interazione, scala e memoria

### Interazione

| N | atteso additivo R+O−B (ms) | integrato misurato (ms) | scarto (ms) | I/(R·O/B) |
|---:|---:|---:|---:|---:|
| 100 | 15,87 | 15,14 | −0,72 | 1,00× |
| 500 | 43,71 | 43,64 | −0,07 | 1,02× |
| 1 500 | 171,67 | 162,40 | −9,27 | 0,92× |
| 3 000 | 666,84 | 485,84 | −181,00 | 0,76× |
| 5 000 | 827,33 | 790,31 | −37,02 | 1,00× |
| 10 000 | 6 049,09 | 5 190,23 | −858,86 | 0,80× |

Gli scarti negativi a 3 000 e 10 000 sono dello stesso ordine della dispersione osservata (SD fino al 66%). **Non c'è evidenza di interazione sistematica**: non possiamo distinguere un effetto incrociato dal rumore. L'oscillazione eventi/s O→I è 1,00–1,23×, senza direzione coerente.

### Scala

| configurazione | b (tick) | b (render) | b (wall misurato) |
|---|---:|---:|---:|
| baseline | 1,496 | 1,147 | 1,430 |
| rendering | 1,521 | 1,155 | 1,461 |
| observability | 1,237 | 1,162 | 1,224 |
| integrated | 1,216 | 1,115 | 1,206 |

`world.step()` resta superlineare ed è il limite di scala; la fase render cresce quasi linearmente.

### Memoria

I delta di heapMisurati sono inaffidabili come contatore di allocazioni: il GC produce valori anche fortemente negativi (tabella §4 di `TABLES.md`). Indicatori più stabili nella sessione R1:

| N | RSS baseline (MB) | RSS observability (MB) | heap peak baseline (MB) | heap peak observability (MB) |
|---:|---:|---:|---:|---:|
| 100 | 102 | 216 | 44 | 147 |
| 500 | 245 | 287 | 127 | 213 |
| 1 500 | 368 | 448 | 205 | 364 |
| 3 000 | 617 | 614 | 485 | 383 |
| 5 000 | 651 | 829 | 335 | 647 |
| 10 000 | 583 | 961 | 467 | 837 |

Sono misure di heap V8 e RSS del processo Node, non memoria GPU. La stima `bufferBytes` non va confusa con questi valori.

---

## 9. Colli di bottiglia identificati (ordine di impatto)

1. **Volume di eventi resource (NON_CRITICAL).** 97,4–98,9% degli eventi; costo misurato fino a +1 697 ms/tick a 10 000. È la leva con maggior rendimento potenziale.
2. **`world.step()` superlineare.** b≈1,50 e 3 407 ms/tick a 10 000 anche senza observability: limite assoluto di scala.
3. **Coda e variabilità.** P99/mean fino a 3,42× e SD fino al 66% sopra 3 000 organismi: le ottimizzazioni che migliorano la media possono essere irrilevanti per la latenza percepita.
4. **Invalidazione `dirty` del piano di rendering con frame vivo.** Azzera gran parte del beneficio dello stride (11 saltate su 3 724 a 10 000).
5. **Writer sintetico.** Fino a 779 ms/run a 10 000, ma <1% dell'overhead totale; inoltre non misura I/O reale.

---

## 10. Raccomandazioni (ordine di impatto)

1. **Limitare o campionare `RESOURCE_REGENERATION`/`RESOURCE_DEPLETION` prima di attivare `scientific_full` nel percorso caldo.** Rimuoverebbe la quasi totalità del costo misurato. Va riverificato con questo harness: il confronto con E2.3.1 §N.9 (`DEATH`-only 1,01× contro 1,65×) usa un carico diverso e non è un risultato di questa sessione.
2. **Non presentare i valori `flushMs` come throughput di scrittura.** Il writer è sintetico: servono misure con persistenza reale (file, fsync, coda asincrona) prima di trarre conclusioni sul costo di I/O.
3. **Mantenere `releaseAfterFlush: true`.** La configurazione non rilasciata cresceva fino a 25 MB (100 org.) e 63 MB (500 org.) in 3 tick in calibrazione; l'OOM a 10 000 resta un'**estrapolazione**, non un dato misurato nella matrice.
4. **Rendere stabile l'identità del piano di rendering quando la morfologia non cambia**, così le creature lontane restano `dirty = false`. È una modifica alla logica di rendering: **non eseguita** in questo branch, solo raccomandata.
5. **Riportare P95/P99 e SD insieme alla media e usare più di 5 seed sopra 3 000 organismi.** In questa sessione la dispersione rende i confronti sotto il ~50% non conclusivi in quella fascia.
6. **Aggiungere un QA browser-side per FPS, frame time e upload GPU.** Node non può misurarli: i campi restano `null`.

---

## 11. Measured / stimato / sintetico / mancante

| Categoria | Contenuto |
|---|---|
| **Misurato (finestra misurata)** | tick/fase (media, mediana, P95, P99, min, max, SD), `measuredWallMs`, `measuredCpuMs`, heapUsed a inizio/fine/picco della finestra, RSS, contatori sink della finestra (`attempted`, `recorded`, `byType`, `lost`, `sampled`, `retainedMax`, `flushedBatches`, `flushedEvents`, `flushErrors`), contatori renderer, popolazione iniziale/finale, seeding. |
| **Misurato separatamente** | `warmup.*` e `totals.*`: non sommati alle metriche della finestra. |
| **Stimato (marcato)** | `bufferBytes = retainedMax × 582 B/evento`; `retainedMax` è misurato, i byte no. |
| **Sintetico** | `flushMs`, `writerBatches`, `writerSyntheticBytes`: property scan in memoria, nessuna persistenza. |
| **Non misurato / `null`** | FPS, frame time GPU, upload/fill-rate, byte GPU, draw call reali, I/O su disco, GC come conteggio allocazioni, dispositivi mobili, screenshot/heap snapshot browser. |
| **Estrapolazione esplicita** | OOM con `releaseAfterFlush: false` a 10 000 organismi, dedotto dalla calibrazione a 100/500 organismi. |

---

## 12. Riproduzione

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd;C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = "true"
.\scripts\run_iv1b.ps1
node scripts/iv1bAnalyze.mjs
npx vitest run --config vitest.config.ts tests/iv1bMetrics.test.ts tests/iv1bDataset.test.ts
```

Override: `IV1B_POPULATIONS`, `IV1B_SEEDS`, `IV1B_TICKS`, `IV1B_WARMUP_TICKS`, `IV1B_OUT`, `IV1B_RESUME`. Il dataset v1 è conservato come `dataset.raw.v1.json` e non viene riscritto.

---

## 13. Validazione

- `npx tsc --noEmit --pretty false` → **exit 0**.
- Test R1 dei calcoli e del dataset: **33/33 passati** (`tests/iv1bMetrics.test.ts` 7/7, `tests/iv1bDataset.test.ts` 26/26). Verificano esclusione del warm-up, denominatori, coerenza contatori/tick e riconciliazione costo/evento.
- Benchmark R1: **1/1 test passato**, 120 run, `flushErrors = 0`, nessuna eccezione. Prima esecuzione interrotta a 100 run e completata con `IV1B_RESUME=1` (log disponibili).
- `node scripts/iv1bAnalyze.mjs` → `analysis.json` v2 con 6 comparazioni e 6 voci `costPerEvent`.
- `npm run lint` → **0 errori, 37 warning** (36 pre-esistenti + 1 `eslint-disable` inutilizzato nell'harness benchmark; nessun warning nei nuovi file di metriche/test).
- `npx next build --webpack` → **OK** (3 pagine statiche prerenderizzate). `--webpack` è obbligatorio in questo ambiente a causa del junction `node_modules`.
- Nessuna soglia di test allentata e nessun test modificato per far passare il benchmark.
