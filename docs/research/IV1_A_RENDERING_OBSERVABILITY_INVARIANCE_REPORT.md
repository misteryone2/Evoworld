# IV1-A / IV1-A-R1 — Invarianza biologica sotto G3.1 adaptive rendering ed E2.3.1 observability

## 1. Esito

**PASS.** Nessuna divergenza biologica rilevata e finestra post-render chiusa, ultimo tick incluso.

- 60 corse complete (5 seed × 3 ripetizioni × 4 configurazioni), 120 tick ciascuna.
- 45 confronti tick-per-tick contro il baseline `OFF/OFF` della stessa coppia seed/ripetizione.
- 0 divergenze, primo tick divergente: `null`.
- Stesso fingerprint biologico finale per ogni quadrupla seed/ripetizione, indipendentemente da rendering e osservabilità.
- **R1**: la fingerprint è acquisita **dopo** il rendering; prove di mutazione artificiale confermano che una mutazione in quella finestra viene rilevata anche nell'ultimo tick, e che il vecchio ordine (fingerprint pre-render) l'avrebbe mancata.
- Nessuna conclusione ecologica nuova: questo esperimento verifica solo l'invarianza del motore.

Artefatto leggibile: [`iv1-a/iv1-a-invariance-results.json`](iv1-a/iv1-a-invariance-results.json).

| Campo | Valore |
|---|---|
| Schema risultati | `evoworld.iv1-a.results.v2` (revisione `IV1-A-R1`) |
| Schema fingerprint | `evoworld.iv1-a.biological-state.v1` |
| Branch | `validation/iv1-a-r1-post-render-fingerprint` |
| Base osservabilità | `research/e2-ecosystem-dynamics` @ `52178e56787d91ab6324a36a0f39a9a2d531b15f` |
| Branch rendering integrato | `graphics/g3-renderer-integration` @ `717da65` |
| Commit di integrazione (codice motore sotto test) | `e936756c5764b9b354bdd303d297ec97a33b1966` |
| `payloadSha256` report R1 | `82e1bb79a6c99d84e16139580bf83bd80e2f7567176df7bf7d65571b59ff2edb` |
| `sourceSha256` sorgenti validate R1 | `45aefc5889c109c02932a86d872a7c4772ab738a33060193626ef130c1b07a10` |

`main` non è stato modificato. Non sono stati creati merge o PR verso `main`, né modificati i branch G o E2.3.1. L'unico merge presente è quello locale sul branch IV1-A che integra G3.1 nel ramo E2.3.1 per poter testare le due funzionalità insieme.

## 2. Metodo di confronto (R1)

Per **ogni** tick, incluso l'ultimo, l'ordine è:

1. `world.step()` — avanzamento della simulazione;
2. `buildRenderFrame(world)` — costruzione del frame di rendering;
3. `updateCreatureInstances(...)` — aggiornamento delle istanze grafiche (percorso G3.1 adattivo);
4. eventuale hook diagnostico `postRenderMutation` (solo nei test di sensibilità);
5. acquisizione della fingerprint biologica **post-render**;
6. confronto con il fingerprint della configurazione di riferimento.

La fingerprint è `sha256(stableStringify(canonicalBiologicalState))`, calcolata sullo stato dopo ogni step (post-render), inclusa la configurazione iniziale (tick 0). Il numero di osservazioni per corsa è quindi 121 (tick 0 + 120 tick).

Nella revisione precedente (IV1-A, pre-R1) la fingerprint era acquisita **prima** del rendering: un'eventuale mutazione biologica prodotta dal rendering nell'ultimo tick restava fuori dalla verifica. R1 sposta l'acquisizione dopo il rendering e aggiunge i test che dimostrano la chiusura della finestra.

### Campi inclusi

- `tick`, `randomState`, `nextOrganismId`, `nextSpeciesId`;
- organismi: `id`, `speciesId`, `position`, `home`, `energy`, `age`, `alive`, `genome` (incluso `ext`), `memory`, `brain`;
- registro specie completo, con `originGenomeSnapshot`;
- pianeta: configurazione e tutti i chunk materializzati (`key`, `lastActiveTick`, celle con elevazione/temperatura/acqua/vegetazione/terreno/riverFlow/isLake/seasonalOffset);
- versione e opzioni del genoma;
- statistiche per tick: `births`, `deaths`, `predationKills`, popolazione, specie e genoma medio.

