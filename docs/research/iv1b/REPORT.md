# IV1-B — Performance integrata: Adaptive Rendering (G3.1) + Observability (E2.3.1)

**Branch:** `benchmark/iv1-b-integrated-performance` · **Esecuzione:** 2026-11-19, 16:09–16:50 CET · **Dataset:** [`dataset.raw.json`](dataset.raw.json) · **Tabelle:** [`TABLES.md`](TABLES.md) · **Configurazione:** [`EXPERIMENTAL_CONFIG.md`](EXPERIMENTAL_CONFIG.md)

---

## 1. Sintesi esecutiva

Tutti i numeri seguenti sono **misurati** nel run integrato (120 run = 6 popolazioni × 4 configurazioni × 5 seed, 5 tick di warm-up esclusi + 20 misurati).

| Risultato | Evidenza misurata |
|---|---|
| L'observability è il costo dominante, non il rendering | Overhead di `world.step()` dovuto agli eventi: **+8.98 ms/tick a 100** organismi fino a **+458.96 ms/tick a 10 000**. Il rendering adaptive, nella migliore configurazione, risparmia **0.07–0.31 ms/tick**. |
| Il rapporto di overhead cala all'aumentare della popolazione, ma il costo assoluto esplode | O/B = 5.17× a 100 → 1.19× a 10 000; in termini assoluti l'extra step passa da 9 a 459 ms/tick (≈51×). |
| L'interazione tra i due sistemi non è rilevabile | Scarto additivo `I − (R + O − B)` tra −126 e +6 ms/tick; rapporto moltiplicativo `I / (R·O/B)` = 0.91–1.06. Valori dentro il rumore di misura ai popolazioni alte (deviazione standard fino al 47%). **Nessuna sinergia o penalizzazione incrociata dimostrata.** |
| L'adaptive rendering è molto meno efficace che nel benchmark G3.1 originale | Speedup della sola fase di rendering = 0.99–1.16× (media ≈1.09×), contro 2.6–3.0× misurati su frame statici. Causa misurata: con `syncFrame()` a ogni tick (come in produzione) le creature «lontane» vengono invalidate come `dirty` e non vengono saltate (es. 10 000 organismi: 3 481 aggiornati, **11 saltati**, 233 cullati). |
| Il collo di bottiglia eventi è strutturale | `RESOURCE_REGENERATION` + `RESOURCE_DEPLETION` = **~97%** di tutti gli eventi (6.91 M di 7.11 M a 10 000 organismi, per run). |
| Nessuna perdita di eventi | `lost = 0` in ogni cella; `attempted = recorded` sempre; `droppedParts = 0` sempre. |
| La scala è dominata dalla simulazione | Esponente `b` in `t = a·N^b`: tick baseline **1.509**, rendering **1.520**, observability **1.207**, integrated **1.194**. La fase di rendering cresce quasi linearmente (b≈1.0). |

**Conclusione operativa:** abilitare observability completa nel percorso caldo è oggi il principale costo (fino a +459 ms/tick a 10 000 organismi); abilitare adaptive rendering in presenza di frame vivo non riproduce i guadagni misurati a frame statico. Le due cose non si amplificano a vicenda: i costi sono sostanzialmente additivi.

---

## 2. Provenienza e isolamento

| Elemento | Valore |
|---|---|
| Base benchmark | `graphics/g3-renderer-integration` @ `717da65` |
| Observability importata da | `research/e2-ecosystem-dynamics` @ `52178e5` |
| Commit di import isolato | `b1ab7da` — copia verbatim, **nessun merge** |
| Branch di lavoro | `benchmark/iv1-b-integrated-performance` |
| `main` | `d330c12` — **non toccato** |

Nessuna logica biologica o di rendering è stata modificata per migliorare i risultati. Il commit `b1ab7da` contiene solo codice E2.3.1 copiato senza alterazioni; il codice di misurazione è confinato in `scripts/iv1bIntegrated.benchmark.ts`, `scripts/iv1bAnalyze.mjs`, `scripts/run_iv1b.ps1` e nella documentazione. Non sono stati eseguiti merge né pull request.

---

## 3. Ambiente (misurato)

