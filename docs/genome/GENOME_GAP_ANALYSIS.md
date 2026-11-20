# GENOME — Analisi dei gap (Rev 4)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 open  
**Baseline:** `2234eec` (Rev 0), `2c800cf` (Rev 1), `319d975` (Rev 2), `df9d533` (Rev 3), Rev 4 in questa revisione.  
**Confronto:** requisiti GEN-1…GEN-8 vs codice verificato in `main@5672f12`.  
**Revisione:** Rev 4 corregge criticità G1–G5 emerse dalla review indipendente di Rev 3 (mutazioni discriminated union, separazione sviluppo/fenotipo, gametogenesi/poliploidia, coerenza mutazioni, registry funzioni custom). Nessuna modifica al codice.

---

## 1. Sintesi

Il progetto ha un genoma vettoriale funzionante (33 geni), espressione fenotipica modulare, speciazione emergente, determinismo verificato e renderer G3.1 integrato. **Non** ha un motore genetico mendeliano operativo: alleli/loci/copie cromosomiche individuali, meiosi/gameti/ricombinazione tracciata, pedigree generalizzato, mutazioni tipizzate con replay e regole di espressione quantitative formali sono assenti dal codice.

Rev 4 rafforza e corregge i contratti progettuali (G1–G5) ma **non implementa, non integra e non attiva** alcun componente. Il gap implementativo resta aperto; i gap contrattuali G1–G5 sono chiusi a livello di documentazione/contratto proposto, con problemi residui tracciati in §4/§5.

---

## 2. Matrice requisito → stato

| Fase/Area | Requisito | Stato verificato | Gap | Classificazione |
|---|---|---|---|---|
| GEN-1 | Modello loci/alleli/cromosomi/copie/genoma/registry | assente nel codice; contratto Rev 4 definito | implementazione isolata + test | **MISSING** codice / **Progettato** |
| GEN-1 | Stati allelici distinti (presente, assenza biologica, undetermined, non-evaluable) | non presente nel codice; contratto esplicito | applicazione runtime/validazione/serializzazione | **MISSING** / **Progettato** |
| GEN-1 | Provenienza e assi riproduttivi generalizzati | assente; assi separati e gametogenesi esplicita (G3) | modello tracciabile e test | **MISSING** / **Progettato** |
| GEN-1 | Ploidia per gruppo omologo (uniforme/aneuploide) e ploidia gamete distinta | blending legacy, non copie per gruppo | rappresentazione, segregazione, invarianti, riepilogo globale condizionato | **MISSING** / **Progettato** |
| GEN-1 | RNG/replay versionato e discriminato | RNG deterministico esistente; replay nuovo assente | trace, compatibilità, `ReplayResult<T>` discriminato | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-1 | Serialization/migration estesa | v1→v2 esistente per schema attuale | migrazione schema esteso, mutazioni strutturali, stati speciali, registry funzioni | `EXISTING_NEEDS_EXTENSION` |
| GEN-1 | Registry funzioni custom (id, versione, firma, unità/domini, implementazione, determinismo, assenza) | assente | contratto G5 definito; implementazione/registro runtime assenti | **MISSING** / **Progettato** |
| GEN-2 | Meiosi/gameti/ricombinazione/pedigree operativi | assenti nel live | integrazione controllata, regole segregazione/anomalie, fallback legacy | **MISSING** |
| GEN-2 | Compatibilità riproduttiva | distanza vettoriale esistente; V2 sotto-tarata | ricalibrazione R-01 e metrica target | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` da R-01 |
| GEN-3 | Mutazioni tipizzate (discriminated union per operazione, strutturali/cromosomiche/aneuploidia) | solo mutazione gaussiana/blending | evento completo, struttura pre/op/post, payload per operazione, replay, storia | **MISSING** |
| GEN-3 | Coerenza/invarianti mutazioni e comportamenti di errore | non formalizzato | validazione G4, test di ammissibilità/impossibilità | **MISSING** / **Progettato** |
| GEN-3 | Neutralità fitness da costruzione | invariante desiderata, non contrattualizzata | separazione evento/effetti/fitness `NON_EVALUABLE` | `EXISTING_NEEDS_EXTENSION` |
| GEN-4 | Espressione quantitativa vincolata | 26 campi derivati ma contratti formali incompleti | canali/unità/domini finiti, normalizzazione/pesi, conflitti, custom versionato/registrato | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-4 | Dominanza/codominanza/dosaggio/epistasi/pleiotropia/poligenia | effetti parziali in calcolo; non regole formali generalizzate | engine regole componibili | **MISSING** (formale) |
| GEN-5 | Sviluppo ontogenetico distinto e formalizzato | età/lifespan/maturity parziali | `DevelopmentalState` distinto, stadi, unità, processi, condizioni rilevanti, passo separato verso fenotipo | **MISSING** / **Progettato** |
| GEN-5 | Derivazione fenotipo finale distinta | pipeline non formalizzata come separazione contrattuale | `derivePhenotype()` verificabile, nessuna duplicazione con espressione/plasticità | **MISSING** / **Progettato** |
| GEN-5 | Ambiente da Planet Engine | nessun adattatore contratto | `EnvironmentalSnapshot` read-only, stati uniformati, coerenza temporale, campionamento | **MISSING** / **Progettato** |
| GEN-6 | Body plan genetico reale | pipeline G esiste ma body plan speculativo, 4 geni MOR | loci/provenienza anatomica, adattatore post-checkpoint | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` |
| GEN-6 | Renderer G3.1 | completo e testato | nessuna riscrittura | `EXISTING_COMPLETE` |
| GEN-7 | Fisiologia/comportamento | hook esistenti | passare da nuovi canali senza sistemi paralleli | `EXISTING_NEEDS_EXTENSION` |
| GEN-8 | Evoluzione osservabile | speciazione/metriche parziali | multi-seed, pedigree/diversità, controlli; selezione vs deriva `NON_EVALUABLE` | `EXISTING_NEEDS_EXTENSION` / `NON_EVALUABLE` |

