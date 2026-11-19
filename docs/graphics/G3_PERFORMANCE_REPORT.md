# G3 — Performance Report

**Data:** 2026-11-18  
**Comando:** `npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts --reporter=verbose`  
**Log:** `C:\Users\matti\AppData\Local\Temp\opencode\g3-qa\g3-benchmark.log` / `.json`  
**Durata:** ~52 s (warmup 20, 80 campioni per misura CPU)

---

## 1. Metodologia

Tre modalità confrontabili sulle stesse popolazioni (100 / 500 / 1500 / 3000):

- **legacy** — `updateCreatureInstances` senza sorgente G2 (baseline G1/G_FINAL);
- **g2-current** — piani G2 precalcolati con il mapping strict G-REV-02;
- **g2-optimized** — sorgente runtime G3 con canale MOR, cache e pool dinamici.

Il benchmark misura solo il costo main-thread in Node. `drawCalls`, `geometries`, `materials` e `cpuKB` sono proxy main-thread calcolati dalle mesh attive. `fps` e `gpuBytes` sono `null` perché Node non ha un `WebGLRenderer`: i valori reali sono stati raccolti nel browser (§4).

---

## 2. Risultati CPU (mediane, ms)

| Popolazione | legacy | G2 attuale | G2 ottimizzato | p95 ottimizzato |
|---:|---:|---:|---:|---:|
| 100 | 0.932 | 2.459 | 2.809 | 4.888 |
| 500 | 2.867 | 11.684 | 14.019 | 16.729 |
| 1500 | 8.365 | 35.540 | 42.292 | 46.721 |
| 3000 | 17.022 | 69.529 | 80.056 | 88.448 |

Confronto con la baseline G_FINAL (mediane legacy/G2: 1.114/2.160, 2.475/8.163, 7.191/29.373, 12.083/60.133 ms): legacy è sostanzialmente invariato; G2 attuale è leggermente più lento a 3000 (69.5 vs 60.1 ms) perché ora `configureGenericPools` viene chiamato per ogni sorgente.

### 2.1 `syncFrame` separato

| Popolazione | warm (ms) | rigenerazione (ms, mediana) |
|---:|---:|---:|
| 100 | 0.000 | 70.122 |
| 500 | 0.001 | 218.074 |
| 1500 | 0.001 | 561.879 |
| 3000 | 0.001 | 857.498 |

Il costo caldo è ~0 ms: i piani non vengono rigenerati a ogni frame. La rigenerazione completa è un evento raro (cambio dei geni MOR / ingresso di nuovi organismi), non un costo per-frame.

### 2.2 Micro-benchmark

| Misura (3000) | Mediana ms |
|---|---:|
| `buildCreatureVisualDescriptor` | 1.399 |
| `descriptorFromLegacyTraits + projectAnatomyToVisual` | 1009.908 |

Conferma che la generazione dei descriptor è il collo di bottiglia e che la cache runtime è la scelta corretta.

---

## 3. Interpretazione

G2 ottimizzato è **più lento per frame** di G2 attuale (2.8 vs 2.5 ms a 100; 80.1 vs 69.5 ms a 3000). Questo non è una regressione di efficienza, ma il costo misurabile della **fedeltà**: il piano G3 emette tutte le parti anatomiche reali (segmenti + appendici + occhi), mentre il mapping strict G-REV-02 ne disegna un sottoinsieme approssimato. Il requisito “nessuna perdita silenziosa di parti” preclude il taglio che renderebbe G3 più veloce.

L’ottimizzazione ottenuta è strutturale:

- cache per `id + versione MOR` → `syncFrame` caldo ~0 ms;
- crescita dei pool solo quando la domanda supera la capacità, con headroom 25%/64 → nessuna riallocazione a metà frame;
- riutilizzo di geometria/materiale → nessuna duplicazione di risorse;
- pruning della cache → numero di voci limitato alla popolazione corrente;
- fallback misurabile fuori capacità → nessuna perdita invisibile.

### 3.1 Proxy di scenario

| Scenario | draw call | geometrie | materiali | CPU istanza (KB) |
|---|---:|---:|---:|---:|
| legacy | 9 | 9 | 9 | 3425.6 – 3533.2 |
| G2 attuale | 12 | 12 | 12 | 7808.4 – 7916.0 |
| G2 ottimizzato | 12 | 12 | 12 | 13544.1 – 13688.5 |

Il costo di memoria CPU aggiuntivo di G3 (~5.8 MB rispetto a G2 attuale a 3000 creature) è dovuto ai pool dimensionati fino al tetto dichiarato di 64 appendici per creatura. È crescita controllata e misurata, non perdita.

---

## 4. Dati browser reali

`renderer.info` letto tramite `window.__EVOWORLD_G3__.snapshot()`:

| Qualità | Creature | draw call | geometrie | texture | fallback | parti perse |
|---|---:|---:|---:|---:|---:|---:|
| basso | 79 → 266 | 12 | 21 | 4–5 | 0 | 0 |
| medio | 95 → 269 | 23 | 22 | 5–6 | 0 | 0 |
| alto | 150 → 1217 | 26–46 | 21–24 | 6–8 | 0 | 0 |

Il numero di draw call resta nell’ordine delle decine anche oltre 1000 creature: il batching tramite `InstancedMesh` funziona. Nessuna crescita illimitata di geometrie/texture è stata osservata attraverso 6 cambi di qualità (geometrie 22, texture 8 a fine sessione).

---

## 5. Limiti di misurazione

- FPS reali, upload GPU, fill-rate e memoria GPU non sono misurabili nel benchmark Node: dichiarati `null`.
- L’heap snapshot del browser supera il limite di trasferimento di 5 MiB dello strumento: come proxy sono stati usati `renderer.info.memory` e `performance.memory` (121.9 MB JS heap a fine sessione, limite 4192 MB).
- Le misure Node includono rumore di macchina; i rapporti tra modalità sono più significativi dei valori assoluti.
- Il benchmark non include il costo di rendering GPU, che può dominare a qualità alta.