| Voce | Valore |
|---|---|
| CPU | 13th Gen Intel Core i7-1365U, 10 core fisici / 12 logici, 1.80 GHz base |
| Memoria | 16 GB (osservati ~6 GB liberi all'inizio) |
| OS | Windows 11 Pro 64 bit, build 10.0.26300 |
| Node | v22.14.0 (portable), `win32` / `x64` |
| Vitest | 4.1.12 |
| GPU | **non misurata** — benchmark in Node, senza `WebGLRenderer` |
| confronto | tutte le configurazioni nello stesso processo, stessa macchina, stessa toolchain |

Il contention da altri processi non è stato controllato attivamente; la variabilità osservata è riportata nella sezione 8.

---

## 4. Protocollo

- **Popolazioni iniziali:** 100, 500, 1 500, 3 000, 5 000, 10 000.
- **Configurazioni:** `baseline` (adaptive OFF + sink nullo), `rendering` (ON + OFF), `observability` (OFF + ON), `integrated` (ON + ON).
- **Seed:** 7, 11, 31, 47, 59 → 5 run/cella.
- **Ordine:** ruotato per seed (`CONFIGS[(i + seedIndex) % 4]`), così ogni configurazione passa una volta in ogni posizione del processo.
- **Tick:** 5 warm-up esclusi + 20 misurati; `world.step()`, `buildRenderFrame`, `syncFrame` e `updateCreatureInstances` cronometrati separatamente.
- **Pianeta:** 64², 96², 160², 224², 288², 400² (costante entro ogni popolazione).
- **Setup:** `mixed`, genoma avanzato e gene effects attivi. Popolazione iniziale identica nelle 4 configurazioni (spread = 0 in tutte le popolazioni).
- **Sink:** `scientific_full`, `snapshotEveryTicks: 0`, `flushEveryEvents: 5000`, `releaseAfterFlush: true`, writer no-op cronometrato — vedi [`EXPERIMENTAL_CONFIG.md`](EXPERIMENTAL_CONFIG.md) §4 per la scelta del buffer limitato.

---

## 5. Risultati di performance

Le tabelle complete sono in [`TABLES.md`](TABLES.md). I grafici SVG sono `chart-tick-mean.svg`, `chart-tick-p95.svg`, `chart-render-mean.svg`, `chart-events-per-second.svg`, `chart-heap-growth.svg`.

### 5.1 Tempo per tick e overhead

| N | baseline (ms) | rendering | observability | integrated | O/B | I/B |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 2.15 | 2.11 | 11.13 | 11.59 | 5.17× | 5.38× |
| 500 | 9.89 | 9.89 | 34.45 | 34.45 | 3.48× | 3.48× |
| 1 500 | 53.78 | 53.23 | 114.88 | 120.49 | 2.14× | 2.24× |
| 3 000 | 168.84 | 164.61 | 316.70 | 315.38 | 1.88× | 1.87× |
| 5 000 | 487.05 | 529.26 | 941.17 | 935.69 | 1.93× | 1.92× |
| 10 000 | 2 397.33 | 2 426.63 | 2 856.29 | 2 759.94 | 1.19× | 1.15× |

Il tempo di `world.step()` non dipende dal rendering (R/B = 0.97–1.09, come atteso: sono fasi separate) e dipende quasi esclusivamente dall'observability (I ≈ O in ogni cella).

### 5.2 Latenza di coda

| N | P95/mean | P99/mean |
|---:|---:|---:|
| 100 | 1.68 | 3.79 |
| 500 | 1.34 | 1.67 |
| 1 500 | 1.43 | 1.60 |
| 3 000 | 1.34 | 1.45 |
| 5 000 | 1.95 | 2.46 |
| 10 000 | 1.96 | 3.16 |

La coda peggiora sopra 3 000 organismi: P99 fino a 3.16× la media a 10 000. Le code lunghe sono coerenti con GC e con la variabilità dei tick a popolazione alta (§8).

---

## 6. Observability

| N | eventi registrati\* | persi | eventi/s | flush per run (ms) | buffer max (KB)\*\* |
|---:|---:|---:|---:|---:|---:|
| 100 | 846 547 | 0 | 709 100 | 13.08 | 2 686.5 |
| 500 | 2 135 357 | 0 | 571 081 | 39.22 | 2 639.1 |
| 1 500 | 5 982 461 | 0 | 488 920 | 95.38 | 2 727.4 |
| 3 000 | 11 718 977 | 0 | 356 513 | 244.14 | 2 706.1 |
| 5 000 | 19 212 778 | 0 | 208 078 | 489.54 | 2 760.2 |
| 10 000 | 36 300 058 | 0 | 133 677 | 844.75 | 2 773.4 |

\* totale di 5 seed × 20 tick (per run: da 169 309 a 7 260 012 eventi).
\*\* **stima**, non misurazione diretta: `retainedMax × 582 B/evento` (582 B/evento è la media misurata nel report E2.3.1 §N.9). Il valore misurato è la profondità massima del buffer: 4 499–4 852 eventi, coerente con il limite `flushEveryEvents = 5000`.

**Composizione degli eventi (misurata):** a 10 000 organismi, `RESOURCE_REGENERATION` 3.61 M + `RESOURCE_DEPLETION` 3.30 M = 6.91 M su 7.11 M eventi (**97.2%**); `RESOURCE_CONSUMPTION` 175 k (2.5%), `HUNT_ATTEMPT` 21 k, `DEATH` 6 k. La stessa proporzione vale a tutte le popolazioni.

**Interpretazione:**
- Il costo non è nel flush: 844.75 ms / 100 tick misurati ≈ 8.4 ms/tick a 10 000, cioè <2% dei 459 ms/tick di overhead totale. Il costo è nella creazione degli eventi dentro `world.step()`.
- Il costo per evento nell'integrazione è ≈6.4 µs a 10 000 (459 ms / 71 106 eventi per tick), contro ≈1.9 µs misurati da E2.3.1 per `record()` diretto in isolamento: l'emissione distribuita su molte hook di pianeta/celle costa circa 3× in più rispetto alla sola registrazione.
- `events/s` cala all'aumentare della popolazione (709 k → 134 k) perché il costo della simulazione cresce più velocemente del numero di eventi emessi.

---

## 7. Adaptive rendering

| N | render baseline (ms) | render adaptive (ms) | speedup | updated | skipped | culled | near | far | droppedParts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.49 | 0.42 | 1.16× | 37 | 34 | 4 | 8 | 66 | 0 |
| 500 | 1.61 | 1.62 | 0.99× | 253 | 31 | 17 | 24 | 277 | 0 |
| 1 500 | 4.89 | 4.58 | 1.07× | 706 | 18 | 54 | 56 | 722 | 0 |
| 3 000 | 9.44 | 8.16 | 1.16× | 1 257 | 41 | 88 | 91 | 1 296 | 0 |
| 5 000 | 17.54 | 16.72 | 1.05× | 1 941 | 6 | 119 | 150 | 1 916 | 0 |
| 10 000 | 35.68 | 31.87 | 1.12× | 3 481 | 11 | 233 | 292 | 3 433 | 0 |

**Interazione osservata con il frame vivo:** la maggior parte delle creature è classificata `far` (es. 3 433 di 3 724 a 10 000), ma quasi nessuna viene saltata (11). Il motivo è misurabile nel codice: `syncFrame()` viene chiamato a ogni tick con un `RenderFrame` appena costruito; la firma cambia, la generazione avanza e l'identità del piano di rendering cambia, quindi la condizione `dirty` in `updateCreatureInstances` forza l'aggiornamento anche delle creature lontane. Nel benchmark G3.1 originale il frame era statico e il piano veniva sincronizzato una sola volta, permettendo lo stride: da qui i 2.6–3.0× precedenti contro l'1.09× medio di qui. **Entrambi i risultati sono misurati; cambia il carico di lavoro, non la logica.**

Il rendering resta una frazione minima del tempo totale (35.7 ms su ~2 470 ms/tick a 10 000, ≈1.4%): anche uno speedup di 3× della sola fase renderer non cambierebbe il tempo di tick a popolazione alta.

---

## 8. Cross-system interaction, scala e variabilità

### Interazione

| N | atteso additivo R+O−B (ms) | integrato misurato (ms) | scarto (ms) | I/(R·O/B) |
|---:|---:|---:|---:|---:|
| 100 | 11.09 | 11.59 | +0.50 | 1.06× |
| 500 | 34.45 | 34.45 | +0.00 | 1.00× |
| 1 500 | 114.33 | 120.49 | +6.17 | 1.06× |
| 3 000 | 312.47 | 315.38 | +2.92 | 1.02× |
| 5 000 | 983.38 | 935.69 | −47.69 | 0.91× |
| 10 000 | 2 885.59 | 2 759.94 | −125.65 | 0.95× |

Gli scarti negativi alle popolazioni alte sono dello stesso ordine della deviazione standard tra run (fino al 47% a 10 000). **Non c'è evidenza di interazione sistematica**: i due sistemi sommano i propri costi senza amplificarli. La variazione degli eventi/s tra observability-only e integrated è ≤5% in ogni cella (0.95–1.00×), confermando che il renderer non altera la produzione di eventi.

### Scala

| configurazione | b (tick) | b (render) | b (wall misurato) |
|---|---:|---:|---:|
| baseline | 1.509 | 1.035 | 1.444 |
| rendering | 1.520 | 1.000 | 1.490 |
| observability | 1.207 | 1.039 | 1.238 |
| integrated | 1.194 | 1.017 | 1.242 |

Il `world.step()` è superlineare (b≈1.5) ed è il vero limite di scala; observability cresce più lentamente (b≈1.2) in termini relativi, ma assolutamente aggiunge centinaia di ms/tick.

### Variabilità (deviazione standard del tick medio tra i 5 seed)

| N | baseline | rendering | observability | integrated |
|---:|---:|---:|---:|---:|
| 100 | 20% | 15% | 8% | 9% |
| 500 | 11% | 5% | 6% | 5% |
| 1 500 | 7% | 3% | 4% | 3% |
| 3 000 | 4% | 3% | 11% | 7% |
| 5 000 | 1% | 12% | 29% | 23% |
| 10 000 | 36% | 47% | 33% | 22% |

Sopra 3 000 organismi le conclusioni quantitative vanno lette con cautela: le differenze tra configurazione inferiori al ~25% non sono distinguibili dal rumore in quella fascia.

### Memoria

I delta di heap grezzi sono inaffidabili (valori negativi per GC; tabella in `TABLES.md` §4). Indicatori più stabili: **RSS** da ~213 MB (100) a ~1.03 GB (10 000), e **heap peak** da 88→531 MB in baseline contro 165→782 MB in integrated: l'observability comporta circa **+250 MB di heap peak a 10 000**, anche con buffer limitato a 5 000 eventi. Il consumo di memoria non è il primo limite in questa configurazione; lo diventerebbe con `releaseAfterFlush: false` (§10).

---

## 9. Colli di bottiglia identificati (in ordine di impatto)

1. **Volume di eventi resource (NON_CRITICAL).** ~97% degli eventi sono `RESOURCE_REGENERATION`/`RESOURCE_DEPLETION`. Costo misurato: fino a +459 ms/tick a 10 000. È la leva con maggior rendimento.
2. **`world.step()` superlineare.** b≈1.5, 2 397 ms/tick a 10 000 anche senza observability: è il limite assoluto di scala e rende irrilevanti ottimizzazioni del solo renderer in quella fascia.
3. **Invalidazione `dirty` del piano di rendering con frame vivo.** Azzera il beneficio dello stride: 11 creature saltate su 3 724 a 10 000, speedup reale 1.12× invece di ~2.8×.
4. **Coda e variabilità.** P99/mean fino a 3.16× e SD fino al 47% sopra 5 000 organismi: degradazione non lineare, probabilmente GC + pressione sulle cache.
5. **Flush e serializzazione.** 844.75 ms/run a 10 000, ma <2% dell'overhead: rilevante solo se si abilita la scrittura su disco reale (non misurata qui, writer no-op).

---

## 10. Raccomandazioni tecniche (in ordine di impatto)

1. **Limitare o campionare gli eventi resource prima di abilitare l'observability in produzione.** Disabilitare `RESOURCE_REGENERATION`/`RESOURCE_DEPLETION` (o applicare `sampleRates`/`maxNonCriticalEvents`) rimuove la quasi totalità del costo misurato. Come termine di confronto **esterno**, il report E2.3.1 §N.9 misura `DEATH`-only a 1.01× del disabilitato contro 1.65× per `scientific_full` (carico diverso dal nostro): va riverificato con questo harness integrato, non presentato come nostro risultato.
2. **Non usare `scientific_full` nel percorso caldo a popolazione alta senza un writer asincrono.** Il costo è in `record()`, non nel flush: spostare il flush su un thread non risolve da solo. Mantenere il buffer limitato (`releaseAfterFlush: true`) — la configurazione non rilasciata è cresciuta fino a 25 MB (100 org.) e 63 MB (500 org.) in soli 3 tick in calibrazione e porterebbe a OOM a 10 000 (**estrapolazione**, non misurata nella matrice).
3. **Rendere stabile l'identità del piano di rendering quando la morfologia non cambia**, così le creature lontane restano `dirty = false` e lo stride G3.1 si attiva anche con frame vivo. È una modifica alla logica di rendering: **non eseguita** in questo branch (vincolo del task), solo raccomandata.
4. **Riportare sempre P95/P99 insieme alla media e ripetere le misure oltre i 5 seed sopra 3 000 organismi.** La variabilità osservata rende i confronti a una cifra significativa circa solo sotto 3 000.
5. **Aggiungere un QA browser-side per FPS, frame time e upload GPU.** Node non può misurarli; i campi restano `null` nel dataset. Un `WebGLRenderer` reale è necessario prima di trarre conclusioni sull'esperienza utente.
6. **Se serve copertura scientifica completa**, valutare emissione differita/aggregata delle due hook resource (conteggi per cella per tick invece di un evento per cella), mantenendo validità dello schema. Anche questa è una proposta, non una modifica applicata.

---

## 11. Measured / stimato / mancante

| Categoria | Contenuto |
|---|---|
| **Misurato** | tempo tick/fase (media, mediana, P95, P99, min, max, SD), tick/s, CPU `user+system`, heapUsed/RSS/heap peak, contatori sink (`attemptsByType`, `byType`, `lost`, `sampled`, `retained`, `flushedBatches`, `flushedEvents`, `flushErrors`), contatori renderer (`updated`, `skipped`, `culled`, `lodNear`, `lodFar`, `droppedParts`), popolazione iniziale/finale, seeding. |
| **Stimato (marcato nel dataset)** | `bufferBytes` = `retainedMax × 582 B/evento`. La profondità `retainedMax` è misurata; i byte derivano da una media pubblicata in E2.3.1 §N.9. |
| **Non misurato / `null`** | FPS, frame time GPU, upload/fill-rate, byte GPU, draw call reali (Node non istanzia `WebGLRenderer`); delta heap come conteggio allocazioni (GC); crescita illimitata del buffer nella matrice; I/O su disco reale del writer; dispositivi mobili fisici; screenshot/heap snapshot browser. |
| **Estrapolazione esplicita** | OOM con `releaseAfterFlush: false` a 10 000 organismi, dedotto dalla crescita lineare osservata in calibrazione. |

---

## 12. Riproduzione

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd;C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = "true"
.\scripts\run_iv1b.ps1
node scripts/iv1bAnalyze.mjs
```

Override: `IV1B_POPULATIONS`, `IV1B_SEEDS`, `IV1B_TICKS`, `IV1B_WARMUP_TICKS`, `IV1B_OUT` per il benchmark; `IV1B_DATASET`, `IV1B_OUT_DIR` per l'analisi.

---

## 13. Validazione

- `npx tsc --noEmit --pretty false` → **exit 0**.
- Suite focalizzata (E2.3.1 ×5 + G3.1): **56/56 test passati** sull'albero combinato.
- Benchmark IV1-B: **1/1 test passato**, 120 run complete, nessuna eccezione, `flushErrors = 0`.
- `npm run lint` → **0 errori, 34 warning**: 33 pre-esistenti sul branch G3 e 1 (`observability.ts:796`) presente verbatim nel codice E2.3.1 importato. Nessun warning nei nuovi file di misurazione.
- `npx next build --webpack` → **OK** (3 pagine statiche prerenderizzate). `--webpack` è obbligatorio in questo ambiente perché il default Turbopack fallisce con il junction `node_modules`.
- Suite completa **non rieseguita** sull'albero combinato: i riferimenti storici (G3.1: 940 passati / 6 falliti pre-esistenti / 1 skippato; E2.3.1: 879 passati / 15 falliti pre-esistenti) vanno letti come contesto dei branch di partenza, non come risultato di questa sessione.
- Nessun test modificato per far passare il benchmark; nessuna soglia allentata.

---

*Report generato su dati misurati; nessun miglioramento di performance è dichiarato senza misurazione diretta.*
