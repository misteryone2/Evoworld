# GENOME — Piano di validazione (Rev 1)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 (open)  
**Revisione:** Rev 1 dopo la revisione tecnica di PR #4.  
**Stato:** piano progettuale; i test del Genome Engine **non sono ancora stati eseguiti** perché il motore mendeliano non esiste. L'unica baseline eseguita è quella GEN-0 di `main@5672f12`. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 1. Principi di validazione

1. **Ogni affermazione deve avere un output verificabile.** I risultati sono accompagnati da commit, comando esatto, seed, log e conteggi. Non si dichiara un test eseguito senza output.
2. **Nessun test viene allentato per farlo passare.** Timeout, soglie e asserzioni restano invariati; un failure viene indagato o classificato come pre-esistente con evidenza.
3. **Distinzione obbligatoria delle categorie:**
   - `OBSERVED`: valore emesso direttamente dal motore o letto da uno snapshot (es. conteggi di figli, frequenze alleliche osservate).
   - `DERIVED`: aggregato calcolato da eventi/snapshot con sorgente tracciata (es. eterozigosità, ricombinazione osservata, p-value).
   - `INFERRED`: conclusione che richiede controlli esterni. **Non autorizzato** dove i protocolli E2 lo vietano (attribuzione selezione vs deriva).
   - `NON_EVALUABLE` / `NON_VALUTABILE`: dato assente, ramo motore inesistente o controfattuale. Non si degrada a "neutro" né si converte in esito positivo.
4. **I risultati tecnici non sono prove scientifiche del mondo reale.** Un test di ereditarietà valida un'implementazione, non la biologia di un organismo reale.
5. **Confronto sempre con la baseline quiescente.** Ogni nuova suite viene confrontata con `main@5672f12` nello stesso ambiente.
6. **Soglie statistiche dichiarate prima dell'esecuzione.** α = 0,05 e intervalli di confidenza al 95% sono criteri di accettazione di progetto, non affermazioni biologiche.

---

## 2. Baseline verificata (GEN-0)

Ambiente: Node `v22.14.0`, Vitest `4.1.12`, Windows 11, CPU Intel i7-1365U.

| Esecuzione | Tempo test | Passati | Failed | Nota |
|---|---:|---:|---:|---|
| Integrazione finale (2026-11-19, `aac7516`) | ~380 s | 1098 | 6 | 6 failure deterministici noti |
| `main@5672f12`, rerun (2026-11-19) | ~419 s | 1096 | 8 | +2 timeout `planet.test.ts` |
| `main@5672f12`, GEN-0 con 4 agenti paralleli (2026-11-20) | ~1047 s | 1072 | 22 | 16 timeout + hook IV1-A a 300 s; **carico non rappresentativo** |
| `main@5672f12`, GEN-0 quiescente (2026-11-20, `gen0-baseline-quiescent.log`) | 252,56 s | 1082 | 22 | 17 timeout; 1 skipped; EXIT=1; **nessun hook a 300 s** |

**Risultato importante:** il numero di failure (22) è identico con e senza agenti paralleli. Il carico parallelo aveva solo allungato i tempi e innescato l'hook IV1-A a 300 s; i 22 failure sono quindi **ripetibili a carico quiescente** e vanno trattati come baseline reale di `main@5672f12`, non come artefatto. La corsa parallela resta solo un confronto storico.

Failure deterministici verificati nella corsa quiescente (non timeout):

| # | Test | Causa verificata |
|---|---|---|
| 1 | `tests/fauna180.test.ts:256` | `1.0800000429153442` vs `1` atteso (costante storica `1.08`) |
| 2 | `tests/reproduction.test.ts:53` | fixture energia 100 < soglia 130 (`reproduction.ts:13`): `offspring.length = 0` |
| 3 | `tests/reproduction.test.ts:75` | stessa causa: energia totale resta 200, nessun costo |
| 4 | `tests/vibeGenomeV1110.test.ts:99` | regex `/social/` colpisce `socialTolerance` |
| 5 | `tests/vibeGenomeV1110.test.ts:241` | regex `/move/` colpisce `movementCostFactor` |

