# E2 — Matrice sperimentale (E2.1 – E2.6)

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
**Data:** 2026-11-18
**Stato:** E2.1 completata con review scientifica (48 corse pilota + 96 corse di isolamento); in attesa di review indipendente prima di E2.2. E2.2–E2.6 restano pianificate.

Questo documento definisce le domande, i disegni e i criteri di decisione delle sottofasi E2. Le fasi successive possono essere riorganizzate se i dati E2.1 mostrano che un'altra sequenza è scientificamente più corretta. Nessun risultato è anticipato: i risultati appartengono ai report di fase.

---

## 1. Protocollo comune

| Elemento | Regola |
|---|---|
| Infrastruttura | Solo E1 (`tools/e1/**`) immutato; metriche addittive in `tools/e2/**` |
| Modifiche al motore | Vietate. Anomalie documentate, non corrette |
| Seed | 12 seed espliciti `1..12` per ogni esperimento comparativo (minimo assoluto) |
| Unità statistica | corsa/seed, **mai** tick di una singola corsa |
| Confronti | appaiati per seed tramite `pairedDifference` di E1; non casuali ⇒ descrittivi, non causali |
| Statistiche | media, mediana, SD campionaria, CI95 (t di Student), distribuzione per seed, effect size come differenza appaiata |
| Serie temporali | `sampleEvery=10` su 900 tick; `sampleEvery=5` o 10 su orizzonti più lunghi |
| Runtime | Node `v22.14.0` / V8 `12.4.254.21-node.22`; versioni diverse alterano i risultati |
| Output grezzo | JSON completo con `results`, `scientificReport`, `protocol`, `runtime` |
| Archivio | gzip + manifest con `payloadSha256`, `archiveSha256`, checksum sorgenti E2 ed E1 separati |
| Classificazione | VERIFICATO / EVIDENZA / INDICATIVO / NON DIMOSTRATO / ANOMALIA |

**Regola di inferenza:** un Pattern osservato in ≥10/12 seed con CI95 che esclude 0 diventa al massimo **EVIDENZA**; la causalità richiederebbe randomizzazione dei seed o interventi controllati aggiuntivi, non disponibili in E2.

**Regola di durata:** 900 tick/~2.25 anni per dinamiche rapide; 2700 tick/~6.75 anni per fenomeni evolutivi; 5000 tick/~12.5 anni solo se E2.6 mostra eventi di speciazione troppo rari. Il costo di un run E1 da 900 tick è dell'ordine di 8 secondi; un blocco di 48 corse richiede circa 6 minuti.

---

## 2. Panoramica

| ID | Fase | Domanda centrale | Scenari E1 riusati | Durata | Stato |
|---|---|---|---|---|---|
| E2.1 | Population Stability | Le popolazioni raggiungono equilibri stabili e quali variabili spiegano le differenze osservate? | S01, S02, S06, S08; bracci I0/IG/ID/IGD; S09, S10, S13, S14 | 900 tick | Completata (review) |
| E2.2 | Food Web Dynamics | I predatori dipendono realmente dalle prede e con quali ritardi? | S04, S05, S06 | 2700 tick | Pianificata |
| E2.3 | Competition & Coexistence | La competizione produce esclusione o coesistenza? | S01, S06, S09, S10, S13, S14 | 900-2700 tick | Pianificata |
| E2.4 | Biodiversity & Complexity | La biodiversità è persistente e correlata alla stabilità? | S01, S06, S09, S10, S12 | 2700 tick | Pianificata |
| E2.5 | Resilience & Perturbation | L'ecosistema recupera dopo cull e shock di risorse? | S08 + S01 appaiato (+ S13/S14 come controllo risorse) | 900-1800 tick | Classificazione appaiata completata in E2.1; estensione pianificata |
| E2.6 | Evolution & Speciation | Mutazione, deriva e speciazione sono distinguibili? | S01, S11, S12 | 2700-5000 tick | Pianificata |

---

## 3. E2.1 — Population Stability

