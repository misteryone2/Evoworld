# IV1-A — Invarianza biologica sotto G3.1 adaptive rendering ed E2.3.1 observability

## 1. Esito

**PASS.** Nessuna divergenza biologica rilevata.

- 60 corse complete (5 seed × 3 ripetizioni × 4 configurazioni).
- 45 confronti tick-per-tick contro il baseline `OFF/OFF` della stessa coppia seed/ripetizione.
- 0 divergenze, primo tick divergente: `null`.
- Stesso fingerprint biologico finale per ogni quadrupla seed/ripetizione, indipendentemente da rendering e osservabilità.
- Nessuna conclusione ecologica nuova: questo esperimento verifica solo l'invarianza del motore.

Artefatto leggibile: [`iv1-a/iv1-a-invariance-results.json`](iv1-a/iv1-a-invariance-results.json).

| Campo | Valore |
|---|---|
| Schema risultati | `evoworld.iv1-a.results.v1` |
| Schema fingerprint | `evoworld.iv1-a.biological-state.v1` |
| Branch | `iv1-a-rendering-observability-invariance` |
| Base osservabilità | `research/e2-ecosystem-dynamics` @ `52178e56787d91ab6324a36a0f39a9a2d531b15f` |
| Branch rendering integrato | `graphics/g3-renderer-integration` @ `717da65` |
| Commit di integrazione | `e936756c5764b9b354bdd303d297ec97a33b1966` |
| `payloadSha256` report | `34cb45e1734e41e0c4d92cae5f29bdc472441b71054bfeac179de212e9a055f4` |
| `sourceSha256` sorgenti validate | `b514afe1b015d55a87d4b0cc3b2fbf8de396d6fa227c62bd9238a729dfb99ed5` |

`main` non è stato modificato. Non sono stati creati merge o PR verso `main`, né modificati i branch G o E2.3.1. L'unico merge presente è quello locale sul branch IV1-A che integra G3.1 nel ramo E2.3.1 per poter testare le due funzionalità insieme.

## 2. Metodo di confronto

La fingerprint è `sha256(stableStringify(canonicalBiologicalState))`, calcolata sullo stato **dopo ogni step**, inclusa la configurazione iniziale (tick 0). Il numero di osservazioni per corsa è quindi 41 (tick 0 + 40 tick).

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

L'ordine di organismi, registro specie e chunk viene normalizzato rispettivamente per `id`, `speciesId` e `key`; gli array semanticamente ordinati (brain, celle row-major) sono preservati. Un test dedicato verifica che invertire l'ordine di quelle collezioni non cambi la fingerprint.

## 3. Condizioni e matrice

Per tutte le corse: mondo 32×32, 60 fondatori, 40 tick, geni avanzati attivi. Condizione iniziale identica e deterministiche per ogni configurazione: energia 220, fertilità 20, età `ceil(lifespan × 0.25)`. Questa trasformazione non consuma RNG ed è applicata solo alle condizioni iniziali, non al motore.

| Configurazione | Rendering G3.1 | Observability E2.3.1 | Corse | Esito |
|---|---|---|---|---|
| `OFF_OFF` | OFF | OFF (sink nullo) | 15 | baseline |
| `ON_OFF` | ON, adaptive | OFF (sink nullo) | 15 | uguale al baseline |
| `OFF_ON` | OFF | ON, `scientific_full`, tutti i tipi, snapshot ogni tick | 15 | uguale al baseline |
| `ON_ON` | ON, adaptive | ON, `scientific_full` | 15 | uguale al baseline |

Il rendering ON esercita il percorso adattivo con `farStride=4`, `nearDistanceScales=8`, sorgente anatomica G2 e refresh periodico del viewport. Il sink ON emette eventi reali; non è un semplice no-op.

Copertura biologica osservata nelle 15 corse baseline: 870 nascite, 186 morti, 627 uccisioni per predazione. Nelle corse osservate: 1734 riproduzioni asessuate, cioè cloni con mutazione: quindi mutazioni coperte dal fingerprint su genoma e brain.

## 4. Risultati per test

| Test | Verifica | Risultato |
|---|---|---|
| fingerprint | completezza biologica e assenza di dati grafici/temporali | PASS |
| fingerprint | indipendenza dall'ordine di organismi/specie/chunk | PASS |
| A | 3 ripetizioni della stessa configurazione identiche tick per tick | PASS |
| B | `OFF_OFF` vs `OFF_ON`: stesso RNG, nascite, morti, predazioni | PASS |
| C | quattro configurazioni a confronto | PASS |
| D | 5 seed × 3 ripetizioni, primo tick divergente e copertura eventi | PASS |
| rilevatore | una fingerprint alterata artificialmente viene localizzata al tick 12 | PASS |

