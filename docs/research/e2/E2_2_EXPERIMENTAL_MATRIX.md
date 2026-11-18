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
| H1 — sequenzialità | In S06, lag del picco di cross-correlazione detrendizzata erbivori→carnivori > 0 | ≥10/12 seed con lag > 0 e `|r| >= 0.5` ⇒ EVIDENZA di sequenzialità aggregata; altrimenti INDICATIVO/NON DIMOSTRATO |
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
| Classificazione | VERIFICATO / EVIDENZA / INDICATIVO / NON DIMOSTRATO / ANOMALIA |
| Inferenza | massimo EVIDENZA; causalità non identificabile senza intervento sulle popolazioni |

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

---

## 5. Variabili dipendenti e metriche

| Categoria | Metrica | Origine |
|---|---|---|
| Serie popolazione | conteggi di tratto erbivoro/carnivoro, `population` | `tools/e2/trophic.ts` |
| Predazione | `cumulativePredationKills`, tasso intervallare, `predationPressure` snapshot | `tools/e2/trophic.ts` |
| Risorsa | `occupiedVegetation`, `occupiedLandFraction` | `tools/e2/trophic.ts` |
| Stabilità | trend (slope, R²), lag-1, CV, oscillazioni per serie | `tools/e2/timeseries.ts` via `tools/e2/trophic.ts` |
| Correlazione | lag-0 originale/detrendizzata, picco, ampiezza lag, rischio trend spurious | `tools/e2/timeseries.ts`, `tools/e2/foodWebReport.ts` |
| Coppie | erbivori↔carnivori, erbivori↔kills, carnivori↔kills, vegetazione↔erbivori, vegetazione↔carnivori | `tools/e2/foodWebReport.ts` |
| Persistenza | presenza, prima/ultimo tick, extinctionTick, frazione coesistenza | `tools/e2/trophic.ts` |
| Confronto | S06−S05 e S06−S04 appaiati su kills, tratti, coesistenza, correlazione | `tools/e2/foodWebReport.ts` |

### 5.1 Direzione dei lag

`crossCorrelation(a,b,lag)` accoppia `a[t]` con `b[t+lag]`. Pertanto:

- `a=erbivori, b=carnivori, lag>0` ⇒ carnivori osservati **dopo** erbivori (sequenzialità predatore→preda nel tempo, coerente con H1).
- `a=erbivori, b=kills, lag>0` ⇒ kills osservate **dopo** l'abbondanza erbivora.
- `a=vegetazione, b=erbivori, lag>0` ⇒ tratto erbivoro osservato **dopo** il proxy di risorsa.

Con `sampleEvery=10`, solo lag multipli di 10 tick sono stimabili; il picco va letto con risoluzione di 10 tick. Il confronto tra blocchi a cadenza diversa usa la griglia di lag comune (multipli di 20 tick).

---

## 6. Regole di sensibilità e decisione

| Asse | Confronto | Cosa può cambiare la conclusione |
|---|---|---|
| Seed | A (1–12) vs B (13–24) | segno del lag, frazione di seed con sequenzialità, kills cumulative |
| Durata | A (2700) vs C (900), più troncamento A→900 | persistenza, correlazioni: un pattern solo a 2700 è "dipendente dall'orizzonte" |
| Campionamento | A (10) vs D (5) e A→20 | risoluzione del lag, ampiezza del picco, stabilità |

**Regola di robustness:** una conclusione è *stabile* se mantiene la stessa classe in A e B, in A e C, e sulla griglia di lag comune A/D/A→20. Altrimenti è classificata **INDICATIVO** con esplicita dipendenza dal disegno.

**Gate E2.2 → E2.3:** se non emerge lag preda-predatore, non inferire assenza di dipendenza; verificare A04 (immunità apicale) e A01 (bucket non toroidali) prima di qualsiasi affermazione trofica.

---

## 7. Consegne e verifiche

- Audit trofico: [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md)
- Matrice: questo documento
- Strumenti: `tools/e2/trophic.ts`, `tools/e2/foodWebReport.ts` (+ estensione additiva di `tools/e2/scenarios.ts`)
- Test: `tests/e2/trophic.test.ts`, `tests/e2/foodWebReport.test.ts`
- Script: `scripts/e2_foodweb.experiment.ts`, `scripts/e2_foodweb_sensitivity.experiment.ts`, `scripts/e2_foodweb_dataset.experiment.ts`
- Output: 5 payload JSON + archivio `e2.2-foodweb.json.gz` e manifest
- Report finale: `docs/research/e2/E2_2_FOOD_WEB_REPORT.md`
- Verifiche: `npx tsc --noEmit --incremental false`, `npm run build`, suite E2 e E1, diff file vietati vuoto