| Campo | Contenuto |
|---|---|
| **ID** | E2.1 |
| **Titolo** | Stabilità demografica, isolamento variabili, correlazione detrendizzata e resilienza appaiata |
| **Domanda scientifica** | Le popolazioni raggiungono equilibri stabili? Quali differenze sopravvivono all'isolamento di geometria, densità e risorse? Le correlazioni trofiche resistono al detrending? S08 recupera rispetto a S01 appaiato? |
| **Ipotesi** | H1: equilibrio baseline stabile; H2: scarsità/densità riduce popolazione e aumenta variabilità; H3: sistema misto più variabile; H4: recupero dopo cull80 entro 450 tick. La review non conferma H2 come effetto della scarsità |
| **Variabile indipendente** | Pilota: scenario S01/S02/S06/S08. Review: una variabile alla volta — geometria (I0 vs IG), densità (I0 vs ID), combinazione (I0 vs IGD), risorse/posizione (S09/S10/S13/S14) |
| **Variabili dipendenti** | popolazione finale, frazione di sopravvivenza, CV, trend, lag-1, oscillazioni, AUC, estinzione, speciazione, biodiversità, vegetazione occupata, correlazione originale/detrendizzata, esiti di recupero |
| **Controllo** | S01 per il pilota e per S08; `I0_control_128x128_150` per geometria/densità; S09/S13/S14 per risorse/posizione; sempre appaiato per seed |
| **Condizioni iniziali** | tabelle E1 immutate; bracci custom costruiti tramite `ScenarioSpec` pubblico; S13/S14 abilitati con `habitatControls: true`; cull deterministico a tick 450 |
| **Seed** | 1–12; 48 corse pilota + 96 corse isolamento = 144 corse |
| **Durata** | 900 tick, campionamento ogni 10 tick (91 punti/corsa) |
| **Protocollo** | `scripts/e2_population_pilot.experiment.ts`, `scripts/e2_variable_isolation.experiment.ts`, `scripts/e2_correlation_review.experiment.ts` (`E2_CORRELATION_MAX_LAG=50`), `scripts/e2_resilience_review.experiment.ts`, `scripts/e2_dataset_review.experiment.ts` |
| **Metriche** | `tools/e2/metrics.ts`, `tools/e2/timeseries.ts` (con detrending), `tools/e2/isolation.ts`, `tools/e2/correlationReview.ts`, `tools/e2/resilience.ts`, `tools/e2/resilienceReview.ts`; 4 confronti pilota + 10 confronti isolamento |
| **Risultati** | [Report revisionato](E2_1_PILOT_REPORT.md); dataset [e2.1-review.json.gz](datasets/e2.1-review.json.gz) e [manifest](datasets/e2.1-review.manifest.json) |
| **Limiti** | 12 seed non randomizzati; 900 tick possono essere troppo brevi; nessuno scalar globale per le risorse; geometria-only approssima la densità dell'1,3%; lag stimabili solo multipli di 10; le categorie di recupero sono entro l'orizzonte |
| **Interpretazione** | Confronti descrittivi per seed; nessuna correlazione o differenza è interpretata come causalità; S02 grezzo è classificato come confuso |
| **Conclusione** | Vedere [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) §9: equilibrio non supportato, attribuzione alla scarsità non dimostrata, in attesa di review indipendente |

---

## 4. E2.2 — Food Web Dynamics

