# IV1-B — Tabelle comparative (generate da `dataset.raw.json`)

Semi: 7, 11, 31, 47, 59. Ogni cella = media su 5 run × 20 tick misurati (5 warm-up esclusi).

## 1. Tempo medio per tick (ms) e rapporti

| N | baseline | rendering | observability | integrated | R/B | O/B | I/B | I/(R·O/B) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 2.15 | 2.11 | 11.13 | 11.59 | 0.98× | 5.17× | 5.38× | 1.06× |
| 500 | 9.89 | 9.89 | 34.45 | 34.45 | 1.00× | 3.48× | 3.48× | 1.00× |
| 1500 | 53.78 | 53.23 | 114.88 | 120.49 | 0.99× | 2.14× | 2.24× | 1.06× |
| 3000 | 168.84 | 164.61 | 316.70 | 315.38 | 0.97× | 1.88× | 1.87× | 1.02× |
| 5000 | 487.05 | 529.26 | 941.17 | 935.69 | 1.09× | 1.93× | 1.92× | 0.91× |
| 10000 | 2397.33 | 2426.63 | 2856.29 | 2759.94 | 1.01× | 1.19× | 1.15× | 0.95× |

## 2. Fase di rendering e adaptive

| N | render baseline (ms) | render adaptive (ms) | speedup | updated | skipped | culled | near | far | droppedParts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.49 | 0.42 | 1.16× | 37 | 34 | 4 | 8 | 66 | 0 |
| 500 | 1.61 | 1.62 | 0.99× | 253 | 31 | 17 | 24 | 277 | 0 |
| 1500 | 4.89 | 4.58 | 1.07× | 706 | 18 | 54 | 56 | 722 | 0 |
| 3000 | 9.44 | 8.16 | 1.16× | 1257 | 41 | 88 | 91 | 1296 | 0 |
| 5000 | 17.54 | 16.72 | 1.05× | 1941 | 6 | 119 | 150 | 1916 | 0 |
| 10000 | 35.68 | 31.87 | 1.12× | 3481 | 11 | 233 | 292 | 3433 | 0 |

## 3. Observability

| N | eventi registrati | persi | eventi/s | flush (ms) | buffer max (KB, stimato) | oscillazione O→I (eventi/s) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 846547 | 0 | 709100 | 13.08 | 2686.5 | 0.97× |
| 500 | 2135357 | 0 | 571081 | 39.22 | 2639.1 | 1.00× |
| 1500 | 5982461 | 0 | 488920 | 95.38 | 2727.4 | 0.95× |
| 3000 | 11718977 | 0 | 356513 | 244.14 | 2706.1 | 1.00× |
| 5000 | 19212778 | 0 | 208078 | 489.54 | 2760.2 | 0.99× |
| 10000 | 36300058 | 0 | 133677 | 844.75 | 2773.4 | 1.00× |

> Il buffer è una **stima** (`retainedMax × 582 B/evento`); `summary().retained` è misurato, i byte no.

## 4. Memoria

| N | Δheap baseline (KB) | Δheap rendering | Δheap observability | Δheap integrated | pendenza O (KB/tick) | pendenza I (KB/tick) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | -2244 | 2954 | 22528 | 9138 | -1995 | -2941 |
| 500 | 7455 | 11489 | 42784 | -2636 | 990 | -1074 |
| 1500 | -67358 | 31011 | -14169 | 50118 | 356 | 683 |
| 3000 | -26101 | -82874 | -31392 | 30606 | -1535 | -1913 |
| 5000 | -29168 | 36056 | -81601 | 13151 | -3346 | -1911 |
| 10000 | 61117 | 16382 | -42696 | 137145 | -1722 | 3911 |

> I delta heap grezzi includono effetti GC: valori negativi sono possibili e vanno letti come indicatori, non come conteggi di allocazione.

## 5. Scala (esponente b in `tempo = a · N^b`)

| configurazione | b (tick) | b (render) | b (wall) |
|---|---:|---:|---:|
| baseline | 1.509 | 1.035 | 1.444 |
| rendering | 1.520 | 1.000 | 1.490 |
| observability | 1.207 | 1.039 | 1.238 |
| integrated | 1.194 | 1.017 | 1.242 |

## 6. Coerenza delle fasi non influenzate

| N | spread buildFrame (ms) | spread sync (ms) | spread popolazione iniziale |
|---:|---:|---:|---:|
| 100 | 0.145 | 0.005 | 0 |
| 500 | 0.370 | 0.040 | 0 |
| 1500 | 0.439 | 0.078 | 0 |
| 3000 | 0.921 | 0.066 | 0 |
| 5000 | 2.623 | 0.087 | 0 |
| 10000 | 5.867 | 0.206 | 0 |

## 7. Scomposizione delle fasi (ms/tick, media 5 seed)

Il `wall` è il solo intervallo misurato (warm-up escluso). `step` è `world.step()`; le altre colonne sono fasi separate misurate nello stesso loop.

| N | cfg | step (ms) | buildFrame | syncSource | render | wall |
|---:|---|---:|---:|---:|---:|---:|
| 100 | baseline | 2.15 | 0.256 | 0.022 | 0.49 | 58.67 |
| 100 | rendering | 2.11 | 0.282 | 0.025 | 0.42 | 57.11 |
| 100 | observability | 11.13 | 0.298 | 0.021 | 0.49 | 239.62 |
| 100 | integrated | 11.59 | 0.400 | 0.020 | 0.37 | 248.27 |
| 500 | baseline | 9.89 | 1.029 | 0.081 | 1.61 | 252.63 |
| 500 | rendering | 9.89 | 0.991 | 0.079 | 1.62 | 252.12 |
| 500 | observability | 34.45 | 1.136 | 0.117 | 1.75 | 749.78 |
| 500 | integrated | 34.45 | 1.361 | 0.077 | 1.62 | 751.96 |
| 1500 | baseline | 53.78 | 3.384 | 0.252 | 4.89 | 1246.54 |
| 1500 | rendering | 53.23 | 3.221 | 0.243 | 4.58 | 1225.94 |
| 1500 | observability | 114.88 | 2.945 | 0.207 | 4.37 | 2448.99 |
| 1500 | integrated | 120.49 | 3.041 | 0.285 | 4.42 | 2565.55 |
| 3000 | baseline | 168.84 | 7.270 | 0.479 | 9.44 | 3721.23 |
| 3000 | rendering | 164.61 | 6.349 | 0.493 | 8.16 | 3592.67 |
| 3000 | observability | 316.70 | 6.502 | 0.433 | 8.72 | 6648.44 |
| 3000 | integrated | 315.38 | 6.809 | 0.427 | 8.09 | 6615.16 |
| 5000 | baseline | 487.05 | 14.650 | 0.912 | 17.54 | 10403.49 |
| 5000 | rendering | 529.26 | 16.134 | 0.905 | 16.72 | 11260.92 |
| 5000 | observability | 941.17 | 17.273 | 0.887 | 20.95 | 19606.83 |
| 5000 | integrated | 935.69 | 16.823 | 0.975 | 20.38 | 19478.68 |
| 10000 | baseline | 2397.33 | 35.902 | 2.181 | 35.68 | 49422.46 |
| 10000 | rendering | 2426.63 | 36.790 | 2.054 | 31.87 | 49947.35 |
| 10000 | observability | 2856.29 | 41.769 | 2.111 | 35.47 | 58713.99 |
| 10000 | integrated | 2759.94 | 38.607 | 1.975 | 30.40 | 56619.66 |