### Campi esclusi

- `RenderFrame`, typed array grafici, mesh, camera, pool e contatori G3.1;
- eventi E2.3.1, hash degli eventi, summary del sink;
- `elapsedMs`, `Date.now()`, percorsi filesystem e qualunque metadato wall-clock.

La serializzazione è canonica: chiavi ordinate ricorsivamente, numeri normalizzati (`-0`, `NaN`, `±Infinity`), `undefined` rimosso. L'ordine di organismi, registro specie e chunk viene normalizzato rispettivamente per `id`, `speciesId` e `key`; gli array semanticamente ordinati (brain, celle row-major) sono preservati. Un test dedicato verifica che invertire l'ordine di quelle collezioni non cambi la fingerprint.

## 3. Condizioni e matrice

Per tutte le corse: mondo 32×32, 60 fondatori, **120 tick**, geni avanzati attivi, capacità di rendering 384. Condizione iniziale identica e deterministica per ogni configurazione: energia 220, fertilità 20, età `ceil(lifespan × 0.25)`. Questa trasformazione non consuma RNG ed è applicata solo alle condizioni iniziali, non al motore.

| Configurazione | Rendering G3.1 | Observability E2.3.1 | Corse | Esito |
|---|---|---|---|---|
| `OFF_OFF` | OFF | OFF (sink nullo) | 15 | baseline |
| `ON_OFF` | ON, adaptive | OFF (sink nullo) | 15 | uguale al baseline |
| `OFF_ON` | OFF | ON, `scientific_full`, tutti i tipi, snapshot ogni tick | 15 | uguale al baseline |
| `ON_ON` | ON, adaptive | ON, `scientific_full` | 15 | uguale al baseline |

Il rendering ON esercita il percorso adattivo con `farStride=4`, `nearDistanceScales=8`, sorgente anatomica G2 e refresh periodico del viewport. Il sink ON emette eventi reali; non è un semplice no-op.

Il sink resta l'`InMemoryEventSink` reale (profilo `scientific_full`, tutti i tipi abilitati, nessun campionamento). Su run da 120 tick i tipi non critici sono numerosissimi: per non esaurire la memoria gli eventi vengono conteggiati e rilasciati con `batchWriter` + `releaseAfterFlush`, senza perdite. La copertura dichiarata resta `COMPLETE` (verificato in tutti i run osservati: `sampled=0`, `droppedNonCritical=0`, `criticalDropped=0`).

Copertura biologica osservata nelle 15 corse baseline (120 tick): **873 nascite, 552 morti, 903 uccisioni per predazione**. Nelle 30 corse osservate: **1740 riproduzioni asessuate** (cloni con mutazione): quindi mutazioni coperte dal fingerprint su genoma e brain. La riproduzione si concentra nella prima fase (saturazione delle risorse), mentre mortalità e predazione continuano per tutta la durata.

## 4. Risultati per test

| Test | Verifica | Risultato |
|---|---|---|
| fingerprint | completezza biologica e assenza di dati grafici/temporali | PASS |
| fingerprint | indipendenza dall'ordine di organismi/specie/chunk | PASS |
| A | 3 ripetizioni della stessa configurazione identiche tick per tick | PASS |
| B | `OFF_OFF` vs `OFF_ON`: stesso RNG, nascite, morti, predazioni, copertura `COMPLETE` | PASS |
| C | quattro configurazioni a confronto, rendering adattivo realmente attivo | PASS |
| D | 5 seed × 3 ripetizioni × 4 configurazioni, primo tick divergente e copertura eventi | PASS |
| rilevatore | una fingerprint alterata artificialmente viene localizzata al tick 12 | PASS |
| R1 — mutazione intermedia | mutazione iniettata durante il rendering al tick 60: rilevata al tick 60 | PASS |
| R1 — mutazione ultimo tick | mutazione iniettata durante il rendering al tick 120: rilevata al tick 120 | PASS |
| R1 — nessun falso positivo | senza mutazione, pre-render = post-render a ogni tick e nessuna divergenza | PASS |