| Campo | Contenuto |
|---|---|
| **ID** | E2.2 |
| **Titolo** | Dinamiche preda-predatore e ritardi demografici |
| **Domanda scientifica** | I predatori seguono le prede con un ritardo misurabile? Esistono cicli o collassi a cascata? |
| **Ipotesi** | H1: in S06 la cross-correlazione tra erbivori e carnivori ha un lag positivo significativo; H2: l'estinzione delle prede è seguita da declino dei predatori; H3: S05 (carnivori stressati) produce zero o pochissime uccisioni |
| **Variabile indipendente** | composizione dietetica iniziale: erbivora (S04), carnivora (S05), mista (S06) |
| **Variabili dipendenti** | conteggio erbivori (`population × herbivoreFraction`), conteggio carnivori (`population × carnivoreFraction`), `predationKills` per tick, `predationPressure`, lag di cross-correlazione, tempo di estinzione di ciascun gruppo, autocorrelazione delle serie |
| **Controllo** | S04 come controllo senza predazione attesa; confronto appaiato S06−S05 |
| **Condizioni iniziali** | tabelle E1 S04/S05/S06; stessa geometria e popolazione iniziale |
| **Seed** | 1–12 |
| **Durata** | 2700 tick (verifica se i cicli emergono solo su scale lunghe); `sampleEvery=10` |
| **Protocollo** | nuovo script `scripts/e2_foodweb.experiment.ts` (additivo); riutilizza `compareCrossCorrelations` e `analyzeTrophicCorrelation` già introdotti nella review E2.1. `maxLag` è in tick: con `sampleEvery=10`, 50 tick corrispondono a 5 campioni |
| **Metriche** | lag ottimale in tick, correlazione massima, conteggio uccisioni cumulativo, tempo al primo collasso di prede/predatori |
| **Risultati** | Da produrre |
| **Limiti** | La classificazione carnivoro/erbivoro usa soglia `carnivory ≥ 0.35`, non il ruolo effettivo in un attacco; nessun ID predatore/preda; i bucket non toroidali (A01) possono alterare la caccia ai bordi; l'immunità apicale (A04) tronca le catene |
| **Interpretazione** | Un lag è evidenza di sequenzialità temporale, non di causalità; la causalità richiederebbe manipolazione delle popolazioni, non disponibile |
| **Conclusione** | Da produrre |

---

## 5. E2.3 — Competition & Coexistence

| Campo | Contenuto |
|---|---|
| **ID** | E2.3 |
| **Titolo** | Competizione, dominanza ed esclusione competitiva |
| **Domanda scientifica** | Le specie che condividono risorse si escludono, coesistono, o semplicemente non competono in modo misurabile? |
| **Ipotesi** | H1: la dominanza (`max count / popolazione`) cresce nel tempo; H2: i controlli a risorse scambiate (S13/S14) mostrano che la posizione e le risorse hanno effetti distinguibili; H3: la coesistenza prolungata richiede differenziazione di nicchia osservabile tramite `meanFitness` e tratti |
| **Variabile indipendente** | qualità delle risorse e posizione dei fondatori (S09 povero, S10 ricco, S13 posizione povera/risorse ricche, S14 posizione ricca/risorse povere), più S01/S06 come confronto |
| **Variabili dipendenti** | dominanza, numero effettivo di specie, Shannon, evenness, turnover Jaccard, persistenza per specie, vegetazione occupata, `SpeciesHabitat.meanFitness` |
| **Controllo** | S13 vs S14 disaccoppia posizione e risorse; S01 come baseline comune |
| **Condizioni iniziali** | tabelle E1 S09/S10/S13/S14 (campionamento regolare, `globalExtremesClaimed: false`) |
| **Seed** | 1–12 |
| **Durata** | 900 tick per confronto diretto; estensione a 2700 se la dominanza non si stabilizza |
| **Protocollo** | script additivo `scripts/e2_competition.experiment.ts`; confronti appaiati S13−S09, S10−S14, S14−S09, S10−S13 (riutilizzando la logica E1 `habitatComparison` come riferimento, non modificandola) |
| **Metriche** | `tools/e2/diversity.ts`, `tools/e2/statistics.ts` |
| **Risultati** | Da produrre |
| **Limiti** | Nessun evento di competizione per individuo; il prelievo vegetazionale è una media su celle occupate; le etichette di habitat sono campionate, non estremi globali; dominanza alta non dimostra esclusione competitiva |
| **Interpretazione** | La coesistenza osservata va definita "assenza di esclusione misurabile", non prova di nicchie stabili |
| **Conclusione** | Da produrre |

---

## 6. E2.4 — Biodiversity & Ecosystem Complexity

