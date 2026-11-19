# IV1-B — Configurazione sperimentale (protocollo)

## 1. Provenienza del codice

| Sistema | Branch | Commit | Modalità |
|---|---|---|---|
| G3.1 Adaptive Rendering | `graphics/g3-renderer-integration` | `717da65` | base del branch benchmark |
| E2.3.1 Observability | `research/e2-ecosystem-dynamics` | `52178e5` | importato verbatim in commit isolato `b1ab7da` |
| Branch benchmark | `benchmark/iv1-b-integrated-performance` | — | creato da `717da65`, nessun merge |

Nessuna logica biologica o di rendering è stata modificata per migliorare i risultati. Il commit `b1ab7da` contiene solo codice E2.3.1 copiato senza alterazioni dai branch di riferimento; il commit successivo contiene solo infrastruttura di misurazione.

## 2. Matrice

**Popolazioni:** 100, 500, 1 500, 3 000, 5 000, 10 000 organismi iniziali.

**Configurazioni (4):**

| Nome | `refs.adaptive.enabled` | Event sink |
|---|---|---|
| `baseline` | `false` | `NULL_EVENT_SINK` |
| `rendering` | `true` | `NULL_EVENT_SINK` |
| `observability` | `false` | `InMemoryEventSink` |
| `integrated` | `true` | `InMemoryEventSink` |

**Seed:** `[7, 11, 31, 47, 59]` → 5 run indipendenti per cella (minimo richiesto: 5).

**Ordine di esecuzione:** ruotato per seed — per il seed all'indice `k` l'ordine è `CONFIGS[(i + k) % 4]`. Ogni configurazione occupa quindi ciascuna posizione nel processo una volta su 4 seed, bilanciando effetti JIT/GC/thermal. Le configurazioni non vengono mai eseguite tutte in blocco.

**Tick:** 5 di warm-up (esclusi) + 20 misurati per ogni run. Warm-up e misurazione usano la stessa `World`, ma solo i secondi alimentano le metriche pubblicate.

**Finestre esplicite (R1):** i riferimenti di tempo (`performance.now`), CPU (`process.cpuUsage`) ed heap (`process.memoryUsage`) vengono acquisiti **dopo** il warm-up. Ogni run registra:

| Campo | Finestra |
|---|---|
| `tickMs`, `frameBuildMs`, `syncMs`, `renderMs`, `heapKB` | solo i 20 tick misurati |
| `measuredWallMs` | dopo il warm-up, fino dopo il flush finale |
| `tickLoopWallMs` | solo il loop dei 20 tick, senza flush finale |
| `measuredCpuMs` | dopo il warm-up, fino dopo il flush finale |
| `heapAtWarmupEndKB`, `heapAfterMeasuredKB`, `heapGrowthMeasuredKB` | finestra misurata |
| `events.*` | delta dei contatori sink tra fine warm-up e fine finestra misurata |
| `warmup.*` | 5 tick di warm-up, tenuti separati e mai uniti alle metriche di cui sopra |
| `totals.*` | intera esecuzione (warm-up + misurazione), solo per controllo |

`ticksPerSecond` usa `measuredWallMs`. Il vecchio dataset v1 è conservato come `dataset.raw.v1.json`: in esso `wallMs`, `cpuMs` e `heapGrowthKB` includevano il warm-up e i contatori evento non erano separati.

**Dimensione pianeta** (costante per popolazione, identica nelle 4 configurazioni): 64², 96², 160², 224², 288², 400².

**Setup iniziale:** `mixed` (`tools/e1/initialConditions.ts`), opzioni `enableAdvancedGenome: true`, `enableGeneEffects: true`, `enableSettlement: false`.

## 3. Parametri del renderer (identici in tutte le configurazioni)

```ts
adaptive: {
  enabled: <secondo la configurazione>,
  nearDistanceScales: 8,
  farStride: 4,
  cullBehindCamera: true,
  cullMarginUnits: 0.5,
}
```

Camera: posizione `(0, 5.5, 0)`, `lookAt(0, 4.5, -1)`, `updateMatrixWorld(true)` — vista tangenziale dalla superficie del pianeta (raggio 5 unità), che esercita sia la classificazione LOD sia il culling dietro il piano.

`createRuntimeAnatomyRenderSource` condiviso; `syncFrame(frame)` a ogni tick misurato (percorso reale, non snapshot artificiale). `detail = 3`, `dtMs = 16`, capacità mesh = `ceil(N * 1.1)`.

## 4. Parametri dell'observability (identici in tutte le configurazioni che la attivano)

