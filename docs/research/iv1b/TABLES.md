# IV1-B — Tabelle comparative (generate da `dataset.raw.json`)

Semi: 7, 11, 31, 47, 59. Ogni cella = media su 5 run × 20 tick misurati (5 warm-up esclusi).

## 1. Tempo medio per tick (ms) e rapporti

| N | baseline | rendering | observability | integrated | R/B | O/B | I/B | I/(R·O/B) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 3.54 | 3.33 | 16.07 | 15.14 | 0.94× | 4.54× | 4.28× | 1.00× |
| 500 | 12.75 | 12.44 | 44.03 | 43.64 | 0.98× | 3.45× | 3.42× | 1.02× |
| 1500 | 65.13 | 67.86 | 168.93 | 162.40 | 1.04× | 2.59× | 2.49× | 0.92× |
| 3000 | 228.74 | 212.95 | 682.63 | 485.84 | 0.93× | 2.98× | 2.12× | 0.76× |
| 5000 | 779.54 | 629.48 | 977.39 | 790.31 | 0.81× | 1.25× | 1.01× | 1.00× |
| 10000 | 3407.47 | 4352.17 | 5104.40 | 5190.23 | 1.28× | 1.50× | 1.52× | 0.80× |

## 2. Fase di rendering e adaptive

| N | render baseline (ms) | render adaptive (ms) | speedup | updated | skipped | culled | near | far | droppedParts |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0.86 | 0.68 | 1.27× | 37 | 34 | 4 | 8 | 66 | 0 |
| 500 | 2.12 | 1.88 | 1.13× | 253 | 31 | 17 | 24 | 277 | 0 |
| 1500 | 6.45 | 6.18 | 1.04× | 706 | 18 | 54 | 56 | 722 | 0 |
| 3000 | 13.70 | 11.98 | 1.14× | 1257 | 41 | 88 | 91 | 1296 | 0 |
| 5000 | 27.74 | 20.75 | 1.34× | 1941 | 6 | 119 | 150 | 1916 | 0 |
| 10000 | 65.48 | 67.18 | 0.97× | 3481 | 11 | 233 | 292 | 3433 | 0 |

## 3. Observability

| N | eventi registrati | persi | eventi/s | flush (ms) | buffer max (KB, stimato) | oscillazione O→I (eventi/s) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 672642 | 0 | 387061 | 15.02 | 2686.5 | 1.07× |
| 500 | 1699923 | 0 | 354728 | 32.72 | 2639.1 | 1.01× |
| 1500 | 4762963 | 0 | 267491 | 96.44 | 2727.4 | 1.03× |
| 3000 | 9328930 | 0 | 157632 | 293.06 | 2706.1 | 1.18× |
| 5000 | 15283554 | 0 | 158126 | 365.78 | 2760.2 | 1.23× |
| 10000 | 28816637 | 0 | 63767 | 778.67 | 2773.4 | 1.01× |

> Il buffer è una **stima** (`retainedMax × 582 B/evento`); `retainedMax` è misurato, i byte no.

> `flush (ms)` misura il **writer sintetico**: throughBatch scorre gli eventi e conta le proprietà, senza scrittura su disco. Non è un throughput di persistenza reale.

## 4. Memoria

| N | Δheap baseline (KB) | Δheap rendering | Δheap observability | Δheap integrated | pendenza O (KB/tick) | pendenza I (KB/tick) |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1150 | -17762 | -15523 | -18113 | -1823 | -1314 |
| 500 | 13816 | 16184 | 61931 | 294 | 326 | 127 |
| 1500 | -33069 | 6542 | 82322 | -44804 | 2950 | -429 |
| 3000 | -1310 | 21992 | 110755 | -59958 | -2983 | -2978 |
| 5000 | 69463 | -32488 | -76105 | -107966 | -2761 | -2231 |
| 10000 | -88757 | -244679 | -404 | 51568 | 13966 | 1143 |

> I delta heap grezzi includono effetti GC: valori negativi sono possibili e vanno letti come indicatori, non come conteggi di allocazione.

## 5. Scala (esponente b in `tempo = a · N^b`)

| configurazione | b (tick) | b (render) | b (wall) |
|---|---:|---:|---:|
| baseline | 1.496 | 1.147 | 1.430 |
| rendering | 1.521 | 1.155 | 1.461 |
| observability | 1.237 | 1.162 | 1.224 |
| integrated | 1.216 | 1.115 | 1.206 |

## 6. Coerenza delle fasi non influenzate