| Campo | Contenuto |
|---|---|
| **ID** | E2.4 |
| **Titolo** | Biodiversità, persistenza e relazione con la stabilità |
| **Domanda scientifica** | La biodiversità è persistente e maggiore stabilità demografica è associata a maggiore diversità? |
| **Ipotesi** | H1: la ricchezza di specie cresce o si mantiene su 2700 tick in almeno uno scenario; H2: la dominanza rimane bassa dove la diversità è alta; H3: esiste una correlazione cross-seed tra diversità media e CV della popolazione |
| **Variabile indipendente** | scenario/contesto ambientale (S01, S06, S09, S10, S12) |
| **Variabili dipendenti** | ricchezza, Shannon, evenness, dominanza, diversità effettiva, turnover, persistenza per specie, correlazione cross-seed diversità↔stabilità |
| **Controllo** | S01; analisi di sensibilità rimuovendo i seed con estinzione totale |
| **Condizioni iniziali** | tabelle E1, geometrie documentate |
| **Seed** | 1–12 |
| **Durata** | 2700 tick (`sampleEvery=10`) |
| **Protocollo** | script additivo `scripts/e2_biodiversity.experiment.ts`; indici multipli obbligatori (nessun indice singolo) |
| **Metriche** | `tools/e2/diversity.ts` + summary cross-seed |
| **Risultati** | Da produrre |
| **Limiti** | 12 osservazioni per correlazione cross-seed ⇒ CI ampi; la correlazione non implica che la diversità causi stabilità; gli ID di specie dipendono anche da RNG nella speciazione |
| **Interpretazione** | Classificare come INDICATIVO se la correlazione non sopravvive alla rimozione di un singolo seed |
| **Conclusione** | Da produrre |

---

## 7. E2.5 — Resilience & Perturbation

| Campo | Contenuto |
|---|---|
| **ID** | E2.5 |
| **Titolo** | Resilienza dopo cull demografico e perturbazione delle risorse |
| **Domanda scientifica** | Dopo una riduzione controllata, l'ecosistema torna allo stato pre-perturbazione, recupera parzialmente, o no? |
| **Ipotesi** | H1: S08 recupera entro la fine dell'orizzonte; H0 (supportata da E1): non si osserva recupero demografico, coerente con Allee effect emergente |
| **Variabile indipendente** | severità/tipo di perturbazione: `cull80` (S08), `cull95` (estensione), shock di risorse tramite snapshot (estensione additiva, se implementabile senza toccare E1) |
| **Variabili dipendenti** | popolazione pre/post, `removed`/`kept`, drop frazionale, minimo post-shock, tempo di ritorno entro ±20% del baseline, persistenza/turturnover delle specie, stabilità post-perturbazione |
| **Controllo** | S01 senza perturbazione, stesso seed (già nel pilota E2.1) |
| **Condizioni iniziali** | snapshot a metà corsa; cull con quota totale stratificata per specie e selezione deterministica per hash |
| **Seed** | 1–12 |
| **Durata** | 900 tick nel pilota; 1800 tick per distinguere recupero lento da mancato recupero |
| **Protocollo** | `tools/e2/metrics.ts` → `resilience` più `tools/e2/resilience.ts` e `tools/e2/resilienceReview.ts` (classificazione assoluta, relativa al controllo, parziale, non osservata) introdotti nella review E2.1; estensione futura con `cull95` e shock risorse in script dedicato |
| **Metriche** | `returnTime`, `baselineBefore`, drop fraction, `PerturbationReport` |
| **Risultati** | Review E2.1: 0/12 assoluti, 0/12 relativi al controllo, 1/12 parziali, 11/12 senza recupero osservato entro 900 tick; estensione `cull95`/shock risorse da produrre |
| **Limiti** | `World.fromSnapshot()` azzera alcuni flag (A09); cull è genome-blind, quindi non testa selezione; nessun helper E1 per shock di risorse a metà corsa |
| **Interpretazione** | Mancato recupero va riportato come risultato, non come difetto; l'assenza di recupero entro 900 tick non prova irreversibilità |
| **Conclusione** | Da produrre |

---

## 8. E2.6 — Evolution & Speciation