Timeout (17 occorrenze, `testTimeout` 5 s tranne `settlementDefaults:27` a 120 s): `hydrology.test.ts` (5), `planet.test.ts` (3), `speciesHabitat.test.ts` (3), `settlementDefaults.test.ts` (2), `iv1/invariance.test.ts` (2), `livingBehavior.test.ts:230`, `vibeGenomeV1110.test.ts:128`.

Nota: nella corsa storica dell'integrazione finale (2026-11-19) i failure noti erano 6 e inclusero `settlementDefaults.test.ts:19`; nella corsa quiescente GEN-0 `settlementDefaults:19` è verde mentre compaiono timeout aggiuntivi in `speciesHabitat` e IV1-A. La differenza è documentata come **comportamento load-sensitive della macchina**, non come regressione: il confronto per le nuove fasi va fatto sempre contro questo log, nella stessa sessione.

**Protocollo di baseline da ora in poi:** eseguire la suite a carico quiescente, registrare durata, conteggi, seed e log (`gen0-baseline-quiescent.log`), ed eventualmente ripetere la singola suite in isolamento prima di classificare un failure come nuovo. Nessun timeout o soglia viene aumentato per far passare i test.

---

## 3. Validazione per fase

### GEN-1 — Architettura del Genome Engine

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G1-F1 | Costruzione di un genoma con N loci arbitrario (N = 1, 33, 1000) | Functional | Nessun limite rigido; costruzione e serializzazione senza errori |
| G1-F2 | Ploidia configurabile (2, 3, 4) senza modificare il core | Functional | Stesse API, parametro di ploidia; nessun cast o branch speciale |
| G1-F3 | Versione dello schema e migrazione | Functional | `v1 → v2` idempotente; `v2 → v1` implicita non richiesta |
| G1-P1 | Costo costruzione/clonazione per genoma | Performance | Misurato, non extrapolato; mediana/P95 riportati |
| G1-R1 | Save/load di un genome con loci aggiunti | Regression | Round-trip identico; i salvataggi v1.10 restano leggibili |

### GEN-2 — Ereditarietà

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G2-F1 | Gameti da due genitori diploidi | Functional | Ogni gamete contiene una sola copia per gruppo omologo e un allele per locus |
| G2-F2 | Meiosi/ricombinazione | Functional | Combinazioni nuove rispetto ai genitori; piano seeded e riproducibile da `RngTrace` |
| G2-F3 | Trasmissione allelica | Statistical | Frequenze ~0,5 per allele non selezionato su molte generazioni; deviazione quantificata |
| G2-F4 | Genealogia flessibile | Functional | Fondatori `[]`, sessuata 2 link, parziale 1+`null`, asessuata 1 link; nessun ciclo |
| G2-F5 | Inbreeding / diversità | Statistical | F e eterozigosità calcolati solo sui link noti; rami ignoti ⇒ `NON_EVALUABLE` |
| G2-R1 | Nessuna regressione del determinismo | Regression | Fingerprint `tools/iv1/invariance.ts` identico prima/dopo per configurazioni legacy |

**Vietato:** usare la media dei genomi parentali come unico meccanismo di ereditarietà nel nuovo motore. Il blending legacy resta come modalità di compatibilità.

### GEN-3 — Mutazione

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G3-F1 | Point, insertion, deletion, duplication, structural, regulatory | Functional | Ogni evento ha tipo, locus, posizione, allele prima/dopo, tick, origine, organismo e RNG tracciati |
| G3-S1 | Distribuzione delle mutazioni | Statistical | Istogramma e media su N run; nessuna assunzione di gaussianità se non misurata |
| G3-F2 | Storia e statistiche | Functional | Eventi e contatori per tipo presenti nello snapshot, se abilitati |
| G3-N1 | Neutralità rispetto alla fitness | Functional | Nessun campo fitness nell'evento; la fitness non dipende da `isMutation` |
| G3-R1 | Tassi configurabili | Regression | I tassi legacy `MUTATION_RATE=0.15`, `MUTATION_STD_FRACTION=0.04` restano disponibili |