---

## 3. Gap contrattuali corretti in Rev 4 (chiusi a livello progettuale)

| Criticità | Correzione Rev 4 | Stato |
|---|---|---|
| G1 — mutazioni strutturali sottospecificate | `MutationEvent` come discriminated union per operazione (point mutation, insertion, deletion, duplication, inversion, translocation, chromosome-level event, aneuploidy, structural variation compatibile). Ogni variante rappresenta struttura precedente, operazione, struttura risultante, cromosomi/intervalli/copie coinvolti, materiale inserito/rimosso/duplicato, posizione/orientamento risultanti, provenienza/causalità. `affectedLoci` opzionale/non richiesto per eventi esclusivamente intergenici o a intero cromosoma. Combinazioni scope/operation/payload impossibili impedite dal tipo. Nessun limite arbitrario a loci/complessità. | **chiuso in documentazione** |
| G2 — sviluppo/fenotipo confusi | Pipeline corretta: `GeneticGenome → ResolvedGenotype → GeneticExpression → PlasticResponse → DevelopmentalState → FinalPhenotype`. `develop()` restituisce `DevelopmentalState`; `derivePhenotype()` è passaggio distinto e verificabile. `DevelopmentalState` modellato senza duplicare dati già presenti in `GeneticExpression`/`PlasticResponse` (usa riferimenti/contesto). | **chiuso in documentazione** |
| G3 — gametogenesi/poliploidia implicite | Regole esplicite di formazione gameti: ploidia organismo vs ploidia gamete, numero contributori, modalità riproduttiva, regole di segregazione, anomalie meiotiche. Nessuna assunzione di una sola copia per gruppo omologo nel gamete. Architettura estendibile a modelli poliploidi senza compromettere correttezza del diploide iniziale. | **chiuso in documentazione** |
| G4 — coerenza mutazioni non formalizzata | Matrice di ammissibilità e invarianti verificabili per scope/operation/payload/cromosomi/loci/intervalli; comportamenti di errore (`ValidationResult`/replay incompatibile) definiti. | **chiuso in documentazione** |
| G5 — registry funzioni custom incompleto | Contratto `CustomFunctionDefinition`/registry: id stabile, versione, firma input/output, unità/domini, implementazione registrata, determinismo, gestione funzioni mancanti/non compatibili, compatibilità replay/serializzazione. Id non sufficiente senza implementazione disponibile e compatibile. | **chiuso in documentazione** |