| Campo | Contenuto |
|---|---|
| **ID** | E2.6 |
| **Titolo** | Diversificazione genetica, deriva e speciazione |
| **Domanda scientifica** | Si osserva cambiamento ereditario direzionale e speciazione riproducibile? È possibile distinguerlo dalla deriva? |
| **Ipotesi** | H1: la distanza genetica media cresce nel tempo; H2: si verificano eventi di speciazione secondo la regola operativa (`≥8` per cluster, separazione ≥4 celle, distanza ≥0.26, controllo ogni 200 tick); H3: il controllo a geni estesi inerti (S11) mostra traiettorie diverse rispetto a S01 solo se gli effetti genetici sono selettivamente rilevanti |
| **Variabile indipendente** | effetti genetici attivi vs inerti (S01 vs S11), orizzonte temporale (S12) |
| **Variabili dipendenti** | distanza genetica media campionata, tratti medi e SD, conteggio eventi di speciazione e tick di origine, persistenza delle nuove specie, distanza dal genoma parentale, ricchezza/turnover |
| **Controllo** | S11 come controllo neutrale per i geni estesi; S01 come baseline |
| **Condizioni iniziali** | tabelle E1 S01/S11/S12; `enableGeneEffects` gestito da E1 senza modificarlo |
| **Seed** | 1–12; se gli eventi restano <3, estensione a 24 seed |
| **Durata** | 2700 tick; 5000 solo se la frequenza di speciazione resta troppo bassa per inferenza |
| **Protocollo** | script additivo `scripts/e2_evolution.experiment.ts`; confronti appaiati S01−S11; uso di `getSpeciesTree()` e statistiche genetiche E1 |
| **Metriche** | `E2RunMetrics.genetics`, `speciationFrequency` E1, timeline eventi |
| **Risultati** | Da produrre |
| **Limiti** | Nessun fitness individuale, nessuna mappa genitore→figlio; la mutazione non è separabile dalla selezione senza controllo neutro; le soglie V2 possono essere miscalibrate; il `getSpeciesGenomeStats()` materializza chunk (A08) quindi va usato con cautela |
| **Interpretazione** | Un cambiamento di tratto **non** è adattamento senza controllo neutrale e covariazione con una pressione misurata; la speciazione va riportata come "evento secondo la regola operativa del motore" |
| **Conclusione** | Da produrre |

---

## 9. Gate decisionali e sequenza

1. **Gate E2.1 → E2.2:** se il pilota mostra estinzioni totali in >6/12 seed entro 900 tick, aumentare la durata o ridurre il sample interval prima di studiare le interazioni trofiche.
2. **Gate E2.2 → E2.3:** se non emerge alcun lag preda-predatore, non inferire assenza di dipendenza; verificare prima l'immunità apicale (A04) e i bucket non toroidali (A01).
3. **Gate E2.3 → E2.4:** se la dominanza è ~1 in tutti i seed, la biodiversità non è uno stato stabile e E2.4 diventa uno studio del collasso della diversità.
4. **Gate E2.4 → E2.5:** priorità alla resilienza se la biodiversità crolla; i confronti post-cull diventano più informativi dei confronti ambientali.
5. **Gate E2.5 → E2.6:** solo se la persistenza delle specie è misurabile ha senso misurare speciazione e persistenza delle nuove specie.

Ogni fase produce report + dataset + manifest + hash + test + limiti + anomalie + proposta per la successiva, e viene committata separatamente sul branch dedicato. **Nessun merge in `main`.**

---

## 10. Copertura dei requisiti

| Requisito | Dove è soddisfatto |
|---|---|
| ≥12 seed per esperimento comparativo | Protocollo comune (§1) |
| Condizioni iniziali comparabili | tabelle E1 e controlli dedicati |
| Una variabile indipendente alla volta | campi "Variabile indipendente" di ogni fase |
| Serie temporali | campionamento ogni 5-10 tick |
| Confronti appaiati | `pairedDifference` E1 tramite `tools/e2/statistics.ts` |
| Risultati grezzi e dataset portabili | gzip + manifest E2 |
| Classificazione delle conclusioni | Protocollo comune + report di fase |
| Nessuna causalità da seed non randomizzati | Regola di inferenza (§1) |