### GEN-4 — Espressione

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G4-F1 | Dominanza completa / incompleta / codominanza | Functional | Fenotipi attesi per AA/Aa/aa noti, con regole diverse sullo stesso locus |
| G4-F2 | Dosaggio e poligenia | Functional | Più loci e più copie contribuiscono con pesi espliciti |
| G4-F3 | Epistasi e pleiotropia | Functional | Interazioni genotipo-genotipo e un gene → più canali testate separatamente |
| G4-F4 | Regolazione e ambiente | Functional | Stesso genotipo, ambienti diversi → fenotipi diversi; genotipo invariato |
| G4-S1 | Distribuzione dei tratti | Statistical | Media, varianza e quantili su popolazione iniziale |
| G4-R1 | Separazione genotipo/fenotipo | Regression | Nessun campo del fenotipo riscritto nel genoma; `PhenotypeProfile` immutabile |

### GEN-5 — Sviluppo

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G5-F1 | Fasi di sviluppo | Functional | Stadio derivato da età/tick e regolazione, non da scala uniforme |
| G5-F2 | Crescita non uniforme | Functional | Almeno due strutture con traiettorie diverse; misurato, non solo dichiarato |
| G5-F3 | Plasticità non ereditaria | Functional | Cambiamento fenotipico non propagato al genoma dei figli |
| G5-R1 | Stabilità genetica | Regression | Il genoma non cambia durante lo sviluppo; fingerprint costante |

### GEN-6 — Integrazione con G

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G6-F1 | Genome → body plan → descriptor → render plan | Functional | Pipeline end-to-end con body plan generato dal genoma |
| G6-F2 | Fallback | Functional | Genoma privo di loci anatomici → comportamento G3.1 attuale, nessun crash |
| G6-P1 | Cache / dynamic pool / adaptive rendering | Performance | Nessuna regressione misurata sui benchmark G3.1 e IV1-B-R1 |
| G6-R1 | Contratti G3.1 | Regression | 185 test G3/G3.1 e 115 test E2 restano verdi |

**Checkpoint obbligatorio:** prima di toccare `lib/anatomy/**`, `lib/phenotype/**`, `lib/adaptiveRender.ts`, `components/simulation/planet3d/**` o `types/index.ts`, serve un checkpoint approvato (`GENOME_ARCHITECTURE.md` §13) e una PR dedicata.

### GEN-7 — Fisiologia e comportamento

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G7-F1 | Metabolismo/energia | Functional | Integrato nei modulatori esistenti, non in una simulazione parallela |
| G7-F2 | Sensori e percezione | Functional | I canali sensoriali esistenti leggono tratti del nuovo fenotipo |
| G7-F3 | Locomozione e risposta ambientale | Functional | Nessuna duplicazione di `movement.ts` / `behavior.ts` |

### GEN-8 — Evoluzione

| ID | Verifica | Tipo | Criterio di accettazione |
|---|---|---|---|
| G8-S1 | Frequenze alleliche multi-seed | Statistical | Almeno 5 seed; trend e varianza riportati, non un singolo run |
| G8-S2 | Mutazione-deriva e bottleneck | Statistical | Eterozigosità attesa calcolata e confrontata con l'osservata |
| G8-S3 | Speciazione emergente | Statistical | Nuove specie compaiono senza catalogo predeterminato; `SpeciesRecord` usato |
| G8-S4 | Selezione vs deriva | **NON_EVALUABLE** | Non prodotto: richiede controlli esterni; `INFERRED` non autorizzato dai protocolli E2 |
| G8-R1 | Estinzione e bilancio energetico | Regression | Ledger E2 e invarianza IV1-A invariati |

---

## 4. Matrice di copertura attuale (GEN-0)

