# E2.2 — Food Web Dynamics Report

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22` — nessun merge in `main`, nessuna PR aperta
**Dataset:** [e2.2-foodweb.json.gz](datasets/e2.2-foodweb.json.gz) · [manifest](datasets/e2.2-foodweb.manifest.json)
**Hash manifest:** `payloadSha256=755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d`, `archiveSha256=d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79`
**Provenance:** `codeCommit=b604b031c32ac10f0fbcab67d3624942074c1ed0`, `workingTreeDirty=false`, `executedAt=2026-11-18T12:30:00.000Z` (timestamp fissato), `sourceSha256=ee1e362eff3914b2f5607081e5213d81a3037dd4b0c75416a30a20d963295877`, `e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe`
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`
**Audit:** [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md) · **Matrice:** [E2_2_EXPERIMENTAL_MATRIX.md](E2_2_EXPERIMENTAL_MATRIX.md)

---

## 1. Sintesi

E2.2 ha eseguito **120 corse** (36 primarie, 36 replica di seed, 36 durata, 12 campionamento fine) su S04/S05/S06, 12 o 24 seed, 900 o 2700 tick. Le conclusioni principali sono:

1. **Il segnale sequenziale robusto non è tratto→tratto, ma tratto erbivoro→uccisioni registrate.** In S06 il picco di cross-correlazione detrendizzata erbivori→tasso di kills è a lag positivo in **12/12 seed in tutti e quattro i blocchi** (10 tick a `sampleEvery=10`, ~5–6 tick a `sampleEvery=5`, 11,67 tick nella replica di seed). È **EVIDENZA di sequenzialità temporale aggregata**, non di causalità.
2. **La correlazione tra tratti non è informativa sul piano trofico in questa codifica.** `herbivoreFraction + carnivoreFraction = 1` per costruzione ⇒ la loro correlazione di Pearson è esattamente **−1 in 12/12 seed**. I conteggi di tratto condividono il fattore `population` e mostrano correlazioni ampiamente variabili (media 0,256; CI95 [−0,082; 0,593]; intervallo −0,671…0,970). Nessuna di queste correlazioni identifica chi ha attaccato chi.
3. **S04 e S05 producono 0 uccisioni in 36/36 corse ciascuno; S06 ne produce 49–70 in media.** È coerente con l'immunità apicale A04, non una prova del meccanismo.
4. **I due tratti coesistono quasi per l'intero orizzonte in S06** (frazione media 0,9686–1,000; 12/12 seed oltre il 50%).
5. **Le conclusioni qualitative sono stabili al cambio di seed e di durata, ma le magnitudini non lo sono**: kills medie 54,67 vs 70,00 tra blocchi di seed; conteggio carnivoro 51,90 vs 28,31 tra 2700 e 900 tick. La dipendenza dalla cadenza di campionamento riguarda la risoluzione del lag (10 → ~5,8 tick), non il suo segno.

Classificazione complessiva: **EVIDENZA** per le dinamiche descrittive misurate e per la sequenzialità erbivori→kills; **NON DIMOSTRATO** per la dipendenza causale dei carnivori dalle prede e per le ipotesi trofiche forti; **ANOMALIA** per l'accoppiamento strutturale dei tratti.

