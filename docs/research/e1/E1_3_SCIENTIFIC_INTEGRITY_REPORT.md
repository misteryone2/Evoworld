# E1.3 — Scientific Integrity & Statistical Validation

**Branch:** `research/e1-ecosystem-qa` · **PR:** #2 (aperta, **non** integrata in `main`) · **Base:** `origin/main` `db86444` · **Baseline:** `d1e2b5b` (E1.2).

Le fasi E1.0 (`9cfb12a`) ed E1.1 (`a60148b`) restano archiviate immutate nei rispettivi report. E1.2 è il baseline pre-correzione: nessun suo numero è stato riscritto; i suoi risultati sono stati conservati come dataset storico.

## 1. Anomalie individuate

| # | Anomalia | Impatto |
|---|---|---|
| A1 | `tools/e1/metrics.ts::wrapCellCoord()` usava `Math.round()`, mentre `Planet.wrapCoord()` / `peekCell()` usano `Math.floor()` | Per ogni posizione frazionaria E1 leggeva la cella successiva; gli scenari S09/S10/S13/S14 assegnano posizioni al centro delle celle (`x+0.5, y+0.5`), quindi la vegetazione occupata era attribuita alla cella sbagliata |
| A2 | I confronti E1.2 (2×2 habitat e cull) usavano solo la differenza tra medie di gruppi indipendenti, pur avendo 12 seed identici in tutti gli scenari | Il disegno appaiato non veniva sfruttato: mancavano differenze per seed, dispersione delle differenze e IC95 del contrasto |
| A3 | La documentazione di `planPerturbation()` e il report E1.2 affermavano che ogni specie conserva `ceil(n_species/5)` | Il codice usa invece una quota **totale** `ceil(N/5)` ripartita per maggiori resti: la documentazione non descriveva il comportamento reale |
| A4 | L'output di 84 corse di E1.2 era rimasto in un JSON locale, senza commit/versione, checksum o protocollo allegato | I risultati non erano verificabili né riproducibili in modo autonomo |

Nessuna di queste anomalie richiedeva una modifica al motore: `simulation/**`, regole biologiche, geni/genomi, mutazioni, ereditarietà, selezione, riproduzione, metabolismo, predazione, comportamento, renderer, G1/G1-b, G2, `lib/anatomy/**`, `lib/phenotype/**` e formati di salvataggio non sono stati toccati.

## 2. Correzioni effettuate

| Anomalia | Correzione | File |
|---|---|---|
| A1 | `wrapCellCoord()` esportata, ora `Math.floor(value) % size` con wrap dei negativi, identica a `Planet.wrapCoord()`; commento che documenta il centro di cella | `tools/e1/metrics.ts` |
| A2 | `pairedDifference()` / `seedValues()` con differenze per seed, media, SD campionaria, min/max, IC95 t di Student (n−1), `validPairs`, seed mancanti; duplicati → errore; integrazione in habitat/cull e campo `pairedComparisons` del report | `tools/e1/statistics.ts` |
| A3 | Documentazione riscritta: quota totale `ceil(N/5)`, quote base `floor(n_i/5)`, seggi residui ai maggiori resti con tie-break su `speciesId`, limite `n_i`; vecchio assert nei test sostituito e nuovi casi aggiunti | `tools/e1/initialConditions.ts`, `tests/e1/e1_metrics.test.ts`, `tests/e1/e1_perturbation.test.ts` |
| A4 | Payload canonico gzip + manifest con `payloadSha256`, `archiveSha256`, commit, timestamp, `sourceSha256`, protocollo e comando di riproduzione; controllo automatico di assenza di percorsi assoluti/email | `tools/e1/dataset.ts`, `scripts/e1_dataset.experiment.ts`, `docs/research/e1/datasets/` |
| Verifica | Confronto campo per campo prima/dopo: solo i quattro campi spaziali possono cambiare; ogni altra differenza fa fallire lo script | `tools/e1/comparison.ts`, `scripts/e1_compare.experiment.ts`, `tests/e1/e1_comparison.test.ts` |

