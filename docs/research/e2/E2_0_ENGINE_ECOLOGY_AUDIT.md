# E2.0 — Engine Ecology Audit

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
**Data:** 2026-11-18
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`
**Classificazione complessiva:** **VERIFICATO** per la mappa del codice; **NON DIMOSTRATO** per molte ipotesi ecologiche plausibili.

---

## 1. Obiettivo e metodo

E1 ha fornito l'infrastruttura di misurazione; E2 deve determinare **quali fenomeni il simulatore dimostra realmente**. Questa fase è stata condotta con quattro audit paralleli e read-only:

1. motore ecologico core (loop, mortalità, energia, alimentazione, movimento);
2. genetica, mutazione, ereditarietà, speciazione ed estinzione;
3. vegetazione, risorse, clima, habitat e osservabilità;
4. infrastruttura E1, schemi di output e protocolli di riproducibilità.

Nessun file sotto `simulation/**`, `lib/anatomy/**`, `lib/phenotype/**`, `app/**`, `components/**`, `workers/**`, `tools/e1/**` o `tests/e1/**` è stato modificato. E2 aggiunge solo `tools/e2/**`, `tests/e2/**`, `scripts/e2*.ts` e `docs/research/e2/**`.

Verifica E1 precedente all'audit: `npx vitest run tests/e1` → **7 file, 65 test passati, exit 0**.

---

## 2. Mappa dei sistemi biologici

### 2.1 Ecologia e dinamica delle popolazioni

| Sistema | Implementazione | Input | Output | Interazioni | Metriche disponibili | Limiti | Rischi |
|---|---|---|---|---|---|---|---|
| Loop / tick | `simulation/core/world.ts:185-284`; `SimulationClock` `simulation/core/clock.ts:10-45` | `world.tick`, organismi vivi, chunk attivi | `tick+1`, stato aggiornato, `lastStats` | Tutti i sistemi | `getStats().tick/year/season`, eventi per tick | Nessuna osservabilità sub-tick | I bucket spaziali sono costruiti prima del movimento (`world.ts:204`) |
| Nascita / riproduzione | `simulation/evolution/reproduction.ts:66-162`; `genome.ts:65-92`; `brain.ts:83-106` | energia ≥130, età, fertilità, vicini entro raggio 4, RNG | nuovi organismi, costo energetico dei genitori, `births` | alimentazione, mortalità, movimento, genetica | `births`, `birthRate`, `cumulativeBirths` | Nessun ID genitore o luogo di nascita | Fallback asessuato 15%; Allee effect emergente |
| Mortalità | `organism.ts:118-122`; `world.ts:237-265`; `predation.ts:153-159` | energia, età, `lifespan`, RNG, predazione | rimozione organismi, `deaths`, `predationKills` | alimentazione, predazione, dispersal | `deaths`, `predationKills`, tassi | **Fame e vecchiaia non separabili** | `predationKills` non confluisce in `deaths` |
| Fame / energia / metabolismo | `organism.ts:104-115,171-185`; `energy.ts:5`; `geneExpression.ts:50-55` | tratti, peso, `home`, flag dispersal | costo energetico, cap 150, starvation | movimento, alimentazione, riproduzione | `meanEnergy`, `energySd` | Nessun bilancio energetico individuale | Costo di caccia non clampato; premia predazione può creare energia |
| Erbivoria / risorse | `feeding.ts:8-36,98-245`; `environment.ts:43-71` | vegetazione cellulare, `size`, `carnivory`, fitness, regione 8×8 | guadagno energetico, depletion vegetazione | pianeta, movimento, selezione | `occupiedVegetation`, `occupiedLandFraction` | Nessun flusso energia/regione esposto | Depletion proporzionale alla domanda, non al guadagno |
| Predazione / carnivoria | `predation.ts:37-170`; `traitRanges.ts:11-24` | carnivoria, energia, dimensione, velocità, abilità, evasione | uccisioni, energia predatore, memoria pericolo | alimentazione, comportamento, tratti | `predationKills`, `predationPressure`, tratti medi | Nessun ID predatore/preda, nessun tentativo fallito | `carnivory ≤ 0.85` + preda a carnivoria inferiore ⇒ predatori apicali immuni |
| Movimento / dispersal | `movement.ts:34-147`; `behavior.ts:97-233`; `organism.ts:167-185` | brain, 13 canali sensoriali, tratti, terreno | nuova posizione, memoria cibo/pericolo | risorse, predazione, riproduzione | posizioni in `RenderFrame` | Nessun evento di dispersal misurabile | Dispersal è solo una tassa energetica, disattivata di default |
| Clima / stagioni | `seasons.ts:22-48`; `planet.ts:24-36,319-420`; `constants.ts:5` | tick, latitudine, seed, elevazione | temperatura, growth factor, biomi | vegetazione, fitness | `season`, `year`, `Cell.temperature` | Nessuno shock climatico esogeno | I chunk dormienti usano catch-up approssimato |
| Habitat / capacità di carico | `planet.ts:130-232,265-325`; `terrainNoise.ts`; `hydrology.ts`; `feeding.ts:147-162` | seed, coordinate, acqua, elevazione, vegetazione | celle, biomi, budget sostenibile per regione | movimento, alimentazione, fitness | `SpeciesHabitat`, `avgVegetation` | Nessun valore globale di capacità di carico | `getCell()` in `speciesAnalysis.ts:89` materializza chunk: l'osservazione muta la cache |
| Estinzione | `speciation.ts:213-239`; `world.ts:271-280` | conteggi specie, registry | `alive=false`, `extinctionTick` | mortalità, speciazione | `speciesExtinct`, `extinctAt`, genealogy | Nessuna causa di estinzione | Nessun revival; le specie restano estinte nel registry |

### 2.2 Genetica, evoluzione e speciazione

| Sistema | Implementazione | Input | Output | Interazioni | Metriche disponibili | Limiti | Rischi |
|---|---|---|---|---|---|---|---|
| Genoma | `genome.ts:36-55,94-121`; `geneRegistry.ts:20-163`; `genomeExt.ts:15-76` | RNG, 13 tratti legacy + 20 geni estesi | vettore genomico | tutte le funzioni biologiche | `genomeStats()`, `averageGenome()` | Nessun linkage, dominanza, ploidia o duplicazione | API V2 presenti ma non usate dal loop live |
| Mutazione | `genome.ts:57-92`; `genomeExt.ts:78-129`; `brain.ts:44-58` | genitori, RNG, range | genoma/brain ereditati e mutati | riproduzione | Nessuna metrica dedicata | Mutazione cieca, zero-mean; non separabile da selezione osservando solo i tratti | `rng.gaussian` consuma 6 draw; l'ordine dei draw è critico |
| Ereditarietà | `reproduction.ts:122-157`; `genome.ts:65-77`; `genomeExt.ts:102-111` | genitori, RNG derivato da stato+ID | figlio con tratti/brain/geni estesi | speciazione, selezione | `births`, tratti medi E1 | Nessuna mappa genitore→figlio nel salvataggio | RNG secondario per geni estesi |
| Selezione naturale | `feeding.ts:201-217`; `environment.ts:26-71`; `organism.ts:104-122`; `predation.ts:144-159`; `reproduction.ts:77-98` | tratti, ambiente, densità, prede, energia | sopravvivenza e riproduzione differenziali | tutti i sistemi | `births/deaths/predationKills`, `meanFitness` per specie | Nessun operatore fitness-proportionale, nessun fitness individuale | Energia non conservativa; selection vs drift non separabile senza controllo neutro |
| Fenotipo | `geneExpression.ts:15-170`; `lib/phenotype/derive.ts:18-108` | genoma, flags | fattori fenotipici; profilo morphologico render-only | alimentazione, predazione, movimento, metabolismo | `Phenotype` ricalcolabile dal genoma | Non persistito; molte caratteristiche anatomiche non determinabili | Cache `WeakMap`/`WeakSet` è stato di processo |
| Speciazione | `speciation.ts:14,21,29,157-211`; `genome.ts:21,30` | cluster genomici, posizioni, registry, RNG | nuovo `speciesId`, record con `parentSpeciesId` | riproduzione, estinzione | `speciesTotalEver`, `getSpeciesTree()`, `originTick` | Regola operativa, non concetto biologico | Soglie V2 potenzialmente miscalibrate; rara e seed-dipendente |
| Distanza genetica | `genome.ts:159-216`; `tools/e1/metrics.ts:187-249` | genomi campionati | distanza media, coppie campionate | speciazione, compatibilità | `meanGeneticDistance`, `geneticPairsTotal/Sampled` | Brain escluso; campione E1 limitato a 120 coppie | V2 diluisce il segnale legacy |
| Snapshot / salvataggio | `world.ts:326-371`; `genomeMigration.ts:13-68`; `lib/persistence.ts:34-96` | stato completo, RNG, registry | snapshot ripristinabile | perturbazioni E1, worker | `randomState`, genealogy, genomi | Brain `Float32Array` richiede structured clone | `fromSnapshot()` azzera flag sperimentali (`world.ts:363-368`) |

---

## 3. Cosa è realmente implementato

**Implementato:** loop a 12 fasi, riproduzione con mutazione, mortalità, energia/metabolismo, alimentazione erbivora con budget regionale, predazione, movimento con brain e memoria, collisioni, stagionalità, vegetazione e biomi, estinzione delle specie, bookkeeping e speciazione operativa.

**Parziale / solo nome:**

- **Dispersal**: solo tassa energetica e concetto di `home`; nessun evento di migrazione; disattivato di default.
- **Speciazione**: implementata, ma come regola operativa k-means + soglia genetica + separazione geografica; non come concetto biologico generale.
- **Piant evoluzione**: `simulation/biology/plantGenome.ts` esiste ma non è usato da `World.step()`; è visual/render-only.

**Non implementato:** ciclo dei nutrienti/detriti, catastrofi esogene, selezione fitness-proportionale esplicita, apprendimento intra-vita, cause di morte separate, flusso energetico conservativo, capacità di carico globale esposta.

---

## 4. Ordine esatto delle fasi per tick

Definito solo in `simulation/core/world.ts:185-284`:

1. `tick++`;
2. calcolo chunk attivi e `Planet.update()`;
3. bucket comportamentali da posizioni **pre-movimento**;
4. per ogni organismo: età, upkeep, eventuale dispersal cost, movimento;
5. collisioni se abilitate;
6. alimentazione erbivora;
7. predazione;
8. morte e rimozione;
9. riproduzione e mutazione;
10. aggiornamento popolazioni specie;
11. ogni 200 tick: tentativo speciazione e nuovo aggiornamento;
12. calcolo statistiche.

Conseguenza: una preda uccisa al punto 7 ha già mangiato al punto 6; i nati al punto 9 non possono morire nello stesso tick; i bucket spaziali non vedono il movimento appena avvenuto.

---

## 5. Cosa E1 può misurare e cosa no

E1 emette 45 campi per campione, inclusi popolazione, eventi per tick, tassi, ricchezza/Shannon/evenness, tratti medi, vegetazione occupata e distanza genetica campionata. Le serie temporali sono reali: `sampleEvery=10` su 900 tick produce 91 punti per corsa.

**Gap che E2 deve colmare con metriche additive:** autocorrelazione, trend, oscillazioni, picchi/minimi, cross-correlazione preda-predatore, tempo di ritorno post-perturbazione, dominanza, persistenza delle specie, turnover, sintesi cross-seed di metriche dinamiche.

**Non misurabile senza modifiche al motore (e quindi fuori scope E2):** causa della morte, ID genitore/figlio, ID predatore/preda, tentativi di caccia falliti,Flusso energetico per individuo, domanda/budget per regione, stock vegetazionale globale, potenziale di vegetazione, livelli di establishment, stato sub-tick.

---

## 6. Anomalie e rischi riproducibili

| ID | Anomalia | Evidenza | Impatto E2 | Classificazione |
|---|---|---|---|---|
| A01 | Bucket spaziali non toroidali rispetto alla distanza wrapped | `spatialIndex.ts:11-44` | Effetti bordo/ seam in comportamento, caccia, accoppiamento | ANOMALIA |
| A02 | Raggio sociale può superare la copertura della finestra bucket 3×3 | `behavior.ts:42-44,111` vs `18` | Percezione troncata ad alto vision | ANOMALIA |
| A03 | bucket pre-movimento per tutte le interazioni spaziali | `world.ts:204`, `predation.ts:104`, `reproduction.ts:86` | Disallineamento tra posizione percepita e posizione reale | ANOMALIA |
| A04 | Predatori apicali immuni per `carnivory ≤ 0.85` e regola “prey strictly lower” | `traitRanges.ts:24`, `predation.ts:121,126` | Catene trofiche troncate | ANOMALIA |
| A05 | Energia non conservativa nella predazione; costo caccia non clampato | `predation.ts:137,156` | Bilancio energetico non interpretabile come flusso | ANOMALIA |
| A06 | Depletion vegetazionale proporzionale alla domanda, non al guadagno | `feeding.ts:191,230-239` | Bassi fit still degradano la risorsa | ANOMALIA |
| A07 | `predationKills` escluso da `deaths` | `world.ts:238,302-303` | Mortalità totale va sommata, non letta da un solo contatore | ANOMALIA |
| A08 | `getSpeciesGenomeStats()` materializza chunk tramite `getCell()` | `speciesAnalysis.ts:89` | L'osservazione cambia la cache del pianeta | ANOMALIA |
| A09 | Flag sperimentali non round-trip safe | `world.ts:363-368` | Confronti pre/post snapshot non sempre equivalenti | ANOMALIA |
| A10 | Allee effect emergente: soglia energia 130 + raggio accoppiamento 4 | `reproduction.ts:12,34,77-114` | Spiega mancato recupero post-cull in E1 S08 | EVIDENZA |
| A11 | Speciazione rara e seed-dipendente | `speciation.ts:157-211`; report E1 | E2-F richiede orizzonti lunghi e più seed | EVIDENZA |
| A12 | Documentazione obsoleta (doc drift): commenti superati in `planet.ts:368` e `feeding.ts:68-96` | audit risorse | Usare codice/test come fonte di verità | ANOMALIA |

Nessuna di queste anomalie è stata corretta: E2 è osservazionale e una proposta di modifica del motore richiederebbe autorizzazione separata.

---

## 7. Strumenti E2 implementati

| Modulo | Funzione |
|---|---|
| `tools/e2/timeseries.ts` | serie per tick, autocorrelazione lag-1, trend, oscillazioni, cross-correlazione con lag in tick, AUC, baseline e tempo di ritorno |
| `tools/e2/diversity.ts` | dominanza, diversità effettiva, turnover Jaccard, persistenza delle specie, sintesi cross-seed |
| `tools/e2/metrics.ts` | analisi completa di corsa: stabilità, trofia, risorse, genetica, resilienza |
| `tools/e2/statistics.ts` | wrapper appaiati e summary riutilizzando E1 |
| `tools/e2/scenarios.ts` | selezione scenari E1 per il pilota e matrice E2 |
| `tools/e2/experiment.ts` | report scientifico e confronti appaiati |
| `tools/e2/dataset.ts` | archivio gzip, manifest, SHA-256, checksum sorgenti E2 ed E1 |

E1 non è stato modificato: i nuovi moduli importano solo le sue API pubbliche.

---

## 8. Matrice sperimentale E2

Vedi [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md). Sintesi:

| Fase | Domanda centrale | Disegno minimo | Stato |
|---|---|---|---|
| E2.1 | Le popolazioni sono stabili? | 12 seed × scenari baseline/scarsità/misto, 900 tick | Pilota avviato |
| E2.2 | I predatori dipendono dalle prede? | serie temporali, cross-correlazione, 12 seed | Pianificata |
| E2.3 | La competizione produce esclusione? | scenari habitat S09/S10/S13/S14, 12 seed | Pianificata |
| E2.4 | La biodiversità è persistente? | ricchezza, Shannon, evenness, dominanza, turnover | Pianificata |
| E2.5 | L'ecosistema recupera dopo perturbazioni? | S08 cull80, tempo di ritorno, 12 seed | Pilota parziale |
| E2.6 | Speciazione è possibile e riproducibile? | S01/S11/S12, 2700-5000 tick, confronto neutro | Pianificata |

---

## 9. Protocollo di riproducibilità

- Seed espliciti, mai `Date.now()`.
- Node pinned `v22.14.0`; V8 divergente in versioni successive può alterare i risultati.
- Unità sperimentale: corsa/seed, non tick.
- Confronti appaiati per seed; 12 seed non randomizzati ⇒ nessuna causalità.
- Serie temporali campionate ogni 10 tick nel pilota.
- Dataset gzip con payload canonico, manifest, `payloadSha256`, `archiveSha256`, checksum sorgenti E2 ed E1 separati.
- LF-normalizzazione nei checksum per compatibilità con checkout Windows.

---

## 10. Validazione E2.0

| Controllo | Risultato |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0 |
| `npx vitest run tests/e1` | 7 file, 65 test, exit 0 |
| `npx vitest run tests/e2` | 5 file, 17 test, exit 0 |
| Modifiche a `simulation/**` / motore / renderer / E1 | nessuna |

---

## 11. Conclusioni classificate

- **VERIFICATO**: il motore implementa esplicitamente tutti i principali meccanismi ecologici ed evolutivi mappati; il loop e le regole sono leggibili e deterministici dato un seed.
- **VERIFICATO**: E1 fornisce serie temporali grezze adeguate come base per E2, ma non analisi dinamiche.
- **EVIDENZA**: alcune anomalie (bucket non toroidali, predatori apicali immuni, mancato recupero post-cull) sono direttamente supportate dal codice e dai report E1.
- **NON DIMOSTRATO**: stabilità, cicli preda-predatore, esclusione competitiva, adattamento e speciazione robusta richiedono gli esperimenti E2.1–E2.6.
- **ANOMALIA**: energia non conservativa nella predazione e osservabilità che muta la cache del pianeta richiedono proposte separate, non modifiche in E2.

---

## 12. Prossime azioni

1. Eseguire il pilota E2.1 su 12 seed × 4 scenari × 900 tick.
2. Generare dataset E2.1 con manifest e hash.
3. Analizzare stabilità, oscillazioni, predazione e recupero post-cull.
4. Solo dopo evidenze quantitative, procedere con E2.2–E2.6.