Nessuna modifica ha interessato `simulation/**`, geni, mutazioni, ereditarietà, selezione, riproduzione, metabolismo, predazione, renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**`, `tests/e1/**` o formati di salvataggio.

---

## 2. Scheda esperimento

| Campo | Contenuto |
|---|---|
| **Domanda** | I carnivori (etichetta di tratto) seguono erbivori, uccisioni e proxy di risorsa con un ritardo misurabile? I gruppi trofici persistono? |
| **Ipotesi** | H1 lag positivo erbivori→carnivori in S06; H2 collasso prede seguito da declino predatori; H3 kills ≈0 in S05; H4 persistenza/coesistenza in S06; H5 robustezza a seed/durata/cadenza |
| **Scenari E1 riutilizzati** | S04 `herbivore` (128×128/150), S05 `carnivore` (128×128/150), S06 `mixed` (**160×160/180**, 90/90) |
| **Seed** | A/C/D 1–12; B 13–24 |
| **Durata / cadenza** | A/B 2700 tick, `sampleEvery=10`; C 900 tick, `sampleEvery=10`; D 2700 tick, `sampleEvery=5`, solo S06 |
| **Lag massimo** | 200 tick (20 campioni a `sampleEvery=10`), intero; i lag sono in **tick**, non campioni |
| **Unità statistica** | corsa/seed. I 271 campioni per corsa non sono repliche indipendenti |
| **Confronti** | appaiati per seed via `pairedDifference` E1; non randomizzati ⇒ descrittivi |
| **Strumenti additivi** | `tools/e2/trophic.ts`, `tools/e2/foodWebReport.ts`, estensione di `tools/e2/scenarios.ts` |
| **Test additivi** | `tests/e2/trophic.test.ts`, `tests/e2/foodWebReport.test.ts` |
| **Script** | `scripts/e2_foodweb.experiment.ts`, `scripts/e2_foodweb_sensitivity.experiment.ts`, `scripts/e2_foodweb_dataset.experiment.ts` |

---

## 3. Integrità dei dati eseguiti

| Blocco | Corse | Seed | Tick | sampleEvery | Tempo simulazione (s) | Exit |
|---|---:|---|---:|---:|---:|---:|
| A — primario | 36/36 | 1–12 | 2700 | 10 | 501,661 | **0** |
| B — replica seed | 36/36 | 13–24 | 2700 | 10 | 495,288 | **0** |
| C — durata | 36/36 | 1–12 | 900 | 10 | 196,229 | **0** |
| D — campionamento fine | 12/12 | 1–12 | 2700 | 5 | 265,474 | **0** |
| S — sensibilità | — | — | — | — | 2,09 (solo test) | **0** |
| DS — dataset | 120 corse archiviate | — | — | — | 1,67 (solo test) | **0** |

Derivate senza nuove corse: troncamento di A a 900 tick e sottocampionamento di A a `sampleEvery=20`. Il troncamento di A riproduce **esattamente** il blocco C su tutte le metriche confrontate (`truncatedPrimaryMatchesGenuineDuration=true`): controllo di determinismo del motore e della pipeline analitica.

---

## 4. Cosa è misurabile e cosa non lo è

| Misurabile in E2.2 | Non osservabile senza modifiche al motore |
|---|---|
| Conteggi approssimati di tratto: `population × frazione` | Ruolo effettivo (attaccante/preda) di un individuo |
| `predationKills` al tick campionato, `cumulativePredationKills`, tasso intervallare Δ/Δtick | ID predatore/preda, tentativi falliti, rete trofica individuale |
| `deaths` separato da `predationKills` (A07) | Causa individuale di morte; flusso energetico individuale (A05) |
| `occupiedVegetation` su celle occupate (`peekCell`) | Stock vegetazionale globale, domanda regionale (A06) |
| `speciesCounts`, frazioni, tratti medi | `meanFitness` nelle serie; mappa genitore→figlio |

**Conseguenza operativa:** ogni conclusione di seguito usa tratti, eventi contati o proxy di risorsa; nessuna ricostruisce la rete trofica individuale.

---

## 5. Risultati

### 5.1 Popolazione e predazione (blocco A, 2700 tick, 12 seed)

| Scenario | Kills cumulativi (media ± SD; CI95) | Tasso kills/tick | Conteggio medio erbivoro | Conteggio medio carnivoro | Coesistenza media |
|---|---|---|---:|---:|---:|
| S04 erbivoro | **0 ± 0** [0; 0] | 0 | 73,55 | 0 | 0 |
| S05 carnivoro | **0 ± 0** [0; 0] | 0 | 0 | 49,71 | 0 |
| S06 misto | **54,67 ± 8,35** [49,36; 59,97] | 0,0202 | 15,46 | 51,90 | 0,9963 |

I conteggi medi sono le medie cross-seed delle serie temporali di tratto; i valori *finali* dell'ultimo campione sono diversi (S04 erbivoro 135,67; S05 carnivoro 83,08; S06 erbivoro 12,00 e carnivoro 142,17) e sono usati solo nei confronti appaiati del §5.5.

S04 mantiene il tratto erbivoro in 12/12 seed; S05 mantiene quello carnivoro in 12/12; S06 mantiene entrambi in 11/12 e 12/12 rispettivamente. In S06 una sola corsa perde il tratto erbivoro, al tick 2590, senza successiva perdita del tratto carnivoro entro l'orizzonte.

**H3 è supportata come dato:** 0 kills in 36/36 corse S04 e 36/36 corse S05 (blocchi A+B+C), contro 49–70 in S06. L'interpretazione meccanicistica (A04: tutti i fondatori S04 sotto soglia di caccia; S05 sopra soglia ma sotto il limite di immunità apicale, quindi nessuna preda idonea) è coerente con il codice, ma **E2.2 non manipola l'anomalia**: non la dimostra come causa.

### 5.2 Correlazioni e lag (S06, blocco A)

| Coppia (a → b) | r detrendizzata a lag 0 | Picco lag (tick) | \|r\| al picco | Seed con lag >0 | Seed con lag =0 | Seed con lag <0 | Classificazione |
|---|---:|---:|---:|---:|---:|---:|---|
| tratto erbivoro → tratto carnivoro | 0,807 | −1,67 | 0,808 | 1/12 | 8/12 | 3/12 | NON DIMOSTRATO |
| **tratto erbivoro → tasso kills** | 0,788 | **+10,0** | **0,819** | **12/12** | 0/12 | 0/12 | **EVIDENZA (sequenzialità)** |
| tratto carnivoro → tasso kills | 0,686 | 0,0 | 0,694 | 6/12 | 1/12 | 5/12 | INDICATIVO |
| vegetazione occupata → tratto erbivoro | −0,052 | −38,33 | 0,027 | 4/12 | 3/12 | 5/12 | NON DIMOSTRATO |
| vegetazione occupata → tratto carnivoro | −0,071 | +35,83 | 0,036 | 7/12 | 2/12 | 3/12 | NON DIMOSTRATO |

Il picco erbivori→kills è a **esattamente 10 tick in 12/12 seed** (r 0,687–0,890, CI95 [0,782; 0,857]). Poiché 10 tick è anche la cadenza di campionamento, la stima è limitata dalla risoluzione: con `sampleEvery=5` il picco si sposta a 5,83 tick (§6.3). Il segno è comunque stabile in tutti i blocchi. Nessuna coppia mostra `spuriousTrendRisk=true`: l'euristica non rileva trend comuni con correlazione residua collassata, il che **non dimostra che il rischio sia assente**.

La coppia tratto carnivoro→kills ha correlazione alta ma lag molto vario (−30…+30 tick, SD 16,5): è indicativa di coviazione, non di sequenzialità.

### 5.3 Accoppiamento strutturale dei tratti (diagnostico additivo)

| Quantità (S06, 12 seed) | Media | SD | CI95 | Intervallo |
|---|---:|---:|---|---|
| Correlazione conteggi erbivori/carnivori | 0,2556 | 0,5316 | [−0,0822; 0,5934] | −0,671 … 0,970 |
| Correlazione **frazioni** erbivora/carnivora | **−1,000** | 0 | [−1; −1] | −1 |
| Correlazione popolazione/conteggio erbivoro | 0,5476 | — | — | — |
| Correlazione popolazione/conteggio carnivoro | 0,9079 | — | — | — |

Il valore −1 esatto non è un risultato ecologico: `herbivoreFraction = 1 − carnivoreFraction` è un'identità di codifica, quindi la correlazione delle frazioni è −1 per costruzione in ogni seed. I conteggi, d'altra parte, sono entrambi proporzionali a `population`, per cui la loro correlazione riflette la variazione demografica condivisa (e la complementarietà) e non una relazione preda-predatore. **Ne consegue che la correlazione tratto↔tratto non può essere usata come evidenza trofica in questo esperimento.** È stato il motivo per cui l'H1 è stata classificata NON DIMOSTRATO nonostante `r≈0,81` a lag 0.

### 5.4 Persistenza, stabilità e oscillazioni

| Metrica (S06, blocco A) | Erbivori | Carnivori |
|---|---:|---:|
| Media della serie | 15,46 | 51,90 |
| CV | 0,9608 | 0,6037 |
| Autocorrelazione lag-1 | 0,9971 | 0,9967 |
| Trend slope (per tick) | −0,0079 | +0,0358 |
| Intervallo medio tra picchi (tick) | 27,10 | 60,48 |

L'autocorrelazione ~0,997 indica serie molto persistenti, coerenti con trend demografici lenti; le "oscillazioni" rilevate dall'euristica di prominence (10% dell'escursione) non costituiscono prova di cicli preda-predatore. La vegetazione occupata media è 0,3175 con slope arrotondato a 0: nessun trend lineare risolto a 2700 tick.

### 5.5 Confronti appaiati (blocco A)

| Confronto | differenza media | CI95 | Interpretazione |
|---|---:|---|---|
| S06 − S05 kills cumulativi | +54,67 | [49,36; 59,97] | differenza netta, ma S06 differisce anche per geometria e densità |
| S06 − S04 kills cumulativi | +54,67 | [49,36; 59,97] | come sopra |
| S06 − S05 tasso kills | +0,0202 | [0,0183; 0,0222] | coerente con la presenza di prede idonee |
| S06 − S05 correlazione detrendizzata lag 0 | +0,8072 | [0,6907; 0,9238] | strutturale (§5.3), non trofica |
| S06 − S04 conteggio erbivoro finale | −123,67 | [−183,99; −63,34] | descrittivo; geometria/densità confondono |

I confronti sui conteggi di tratto hanno CI95 che includono lo 0 in almeno un blocco (es. S06−S05 carnivori: −109,29…227,46 nel blocco A): non vengono usati per conclusioni.

### 5.6 Dipendenza dei carnivori: verdetto

La valutazione `assessCarnivoreDependence` sulla coppia erbivori→carnivori dà **NON DIMOSTRATO** in tutti i blocchi e scenari (0–3/12 seed con lag positivo forte, soglia ≥10 per EVIDENZA). Ciò **non significa che i carnivori non dipendano dalle prede**: significa che la dipendenza non è identificabile con le osservazioni disponibili. I motivi sono (i) l'identità complementare dei tratti, (ii) l'assenza di ID predatore/preda, (iii) l'immunità apicale A04 che vieta la predazione tra conspecifici a `carnivory=0,6`, (iv) la mancata manipolazione delle popolazioni.

Il segnale erbivori→kills (§5.2) mostra che le uccisioni registrate seguono l'abbondanza del tratto erbivoro, ma **non identifica i carnivori come causa**: in S06 gli unici predatori idonei sono i portatori del tratto carnivoro, tuttavia il conteggio di quel tratto non precede le kills in modo coerente (6/12 lag positivi, 5/12 negativi).

---

## 6. Sensibilità

### 6.1 Seed (A: 1–12 vs B: 13–24)

| Metrica S06 | A | B | Δ |
|---|---:|---:|---:|
| Kills cumulativi | 54,67 | 70,00 | +15,33 |
| Conteggio carnivoro medio | 51,90 | 32,12 | −19,79 |
| Conteggio erbivoro medio | 15,46 | 18,02 | +2,57 |
| Coesistenza media | 0,9963 | 0,9686 | −0,0277 |
| Lag picco erbivori→carnivori | −1,67 | −20,83 | −19,17 |
| Lag picco erbivori→kills | +10,0 | +11,67 | +1,67 |

Le classificazioni coincidono in 3/3 scenari; il segno del lag tratto↔tratto coincide in 3/3 scenari (ma è un segno "non consistente" in entrambi). Le magnitudini di kills e tratti cambiano sensibilmente: la replica di seed ha kill massime 159 contro 68 del blocco primario. **La direzione del risultato è stabile, la quantità no.**

### 6.2 Durata (A: 2700 vs C: 900 tick)

| Metrica S06 | 2700 | 900 | Δ |
|---|---:|---:|---:|
| Kills cumulativi | 54,67 | 49,17 | −5,50 |
| Conteggio carnivoro medio | 51,90 | 28,31 | −23,59 |
| Conteggio erbivoro medio | 15,46 | 23,07 | +7,61 |
| Coesistenza media | 0,9963 | 1,0000 | +0,0037 |
| Lag picco erbivori→carnivori | −1,67 | +2,50 | +4,17 |
| Lag picco erbivori→kills | +10,0 | +10,0 | 0 |

Il segno del lag tratto↔tratto **non è stabile** tra durate (coincidenza 2/3 scenari); la sequenzialità erbivori→kills lo è. Il troncamento di A a 900 tick riproduce C esattamente su 8 metriche e sulla classificazione: `truncatedPrimaryMatchesGenuineDuration=true`.

### 6.3 Frequenza di campionamento (S06)

| Variante | sampleEvery | lag 0 H→C | Picco H→C (tick) | Seed lag>0 forti | Picchi su griglia 20 tick |
|---|---:|---:|---:|---:|---:|
| A (primaria) | 10 | 0,8072 | −1,67 | 1/12 | 8/12 |
| D (fine) | 5 | 0,8044 | −2,50 | 1/12 | 7/12 |
| A→20 (derivata) | 20 | 0,8124 | −3,33 | 0/12 | 12/12 |

La correlazione a lag 0 è sostanzialmente invariata (0,804–0,812), ma la risoluzione del lag cambia: a `sampleEvery=5` compaiono picchi a 5 e −5 tick non stimabili a 10; la serie derivata a 20 vincola tutti i picchi alla griglia di 20 tick. Per la coppia erbivori→kills il picco passa da 10,0 tick (sample10) a 5,83 tick (sample5): il ritardo osservato è quindi **al più dell'ordine di 10 tick** e la stima a 10 tick è un artefatto di risoluzione, non un valore preciso.

---

## 7. Classificazione delle ipotesi

| Ipotesi | Esito | Classe | Base |
|---|---|---|---|
| H1 — lag positivo erbivori→carnivori | Non confermata; 1–3/12 seed con lag positivo, correlazione strutturale | **NON DIMOSTRATO** | §5.2, §5.3, §6 |
| H1b — lag positivo erbivori→kills | 12/12 seed in tutti i blocchi | **EVIDENZA (sequenzialità, non causalità)** | §5.2 |
| H2 — estinzione prede seguita da predatori | Perdite di tratto in 1–2/12 corse: erbivoro in A seed 3 (tick 2590) e B seed 20 (tick 2500), carnivoro in B seed 13 (tick 1900). **0 casi** di perdita del tratto carnivoro successiva a una perdita del tratto erbivoro | **NON DIMOSTRATO / non testabile** | §5.1 |
| H3 — kills ≈0 in S05 | 0 in 36/36 corse S05 e 36/36 S04 | **EVIDENZA (dato); A04 coerente ma non manipolato** | §5.1 |
| H4 — persistenza/coesistenza in S06 | 0,9686–1,000; 12/12 seed >50% | **EVIDENZA (descrittiva)** | §5.1 |
| H5 — robustezza | Classi stabili; magnitudini no; segno lag tratto↔tratto instabile con durata | **EVIDENZA parziale / INDICATIVO** | §6 |

---

## 8. Limiti espliciti e anomalie

1. **Tratti ≠ ruoli.** `carnivory ≥ 0.35` è una soglia di etichetta; `herbivoreFraction` è il complemento. Non sappiamo chi abbia ucciso chi.
2. **Identità strutturale.** La correlazione delle frazioni è −1 per costruzione; i conteggi condividono `population`. La correlazione tratto↔tratto non è evidenza trofica (§5.3).
3. **Correlazione ≠ causalità.** Nessun seed è randomizzato e nessuna popolazione è stata manipolata. I lag sono sequenzialità osservazionale.
4. **Kills ≠ mortalità totale.** `predationKills` è separato da `deaths` (A07); fame e vecchiaia non sono separabili per individuo.
5. **Risoluzione del lag.** Con `sampleEvery=10` solo multipli di 10 tick sono stimabili; la cadenza cambia la stima numerica del ritardo (§6.3).
6. **Geometria confusa.** S06 è 160×160/180 contro 128×128/150 di S04/S05: i confronti appaiati non isolano la dieta.
7. **Proxy di risorsa.** `occupiedVegetation` è una media su celle occupate, non uno stock; per A06 la depletion segue la domanda, non il guadagno.
8. **Anomalie engine.** A04 (immunità apicale) spiega le kills nulle; A05 energia non conservativa; A08 osservazione che materializza chunk (evitata usando `peekCell`); A10 Allee effect; A12 doc drift. Nessuna è stata corretta.
9. **Orizzonte.** 2700 tick non garantiscono assenza di cicli più lenti o di collassi tardivi; le 3 perdite di tratto osservate avvengono tra 1900 e 2590 tick.
10. **Campioni E1 arrotondati.** Le frazioni hanno 4 decimali: i conteggi di tratto sono approssimati.

---

## 9. Dataset, manifest e verifiche

| Controllo | Risultato |
|---|---|
| Payload SHA-256 letto dall'archivio | `755d2a4f…e772d` — corrisponde al manifest |
| Archive SHA-256 su disco | `d407c8d3…b79` — corrisponde al manifest |
| `sourceSha256` E2 ricalcolato | `ee1e362e…5877` — corrisponde |
| `e1SourceSha256` ricalcolato | `24dec478…51fe` — corrisponde |
| Riga generazione | `codeCommit=b604b03`, `workingTreeDirty=false` |
| Corse archiviate | 120; configurazioni 120; scenari 3 |
| Input hashing | 5 SHA-256 in `dataset.auxiliary.inputs` |
| Coerenza report↔dataset | 5/5 uguali per serializzazione canonica (`main`, `seedReplication`, `duration`, `sampling`, `sensitivity`) |
| Riproducibilità bit-per-bit | Seconda generazione con lo stesso commit/timestamp: archivio e manifest **byte-identici** |
| Troncamento A→900 vs blocco C | `true` su tutte le metriche e classificazioni |
| File vietati modificati rispetto a `d330c12` | nessuno |

---

## 10. Verifiche eseguite

Comandi eseguiti con Node `v22.14.0` e `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.

| Comando | Output essenziale | Exit code |
|---|---|---:|
| `npx tsc --noEmit --incremental false` | nessun output diagnostico | **0** |
| `npx vitest run tests/e2` | `Test Files 12 passed (12)` · `Tests 49 passed (49)` | **0** |
| `npx vitest run tests/e1` | `Test Files 7 passed (7)` · `Tests 65 passed (65)` | **0** |
| `npm run build` | Next.js 16.3.0 (Turbopack), `Compiled successfully`, `Finished TypeScript`, 3/3 pagine statiche | **0** |
| `scripts/e2_foodweb.experiment.ts` (A/B/C/D) | 36+36+36+12 corse, 10 confronti per blocco, `exit 0` | **0** |
| `scripts/e2_foodweb_sensitivity.experiment.ts` | 24 righe seed, 24 durata, `truncationMatches=true` | **0** |
| `scripts/e2_foodweb_dataset.experiment.ts` | manifest e archivio scritti, `totalRuns=120`, `workingTreeDirty=false` | **0** |
| rigenerazione dataset | hash identici, archivio e manifest byte-identici | **0** |

Nessuna verifica non eseguita viene dichiarata come eseguita.

---

## 11. Conclusione e gate

E2.2 risponde alla domanda con una distinzione netta. **I carnivori non risultano seguire i tratti erbivori con un lag coerente**, ma le uccisioni registrate seguono l'abbondanza del tratto erbivoro con un ritardo breve e ripetibile in 12/12 seed. Poiché le frazioni di tratto sono identicamente complementari e i conteggi condividono la popolazione, la correlazione tra tratti è strutturalmente non informativa: la dipendenza trofica causale resta **NON DIMOSTRATO**. Le kills nulle in S04/S05 sono coerenti con l'immunità apicale A04, ma non costituiscono una prova del meccanismo.

**Gate E2.2 → E2.3:** non inferire assenza di dipendenza trofica dal mancato lag tratto→tratto. Prima di ogni affermazione ecologica verificare A04 (immunità apicale) e A01 (bucket non toroidali). E2.3 può procedere sullo studio della competizione, ma deve evitare l'uso di correlazioni tra tratti come evidenza.

Consegna completata su `research/e2-ecosystem-dynamics`: audit, matrice, strumenti, test, 120 corse, sensibilità, dataset `e2.2-foodweb`, manifest e report. **Nessun merge in `main`, nessuna PR aperta. Il lavoro si ferma qui in attesa di review indipendente prima di E2.3.**

---

## 12. Riproduzione

```powershell
$env:Path = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:Path
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
$out = 'C:\Users\matti\AppData\Local\Temp\opencode\e2.2-results'

function Run-Block($label, $seeds, $ticks, $sampleEvery, $scenarios, $file) {
  $env:E2_FOODWEB_LABEL = $label
  $env:E2_FOODWEB_SEEDS = $seeds
  $env:E2_FOODWEB_TICKS = $ticks
  $env:E2_FOODWEB_SAMPLE_EVERY = $sampleEvery
  $env:E2_FOODWEB_MAX_LAG = '200'
  if ($scenarios) { $env:E2_FOODWEB_SCENARIOS = $scenarios } else { Remove-Item Env:E2_FOODWEB_SCENARIOS -ErrorAction SilentlyContinue }
  $env:E2_FOODWEB_OUT = "$out\$file"
  npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts
}

Run-Block 'main' '1,2,3,4,5,6,7,8,9,10,11,12' '2700' '10' $null 'e2.2-main.json'
Run-Block 'seed' '13,14,15,16,17,18,19,20,21,22,23,24' '2700' '10' $null 'e2.2-seed.json'
Run-Block 'duration' '1,2,3,4,5,6,7,8,9,10,11,12' '900' '10' $null 'e2.2-duration.json'
Run-Block 'sampling' '1,2,3,4,5,6,7,8,9,10,11,12' '2700' '5' 'S06_predator_prey_mixed' 'e2.2-sampling.json'

$env:E2_FOODWEB_SENS_MAIN = "$out\e2.2-main.json"
$env:E2_FOODWEB_SENS_SEED = "$out\e2.2-seed.json"
$env:E2_FOODWEB_SENS_DURATION = "$out\e2.2-duration.json"
$env:E2_FOODWEB_SENS_SAMPLING = "$out\e2.2-sampling.json"
$env:E2_FOODWEB_SENS_OUT = "$out\e2.2-sensitivity.json"
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts

$env:E2_FOODWEB_DATASET_MAIN = "$out\e2.2-main.json"
$env:E2_FOODWEB_DATASET_SEED = "$out\e2.2-seed.json"
$env:E2_FOODWEB_DATASET_DURATION = "$out\e2.2-duration.json"
$env:E2_FOODWEB_DATASET_SAMPLING = "$out\e2.2-sampling.json"
$env:E2_FOODWEB_DATASET_SENSITIVITY = "$out\e2.2-sensitivity.json"
$env:E2_FOODWEB_DATASET_OUT_DIR = 'docs/research/e2/datasets'
$env:E2_FOODWEB_DATASET_LABEL = 'e2.2-foodweb'
$env:E2_FOODWEB_DATASET_CODE_COMMIT = 'b604b031c32ac10f0fbcab67d3624942074c1ed0'
$env:E2_FOODWEB_DATASET_WORKING_TREE_DIRTY = '0'
$env:E2_FOODWEB_DATASET_EXECUTED_AT = '2026-11-18T12:30:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts
```

`readDataset(archive, manifest)` in `tools/e2/dataset.ts` verifica `payloadSha256` e `archiveSha256`; i test E2 coprono la riproducibilità byte-per-byte della generazione.