Test aggiunti: `e1_spatial.test.ts` (confronto diretto con `peekCell()` su interi, frazionari, centri di cella, bordi, wrap e S09/S10/S13/S14), `e1_statistics.test.ts` (coppie complete/incomplete, seed mancanti/duplicati, ordini non ordinati, riproducibilità, integrazione), `e1_perturbation.test.ts` (specie di dimensioni diverse, singolo organismo, molte specie piccole, `N` non divisibile per 5, ordine invertito, determinismo, RNG invariato), `e1_dataset.test.ts`, `e1_comparison.test.ts`.

## 3. Nuove definizioni statistiche

Per ogni contrasto tra scenari `A` e `B` con gli stessi seed:

- coppie valide: `S = { seed | seed ∈ A ∧ seed ∈ B }`, `n = |S|`;
- differenza individuale: `d_i = A_i − B_i` per `i ∈ S`, ordinata per seed;
- media: `d̄ = Σ d_i / n`;
- deviazione standard **campionaria**: `s = sqrt(Σ (d_i − d̄)² / (n − 1))`;
- min/max: estremi delle `d_i`;
- **IC95%**: `d̄ ± t_{0.975, n−1} · s / √n` (t di Student; `n = 12` → `t = 2.201`). Con `n = 1` l'IC non viene calcolato;
- completezza: seed presenti solo in `A` o solo in `B` sono dichiarati in `missingInB` / `missingInA`; seed duplicati in uno dei due gruppi generano un errore, perché il disegno appaiato richiede un'unica osservazione per seed.

`meanDifference` resta nel report come differenza descrittiva tra medie di gruppo indipendenti, per continuità con E1.2; **non** sostituisce il confronto appaiato. Né l'IC95 né la differenza media sono prove causali: i 12 seed non sono stati randomizzati e le repliche non sono unità biologiche indipendenti.

## 4. Protocollo e risultati aggiornati

Eseguito il 17 novembre 2026 con Node `v22.14.0` (V8 `12.4.254.21-node.22`): **12 seed × 7 scenari = 84 corse**, 900 tick ciascuna, campione ogni 50 tick (19 campioni per corsa, **1596 campioni** confrontati). Comando e parametri esatti nel manifest del dataset e nella sezione 10.

| Scenario | Corse | Pop. finale media | SD | IC95 | Estinzione | Speciazione |
|---|---:|---:|---:|---|---|---|
| S01_stability_baseline | 12 | 22.5833 | 8.6493 | [17.0878, 28.0789] | 0/12 | 0/12 |
| S06_predator_prey_mixed | 12 | 35.4167 | 11.0656 | [28.3859, 42.4474] | 0/12 | 0/12 |
| S08_recovery_after_cull80 | 12 | 5.7500 | 2.7675 | [3.9916, 7.5084] | 0/12 | 0/12 |
| S09_poor_habitat | 12 | 14.9167 | 5.4682 | [11.4423, 18.3910] | 0/12 | 0/12 |
| S10_rich_habitat | 12 | 21.1667 | 4.5092 | [18.3016, 24.0317] | 0/12 | 0/12 |
| S13_poor_position_rich_resources | 12 | 16.9167 | 5.5671 | [13.3795, 20.4538] | 0/12 | 0/12 |
| S14_rich_position_poor_resources | 12 | 19.0000 | 5.0990 | [15.7602, 22.2398] | 0/12 | 0/12 |

Complessivamente: estinzione **0/84**, speciazione **0/84** a 900 tick. I valori non spaziali sono **identici al baseline E1.2** (verificato campo per campo nella sezione 6): la correzione ha cambiato solo la cella letta per le metriche di habitat, non la traiettoria biologica.

Cull di S08 al tick 450 (12/12 campioni con `denominatorMatchesStart = true`): popolazione a inizio step media **25.2500** (SD 4.0028, 19–34); rimossi **19.8333** in media (SD 3.2706, 15–27); conservati **5.4167** (SD 0.7930, 4–7). In **12/12 corse** i conservati sono esattamente `ceil(N/5)` sulla popolazione a inizio step, coerente con la quota totale e la ripartizione per maggiori resti descritte in E1.3, non con `ceil(n_species/5)` per specie.

## 5. Confronti appaiati per seed