| N | spread buildFrame (ms) | spread sync (ms) | spread popolazione iniziale |
|---:|---:|---:|---:|
| 100 | 0.027 | 0.017 | 0 |
| 500 | 0.209 | 0.048 | 0 |
| 1500 | 0.807 | 0.056 | 0 |
| 3000 | 6.418 | 0.267 | 0 |
| 5000 | 5.668 | 0.446 | 0 |
| 10000 | 30.495 | 0.833 | 0 |

## 7. Scomposizione delle fasi (ms/tick, media 5 seed)

Il `wall` è il solo intervallo misurato (warm-up escluso). `step` è `world.step()`; le altre colonne sono fasi separate misurate nello stesso loop.

| N | cfg | step (ms) | buildFrame | syncSource | render | wall |
|---:|---|---:|---:|---:|---:|---:|
| 100 | baseline | 3.54 | 0.421 | 0.037 | 0.86 | 97.68 |
| 100 | rendering | 3.33 | 0.399 | 0.034 | 0.68 | 89.27 |
| 100 | observability | 16.07 | 0.426 | 0.027 | 0.75 | 349.67 |
| 100 | integrated | 15.14 | 0.415 | 0.020 | 0.50 | 324.40 |
| 500 | baseline | 12.75 | 1.323 | 0.088 | 2.12 | 326.19 |
| 500 | rendering | 12.44 | 1.265 | 0.080 | 1.88 | 313.67 |
| 500 | observability | 44.03 | 1.473 | 0.127 | 2.15 | 958.60 |
| 500 | integrated | 43.64 | 1.421 | 0.084 | 2.17 | 948.48 |
| 1500 | baseline | 65.13 | 4.108 | 0.286 | 6.45 | 1519.96 |
| 1500 | rendering | 67.86 | 4.311 | 0.278 | 6.18 | 1573.28 |
| 1500 | observability | 168.93 | 4.602 | 0.315 | 7.18 | 3622.66 |
| 1500 | integrated | 162.40 | 3.795 | 0.259 | 6.40 | 3459.22 |
| 3000 | baseline | 228.74 | 10.195 | 0.614 | 13.70 | 5065.56 |
| 3000 | rendering | 212.95 | 8.116 | 0.598 | 11.98 | 4673.56 |
| 3000 | observability | 682.63 | 14.534 | 0.705 | 20.85 | 14377.36 |
| 3000 | integrated | 485.84 | 11.059 | 0.865 | 15.21 | 10261.76 |
| 5000 | baseline | 779.54 | 19.637 | 1.212 | 27.74 | 16563.29 |
| 5000 | rendering | 629.48 | 16.853 | 0.974 | 20.75 | 13361.80 |
| 5000 | observability | 977.39 | 18.298 | 0.890 | 22.10 | 20375.97 |
| 5000 | integrated | 790.31 | 13.968 | 0.766 | 17.27 | 16448.09 |
| 10000 | baseline | 3407.47 | 54.558 | 2.867 | 65.48 | 70608.72 |
| 10000 | rendering | 4352.17 | 70.905 | 3.013 | 67.18 | 89866.30 |
| 10000 | observability | 5104.40 | 85.053 | 3.700 | 78.42 | 105435.70 |
| 10000 | integrated | 5190.23 | 71.565 | 3.640 | 74.00 | 106792.04 |

## 8. Riconciliazione costo per evento (R1)

Numeratore: extra `world.step()` per tick nella cella observability (`O − B`). Denominatore: eventi registrati per tick nella **stessa cella**, finestra misurata dopo warm-up.

| N | overhead step (ms/tick) | eventi registrati (finestra misurata) | tick misurati totali | eventi/tick | us/evento |
|---:|---:|---:|---:|---:|---:|
| 100 | 12.54 | 672642 | 100 | 6726 | 1.864 |
| 500 | 31.27 | 1699923 | 100 | 16999 | 1.840 |
| 1500 | 103.80 | 4762963 | 100 | 47630 | 2.179 |
| 3000 | 453.89 | 9328930 | 100 | 93289 | 4.865 |
| 5000 | 197.85 | 15283554 | 100 | 152836 | 1.295 |
| 10000 | 1696.92 | 28816637 | 100 | 288166 | 5.889 |

> Correzione R1: il report IV1-B dichiarava 71 106 eventi/tick e 6,4 us/evento, valori non riproducibili dal dataset. Il denominatore corretto e' 5 seed x 20 tick = 100: con i contatori cumulativi v1 si ottengono 363 000,58 eventi/tick e 1,26 us/evento a 10 000. Il dataset v2 misura direttamente la finestra, rimuovendo anche il warm-up.
