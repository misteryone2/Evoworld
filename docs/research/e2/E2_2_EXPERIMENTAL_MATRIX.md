# E2.2 — Matrice sperimentale: Food Web Dynamics

**Fase:** E2.2
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
**Data:** 2026-11-18
**Stato:** disegno approvato per esecuzione; audit in [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md).

---

## 1. Domanda e ipotesi

**Domanda centrale:** i carnivori (etichetta di tratto) seguono erbivori, uccisioni registrate e proxy di risorsa con un ritardo temporale misurabile, e i gruppi trofici persistono su orizzonti lunghi?

| Ipotesi | Operazionalizzazione | Criterio di classificazione |
|---|---|---|
| H1 — sequenzialità | In S06, lag del picco di cross-correlazione detrendizzata erbivori→carnivori > 0 | EVIDENZA solo se direzione descrittiva consistente **e** Fisher p<0,05 dei test IAAFT con massimo su tutti i lag; altrimenti INDICATIVO_POSITIVO/NON_DIMOSTRATO. `|r|` e conteggio seed non sono significatività |
| H2 — collasso preda→predatore | In S06, il tratto carnivoro scompare dopo il tratto erbivoro nello stesso seed | conteggio di seed con `extinctionTick(carnivoro) > extinctionTick(erbivoro)`; descrittivo |
| H3 — kills basse in S05 | `cumulativePredationKills` in S05 ≈ 0 | coerente con A04 (nessuna preda a carnivoria inferiore); **non** prova assenza di dipendenza trofica |
| H4 — persistenza | S06 mantiene coesistenza dei due tratti per una frazione sostanziale dell'orizzonte | frazione di seed con coesistenza >50% dei campioni |
| H5 — robustezza | Le conclusioni H1–H4 sopravvivono a cambio di seed, durata e cadenza | tabelle di sensibilità; differenze riportate come tale |

**Ipotesi nulla operativa (H0):** nessuna sequenzialità consistente; le correlazioni osservate sono descrittive o dovute a trend comuni.

---

## 2. Protocollo comune

| Elemento | Regola |
|---|---|
| Infrastruttura | E1 immutato (`tools/e1/**`); analisi additiva in `tools/e2/**` |
| Seed | `1..12` (blocco primario), `13..24` (replica di sensibilità) |
| Unità statistica | corsa/seed; **mai** tick di una singola corsa |
| Confronti | appaiati per seed (`pairedDifference` E1 via `tools/e2/statistics.ts`); non randomizzati ⇒ descrittivi |
| Orizzonte primario | 2700 tick (~6.75 anni), `sampleEvery=10` ⇒ 271 punti/corsa |
| Lag massimo | `E2_FOODWEB_MAX_LAG=200` tick (=20 campioni a `sampleEvery=10`); **intero obbligatorio**, i lag sono in tick |
| Runtime | Node `v22.14.0`, V8 `12.4.254.21-node.22` |
| Output grezzo | JSON con `schema`, `env`, `protocol`, `scientificReport`, `results`, `runtime` |
| Classificazione | `EVIDENZA_SEQUENZIALITA_POSITIVA/NEGATIVA` / `INDICATIVO_POSITIVO/NEGATIVO/MISTO` / `NON_DIMOSTRATO`; la causalità resta `NON_IDENTIFICABILE` |
| Inferenza | EVIDENZA solo con test surrogato IAAFT significante e direzione descrittiva consistente; tick non sono repliche; `|r|` e concordanza di seed non bastano |

---

## 3. Scenari e ruoli

| ID E1 | Setup | Geometria / fondatori | Ruolo in E2.2 |
|---|---|---|---|
| `S04_herbivore_monoculture` | `herbivore` (`carnivory=0.05`) | 128×128 / 150 | controllo senza predazione attesa (A04) |
| `S05_carnivore_stress` | `carnivore` (`carnivory=0.6`) | 128×128 / 150 | tutti sopra soglia di caccia ma sotto soglia apicale: kills attese ≈0 |
| `S06_predator_prey_mixed` | `mixed` (`0.05`/`0.6`, `speciesId` 1/2) | **160×160 / 180** (90/90) | sistema preda-predatore; teatro principale di H1/H2/H4 |