Gap documentali/contrattuali chiusi in Rev 2/3 restano chiusi (stati allelici, provenienza generalizzata, maturità, replay discriminato, ambiente ancorato a Planet Engine, espressione vincolata, ploidia per gruppo). Tutti restano **aperti nel codice** finché non implementati/integrati con evidenza.

---

## 4. Gap trasversali e problemi non risolti

- **Maturità:** nessun componente Genome Engine è implementato/integrato/attivo; ogni claim futuro deve includere evidenza di livello.
- **Contratti condivisi:** `types/index.ts`, `WorldSnapshot`, `RenderFrame`, worker, persistence, core richiedono checkpoint §13.
- **R-01:** soglie/metrica compatibilità non ricalibrate per V2/locus (blocca semantica pre-GEN-2).
- **Performance:** costi per genoma/organismo/generazione non misurati; GPU/FPS `UNVERIFIED`.
- **Test:** assenza suite `genomeEngine`; T-01…T-17 progettuali, **non eseguiti**.
- **D-01/D-07 (circoscritti):** DSL conflitti estesa e catalogo/unità specifici registry/deployment non fissati.
- **D-14:** mapping concreto Planet Engine snapshot → `EnvironmentalSnapshot` subordinato al contratto Planet Engine.
- **Dettaglio operativo:** scelta concreta di algoritmi/policy per segregazione poliploide complessa, anomalie meiotiche specifiche, catalogo implementazioni custom e migrazioni di versioni registry-funzioni resta demandata a decisioni/registry futuri (senza introdurre limiti arbitrari o assunzioni implicite).
- **Pinning/versioning operativo:** meccanismo di pinning runtime di registry/config/custom-function registry negli snapshot/eventi (D-06) definito a livello di requisiti ma non come implementazione.

---

## 5. Non-gap / vincoli di non-regressione

- Renderer G3.1, anatomia/descriptor/LOD/validator, adaptive rendering, cache/pool: preservare.
- RNG/determinismo esistente e fingerprint IV1-A: preservare.
- Fallback legacy genome v1/v2 e blending: preservare finché sostituzione non attiva e verificata.
- E2/IV1 dataset e tag storici: preservare.
- Nessun test esistente allentato.
- Nessuna specie definita tramite preset rigidi; nessun limite artificiale al numero di geni o loci.

---

## 6. Priorità

| Priorità | Elemento | Motivo | Fase |
|---|---|---|---|
| P0 | Review indipendente Rev 4 + checkpoint policy | prerequisito governance/contratti | GEN-0 |
| P0 | R-01 ricalibrazione distanza | blocca semantica compatibilità/speciazione | pre-GEN-2 |
| P1 | Predisposizione isolata contratti/stati/ploidia-gameti/segregazione/validazione/serializzazione | fondazione verificabile senza rischio live | GEN-1 |
| P1 | Mutazioni discriminated union (G1/G4) e replay discriminato isolati | integrità e tracciabilità | GEN-1/3 design |
| P1 | Registry funzioni custom (G5) e espressione quantitativa vincolata | correttezza fenotipica/riproducibilità | GEN-1/4 design |
| P1 | Pipeline sviluppo/fenotipo separata (G2) | coerenza contrattuale | GEN-1/5 design |
| P2 | Integrazione ereditarietà/pedigree/gametogenesi controllata | passaggio a comportamento genetico reale | GEN-2 |
| P2 | Integrazione mutazioni e adattatore ambiente Planet Engine | variabilità e input ambientale autorevole | GEN-3/5 |
| P3 | Adattamento G3.1 con provenienza reale | solo con loci anatomici validati | GEN-6 |
| P3 | Metriche evolutive multi-seed e performance dedicate | evidenza scalabilità/evoluzione | GEN-7/8 |

Nessuna priorità autorizza implementazione o integrazione prima della review indipendente e dei checkpoint richiesti. **GEN-1 non avviato.**