```ts
new InMemoryEventSink({
  simulationId: "iv1b",
  experimentId: "IV1-B",
  runId: `iv1b-${population}-${config}-${seed}`,
  profile: "scientific_full",
  snapshotEveryTicks: 0,          // snapshot diagnostici disattivati per limitare la memoria
  batchWriter: measuringWriter,   // writer SINTETICO: property scan in memoria, nessun I/O su disco
  flushEveryEvents: 5000,
  releaseAfterFlush: true,        // config produttiva-safe: buffer limitato a 5000 eventi
})
```

`measuringWriter` è un contatore di batch/bytes con cronometro: **non scrive su disco**. `throughBatch` scorre gli eventi e ne conta le proprietà; `bytes` è un conteggio sintetico di campioni, non byte serializzati. I valori `flushMs` e `eventsPerSecond` misurano quindi il costo di elaborazione in memoria del writer sintetico, **non un throughput di persistenza reale**. I/O su disco, fsync e buffering del sistema operativo non sono stati misurati.

**Nota sul buffer (dati mancanti / stima):** con `releaseAfterFlush: true` gli eventi flushati vengono rilasciati, quindi il buffer finale non è serializzabile. La profondità massima del buffer è misurata via `summary().retained` campionato a ogni tick; `bufferBytes` è una **stima** (`retainedMax × 582 B/evento`, dove 582 B/evento è la media misurata da E2.3.1 nel report N.9) ed è marcato come tale nel dataset (`bufferBytesIsEstimate: true`). La configurazione non rilasciata (`releaseAfterFlush: false`) è stata provata in calibrazione: 25 MB di JSONL a 100 organismi e 63 MB a 500 organismi in soli 3 tick, con crescita lineare che porterebbe a OOM a 10 000 organismi — quindi non è usata nella matrice completa. Questo vincolo è riportato come limite ambientale, non come risultato di scala.

## 5. Metriche

- **Performance (finestra misurata):** tempo/tick (media, mediana, P95, P99, min, max, dev.std), tick/s, tempo di `buildRenderFrame`, di `syncFrame`, di `updateCreatureInstances`, CPU utente+sistema, heapUsed a inizio/fine/picco, pendenza della crescita heap, RSS finale. Warm-up e totali sono campi separati.
- **Observability (finestra misurata):** eventi tentati, registrati, registrati/tick, eventi/s (denominatore `measuredWallMs`), persi (non-critici + critici + tipi disabilitati), sampler, flush (ms e numero batch, writer sintetico), profondità massima del buffer (**misurata**), byte buffer (**stima** `retainedMax × 582 B/evento`), overhead vs configurazioni OFF.
- **Costo per evento (R1):** `(tickMs[observability] − tickMs[baseline]) × 1000 / eventiRegistratiPerTick`. Numeratore e denominatore appartengono alla stessa popolazione, agli stessi seed e alla stessa finestra misurata. Il totale degli eventi va diviso per `seed × tick misurati` prima di essere usato come denominatore.
- **Rendering:** organismi aggiornati/saltati/cullati, LOD near/far, `droppedParts`, costo adaptive = `renderMs(rendering) − renderMs(baseline)`.

## 6. Ambiente

Documentato in `REPORT.md` (CPU, RAM, OS, Node, Git). Tutte le configurazioni girano nello stesso processo, sullo stesso host, con la stessa toolchain. Nessun confronto tra macchine diverse.

## 7. Dati mancanti dichiarati

`fps`, `frameTimeMs`, `gpuBytes`, `gpuDrawCalls` sono `null`: Node non istanzia `WebGLRenderer`. Il numero di mesh instanziate è un proxy main-thread, non un draw call GPU. La memoria riportata è heap V8 + RSS, non occupazione GPU.

## 8. Riproduzione

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd;C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = "true"
.\scripts\run_iv1b.ps1
```

Override facoltativi: `IV1B_POPULATIONS`, `IV1B_SEEDS`, `IV1B_TICKS`, `IV1B_WARMUP_TICKS`, `IV1B_OUT`.

Se una matrice viene interrotta (ad esempio per timeout dell'ambiente), è possibile riprenderla senza perdere i run già scritti:

```powershell
$env:IV1B_RESUME = "1"
$env:IV1B_POPULATIONS = "10000"   # sole popolazioni mancanti
.\scripts\run_iv1b.ps1
```

`IV1B_RESUME=1` richiede un dataset v2 esistente, carica i run precedenti, verifica l'assenza di duplicati `(popolazione, configurazione, seed)` e riscrive il dataset con l'unione completa. Nella sessione R1 la prima esecuzione è stata interrotta dopo 100 run (5 popolazioni) e la popolazione 10 000 è stata completata con questa procedura; i log `r1-benchmark.log` e `r1-resume.log` documentano le due fasi.