Tutti e cinque i contrasti hanno **12 coppie valide**, senza seed mancanti né duplicati. `d = A − B` è la differenza per seed della popolazione finale.

| Contrasto | Significato | Media `d` | SD | min | max | IC95 |
|---|---|---:|---:|---:|---:|---|
| S13 − S09 | risorse ricche vs povere, posizione povera | 2.0000 | 3.9772 | −6 | 8 | [−0.5270, 4.5270] |
| S10 − S14 | risorse ricche vs povere, posizione ricca | 2.1667 | 6.1027 | −7 | 16 | [−1.7108, 6.0441] |
| S14 − S09 | posizione ricca vs povera, risorse povere | 4.0833 | 6.9995 | −9 | 15 | [−0.3639, 8.5306] |
| S10 − S13 | posizione ricca vs povera, risorse ricche | 4.2500 | 5.2071 | −4 | 13 | [0.9416, 7.5584] |
| S08 − S01 | effetto del cull, popolazione finale | −16.8333 | 6.9783 | −32 | −8 | [−21.2672, −12.3995] |

Osservazioni:

- Con 12 coppie complete la media delle differenze coincide algebraicamente con la differenza tra medie di gruppo pubblicata in E1.2: il valore puntuale non cambia, ma l'analisi appaiata aggiunge la **dispersione delle differenze individuali** e il loro **IC95**, che il confronto E1.2 non forniva.
- L'IC95 esclude lo zero solo per **S10 − S13** (effetto posizione con risorse ricche) e per **S08 − S01** (cull). Per i primi tre contrasti l'intervallo include lo zero: i dati non consentono di distinguere l'effetto dal rumore dei seed con questa numerosità.
- **Questi numeri non sono una prova causale.** I 12 seed non sono stati randomizzati, ciascun seed è usato in tutti gli scenari e le repliche non sono unità biologiche indipendenti. L'appaiamento controlla solo la componente di variabilità legata al seed. Le differenze vanno lette come descrittive di queste 84 corse, non come stime di un effetto generale del modello.

Le differenze per seed, l'ordine delle coppie e gli IC sono nel payload `metrics.pairedComparisons` del dataset (`pairedDifference()` in `tools/e1/statistics.ts`).

## 6. Confronto prima/dopo: isolamento della correzione spaziale

**Il confronto ufficiale usa Node `v22.14.0`, lo stesso runtime del baseline.** Una prima esecuzione con Node `v26.13.1` (exit 0, 447.91 s) è stata **scartata** come confronto: produceva **583 differenze non spaziali**. La diagnosi è una divergenza di toolchain, non della correzione: il motore non usa `Math.random()` (PRNG mulberry32, `simulation/core/random.ts`), ma impiega funzioni trascendenti (`Math.sin` in `seasons.ts`, `Math.pow` in `organism.ts` e `planet.ts`, `Math.exp` in `environment.ts`) i cui ultimi bit possono variare tra versioni di V8 e amplificarsi dopo centinaia di tick. Esempio osservato: corse identiche fino al tick 250 per il seed 1 e divergenza della popolazione al tick 500 per il seed 2. Rieseguendo con Node 22 la divergenza scompare, confermando che la causa è il runtime.

Confronto ufficiale (exit 0, 2.18 s): **84 → 84 corse, 84 abbinate, 1596 campioni**:

- `biologicalInvariance = true`, `descriptiveStatisticsIdentical = true`;
- **0** differenze non spaziali, **0** corse mancanti o in eccesso;
- solo quattro campi spaziali possono cambiare, e infatti cambiano così:

| Campo | Corse cambiate | Campioni cambiati | massimo delta assoluto |
|---|---:|---:|---:|
| `occupiedVegetation` | 84/84 | 1596/1596 | 0.4442 |
| `occupiedLandFraction` | 84/84 | 1518/1596 | 0.8571 |
| `organismsSampled` | 0/84 | 0/1596 | 0 |
| `occupiedCellsSampled` | 52/84 | 152/1596 | 2 |

