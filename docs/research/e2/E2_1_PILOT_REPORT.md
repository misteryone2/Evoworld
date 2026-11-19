# E2.1 — Population Stability Report (revisione scientifica)

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22` — nessun merge in `main`
**Pilota originale:** 2026-11-18T10:22:27.659Z
**Isolamento review:** 2026-11-18T10:54:10.057Z
**Dataset review:** `executedAt=2026-11-18T11:00:00.000Z` (timestamp fissato per riproducibilità)
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`
**Dataset:** [e2.1-review.json.gz](datasets/e2.1-review.json.gz) · [manifest](datasets/e2.1-review.manifest.json)
**Hash manifest:** `payloadSha256=cbbcce2576e2f1e74f5ca4587ac621498ee6613ecad08e947e4e9fd4f4c2a3fe`, `archiveSha256=d5cb5cee1934f00245650adf1a03b627e87f75e8ad8015fd12a2bec5cb4b8b89`
**Provenance:** `codeCommit=44c69e8bcf3bbbd0a995e8d3fe66908101ac863d`, `workingTreeDirty=false`, `sourceSha256=627e79d5b79c03e486f3538013369eb07b9c2760d2de12c1701d03fd4dfad2ec`, `e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe`

---

## 1. Sintesi delle correzioni della review

| Richiesta review | Implementazione additiva | Evidenza | Sezione |
|---|---|---|---|
| Isolare geometria, densità e risorse | `tools/e2/isolation.ts`, `scripts/e2_variable_isolation.experiment.ts`; 8 bracci, 10 confronti appaiati, metrica primaria `survivalFractionOf` | 96 corse, 12 seed, 900 tick, exit 0 | §4.2 |
| Detrending e correlazioni preda-predatore | `detrendLinear`, `pearsonCorrelation`, `detrendedCrossCorrelation`, `compareCrossCorrelations` in `tools/e2/timeseries.ts`; aggregazione in `tools/e2/correlationReview.ts` | `maxLag=50` tick (= 5 campioni con `sampleEvery=10`), 12 seed, exit 0 | §4.3 |
| Recupero S08 rispetto al controllo appaiato | `tools/e2/resilience.ts`, `tools/e2/resilienceReview.ts`; quattro esiti descrittivi | 12 coppie S08/S01, exit 0 | §4.4 |
| Provenienza pulita e riproducibile | Dataset rigenerato dal commit `44c69e8`, albero tracciato pulito, timestamp fissabile, doppia generazione identica | hash e controlli in §7 | §7 |
| Nuove verifiche | E2, E1, TypeScript e build rieseguiti; output e codici reali riportati | 38/38, 65/65, exit 0 ovunque | §8 |