I setup mutano **solo le condizioni iniziali**. Il confronto S06−S05 e S06−S04 è confuso per geometria/densità (correzione del drift documentata nell'audit §4.1): deve essere etichettato "descrittivo, non isolato".

---

## 4. Blocchi sperimentali

| Blocco | Script | Seeds | Tick | sampleEvery | Scenari | Corse | Scopo |
|---|---|---|---|---|---|---|---|
| **A — primario** | `e2_foodweb.experiment.ts` | 1–12 | 2700 | 10 | S04,S05,S06 | 36 | risultati principali |
| **B — replica seed** | `e2_foodweb.experiment.ts` | 13–24 | 2700 | 10 | S04,S05,S06 | 36 | sensibilità al seed |
| **C — durata** | `e2_foodweb.experiment.ts` | 1–12 | 900 | 10 | S04,S05,S06 | 36 | sensibilità all'orizzonte |
| **D — campionamento fine** | `e2_foodweb.experiment.ts` | 1–12 | 2700 | 5 | S06 | 12 | sensibilità alla cadenza |
| **S — aggregazione** | `e2_foodweb_sensitivity.experiment.ts` | — | — | — | — | 0 | confronto A/B/C/D + derivate |
| **DS — dataset** | `e2_foodweb_dataset.experiment.ts` | — | — | — | — | 0 | archivio + manifest |

Totale **120 corse nuove**. Derivate senza corse aggiuntive:
- **troncamento A→900**: rielaborazione di A con `samples.filter(tick<=900)` — deve coincidence con C (seed identici, motore deterministico) ⇒ controllo di riproducibilità.
- **sottocampionamento A→`sampleEvery=20`**: rielaborazione di A prendendo un campione ogni 2 ⇒ stima della sensitività a cadenza più grossolana. I lag stimabili sono multipli di 20 tick.

### 4.1 Comandi di riproduzione

```bash
# Blocco A
E2_FOODWEB_LABEL=main E2_FOODWEB_SEEDS=1,2,3,4,5,6,7,8,9,10,11,12 \
E2_FOODWEB_TICKS=2700 E2_FOODWEB_SAMPLE_EVERY=10 E2_FOODWEB_MAX_LAG=200 \
E2_FOODWEB_OUT=<out>/e2.2-main.json \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts

# Blocchi B/C/D: cambiare LABEL/SEEDS/TICKS/SAMPLE_EVERY (D usa SOLO S06)
E2_FOODWEB_SCENARIOS=S06_predator_prey_mixed ...

# Aggregazione sensibilità
E2_FOODWEB_SENS_MAIN=<A> E2_FOODWEB_SENS_SEED=<B> \
E2_FOODWEB_SENS_DURATION=<C> E2_FOODWEB_SENS_SAMPLING=<D> \
E2_FOODWEB_SENS_OUT=<out>/e2.2-sensitivity.json \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts

# Dataset (codice committato, working tree pulita, timestamp fissato)
E2_FOODWEB_DATASET_MAIN=<A> E2_FOODWEB_DATASET_SEED=<B> \
E2_FOODWEB_DATASET_DURATION=<C> E2_FOODWEB_DATASET_SAMPLING=<D> \
E2_FOODWEB_DATASET_SENSITIVITY=<S> \
E2_FOODWEB_DATASET_CODE_COMMIT=<commit> E2_FOODWEB_DATASET_WORKING_TREE_DIRTY=0 \
E2_FOODWEB_DATASET_EXECUTED_AT=<ISO> E2_FOODWEB_DATASET_OUT_DIR=docs/research/e2/datasets \
E2_FOODWEB_DATASET_LABEL=e2.2-foodweb \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts
```

Solo i file `scripts/e2*.ts` vengono invocati: nessuna modifica a E1 o al motore.

### 4.2 Rigenerazione review (senza rieseguire il motore)

```bash
# Analisi corrette dai quattro blocchi grezzi originali
E2_FOODWEB_REANALYSIS_MAIN=<A> E2_FOODWEB_REANALYSIS_SEED=<B> \
E2_FOODWEB_REANALYSIS_DURATION=<C> E2_FOODWEB_REANALYSIS_SAMPLING=<D> \
E2_FOODWEB_REANALYSIS_{MAIN,SEED,DURATION,SAMPLING}_OUT=<review>/... \
E2_FOODWEB_REANALYSIS_EXECUTED_AT=2026-11-18T13:00:00.000Z \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_reanalysis.experiment.ts

# Aggregazione della sensibilità dai report corretti
E2_FOODWEB_SENS_MAIN=<review>/main E2_FOODWEB_SENS_SEED=<review>/seed \
E2_FOODWEB_SENS_DURATION=<review>/duration E2_FOODWEB_SENS_SAMPLING=<review>/sampling \
E2_FOODWEB_SENS_OUT=<review>/sensitivity.json \
E2_FOODWEB_SENS_EXECUTED_AT=2026-11-18T13:10:00.000Z \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts

# Validazione review e dataset corretto
E2_FOODWEB_VALIDATION_RAW_{MAIN,SEED,DURATION,SAMPLING}=<raw>/... \
E2_FOODWEB_VALIDATION_REVIEW_{MAIN,SEED,DURATION,SAMPLING}=<review>/... \
E2_FOODWEB_VALIDATION_ORIGINAL_MANIFEST=docs/research/e2/datasets/e2.2-foodweb.manifest.json \
E2_FOODWEB_VALIDATION_ORIGINAL_ARCHIVE=docs/research/e2/datasets/e2.2-foodweb.json.gz \
E2_FOODWEB_VALIDATION_OUT=<review>/validation.json \
E2_FOODWEB_VALIDATION_EXECUTED_AT=2026-11-18T13:20:00.000Z \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_review_validation.experiment.ts

E2_FOODWEB_DATASET_* E2_FOODWEB_DATASET_LABEL=e2.2-foodweb-review \
E2_FOODWEB_DATASET_CODE_COMMIT=<code-commit> E2_FOODWEB_DATASET_WORKING_TREE_DIRTY=0 \
E2_FOODWEB_DATASET_EXECUTED_AT=2026-11-18T13:30:00.000Z \
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts
```

---

## 5. Variabili dipendenti e metriche

| Categoria | Metrica | Origine |
|---|---|---|
| Serie popolazione | conteggi di tratto erbivoro/carnivoro, `population` | `tools/e2/trophic.ts` |
| Predazione | `cumulativePredationKills`, tasso intervallare, `predationPressure` snapshot | `tools/e2/trophic.ts` |
| Risorsa | `occupiedVegetation`, `occupiedLandFraction` | `tools/e2/trophic.ts` |
| Stabilità | trend (slope, R²), lag-1, CV, oscillazioni per serie | `tools/e2/timeseries.ts` via `tools/e2/trophic.ts` |
| Correlazione | lag-0 originale/detrendizzata, picco, segno(r)×segno(lag), diagnostica lag, rischio trend spurious, null IAAFT | `tools/e2/timeseries.ts`, `tools/e2/fourier.ts`, `tools/e2/surrogateInference.ts`, `tools/e2/foodWebReport.ts` |
| Coppie | erbivori↔carnivori, erbivori↔kills, carnivori↔kills, vegetazione↔erbivori, vegetazione↔carnivori | `tools/e2/foodWebReport.ts` |
| Persistenza | presenza, prima/ultimo tick, extinctionTick, frazione coesistenza | `tools/e2/trophic.ts` |
| Confronto | S06−S05 e S06−S04 appaiati su kills, tratti, coesistenza, correlazione | `tools/e2/foodWebReport.ts` |

### 5.1 Direzione dei lag

`crossCorrelation(a,b,lag)` accoppia `a[t]` con `b[t+lag]`. Pertanto:

- `a=erbivori, b=carnivori, lag>0` ⇒ carnivori osservati **dopo** erbivori (sequenzialità preda→predatore nel tempo, coerente con H1).
- `a=erbivori, b=kills, lag>0` ⇒ kills osservate **dopo** l'abbondanza erbivora.
- `a=vegetazione, b=erbivori, lag>0` ⇒ tratto erbivoro osservato **dopo** il proxy di risorsa.

Con `sampleEvery=10`, solo lag multipli di 10 tick sono stimabili; il picco va letto con risoluzione di 10 tick. Il confronto tra blocchi a cadenza diversa usa la griglia di lag comune (multipli di 20 tick). La diagnostica obbligatoria distingue lag nominali (`2*maxLag+1`), lag sulla griglia, lag senza coppie, lag accettati, minima sovrapposizione e perdita di coppie ai lag estremi. Con `maxLag=200` e 271 punti: 401 nominali, 41 sulla griglia, 360 senza coppie, 41 accettati, 251 coppie minime, perdita estrema ≈7,38%.

---

## 6. Regole di sensibilità e decisione

| Asse | Confronto | Cosa può cambiare la conclusione |
|---|---|---|
| Seed | A (1–12) vs B (13–24) | segno del lag, frazione di seed con sequenzialità, kills cumulative |
| Durata | A (2700) vs C (900), più troncamento A→900 | persistenza, correlazioni: un pattern solo a 2700 è "dipendente dall'orizzonte" |
| Campionamento | A (10) vs D (5) e A→20 | risoluzione del lag, ampiezza del picco, stabilità |

**Regola di robustness:** una conclusione è *stabile* se mantiene la stessa classe (direzione inclusa) in A e B, in A e C, e sulla griglia di lag comune A/D/A→20. Altrimenti è classificata **INDICATIVO** con esplicita dipendenza dal disegno. La significatività non è dedotta dalla stabilità descrittiva: richiede il test surrogato e la correzione del massimo sui lag.

**Gate E2.2 → E2.3:** se non emerge lag preda-predatore, non inferire assenza di dipendenza; verificare A04 (immunità apicale) e A01 (bucket non toroidali) prima di qualsiasi affermazione trofica.

---

## 7. Consegne e verifiche

- Audit trofico: [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md)
- Matrice: questo documento
- Strumenti: `tools/e2/trophic.ts`, `tools/e2/timeseries.ts`, `tools/e2/fourier.ts`, `tools/e2/surrogateInference.ts`, `tools/e2/foodWebReport.ts` (+ estensione additiva di `tools/e2/scenarios.ts`)
- Test: `tests/e2/trophic.test.ts`, `tests/e2/timeseries.test.ts`, `tests/e2/foodWebReport.test.ts`
- Script: `scripts/e2_foodweb.experiment.ts`, `scripts/e2_foodweb_reanalysis.experiment.ts`, `scripts/e2_foodweb_sensitivity.experiment.ts`, `scripts/e2_foodweb_review_validation.experiment.ts`, `scripts/e2_foodweb_dataset.experiment.ts`
- Output: 4 payload grezzi + 4 report review + sensibilità + validazione + archivi `e2.2-foodweb.json.gz` (immutato) e `e2.2-foodweb-review.json.gz`
- Report finale: `docs/research/e2/E2_2_FOOD_WEB_REPORT.md`
- Verifiche: `npx tsc --noEmit --incremental false`, `npm run build`, suite E2 e E1, diff file vietati vuoto