`organismsSampled` resta identico in tutti i campioni: la correzione non cambia *quanti* organismi vengono campionati, ma *quale cella* viene letta per ciascuno. `occupiedCellsSampled` cambia in 52 corse perché `Math.floor` e `Math.round` producono chiavi di cella distinte diverse, specialmente per le posizioni al centro di cella. Popolazioni, nascite, mortalità, predazione, tassi, specie e genetica sono bit-per-bit identici: l'effetto della correzione è confinato alle metriche spaziali, come previsto.

## 7. Dataset riproducibile e provenance

| Artefatto | Contenuto | SHA-256 (archivio gzip) |
|---|---|---|
| `e1-phase2-baseline.json.gz` | 84 corse E1.2 pre-correzione | `a3a9909fa5811ea8477e8b91e7e758800f5dd847b93ba4d5b41125f53c8fd632` |
| `e1-phase2-e1.3.json.gz` | 84 corse E1.3 post-correzione | `283e6ef676d08d4f8ba72b4c93b71d5c5aae1a587e79985fefdfab273b71ba82` |
| `e1-phase2-comparison.json` | confronto campo per campo (non compresso) | — |

I payload canonici (chiavi ordinate) hanno SHA-256 `9f78a585a9c1d1563c72844380cc6304e97044329b4f8abead9934070b8462f5` (baseline) e `695af719fe21541ad32ffb6b2e1e187eff02c5c86fb237ccfc7a92f899d801f7` (E1.3). Ogni manifest riporta schema, checksum, commit, timestamp ISO, runtime, seed, parametri e comando di riproduzione. Il manifest E1.3 riporta `sourceSha256 = 9ba76a72b1fca86768c1d5ccb2f749d46a5e95f436e6e560211fc0685c001600`, calcolato sul contenuto finale di `tools/e1/**`, `tests/e1/**` e `scripts/e1*.ts` ed è l'identificatore immutabile autorevole dei sorgenti usati.

I manifest conservano la provenance **effettiva dell'esecuzione**: `codeCommit = d1e2b5b` (l'HEAD al momento delle corse) e `workingTreeDirty = true`, perché gli strumenti E1.3 non erano ancora committati. Non è stata applicata la finalizzazione artificiale a `false`: essa renderebbe il manifest inconsistente con il payload che lo accompagna e cancellerebbe un fatto vero. La combinazione `codeCommit` + `sourceSha256` + runtime permette di ricostruire esattamente lo stato eseguito. `assertPortable()` garantisce che nessun percorso assoluto o indirizzo email entri negli artefatti; i tempi di esecuzione sono esclusi.

## 8. Validazioni eseguite e limiti residui

Tutti i comandi sono stati eseguiti sull'branch `research/e1-ecosystem-qa` con Node `v22.14.0`; le durate sono quelle misurate (tempo shell, tra parentesi il tempo interno Vitest quando disponibile).

| Comando | Esito | Durata |
|---|---|---|
| `npx tsc --noEmit --incremental false` | exit 0 | 9.06 s |
| `npx vitest run tests/e1` | 7 file, **54/54 passati**, exit 0 | 6.52 s (3.82 s) |
| `npx next build` | exit 0 | 14.51 s |
| Fase 2, 12 seed × 7 scenari, 900 tick | 84 corse, exit 0 | 332.15 s |
| `scripts/e1_compare.experiment.ts` | exit 0, invarianza verificata | 2.18 s |
| `scripts/e1_dataset.experiment.ts` (baseline ed E1.3) | exit 0 ×2 | ~2.4 s ciascuno |
| `scripts/e1_paired_report.experiment.ts` | exit 0 | — |
| `npx vitest run` (suite completa) | 759 passati / 9 falliti / 1 skip, exit 1 | 84.72 s (81.58 s) |
| `npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts` con Node 26 (esplorativo, scartato) | exit 0 ma 583 mismatch non spaziali | 447.91 s |

La suite completa passa da 730 a **759 test passati** con E1.3: i **+29** sono esattamente i nuovi test E1 (25 → 54), tutti passati. I **9 fallimenti** sono pre-esistenti e documentati in E1.2 (1 `fauna180`, 1 `hydrology`, 2 `planet`, 2 `reproduction`, 3 `vibeGenomeV1110`); nessuno appartiene a `tests/e1/**`. Non sono stati modificati per far passare la suite, coerentemente con il divieto di toccare motore e regole biologiche.