Nessuna modifica ha interessato motore, geni, mutazioni, ereditarietà, selezione, riproduzione, metabolismo, predazione, renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**`, `tests/e1/**` o formati di salvataggio.

---

## 2. Scheda esperimento

| Campo | Contenuto |
|---|---|
| **ID** | E2.1 |
| **Titolo** | Stabilità demografica, isolamento delle variabili, correlazione detrendizzata e resilienza appaiata |
| **Domanda scientifica** | Le popolazioni raggiungono equilibri stabili entro 900 tick? Quali differenze osservate sopravvivono all'isolamento di geometria, densità e risorse? Le correlazioni trofiche resistono al detrending? Come cambia la classificazione di recupero se S08 è confrontato con S01 appaiato? |
| **Ipotesi originali** | H1 baseline stabile; H2 scarsità/densità → minore popolazione e maggiore variabilità; H3 sistema misto → maggiore variabilità; H4 recupero dopo `cull80` entro 450 tick |
| **Disegno pilota** | S01, S02, S06, S08; 12 seed; 900 tick; `sampleEvery=10` |
| **Disegno isolamento** | `I0_control_128x128_150`, `IG_geometry_only_64x64_38`, `ID_density_only_128x128_220`, `IGD_combined_64x64_220`, più S09/S10/S13/S14; 12 seed; 900 tick |
| **Unità statistica** | corsa/seed; i 91 campioni per corsa non sono repliche indipendenti |
| **Confronti** | appaiati per seed tramite `pairedDifference` di E1; seed non randomizzati ⇒ descrittivi, mai causali |
| **Metrica primaria isolamento** | `survivalFractionOf = finalPopulation / initialPopulation`; la popolazione finale grezza resta descrittiva perché i bracci hanno fondatori diversi |
| **Controlli risorse** | S09/S10/S13/S14 mantengono geometria 128×128 e 150 fondatori; nessuno scalar pubblico per la risorsa globale è disponibile nel motore |
| **Classificazione trofica** | conteggi derivati da `population × herbivoreFraction` e `population × carnivoreFraction`; sono tratti, non ruoli osservati in un attacco |
| **Soglia recupero** | tolleranza ±20% del baseline pre-shock, 3 campioni consecutivi, recupero parziale ≥50% del divario massimo post-shock, finestra baseline 5 campioni |
| **Dataset** | 144 corse totali (48 pilota + 96 isolamento), 12 scenari, 12 seed |

---

## 3. Integrità dei dati eseguiti

| Controllo | Pilota originale | Isolamento review | Dataset finale |
|---|---|---|---|
| Corse completate | 48/48 | 96/96 | 144 |
| Seed | 1–12 | 1–12 | 1–12 |
| Durata | 900 tick | 900 tick | 900 tick |
| Campioni per corsa | 91 | 91 | 91 |
| Campioni totali | 4.368 | 8.736 | 13.104 |
| Estinzioni demografiche | 0/48 | 0/96 | 0/144 |
| Tempo simulazione | 161,1 s | 191,90 s | — |
| Tempo parete | — | 193,2 s | — |
| Exit code esperimento | 0 | 0 | 0 |
| Albero tracciato al momento della generazione | non pulito (`true`) | pulito | **pulito (`workingTreeDirty=false`)** |

Il picco di popolazione coincide con il tick 0 in tutte le corse: è la condizione fondatrice, non un overshoot emergente. Il confronto grezzo S02−S01 del pilota resta incluso come dato storico, ma non viene più usato per attribuire un effetto alla scarsità.

---

## 4. Risultati

### 4.1 Stabilità demografica del pilota originale

Valori medi cross-seed ± SD campionaria; IC95 tra parentesi quadre.

| Scenario | Popolazione finale | CV popolazione | lag-1 | Slope (n/tick) | Estinzione | Speciazione |
|---|---|---|---|---|---|---|
| S01 baseline | 22,58 ± 8,65 [17,09–28,08] | 0,767 ± 0,114 | 0,9973 ± 0,0004 | −0,0796 ± 0,0116 | 0/12 | 0/12 |
| S02 grezzo (confuso) | 10,33 ± 2,46 [8,77–11,90] | 1,450 ± 0,080 | 0,9960 ± 0,0006 | −0,0831 ± 0,0075 | 0/12 | 0/12 |
| S06 misto | 35,42 ± 11,07 [28,39–42,45] | 0,657 ± 0,125 | 0,9973 ± 0,0004 | −0,0875 ± 0,0117 | 0/12 | 0/12 |
| S08 post-cull | 5,75 ± 2,77 [3,99–7,51] | 1,184 ± 0,082 | 0,9959 ± 0,0006 | −0,1084 ± 0,0066 | 0/12 | 0/12 |

Fatti osservati: trend negativo in 48/48 corse, lag-1 ≈0,996–0,997, nessun equilibrio stazionario in 900 tick, nessuna estinzione e nessuna speciazione. La vocazione “scarsità/densa” di S02 non è separable dal disegno originale: geometria e fondatori cambiano insieme.

### 4.2 Isolamento controllato di geometria, densità e risorse

Bracci costruiti senza toccare `tools/e1/**`: i quattro bracci custom usano `ScenarioSpec` pubblico; S09/S10/S13/S14 usano `buildScenarios({habitatControls:true})`.

| Braccio | Variabile cambiata | Fondatori | Geometria | Popolazione finale | Frazione di sopravvivenza |
|---|---|---:|---|---:|---:|
| `I0_control_128x128_150` | controllo | 150 | 128×128 | 22,58 ± 8,65 | 0,1506 ± 0,0577 |
| `IG_geometry_only_64x64_38` | geometria | 38 | 64×64 | 7,17 ± 4,53 | 0,1886 ± 0,1192 |
| `ID_density_only_128x128_220` | densità | 220 | 128×128 | 28,25 ± 10,81 | 0,1284 ± 0,0491 |
| `IGD_combined_64x64_220` | geometria + densità (S02 ricostruito) | 220 | 64×64 | 10,33 ± 2,46 | 0,0470 ± 0,0112 |
| `S09_poor_habitat` | posizione e risorse povere | 150 | 128×128 | 14,92 ± 5,47 | 0,0994 ± 0,0365 |
| `S10_rich_habitat` | posizione e risorse ricche | 150 | 128×128 | 21,17 ± 4,51 | 0,1411 ± 0,0301 |
| `S13_poor_position_rich_resources` | risorse ricche, posizioni povere | 150 | 128×128 | 16,92 ± 5,57 | 0,1128 ± 0,0371 |
| `S14_rich_position_poor_resources` | posizioni ricche, risorse povere | 150 | 128×128 | 19,00 ± 5,10 | 0,1267 ± 0,0340 |

La densità del braccio geometry-only è 38/4096 = 0,00928 fondatori/cella contro 150/16384 = 0,00916 del controllo: differenza dell'1,3%, dovuta all'arrotondamento di 37,5 a 38. La geometria non è quindi perfettamente isolata dalla densità, ma la deviazione è piccola e documentata.

Confronti appaiati per seed. `Δ` è A−B; ICD95 calcolato sulla differenza appaiata; i segni sono il numero di seed negativi/positivi/nulli.

| Confronto | Metrica | Δ medio | IC95 | Segni | Classificazione |
|---|---|---:|---|---|---|
| geometry_only − control | popolazione finale | −15,4167 | [−19,9213, −10,9120] | 12/0/0 | **descrittiva**: fondatori diversi (38 vs 150) |
| geometry_only − control | **sopravvivenza** | +0,0380 | [−0,0243, 0,1004] | 5/7/0 | **NON DIMOSTRATO**: IC include 0 |
| density_only − control | popolazione finale | +5,6667 | [−2,0693, 13,4027] | 4/8/0 | **NON DIMOSTRATO** |
| density_only − control | **sopravvivenza** | −0,0221 | [−0,0644, 0,0201] | 7/5/0 | **NON DIMOSTRATO** |
| combined − control | popolazione finale | −12,2500 | [−17,7366, −6,7634] | 12/0/0 | **descrittiva**: due variabili insieme |
| combined − control | **sopravvivenza** | −0,1036 | [−0,1398, −0,0673] | 12/0/0 | **EVIDENZA** per il braccio combinato, non per la scarsità |
| S13 − S09 | risorse, posizioni povere | +2,0000 | [−0,5270, 4,5270] | 3/9/0 | **NON DIMOSTRATO** |
| S10 − S14 | risorse, posizioni ricche | +2,1667 | [−1,7108, 6,0441] | 4/8/0 | **NON DIMOSTRATO** |
| S14 − S09 | posizione, risorse povere | +4,0833 | [−0,3639, 8,5306] | 4/8/0 | **NON DIMOSTRATO** |
| S10 − S13 | posizione, risorse ricche | +4,2500 | [0,9416, 7,5584] | 2/9/1 | **EVIDENZA** descrittiva; non causale |

**Conclusione dell'isolamento:** il calo grezzo della popolazione finale nel braccio geometry-only scompare quando si normalizza per i fondatori iniziali; il solo aumento di densità non mostra un effetto risolto; l'effetto negativo più consistente compare solo quando geometria e densità cambiano insieme. I due contrasti risorse hanno segno positivo ma IC95 che include 0. Non è quindi supportata l'attribuzione del declino alla scarsità. I contrasti posizione/risorse usano etichette campionate, non estremi globali, e restano descrittivi.

### 4.3 Correlazione preda-predatore: originale, detrendizzata e lag

Le serie sono derivate da S06. Il detrending rimuove una tendenza lineare; non rimuove cicli non lineari né crea informazione causale. Con `sampleEvery=10`, solo i lag multipli di 10 hanno 12 seed validi; gli altri lag riportano `validSeeds=0` e non sono interpretati.

| Misura | Originale | Detrendizzata | Δ (detrended − original) |
|---|---:|---:|---:|
| Correlazione a lag 0 | 0,9792 ± 0,0143 [0,9701–0,9882] | 0,9765 ± 0,0095 [0,9704–0,9825] | −0,0027 |
| Lag del picco | media −7,5; valori −20/−10/0/+10 | media +2,5; valori 0/+10 | — |
| Distribuzione picco | 0:4, −10:4, −20:3, +10:1 | 0:9, +10:3 | — |

Trend comune lineare rilevato in 4/12 seed; `spuriousTrendRisk=true` in **0/12** seed perché la correlazione residua resta alta quando il trend viene rimosso. Questo riduce il sospetto di correlazione spuria da trend comune, ma non dimostra una relazione trofica né la sua direzione.

Sensibilità ai lag validi (12 seed ciascuno):

| Lag (tick / campioni) | Originale | Detrendizzata | Δ |
|---:|---:|---:|---:|
| −50 / −5 | 0,9695 | 0,7962 | −0,1733 |
| −40 / −4 | 0,9737 | 0,8636 | −0,1100 |
| −30 / −3 | 0,9767 | 0,9156 | −0,0612 |
| −20 / −2 | 0,9788 | 0,9516 | −0,0272 |
| −10 / −1 | 0,9795 | 0,9716 | −0,0079 |
| 0 / 0 | 0,9792 | 0,9765 | −0,0027 |
| +10 / +1 | 0,9780 | 0,9737 | −0,0043 |
| +20 / +2 | 0,9750 | 0,9564 | −0,0185 |
| +30 / +3 | 0,9711 | 0,9225 | −0,0485 |
| +40 / +4 | 0,9666 | 0,8689 | −0,0978 |
| +50 / +5 | 0,9616 | 0,7941 | −0,1675 |

L'originale rimane elevata a tutti i lag validi; la detrendizzata decade simmetricamente all'aumentare di |lag|. La differenza tra lag0 originale e detrendizzato è piccola, ma la sensibilità ai lag mostra che la vicinanza a 0 non è l'unica informazione rilevante. **Nessuna correlazione è interpretata come prova di causalità.**

### 4.4 Resilienza S08 rispetto a S01 appaiato per seed

La classificazione usa coppie S08/S01 con lo stesso seed e la traiettoria del controllo, non solo il livello pre-cull assoluto.

| Esito | Seed | Interpretazione |
|---|---:|---|
| `absolute_recovery` | 0/12 | ritorno entro ±20% del livello pre-cull per 3 campioni consecutivi |
| `control_relative_recovery` | 0/12 | ritorno del divario S08−S01 al divario pre-shock |
| `partial_recovery` | 1/12 (seed 5) | chiusura ≥50% del divario massimo post-shock senza ritorno completo |
| `no_observed_recovery` | 11/12 | nessuno dei criteri precedenti entro 900 tick |

Chiusura del divario: media 0,2348, IC95 [0,1100–0,3596], min 0, max 0,6000. Divario finale: media 16,8333, IC95 [12,3995–21,2672]. Tick di perturbazione: 450. Baseline pre-cull: 19,6–37,2 per seed.

Questa classificazione separa correttamente il declino comune di S01 dall'effetto osservato in S08, ma resta un esito **entro l'orizzonte**: non dimostra irreversibilità né un meccanismo causale come l'Allee effect.

### 4.5 QA: anomalia dello strumento E2 (corretta)

Nella prima analisi E2 l'autocorrelazione lag-1 risultava >1 (fino a 1,20) per un denominatore errato. La correzione è in `tools/e2/timeseries.ts` con test di regressione; tutti i numeri di questo report e del dataset usano la versione corretta. Era un'anomalia dello strumento E2, non del motore.

---

## 5. Interpretazione e classificazione aggiornata

| Affermazione | Evidenza | Classificazione |
|---|---|---|
| Il motore parte da alta densità fondatrice e non raggiunge equilibrio in 900 tick | picco a tick 0 e slope negativo in 48/48 piloti | **VERIFICATO** per l'orizzonte |
| S02 grezzo ha popolazione finale inferiore a S01 | Δ −12,25, 12/12 seed | **EVIDENZA** grezza, **confusa**; non più usata per inferenza |
| La geometria da sola riduce la popolazione finale | Δ grezzo −15,42, ma Δ sopravvivenza +0,0380 con IC95 che include 0 | **NON DIMOSTRATO** |
| L'aumento di densità da solo riduce la sopravvivenza relativa | Δ −0,0221, IC95 [−0,0644, 0,0201] | **NON DIMOSTRATO** |
| La combinazione geometria+densità riduce la sopravvivenza relativa | Δ −0,1036, IC95 esclude 0, 12/12 negativi | **EVIDENZA** descrittiva per il braccio combinato |
| La disponibilità di risorse spieghi il calo di S02 | due contrasti risorse con IC95 che include 0 | **NON DIMOSTRATO** |
| La posizione influenzi la popolazione finale a risorse ricche | S10−S13 = +4,25, IC95 [0,94, 7,56] | **EVIDENZA** descrittiva, non causale |
| La correlazione erbivori↔carnivori sia spuria per trend comune | 4/12 con trend comune, 0/12 con `spuriousTrendRisk` | **NON DIMOSTRATO** (il rischio non è rilevato, non è provata l'assenza) |
| Esista un lag causale preda→predatore | correlazioni descrittive e non randomizzate; detrending lineare | **NON DIMOSTRATO** |
| S08 non recuperi completamente entro 900 tick | 0/12 assoluto, 0/12 relativo, 1/12 parziale | **EVIDENZA** entro l'orizzonte |
| Il mancato recupero sia irreversibile o causato da Allee effect | nessuna manipolazione meccanicistica | **NON DIMOSTRATO** |
| S06 mantenga due specie per 900 tick | ricchezza 2, turnover 0 in 12/12 | **EVIDENZA** per l'orizzonte |
| Si verifichi speciazione in 900 tick | 0 eventi in 48 corse | **VERIFICATO** per l'orizzonte; **NON DIMOSTRATO** che sia impossibile |
| La diversità causi stabilità | nessun disegno causale dedicato | **NON DIMOSTRATO** |

---

## 6. Limiti espliciti

1. **Orizzonte:** 900 tick coprono ~2,25 anni simulati; equilibri, cicli e speciazione possono richiedere 2700–5000 tick.
2. **Unità statistica:** corsa/seed; i 91 campioni per corsa non sono repliche indipendenti.
3. **Non randomizzazione:** 12 seed fissi. Gli IC95 quantificano variabilità campione, non inferenza causale.
4. **Risorse:** non esiste uno scalar pubblico per la disponibilità globale; S13/S14 manipolano risorse locali a geometria e popolazione fisse, con etichette campionate e `globalExtremesClaimed: false`.
5. **Geometria-only:** 38 fondatori approssimano 37,5; la densità differisce dell'1,3% dal controllo.
6. **Metrica di sopravvivenza:** rapporto fra popolazione finale e iniziale; non separa nascite, morti e immigrazione, non osservabili separatamente.
7. **Detrending:** rimuove solo una tendenza lineare; non rimuove cicli non lineari e non stabilisce causalità.
8. **Lag:** con `sampleEvery=10` solo i multipli di 10 sono stimabili; gli altri lag hanno 0 seed validi.
9. **Classificazione trofica:** `carnivory ≥ 0.35` è una soglia di tratto, non il ruolo effettivo in un attacco.
10. **Recupero:** le quattro categorie sono descrittive entro 900 tick; non provano irreversibilità.
11. **Osservabilità:** non sono disponibili causa della morte, ID genitore/figlio, ID predatore/preda, tentativi di caccia falliti, flusso energetico o stock vegetazionale globale.
12. **Picchi locali:** la metrica di oscillazione del pilota non detrendizza; andrà ricalcolata su serie detrendizzate nella fase successiva.
13. **Determinismo:** richiede Node `v22.14.0`; gzip e V8 possono differire altrove. I file generati `AGENTS.md`/`CLAUDE.md` sono esclusi dai commit E2.

---

## 7. Provenienza, hash e riproducibilità

### 7.1 Commit del codice sperimentale

| Commit | Contenuto |
|---|---|
| `d52f1f1` | E2.0 — engine ecology audit |
| `81a84bd` | correzione normalizzazione lag-1 |
| `ee8458c` | pilota E2.1 originale |
| `f2c155b` | isolamento variabili |
| `c86a0b8` | strumenti correlazione detrendizzata |
| `9c66bdc` | resilienza appaiata |
| `a5eb542` | provenienza dataset consolidata |
| `bbd00eb` | contrasti normalizzati e sweep lag corretto |
| **`44c69e8`** | **timestamp riproducibile per la generazione dataset — commit puntato dal manifest finale** |

### 7.2 Verifiche di provenienza

| Verifica | Risultato |
|---|---|
| `git rev-parse HEAD` uguale a `manifest.codeCommit` | `44c69e8bcf3bbbd0a995e8d3fe66908101ac863d` |
| `workingTreeDirty` | `false` |
| `sourceSha256` E2 ricalcolato | `627e79d5b79c03e486f3538013369eb07b9c2760d2de12c1701d03fd4dfad2ec` |
| `e1SourceSha256` ricalcolato | `24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe` |
| Hash payload letto dall'archivio | `cbbcce2576e2f1e74f5ca4587ac621498ee6613ecad08e947e4e9fd4f4c2a3fe` |
| Hash archivio su disco | `d5cb5cee1934f00245650adf1a03b627e87f75e8ad8015fd12a2bec5cb4b8b89` |
| Input pilota / isolamento / correlazione / resilienza | SHA-256 registrati in `dataset.auxiliary.inputs` e riverificati sui file sorgente |
| Coerenza report↔dataset | `metrics.pilot`, `metrics.isolation`, `metrics.correlation`, `metrics.resilience` confrontati con gli output grezzi tramite serializzazione canonica: 5/5 uguali |
| Controlli strutturali manifest/dataset | 23/23 superati |
| File vietati modificati rispetto a `d330c12` | nessuno (`simulation/**`, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**`, `tests/e1/**`, renderer/G1/G2) |

### 7.3 Riproducibilità della generazione

Due generazioni indipendenti con lo stesso input, lo stesso `codeCommit`, lo stesso `workingTreeDirty=false` e `E2_DATASET_REVIEW_EXECUTED_AT=2026-11-18T11:00:00.000Z` (label di controllo `e2.1-review-repro`) hanno prodotto:

- `payloadSha256=85712d57920c9b57341444b41de10500ab53e7ee915e0d2b681bf3622a28e61d`;
- `archiveSha256=249b159ce6fc202defbba78fcb7f3c2b3b127aaaa0024509fea4ab9b0a598074`;
- byte dell'archivio identici (`ARCHIVE_BYTES_IDENTICAL=True`);
- testo del manifest identico (`MANIFEST_TEXT_IDENTICAL=True`).

Il dataset finale usa la label `e2.1-review`, quindi ha hash diversi per via del campo di riproduzione incluso nel payload; il processo è comunque riproducibile bit-per-bit con la label finale. `tests/e2/dataset.test.ts` include un test dedicato alla riproducibilità byte-per-byte con sorgente fissata.

---

## 8. Verifiche eseguite

Comandi eseguiti con Node `v22.14.0` e `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.

| Comando | Output essenziale | Exit code |
|---|---|---:|
| `npx vitest run tests/e2` | `Test Files 10 passed (10)` · `Tests 38 passed (38)` · `Duration 1.57s` | **0** |
| `npx vitest run tests/e1` | `Test Files 7 passed (7)` · `Tests 65 passed (65)` · `Duration 2.01s` | **0** |
| `npx tsc --noEmit --incremental false` | nessun output diagnostico | **0** |
| `npm run build` | Next.js 16.3.0 (Turbopack); `Compiled successfully in 12.8s`; `Finished TypeScript in 2.2s`; 3/3 pagine statiche generate | **0** |
| `scripts/e2_variable_isolation.experiment.ts` | 96 corse, 10 confronti, `Duration 191.90s` | **0** |
| `scripts/e2_correlation_review.experiment.ts` | 12 seed, `spuriousTrendRisk=0`, `Duration 1.48s` | **0** |
| `scripts/e2_resilience_review.experiment.ts` | 12 coppie, `absolute=0, relative=0, partial=1, none=11`, `Duration 1.18s` | **0** |
| `scripts/e2_dataset_review.experiment.ts` | manifest e archivio scritti, `workingTreeDirty=false`, `Duration 1.80s` | **0** |

Nessuna verifica non eseguita viene dichiarata come eseguita.

---

## 9. Conclusione e gate

La revisione E2.1 conferma robustamente le dinamiche osservate (declino senza equilibrio in 900 tick, coesistenza osservata in S06, mancato recupero completo di S08 entro l'orizzonte), ma **ritira ogni attribuzione causale basata sul confronto grezzo S02−S01**. Dopo isolamento, né geometria né densità da sole mostrano un effetto risolto sulla frazione di sopravvivenza; il calo compare nel braccio combinato e i contrasti risorse non sono risolti. Le correlazioni trofiche restano elevate dopo detrending ma non dimostrano causalità; il rischio di correlazione spuria da trend comune non è rilevato, il che non equivale a dimostrarne l'assenza.

Classificazione complessiva: **EVIDENZA** per le dinamiche descrittive misurate; **NON DIMOSTRATO** per le ipotesi ecologiche forti; **ANOMALIA risolta** per il difetto di normalizzazione lag-1 dello strumento E2.

Consegna completata su `research/e2-ecosystem-dynamics`: report revisionato, dataset `e2.1-review`, manifest aggiornato, test e commit separati. **Nessun merge in `main`, nessuna PR aperta. Il lavoro si ferma qui in attesa di review indipendente prima di E2.2.**

---

## 10. Riproduzione

```powershell
$env:Path = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:Path
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
$tmp = 'C:\Users\matti\AppData\Local\Temp\opencode'

$env:E2_PILOT_SEEDS = '1,2,3,4,5,6,7,8,9,10,11,12'
$env:E2_PILOT_TICKS = '900'
$env:E2_PILOT_SAMPLE_EVERY = '10'
$env:E2_PILOT_OUT = "$tmp\e2-pilot-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e2_population_pilot.experiment.ts

$env:E2_ISOLATION_SEEDS = '1,2,3,4,5,6,7,8,9,10,11,12'
$env:E2_ISOLATION_TICKS = '900'
$env:E2_ISOLATION_SAMPLE_EVERY = '10'
$env:E2_ISOLATION_OUT = "$tmp\e2-isolation-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e2_variable_isolation.experiment.ts

$env:E2_CORRELATION_INPUT = $env:E2_PILOT_OUT
$env:E2_CORRELATION_OUT = "$tmp\e2-correlation-review.json"
$env:E2_CORRELATION_MAX_LAG = '50'
npx vitest run --config vitest.experiment.config.ts scripts/e2_correlation_review.experiment.ts

$env:E2_RESILIENCE_INPUT = $env:E2_PILOT_OUT
$env:E2_RESILIENCE_OUT = "$tmp\e2-resilience-review.json"
npx vitest run --config vitest.experiment.config.ts scripts/e2_resilience_review.experiment.ts

$env:E2_DATASET_REVIEW_PILOT = $env:E2_PILOT_OUT
$env:E2_DATASET_REVIEW_ISOLATION = $env:E2_ISOLATION_OUT
$env:E2_DATASET_REVIEW_CORRELATION = $env:E2_CORRELATION_OUT
$env:E2_DATASET_REVIEW_RESILIENCE = $env:E2_RESILIENCE_OUT
$env:E2_DATASET_REVIEW_OUT_DIR = 'docs/research/e2/datasets'
$env:E2_DATASET_REVIEW_LABEL = 'e2.1-review'
$env:E2_DATASET_REVIEW_CODE_COMMIT = '44c69e8bcf3bbbd0a995e8d3fe66908101ac863d'
$env:E2_DATASET_REVIEW_WORKING_TREE_DIRTY = '0'
$env:E2_DATASET_REVIEW_EXECUTED_AT = '2026-11-18T11:00:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_dataset_review.experiment.ts
```

Verifica hash: `readDataset(archive, manifest)` in `tools/e2/dataset.ts` controlla sia `payloadSha256` sia `archiveSha256`; il test `tests/e2/dataset.test.ts` copre anche la riproducibilità byte-per-byte.