## 5. Lista divergenze

**Vuota.**

Non esiste alcun tick in cui due configurazioni della stessa coppia seed/ripetizione abbiano fingerprint diversa. `firstDivergenceTick = null`.

## 6. Prove di sensibilità R1 (chiusura della finestra)

Le prove sono registrate nell'artefatto JSON nel blocco `postRenderIntegrity` (corse di controllo con seed 7, ripetizione 1, `ON/ON`):

| Prova | Esito |
|---|---|
| Mutazione al tick intermedio 60 | rilevata, primo tick divergente = 60 |
| Mutazione all'ultimo tick 120 | rilevata, primo tick divergente = 120 |
| Fingerprint **pre-render** dell'ultimo tick mutato | `d0f4280a…` = fingerprint del baseline: il vecchio ordine **non** avrebbe rilevato la mutazione |
| Fingerprint **post-render** dell'ultimo tick mutato | `c88824ca…` ≠ baseline: il nuovo ordine la rileva |
| Controllo senza mutazione, rendering ON | nessuna divergenza; pre-render = post-render a ogni tick |

Quindi il test di mutazione artificiale **fallisce quando deve fallire** (con il vecchio ordine pre-render l'asserzione sull'ultimo tick sarebbe falsa) e **passa quando deve passare** (con l'ordine post-render la mutazione è rilevata). La mutazione usata è deterministica e non consuma RNG: `organisms[0].energy += 1` e `organisms[0].genome.lifespan += 1`.

## 7. Confronto con la versione precedente

| Aspetto | IV1-A (pre-R1) | IV1-A-R1 |
|---|---|---|
| Schema risultati | `evoworld.iv1-a.results.v1` | `evoworld.iv1-a.results.v2` |
| Tick per corsa | 40 | 120 |
| Ordine fingerprint | pre-render (dopo lo step, prima del rendering) | **post-render** (dopo il rendering) |
| Ultimo tick coperto | no (finestra aperta) | sì (finestra chiusa e dimostrata) |
| Test di mutazione artificiale | assente | presente (intermedio + ultimo tick + controllo) |
| Corse matrice | 60 | 60 |
| Divergenze | 0 | 0 |
| `payloadSha256` | `34cb45e1734e41e0c4d92cae5f29bdc472441b71054bfeac179de212e9a055f4` | `82e1bb79a6c99d84e16139580bf83bd80e2f7567176df7bf7d65571b59ff2edb` |
| `sourceSha256` | `b514afe1b015d55a87d4b0cc3b2fbf8de396d6fa227c62bd9238a729dfb99ed5` | `45aefc5889c109c02932a86d872a7c4772ab738a33060193626ef130c1b07a10` |
| Nascite baseline (15 corse) | 870 | 873 |
| Morti baseline (15 corse) | 186 | 552 |
| Predazioni baseline (15 corse) | 627 | 903 |
| Riproduzioni asessuate osservate | 1734 | 1740 |

Entrambe le revisioni usano lo stesso codice motore (`e936756`). Il `payloadSha256` e `sourceSha256` cambiano perché cambiano durata, ordine di acquisizione, test e codice di validazione. Il risultato sostanziale è invariato — zero divergenze — ma R1 elimina la finestra non verificata e la dimostra chiusa con prove di sensibilità.

## 8. Diagnosi tecnica

Non ci sono divergenze da diagnosticare. Le ragioni strutturali verificate sono:

- il sink E2.3.1 è passivo: non usa il `Random` del motore e non scrive lo stato biologico; il confronto B mostra identici `randomState`, conteggi cumulativi e fingerprint complete;
- il percorso G3.1 legge il `RenderFrame` e aggiorna solo mesh/contatori di rendering; con rendering ON e nessuna mutazione iniettata, la fingerprint pre-render e post-render coincidono a **ogni** tick, quindi il rendering da solo non tocca lo stato biologico;
- la configurazione iniziale è applicata una sola volta in modo identico, senza consumare casualità.

Se una divergenza futura comparisse, `compareRuns()` restituisce il **primo tick** in cui le hash differiscono, le due osservazioni complete e i campi riassuntivi sospetti (`population`, `randomState`, `births`, `deaths`, `predationKills`, specie). Quando i riassunti coincidono, la diagnosi indica esplicitamente che la differenza è in campi di dettaglio (genoma, brain, posizione, energia, celle o registro specie).

## 9. Riproduzione

```powershell
$env:IV1_A_CODE_COMMIT = 'e936756c5764b9b354bdd303d297ec97a33b1966'
$env:IV1_A_BRANCH = 'validation/iv1-a-r1-post-render-fingerprint'
node node_modules/vitest/vitest.mjs run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts

node node_modules/vitest/vitest.mjs run tests/iv1/invariance.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/next/dist/bin/next build
```

Lo script principale riscrive `docs/research/iv1-a/iv1-a-invariance-results.json`; il report JSON include `payloadSha256` calcolato sui soli dati portatili, senza tempi di esecuzione.

## 10. Validazione eseguita

- `tsc --noEmit`: PASS.
- `vitest run tests/iv1/invariance.test.ts`: 10/10 PASS.
- `vitest run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts`: 1/1 PASS; 60 corse, 45 confronti, 0 divergenze; tutti i check tecnici `true` (inclusi `postRenderWindowClosed`, `intermediateMutationDetected`, `noFalsePositive`, `observabilityComplete`).
- `next build`: PASS (compilazione, TypeScript e generazione pagine statiche).
- Suite completa sul branch R1 (seconda esecuzione, output integrale): 1061 passati, 1 skip, 10 falliti su 1072 test; gli stessi 10 falliti del commit di integrazione `e936756` (`reproduction`, `fauna180`, `vibeGenomeV1110`, `planet`, `hydrology`, `settlementDefaults`). I 10 test aggiuntivi da IV1-A/R1 passano e non introducono regressioni.
- Prima esecuzione della suite completa sul branch R1: 1060 passati, 1 skip, 11 falliti. L'undicesimo fallimento era in `tests/livingBehavior.test.ts`; il file passa 26/26 in isolamento e 26/26 nella seconda esecuzione completa, quindi è flakiness da carico (non dipende da R1, che non tocca codice di produzione né quel test). Segnalato per trasparenza.

`npm run lint` non è stato usato come gate: il progetto non ha `eslint.config.js` sul ramo E2.3.1 di partenza (il merge G3 lo introduce, ma la configurazione lint non è oggetto di IV1-A).

## 11. File modificati da IV1-A-R1

- `tools/iv1/invariance.ts` — ordine post-render, hook diagnostici, sink a memoria limitata, fingerprint canonica e comparatore.
- `tests/iv1/invariance.test.ts` — test A/B/C/D aggiornati a 120 tick + suite R1 di integrità post-render.
- `scripts/iv1_invariance.experiment.ts` — script riproducibile, blocco `postRenderIntegrity` e check aggiuntivi.
- `docs/research/iv1-a/iv1-a-invariance-results.json` — risultati portatili aggiornati (schema v2).
- `docs/research/IV1_A_RENDERING_OBSERVABILITY_INVARIANCE_REPORT.md` — questo report.

Nessun file di rendering, evoluzione, ecologia o osservabilità è stato modificato da IV1-A-R1.

## 12. Limiti

- La verifica copre 5 seed, 3 ripetizioni e 120 tick per configurazione: è una prova di invarianza tecnica, non una caratterizzazione ecologica.
- La condizione iniziale energizzata serve a far comparire riproduzione, mortalità e mutazioni; non cambia le regole del motore ed è identica in tutte le configurazioni. La riproduzione si concentra nella prima fase; mortalità e predazione proseguono fino al tick 120.
- Il fingerprint include lo stato materializzato del pianeta: chunk non ancora generati non sono confrontabili perché non esistono in nessuna corsa.
- Le prove di mutazione artificiale iniettano una mutazione deterministica: verificano la sensibilità del rilevatore, non un meccanismo biologico reale.
- Non sono state modificate le soglie o i test E2.3.1 esistenti.
