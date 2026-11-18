# G Final — Report prestazioni

## 1. Metodo

Comando esatto:

```
npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts --reporter=verbose
```

- Exit code: 0.
- Durata: 22.27s (test 19.83s).
- Ambiente: Node `v22.14.0`, Windows, worktree `Evoworld-g-final`.
- Il benchmark misura **solo costo CPU main-thread**: nessuna GPU, FPS, upload, draw call o fill-rate.
- Warmup e più campioni per riga; sotto sono riportati mediana, p95 e media in ms.
- Log completo: `C:\Users\matti\AppData\Local\Temp\opencode\g-final-qa\benchmark-verbose.log`.

Le righe `updateCreatureInstances+g2` usano piani G2 **precalcolati** e memorizzati in una `CreatureAnatomyRenderSource`; il loop misurato non genera descriptor. I numeri sono medie di più campioni, non misure GPU.

## 2. Risultati

| Misura | Mediana (ms) | p95 (ms) | Media (ms) |
|---|---:|---:|---:|
| `updateCreatureInstances/100` | 1.114 | 2.635 | 1.273 |
| `updateCreatureInstances+g2/100` | 2.160 | 4.947 | 2.413 |
| `updateCreatureInstances/500` | 2.475 | 4.278 | 2.754 |
| `updateCreatureInstances+g2/500` | 8.163 | 15.074 | 9.261 |
| `updateCreatureInstances/1500` | 7.191 | 11.361 | 7.316 |
| `updateCreatureInstances+g2/1500` | 29.373 | 44.812 | 30.198 |
| `updateCreatureInstances/3000` | 12.083 | 23.833 | 13.849 |
| `updateCreatureInstances+g2/3000` | 60.133 | 86.209 | 62.059 |
| `buildCreatureVisualDescriptor/3000` | 3.777 | 11.380 | 4.896 |
| `descriptorFromLegacyTraits+project/3000` | 1041.105 | 1060.219 | 1041.703 |

Riga machine-readable dal log:

```
G_BENCHMARK_JSON=[{"label":"updateCreatureInstances/100","medianMs":1.114,...}]
```

## 3. Interpretazione

### 3.1 Percorso legacy

Il percorso legacy rimane il default e non regredisce: 12.083 ms mediani a 3000 creature. È il percorso usato da tutte le configurazioni che non forniscono `anatomyRenderSource`.

### 3.2 Percorso G2

Con sorgente G2 precalcolata, il costo mediano del loop sale:

- 100 creature: 1.114 → 2.160 ms (≈1.94×).
- 500 creature: 2.475 → 8.163 ms (≈3.30×).
- 1500 creature: 7.191 → 29.373 ms (≈4.09×).
- 3000 creature: 12.083 → 60.133 ms (≈4.98×).

L'aumento è atteso: ogni frame scrive anche i tre pool generici limitati (`segment`, `appendage`, `eye`) e aggiorna contatori/visibilità. Non è stato dichiarato alcun miglioramento prestazionale: questa è una misura di costo, non un beneficio.

### 3.3 Costruzione dei piani

`descriptorFromLegacyTraits+project/3000` richiede ~1041 ms mediani, tre ordini di grandezza oltre il loop G2 stesso (~60 ms). I piani devono quindi essere generati e cached**fuori** dal loop caldo, nella sorgente lato renderer. Il benchmark G2 usa già questa strategia; integrazioni future devono mantenerla.

`buildCreatureVisualDescriptor/3000` resta economico (3.777 ms) e non è stato modificato.

## 4. Limiti della misura

- Nessun dato GPU: il costo reale di draw call, upload delle instance buffer e fill-rate non è misurato.
- I numeri sono specifici per questa macchina e questa versione di Node/Vitest; vanno confrontati solo con esecuzioni sulla stessa configurazione.
- Il benchmark usa geometrie e materiali semplificati, non la scena completa di `Planet3DView`.
- Il percorso G2 nel benchmark non usa la generazione live di descriptor; se un'integrazione la usasse, il costo sarebbe dominato dalla riga ~1041 ms.
- 3000 creature è il massimo campione richiesto; non sono state misurate popolazioni superiori.

## 5. Raccomandazioni operative

1. Mantenere G2 come opt-in: il default legacy resta preferibile per profili a basso dettaglio e per grandi popolazioni.
2. Costruire `AnatomyRenderPlan` una volta per organismo/fingerprint e riutilizzarlo tramite `planFor`.
3. Invalidare la cache solo quando cambiano i dati anatomici sorgente; non ricostruire per tick.
4. Monitorare `CreatureRendererStats` (`mapped`, `fallback`, `unsupported`) per individuare piani che ricadono sulla geometria legacy.
5. Non aumentare `GENERIC_RENDER_SLOTS` senza nuove misure: i limiti attuali (6/12/2) sono scelti per contenere il costo del loop.

## 6. Conclusione

I quattro livelli di popolazione richiesti (100/500/1500/3000) sono stati misurati sia sul percorso legacy sia su quello G2. Il consolidamento non introduce regressioni nel percorso legacy e rende esplicito il costo del percorso G2, che resta una scelta opzionale e richiede piani precalcolati.