| Area | Test esistenti | Copertura Genome Engine |
|---|---|---|
| Genoma vettoriale legacy/V2 | `genome.test.ts` (8), `genomeV2.test.ts` (27) | **EXISTING_COMPLETE** per il modello attuale |
| Mutazione / intervalli | `vibeGenomeV1110.test.ts` (34, con failure noti), `plantGenome.test.ts` (13) | parziale, con incoerenze documentate |
| Ereditarietà live | `reproduction.test.ts` (3, 2 failure) | **EXISTING_DEFECT** nelle fixture |
| Speciazione | `speciation.test.ts` (15), `speciesTree.test.ts` (7), `speciesTraitHistory.test.ts` (8) | copre distanza/registry, non selezione vs deriva |
| Fenotipo G2 | `phenotypeG2.test.ts` (6), `g3MorphologyFrame.test.ts` (2) | solo 4 geni morfologici |
| Anatomia/renderer G | 11 file, 185 test | completo per G3.1, nessun body plan genetico |
| Save/load | `persistence.test.ts` (6), `genomeV2.test.ts:126-170`, `statsPanelGenome.test.ts` | completo per schema v1/v2 e UI |
| Determinismo | `tests/iv1/invariance.test.ts` (10), `random.test.ts` (4), `world.test.ts:14-28` | completo per il motore attuale |
| Worker / snapshot | `types/index.ts:464-485`, `simulation.worker.ts:29-31,106-179` | contratti generici, non genome-specifici |
| Performance / scala | `docs/research/iv1b/TABLES.md:75-104`, `REPORT.md:128-201`, `G_FINAL_PERFORMANCE_REPORT.md:20-70` | misurazioni storiche; GPU/FPS non misurati |
| **Genome Engine mendeliano** | **nessun file dedicato** | **MISSING** |

---

## 5. Criteri di accettazione globali per la prima PR implementativa

1. `npx tsc --noEmit --pretty false` → exit 0.
2. `npx vitest run --config vitest.config.ts tests/genomeEngine` → tutti verdi.
3. Suite E2 (19 file / 115 test) e G3 (11 file / 185 test) senza nuovi failure.
4. `npx next build --webpack` → exit 0.
5. Full suite confrontata con `main@5672f12`: **nessun nuovo failure deterministico**; i timeout load-sensitive riportati con durata e carico.
6. Diff review: nessuna modifica a `lib/anatomy/**`, `lib/phenotype/**`, renderer, `types/index.ts` senza checkpoint approvato.
7. Documentazione aggiornata con comandi, output e classificazioni `OBSERVED`/`DERIVED`/`INFERRED`/`NON_EVALUABLE`.

---

## 6. Test progettuali obbligatori prima di proporre GEN-1

Tutti i test seguenti sono **progettati, non eseguiti**. Usano almeno **5 seed distinti** e campioni grandi; ogni esecuzione deve salvare seed, comando, log, conteggi e statistiche. Le deviazioni accettate sono intervalli di confidenza al 95%/test χ² con α = 0,05 dichiarati prima dell'esecuzione.

