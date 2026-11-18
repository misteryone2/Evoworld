# E2.1 — Population Stability Pilot Report

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
**Esecuzione:** 2026-11-18T10:22:27.659Z
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`
**Dataset:** [e2.1-pilot.json.gz](datasets/e2.1-pilot.json.gz) · [manifest](datasets/e2.1-pilot.manifest.json)
**Hash manifest:** `payloadSha256=c2dc66e9f5769344080ad4bc49fa5c5c3c4b10386329af6307b7c339204c315a`, `archiveSha256=b70031190c42d27dd70b67fd0b172fa4202d7d3a81b4cfa01fb6ad6493f67507`
**Provenance:** `codeCommit=81a84bd`, `sourceSha256=d28d341d8f0809c5c0448f44aaa4530aaea6ebd3f2ff05c5c68a027eddcfe40c`, `e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe`

---

## 1. Scheda esperimento

| Campo | Contenuto |
|---|---|
| **ID** | E2.1 |
| **Titolo** | Pilota di stabilità demografica, interazione mista e recupero post-cull |
| **Domanda scientifica** | Le popolazioni raggiungono equilibri stabili, quali condizioni producono declino o persistenza, e cosa accade dopo una riduzione demografica dell'80%? |
| **Ipotesi** | H1 baseline stabile; H2 scarsità/densità → minore popolazione finale e maggiore variabilità; H3 sistema misto → maggiore variabilità e più uccisioni; H4 recupero dopo cull80 entro 450 tick |
| **Variabile indipendente** | scenario E1: S01 controllo, S02 mondo 64×64 con 220 fondatori, S06 sistema misto 160×160 con 180 fondatori, S08 baseline + cull80 a tick 450 |
| **Variabili dipendenti** | popolazione finale, CV, trend, autocorrelazione lag-1, oscillazioni, AUC, estinzione, speciazione, indici di biodiversità, vegetazione occupata, uccisioni cumulate, tempo di ritorno post-cull |
| **Controllo** | S01_stability_baseline (128×128, 150 fondatori), stesso seed, stessa durata |
| **Condizioni iniziali** | tabelle E1 immutate; `setup=baseline` per S01/S02/S08, `mixed` per S06; cull stratificato deterministico a tick 450 in S08 |
| **Seed** | 1–12, non randomizzati |
| **Durata** | 900 tick, `sampleEvery=10` → 91 campioni/corsa |
| **Protocollo** | 48 corse E1 via `scripts/e2_population_pilot.experiment.ts`; analisi additiva E2; confronti appaiati per seed |
| **Metriche** | `tools/e2/timeseries.ts`, `tools/e2/diversity.ts`, `tools/e2/metrics.ts`, `tools/e2/experiment.ts` |
| **Risultati** | §3 di questo report + dataset grezzo |
| **Limiti** | §5 |
| **Interpretazione** | §4 |
| **Conclusione** | §6 |

---

## 2. Integrità dei dati eseguiti

| Controllo | Valore |
|---|---|
| Corse completate | 48/48 (12 seed × 4 scenari) |
| Tick completati | 900 in tutte le corse |
| Campioni per corsa | 91 in tutte le corse (0, 10, …, 900) |
| Campioni totali | 4.368 |
| Corse con estinzione demografica (`population = 0`) | 0/48 |
| Corse con perturbazione | 12/12 in S08, 0/48 altrove |
| Tempo simulazione | 161,1 s |
| Modalità | seed espliciti, nessun `Date.now()` nel motore |
| Motore / E1 modificati | no |

La popolazione massima osservata coincide sempre con il tick 0 (150 in S01/S08, 220 in S02, 180 in S06): **il picco è la condizione iniziale dei fondatori, non un overshoot emergente**. Questa distinzione è essenziale per non interpretare il declino come esaurimento dopo una crescita interna.

---

## 3. Risultati

### 3.1 Stabilità demografica per scenario

Valori medi cross-seed ± SD campionaria; IC95 tra parentesi quadre.

| Scenario | Popolazione finale | CV popolazione | lag-1 | Slope (n/tick) | Estinzione | Speciazione |
|---|---|---|---|---|---|---|
| S01 baseline | 22,58 ± 8,65 [17,09–28,08] | 0,767 ± 0,114 | 0,9973 ± 0,0004 | −0,0796 ± 0,0116 | 0/12 | 0/12 |
| S02 scarsità/densa | 10,33 ± 2,46 [8,77–11,90] | 1,450 ± 0,080 | 0,9960 ± 0,0006 | −0,0831 ± 0,0075 | 0/12 | 0/12 |
| S06 misto | 35,42 ± 11,07 [28,39–42,45] | 0,657 ± 0,125 | 0,9973 ± 0,0004 | −0,0875 ± 0,0117 | 0/12 | 0/12 |
| S08 post-cull | 5,75 ± 2,77 [3,99–7,51] | 1,184 ± 0,082 | 0,9959 ± 0,0006 | −0,1084 ± 0,0066 | 0/12 | 0/12 |

**Fatti osservati:**

1. **Il trend è negativo in 48/48 corse**, con IC95 che esclude 0 in ogni scenario. Nessuna corsa raggiunge un equilibrio demografico entro 900 tick: il sistema parte dall'alta densità iniziale e decade in modo pressoché monotono.
2. **L'autocorrelazione lag-1 è ≈0,996–0,997 in tutti gli scenari**: la serie è molto liscia e la memoria del campione precedente domina. Le fluttuazioni locali sono piccole rispetto al trend.
3. **Gli intervalli tra picchi locali** sono 27,07 ± 9,83 tick in S01 (11/12 corse con picchi rilevati), 23,69 ± 4,95 in S06 (7/12), 22,83 ± 5,08 in S08 (12/12); in S02 non viene rilevato alcun picco sopra la soglia di prominenza. Questi valori **non sono cicli stazionari**: sono oscillazioni sovrapposte a un declino. Non vanno interpretati come periodi di un ciclo preda-predatore.
4. **La variabilità relativa è massima in S02** (CV 1,45) e **minima in S06** (CV 0,66); S01 è intermedio (0,77) e S08 elevato (1,18).
5. **Nessuna estinzione demografica**, ma S08 seed 11 termina con 1 individuo: il rischio è reale ma non realizzato entro l'orizzonte.
6. **Nessun evento di speciazione** in 48 corse (controlli a tick 200/400/600/800). La ricchezza finale è 1 in S01/S02/S08 e 2 in S06, dove le due specie sono quelle seminate all'inizio (`setup=mixed`), non nuove.

### 3.2 Biodiversità e risorse

| Scenario | Ricchezza finale | Shannon finale | Dominanza media | Specie effettive | Turnover medio | Vegetazione occupata |
|---|---|---|---|---|---|---|
| S01 | 1 | 0,000 | 1,000 | 1,000 | 0,000 | 0,199 ± 0,084 |
| S02 | 1 | 0,000 | 1,000 | 1,000 | 0,000 | 0,203 ± 0,102 |
| S06 | 2 | 0,631 | 0,591 | 1,907 | 0,000 | 0,283 ± 0,073 |
| S08 | 1 | 0,000 | 1,000 | 1,000 | 0,000 | 0,297 ± 0,162 |

- S06 mantiene entrambe le specie seminate in tutti i 12 seed e in tutti i 91 campioni, con evenness finale 0,910 e dominanza media 0,591: **coesistenza osservata per 900 tick**, non prova di stabilità evolutiva.
- L'evenness E1 è 0 quando c'è una sola specie per convenzione dell'indice (0/0): non va letta come "specie disuguali".
- La vegetazione occupata è una media condizionata sulle celle occupate e materializzate: non è uno stock globale.

### 3.3 Confronti appaiati per seed

| Confronto | Δ medio | SD | IC95 | Separazione per seed |
|---|---|---|---|---|
| S02 − S01, popolazione finale | **−12,25** | 8,64 | [−17,74, −6,76] | 12/12 negativi |
| S06 − S01, popolazione finale | **+12,83** | 13,24 | [4,42, 21,24] | 11/12 positivi (seed 8: −4) |
| S06 − S01, uccisioni cumulate | +1,67 | 6,75 | [−2,62, 5,95] | 6 positivi, 2 nulli, 4 negativi |
| S08 − S01, popolazione finale | **−16,83** | 6,98 | [−21,27, −12,40] | 12/12 negativi |

Le uccisioni cumulate sono più alte in S02 che in S01 (106,25 ± 10,86 contro 47,50 ± 7,59), nonostante la popolazione finale più bassa: il sistema denso genera più interazioni predatorie durante la fase iniziale ad alta densità. Questo è un dato osservazionale, non una dimostrazione di maggiore pressione predatoria per individuo.

I confronti appaiati usano gli stessi seed ma **seed non randomizzati**: gli IC95 quantificano la variabilità campione, non consentono inferenza causale.

### 3.4 Resilienza dopo cull80 (S08)

| Misura | Risultato |
|---|---|
| Tick perturbazione | 450 (metà corsa) |
| Popolazione pre-cull (media ultimi 5 campioni) | 19,6 – 37,2 per seed |
| Rimosssi / mantenuti | 15–27 rimosssi, 4–7 mantenuti |
| Caduta frazionale media | 0,840 (minimo post-cull medio 4,17 individui) |
| Ritorno a ±20% del baseline per 3 campioni consecutivi | **0/12 seed** |
| Popolazione finale | 5,75 ± 2,77 (1–11) |

Il mancato ritorno è completo e riproducibile. Va però notato un limite metodologico importante: anche il controllo S01 è in declino continuo (finale medio 22,58 da 150 iniziali). Il criterio "torna al livello pre-cull assoluto" può quindi essere irraggiungibile in un sistema che sta calando globalmente. E2.5 dovrà confrontare la **traiettoria post-cull con la traiettoria di controllo appaiata**, oltre che con il livello assoluto, per separare effetto della perturbazione da trend di fondo.

### 3.5 QA: anomalia dello strumento E2 (corretta)

Nella prima analisi l'autocorrelazione lag-1 risultava >1 (fino a 1,20), valore matematicamente impossibile. Causa: il denominatore usava solo la somma dei quadrati dei valori correnti invece della radice delle somme correnti e precedenti. Correzione applicata in `tools/e2/timeseries.ts`, test di regressione aggiunto (`|r| ≤ 1` anche con trend), pilota e dataset rigenerati. Il dataset e i numeri di questo report usano esclusivamente la versione corretta. **Questa è un'anomalia dello strumento E2, non del motore.**

---

## 4. Interpretazione e classificazione

| Affermazione | Evidenza | Classificazione |
|---|---|---|
| Il motore parte sempre da alta densità fondatrice e la popolazione decade senza raggiungere equilibrio in 900 tick | picco a tick 0 in 48/48; slope negativo in 48/48; IC95 escludono 0 | **VERIFICATO** |
| S02 produce popolazione finale inferiore a S01 | Δ −12,25, IC95 esclude 0, 12/12 seed | **EVIDENZA** (non causale) |
| S06 mantiene popolazione finale superiore a S01 | Δ +12,83, IC95 esclude 0, 11/12 seed | **EVIDENZA** (non causale) |
| Il sistema misto uccide più prede del baseline | Δ +1,67, IC95 include lo 0, segni misti | **NON DIMOSTRATO** |
| S08 non recupera il livello pre-cull entro 450 tick | 0/12 ritorni, caduta media 84% | **EVIDENZA** (criterio assoluto; vedi limite in §3.4) |
| Mancato recupero coerente con Allee effect emergente | soglia energia 130 + raggio accoppiamento 4 (`reproduction.ts`); E1 S08 | **EVIDENZA** / **ANOMALIA** A10 |
| In S06 coesistono due specie per 900 tick | ricchezza 2 e turnover 0 in 12/12 | **EVIDENZA** (orizzonte limitato) |
| In S01/S02/S08 persiste una sola specie | dominanza 1, Shannon 0, turnover 0 | **VERIFICATO** |
| Non si osserva speciazione in 900 tick | 0 eventi in 48 corse | **VERIFICATO** per l'orizzonte; **NON DIMOSTRATO** che sia impossibile |
| Le oscillazioni a 23–27 tick siano cicli preda-predatore | picchi su trend decrescente, lag-1 ≈0,996 | **NON DIMOSTRATO** |
| La diversità causi stabilità | nessun disegno factorial in questo pilota | **NON DIMOSTRATO** |
| La scarsità causi il declino osservato | seed non randomizzati, scenari differiscono anche per geometria/densità | **NON DIMOSTRATO** |
| Autocorrelazione lag-1 >1 | era un difetto del modulo E2, ora corretto | **ANOMALIA** (strumento, risolta) |

---

## 5. Limiti espliciti

1. **Orizzonte:** 900 tick coprono ~2,25 anni simulati. Equilibrium, speciazione e cicli possono richiedere 2700–5000 tick.
2. **Unità statistica:** seed/corsa; i 91 campioni per corsa non sono repliche indipendenti.
3. **Non randomizzazione:** 12 seed fissi; gli appaiati sono descrittivi.
4. **Osservabilità:** non sono disponibili causa della morte, ID genitore/figlio, ID predatore/preda, tentativi di caccia falliti, flusso energetico, stock vegetazionale globale.
5. **Classificazione trofica:** `carnivory ≥ 0.35` è una soglia di tratto, non il ruolo effettivo in un attacco.
6. **Picchi locali:** la metrica di oscillazione non detrendizza; va ricalcolata su serie detrendizzate in E2.2.
7. **Criterio di recupero:** assoluto, non confrontato con la traiettoria di controllo.
8. **Evenness E1:** 0 per single-species scenario per convenzione dell'indice.
9. **Vegetazione occupata:** condizionata sopravvissuti e celle materializzate.
10. **Determinismo:** richiede Node v22.14.0; `gzip` e V8 possono differire altrove.

---

## 6. Conclusione

Il pilota E2.1 **non supporta l'ipotesi di equilibri demografici stabili** nell'orizzonte di 900 tick: tutte le 48 corse declinano da densità fondatrici elevate, con autocorrelazione quasi perfetta e nessun ritorno a un livello stazionario. Le differenze tra scenari sono riproducibili e appaiate per seed (scarsità peggiore, misto migliore), ma **non sono interpretable causalmente** senza randomizzazione e senza disaccoppiare geometria, densità e composizione. La persistenza di due specie in S06 e l'assenza di recupero dopo cull80 sono risultati solidi entro il disegno; la speciazione e i cicli preda-predatore restano **non dimostrati**, non esclusi.

Classificazione complessiva della fase: **EVIDENZA** per le dinamiche osservate; **NON DIMOSTRATO** per le ipotesi ecologiche forti; **ANOMALIA** (risolta) per il difetto di normalizzazione dello strumento E2.

---

## 7. Prossime azioni (gate E2.1 → E2.2)

1. **E2.2** con S04/S05/S06 a 2700 tick, detrending delle serie e cross-correlazione erbivori↔carnivori con lag in tick. Verificare separatamente l'immunità apicale (A04) e i bucket non toroidali (A01) prima di inferire assenza di cicli.
2. **E2.5** esteso: confronto post-cull contro controllo appaiato, `cull95`, e durata 1800 tick.
3. **E2.4/E2.6** solo dopo aver stabilito se la persistenza delle specie è misurabile su orizzonti lunghi.
4. Nessuna modifica al motore: le anomalie A01–A12 restano documentate in [E2_0_ENGINE_ECOLOGY_AUDIT.md](E2_0_ENGINE_ECOLOGY_AUDIT.md).

---

## 8. Riproduzione

```powershell
$env:Path = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:Path
$env:E2_PILOT_SEEDS='1,2,3,4,5,6,7,8,9,10,11,12'
$env:E2_PILOT_TICKS='900'
$env:E2_PILOT_SAMPLE_EVERY='10'
$env:E2_PILOT_OUT='<output>.json'
npx vitest run --config vitest.experiment.config.ts scripts/e2_population_pilot.experiment.ts

$env:E2_DATASET_INPUT=$env:E2_PILOT_OUT
$env:E2_DATASET_LABEL='e2.1-pilot'
$env:E2_DATASET_PHASE='E2.1-pilot'
$env:E2_DATASET_OUT_DIR='docs/research/e2/datasets'
$env:E2_DATASET_WORKING_TREE_DIRTY='1'
npx vitest run --config vitest.experiment.config.ts scripts/e2_dataset.experiment.ts
```

Verifica hash: `readDataset(archive, manifest)` in `tools/e2/dataset.ts` controlla sia `payloadSha256` sia `archiveSha256`; il test `tests/e2/dataset.test.ts` copre il percorso.