**Limiti residui.**

1. **Toolchain:** la riproduzione esatta richiede Node `v22.14.0`. Con Node 26 le traiettorie biologiche divergono dopo alcune centinaia di tick a causa di differenze di ultimo bit nelle funzioni trascendenti di V8; il motore è deterministico a parità di runtime, non tra runtime diversi.
2. **Disegno campionario:** 12 seed non randomizzati e usati in tutti gli scenari; non vanno interpretati come repliche indipendenti. L'IC95 t di Student assume approssimativamente indipendenza e normalità delle differenze, condizioni qui solo parzialmente soddisfatte.
3. **Habitat:** le celle sono selezionate su griglia regolare (`globalExtremesClaimed: false`), non per scansione esaustiva del pianeta.
4. **Osservabilità:** estinzione, speciazione, eventi e tassi sono misurati solo su quanto esposto dallo stato pubblico del World; effetti non osservati non possono essere esclusi.
5. **Ampiezza:** 900 tick (2.25 anni simulati) non coprono dinamiche a lungo orizzonte; lo scenario S12 resta fuori dalla fase multi-seed.

## 9. Valutazione dell'affidabilità scientifica

- **Correttezza delle misure:** le metriche spaziali ora descrivono la cella realmente occupata secondo la convenzione del motore; la regressione è coperta da test diretti contro `peekCell()` sugli scenari habitat.
- **Coerenza statistica:** i contrasti usano il disegno appaiato e riportano la dispersione delle differenze; le affermazioni sono qualitative e accompagnate dalle condizioni di campionamento.
- **Riproducibilità:** dataset compresso con checksum e provenance, comando esatto e sorgenti identificati; i campi variabili (tempi) sono esclusi dal confronto scientifico.
- **Invarianza biologica:** il confronto prima/dopo verifica che nessun campo non spaziale sia cambiato; in caso contrario lo script fallisce.
- **Limiti residui:** vedi sezione 8. Il giudizio complessivo è di **affidabilità migliorata ma non definitiva**: il numero di seed è piccolo, il campionamento dell'habitat è su griglia e non esaustivo, e nessun test può dimostrare l'assenza di effetti non osservati.

## 10. Istruzioni per riprodurre gli esperimenti

Dalla radice del repository, sul branch `research/e1-ecosystem-qa`, con **Node `v22.14.0`** (lo stesso del baseline; con altre versioni di V8 i risultati non sono confrontabili bitwise, vedi sezione 8):

```powershell
# 1) Validazione statica, test E1 e build
npx tsc --noEmit --incremental false
npx vitest run tests/e1
npx next build

# 2) 84 corse: 12 seed × 7 scenari, 900 tick, campione ogni 50
$env:E1_PHASE2_SEEDS = "1,2,3,4,5,6,7,8,9,10,11,12"
$env:E1_PHASE2_TICKS = "900"
$env:E1_PHASE2_SAMPLE_EVERY = "50"
$env:E1_PHASE2_OUT = "<output locale>.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts

# 3) Confronto con il baseline e generazione del dataset
$env:E1_COMPARE_BEFORE = "<baseline.json>"
$env:E1_COMPARE_AFTER = "<output locale>.json"
$env:E1_COMPARE_OUT = "docs/research/e1/datasets/e1-phase2-comparison.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_compare.experiment.ts

$env:E1_DATASET_INPUT = "<output locale>.json"
$env:E1_DATASET_LABEL = "e1-phase2-e1.3"
$env:E1_DATASET_PHASE = "E1.3"
$env:E1_DATASET_OUT_DIR = "docs/research/e1/datasets"
npx vitest run --config vitest.experiment.config.ts scripts/e1_dataset.experiment.ts
```

Gli artefatti già generati, i checksum e le istruzioni di verifica sono in [`datasets/README.md`](datasets/README.md). Il payload è decompresso con `zlib.gunzipSync`; `payloadSha256` è calcolato sulla serializzazione canonica (chiavi ordinate), non sui byte del file gzip.