| ID | Categoria | Disegno | Campione e seed | Statistica / criterio | Classificazione |
|---|---|---|---|---|---|
| T-01 | **Genotipo diploide** | Per ogni gruppo omologo contare le copie; per ogni copia contare un solo allele per locus; verificare che il catalogo alleli del registry non compaia come genotipo | 1.000 organismi × 5 seed | 0 copie mancanti/duplicate, 0 locus duplicati, 0 alleleId fuori registry | `OBSERVED` + validation result |
| T-02 | **Segregazione mendeliana** | `AA×aa → Aa` (F1); `Aa×Aa → 1:2:1` genotipi e `3:1` fenotipi con dominanza completa | ≥20.000 figli per incrocio per seed, 5 seed | χ² goodness-of-fit, α=0,05; IC al 95% riportati per ogni seed | `OBSERVED` conteggi, `DERIVED` ratio/p-value |
| T-03 | **Ricombinazione** | Loci a 10/30 cM su uno cromosoma noto; contare gameti ricombinanti e ricostruire il piano da `RngTrace` | ≥50.000 gameti per seed, 5 seed | Frazione ricombinante dentro CI atteso; replay del piano identico | `OBSERVED` crossover, `DERIVED` frazione |
| T-04 | **Indipendenza e associazione dei loci** | Coppie non collegate vs collegate; test di indipendenza e confronto con `positionCm` | ≥50.000 gameti per coppia, 5 seed | Non collegate: χ² non significativo (α=0,05); collegate: associazione significativa e distanza coerente | `DERIVED` |
| T-05 | **Dominanza** | Stesso locus con regole `complete-dominance` e `incomplete-dominance`; genotipi AA/Aa/aa | matrice completa × 5 seed | Fenotipi attesi distinti per regola; gerarchia non globale | `DERIVED` |
| T-06 | **Codominanza** | Aa produce un canale separato rispetto ad AA e aa, senza gerarchia | matrice completa × 5 seed | Aa ≠ AA e Aa ≠ aa; contributi per copia entrambi > 0 | `DERIVED` |
| T-07 | **Epistasi** | Locus modificatore `suppress`/`enhance`/`mask` su locus target; tutte le combinazioni | 3^k combinazioni × 5 seed | Effetto atteso solo nelle combinazioni dichiarate; nessuna interferenza con pleiotropia | `DERIVED` |
| T-08 | **Mutazioni** | Ogni evento con tipo, locus, posizione, allele prima/dopo, tick, origine, organismo, RNG, replay; ricostruire l'evento da trace | ≥10.000 eventi per seed, 5 seed | 100% campi presenti; replay identico; 0 campi fitness; effetto/fitness separati | `OBSERVED` evento, `DERIVED` delta, fitness `NON_EVALUABLE` |
| T-09 | **Pedigree** | Fondatori, sessuata completa, sessuata parziale, asessuata, snapshot legacy, tentato ciclo | 10.000 individui × 5 seed | Link 0/1/2 validi; 0 cicli; metriche con ramo ignoto ⇒ `NON_EVALUABLE` | `OBSERVED` grafo, `DERIVED` metriche |
| T-10 | **Riproduzione asessuata** | `cloneAsexual()` su fondatori e discendenti; verificare figlio e link `sole-parent` | ≥5.000 figli per seed, 5 seed | Fingerprint uguale al genitore salvo mutazioni configurate; pedigree a 1 genitore | `OBSERVED` |
| T-11 | **Determinismo** | Stesso seed/config/registry → identici fingerprint, gameti, eventi; controllo RNG del mondo non consumato | 5 seed, 2 replay ciascuno; IV1-A 60 run/45 confronti | 0 divergenze tick-per-tick; fingerprint legacy invariato | `OBSERVED` |
| T-12 | **Compatibilità legacy** | Snapshot v1/v2 senza `genetics`, `ext` assente, blend fallback; caricamento e salvataggio | 1.000 snapshot storici × 5 seed | Nessuna eccezione; valori legacy identici; nessun campo obbligatorio nuovo | `OBSERVED` |
| T-13 | **Serializzazione e migrazione** | Round-trip canonico, `v1→v2→v3`, doppia migrazione idempotente, versione futura | 1.000 genomi × 5 seed | `serialize(deserialize(s)) === s`; 0 modifiche alla seconda migrazione; future ⇒ `unsupported` + `NON_EVALUABLE` | `OBSERVED` + `DERIVED` |

### 6.1 Regole di riporto per i test statistici

- Riportare per ogni seed: N, conteggi, stima, intervallo di confidenza 95%, p-value quando applicabile.
- Non sostituire una deviazione significativa con "rumore" senza analisi; se il test fallisce, stop e classificazione.
- Non usare i test tautologici noti in `vibeGenomeV1110.test.ts` come evidenza di correttezza.
- Non usare il campionamento visivo (`lib/renderSampling.ts`) come evidenza di dinamiche evolutive.
- Selezione vs deriva resta `NON_EVALUABLE` (G8-S4); nessun `INFERRED` viene autorizzato.

---

## 7. Evidenze e stato della revisione

Ogni futuro report di validazione dovrà contenere:

1. commit esatto e branch;
2. comandi esatti (Node, Vitest, eventuale script multi-seed);
3. seed utilizzati e durata;
4. log completo salvato su file;
5. conteggi passati/failed/skipped confrontati con `gen0-baseline-quiescent.log`;
6. classificazione `OBSERVED` / `DERIVED` / `INFERRED` / `NON_EVALUABLE` per ogni conclusione.

**Stato della Rev 1:** nessuno dei test del Genome Engine è stato eseguito. L'unico output verificabile prodotto finora è la baseline quiescente GEN-0 richiamata in §2. Questa revisione non introduce risultati di test nuovi.

**Conferma esplicita:** nessun codice di produzione è stato modificato in questa revisione; nessun test è stato allentato; nessun timeout aumentato; nessun merge eseguito.