## 5. Lista divergenze

**Vuota.**

Non esiste alcun tick in cui due configurazioni della stessa coppia seed/ripetizione abbiano fingerprint diversa. `firstDivergenceTick = null`.

## 6. Diagnosi tecnica

Non ci sono divergenze da diagnosticare. Le ragioni strutturali verificate sono:

- il sink E2.3.1 è passivo: non usa il `Random` del motore e non scrive lo stato biologico; il confronto B mostra identici `randomState`, conteggi cumulativi e fingerprint complete;
- il percorso G3.1 legge il `RenderFrame` e aggiorna solo mesh/contatori di rendering; il fingerprint viene calcolato prima e indipendentemente da ogni chiamata al renderer;
- la configurazione iniziale è applicata una sola volta in modo identico, senza consumare casualità.

Se una divergenza futura comparisse, `compareRuns()` restituisce il **primo tick** in cui le hash differiscono, le due osservazioni complete e i campi riassuntivi sospetti (`population`, `randomState`, `births`, `deaths`, `predationKills`, specie). Quando i riassunti coincidono, la diagnosi indica esplicitamente che la differenza è in campi di dettaglio (genoma, brain, posizione, energia, celle o registro specie).

## 7. Riproduzione

```powershell
$env:IV1_A_CODE_COMMIT = 'e936756c5764b9b354bdd303d297ec97a33b1966'
node node_modules/vitest/vitest.mjs run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts

node node_modules/vitest/vitest.mjs run tests/iv1/invariance.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/next/dist/bin/next build
```

Lo script principale riscrive `docs/research/iv1-a/iv1-a-invariance-results.json`; il report JSON include `payloadSha256` calcolato sui soli dati portatili, senza tempi di esecuzione.

## 8. Validazione eseguita

- `tsc --noEmit`: PASS.
- `vitest run tests/iv1/invariance.test.ts`: 7/7 PASS.
- `vitest run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts`: 1/1 PASS; 60 corse, 45 confronti, 0 divergenze; tutti i check tecnici `true`.
- `next build`: PASS (dopo pulizia di `.next`; il primo tentativo con `.next` copiato da un altro worktree ha fallito per un errore interno Turbopack di scrittura chunk, non per codice).
- Suite completa sul branch IV1-A: 1058 passati, 1 skip, 10 falliti.
- Suite completa sul commit di integrazione `e936756` senza file IV1-A: 1051 passati, 1 skip, gli **stessi 10 falliti** (`reproduction`, `fauna180`, `vibeGenomeV1110`, `planet`, `hydrology`, `settlementDefaults`). I 7 test aggiuntivi sono quindi tutti passanti e non introducono regressioni.

`npm run lint` non è stato usato come gate: il progetto non ha `eslint.config.js` sul ramo E2.3.1 di partenza (il merge G3 lo introduce, ma la configurazione lint non è oggetto di IV1-A).

## 9. File modificati da IV1-A

- `tools/iv1/invariance.ts` — fingerprint canonica, runner e comparatore tick-per-tick.
- `tests/iv1/invariance.test.ts` — test automatici A/B/C/D e controllo del rilevatore.
- `scripts/iv1_invariance.experiment.ts` — script riproducibile e generazione del report JSON.
- `docs/research/iv1-a/iv1-a-invariance-results.json` — risultati portatili.
- `docs/research/IV1_A_RENDERING_OBSERVABILITY_INVARIANCE_REPORT.md` — questo report.

Nessun file di rendering, evoluzione, ecologia o osservabilità è stato modificato da IV1-A.

## 10. Limiti

- La verifica copre 5 seed, 3 ripetizioni e 40 tick per configurazione: è una prova di invarianza tecnica, non una caratterizzazione ecologica.
- La condizione iniziale energizzata serve a far comparire riproduzione, mortalità e mutazioni entro 40 tick; non cambia le regole del motore ed è identica in tutte le configurazioni.
- Il fingerprint include lo stato materializzato del pianeta: chunk non ancora generati non sono confrontabili perché non esistono in nessuna corsa.
- Non sono state modificate le soglie o i test E2.3.1 esistenti.
