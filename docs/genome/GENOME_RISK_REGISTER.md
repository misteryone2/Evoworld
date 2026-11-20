# GENOME — Registro dei rischi (Rev 1)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 (open)  
**Revisione:** Rev 1 dopo la revisione tecnica di PR #4.  
**Metodo:** rischi derivati dal codice, dai documenti verificati e dai rilievi della review; non da ipotesi. Ogni rischio ha evidenza, impatto, mitigazione e trigger di stop. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 1. Rischi tecnici pre-esistenti

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-01 | **Distanza genetica V2 sotto-tarata** | `docs/GENOMA-v1.11.0.md:75-78`: fattore `sqrt(13/23,5)=0,744`; soglie 0,16/0,26 non ricalibrate; specie a 4.000 tick 3,4 → 2,0 | Alto: nuovi meccanismi ereditari amplificherebbero l'errore di scala | Ricalibrare con esperimento multi-seed (≥5 seed) **prima** di collegare la meiosi al loop live; mantenere formula v1.10 per mondi senza `ext` | Qualsiasi modifica alle soglie senza esperimento documentato |
| R-02 | **Separazione dei flussi RNG** | `genomeExt.ts:83-90` usa RNG derivato; `genomeV2.test.ts:52-57` verifica che il RNG del mondo non venga consumato | Alto: un nuovo motore che consumi il RNG del mondo rompe IV1-A e la riproducibilità | Ogni campione usa stream derivato con namespace/salt e `RngTrace`; test T-11 obbligatorio | Fingerprint IV1-A diverso da `82e1bb79…` |
| R-03 | **Regressione del determinismo** | `tools/iv1/invariance.ts:189-270`, 60 run/45 confronti/0 divergenze | Critico: perdita della garanzia tecnica principale | Eseguire `tests/iv1/invariance.test.ts` e l'esperimento completo a ogni PR che tocchi genoma/simulazione | Qualsiasi divergenza tick-per-tick |
| R-04 | **Espansione non controllata di `ext`** | `genomeMigration.ts:34-50` conserva chiavi sconosciute ma solo 20 vengono lette | Medio: nuovi loci "invisibili" all'espressione | Registry versionato e validazione obbligatoria; nessuna chiave senza `GeneDefinition` | Loci senza default, range o hook documentati |
| R-05 | **Mutazioni che alterano la fitness per costruzione** | Requisito GEN-3; `geneExpression.ts` collega i geni ai costi | Alto: falsa selezione | Separare `MutationEvent` da `ExpressionDelta` e `FitnessAssessment`; test G3-N1; nessun termine fitness dipendente da `isMutation` | Qualsiasi modifica fitness legata al fatto che un allele sia mutato |
| R-06 | **Timeout e flakiness interpretati come regressione** | Baseline quiescente GEN-0: **22 failure, 17 timeout, 252,56 s** (`gen0-baseline-quiescent.log`); stessi 22 failure con agenti paralleli, ma hook IV1-A a 300 s | Medio: diagnosi errate, test allentati | Usare come riferimento il log quiescente; confronto con `main@5672f12` nello stesso ambiente; mai aumentare i timeout | Nuovo failure non presente nel baseline quiescente |

---

## 2. Rischi di integrazione con G

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-07 | **Body plan speculativo scambiato per biologia** | `docs/graphics/G3_FINAL_LIMITATIONS.md:11`: `speculativeBodyPlanId(speciesId)` seeded-speculative; `lib/phenotype/derive.ts:33-45` elenca 10 characteristics `undetermined` | Alto: conclusioni scientifiche invalide | Mantenere `DataSource.kind = "undetermined"` finché non esiste un locus reale; nessun `INFERRED` nei report | Qualsiasi struttura anatomica presentata come geneticamente determinata senza locus |
| R-08 | **Rottura dei contratti G3.1** | 185 test G3 + 115 E2 + IV1-A; cache, MOR, adaptive render | Critico per rendering e performance | Checkpoint §13 prima di toccare `lib/anatomy/**`, `lib/phenotype/**`, `lib/adaptiveRender.ts`, renderer; PR dedicata | Qualsiasi modifica a contratti condivisi senza checkpoint approvato |
| R-09 | **Costo per organismo incompatibile con 10k organismi** | `world.step()` 3,54 ms a 100 → 3407,47 ms a 10.000, `b≈1,496` (`iv1b/TABLES.md:75-104`); observability +1696,92 ms/tick a 10k; anatomy non cacheata ~1041 ms; `gpu: null`, FPS non misurato | Medio: degrado non rilevato dai test funzionali | Benchmark `costPerGenome`, `costPerOrganism`, `costPerGeneration` con mediana/P95; confronti solo nella stessa sessione | Superamento misurato rispetto al baseline nella stessa sessione |
| R-10 | **Save/load con nuovo schema genomico** | `WorldSnapshot` include `genomeVersion`, `advancedGenome`, `geneEffects`; migrazione idempotente testata | Alto: salvataggi vecchi illeggibili | Solo campi opzionali; migrazione monotonica; test T-12/T-13 e ripresa identica | Qualsiasi modifica a campi obbligatori esistenti |
| R-11 | **Fallback non coperto** | `G6-F2`: genoma senza loci anatomici | Medio: crash su mondi legacy | Test di fallback con genome v1.10 e con `ext` assente; `RenderFrame` additivo | Qualsiasi eccezione su snapshot legacy |

---

## 3. Rischi scientifici e di processo

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-12 | **Selezione vs deriva presentata come dimostrata** | `E2_3_EVENT_SCHEMA.md:340`: attribuzione `INFERRED only`, richiede controlli esterni, **not produced here** | Critico: falsa prova scientifica | Classificare `NON_EVALUABLE`; solo controlli esterni dedicati potrebbero produrre `DERIVED`; `INFERRED` resta non autorizzato | Qualsiasi report che affermi selezione senza controllo |
| R-13 | **Test tautologici ereditati** | `docs/GENOMA-v1.11.0.md:109-114`: tre test finiscono con `expect(true).toBe(true)`; due failure Vibe per regex errate | Medio: falsa sicurezza | Non usare quei test come evidenza; scrivere nuovi test con asserzioni reali; **non modificare i test esistenti per farli passare** | Uso di un test tautologico come criterio di accettazione |
| R-14 | **Piante non evolvevoli** | `plantGenome.ts:4-9` modulo puro scollegato; flora generata da celle in `lib/flora.ts` | Medio: diversità vegetale non emergente | Gap esplicito; non dichiarare evoluzione vegetale finché non collegata | Qualsiasi affermazione di evoluzione delle piante |
| R-15 | **Modifica diretta di `main` o merge non autorizzato** | Requisito di governance del programma | Critico di processo | Tutti i lavori su branch `milestone/genome/*`; PR e approvazione esplicita per il merge | Qualsiasi push diretto su `main` o merge non autorizzato |
| R-16 | **Riscrittura architetturale senza analisi d'impatto** | Requisito: non riscrivere il renderer per problemi del Genome Engine | Alto | Ogni modifica strutturale deve avere architettura aggiornata e analisi d'impatto prima del codice | PR che modifica >1 sottosistema senza analisi |
| R-17 | **Campionamento renderer con churn massivo** | `lib/renderSampling.ts:18-34` + `LIMITE-CAMPIONAMENTO-POPOLAZIONE.md:1-21`: una morte a 3k cambia 1495/1500 creature disegnate | Medio: metriche visive instabili, falsi segnali di evoluzione | Non usare il campionamento come evidenza di dinamiche evolutive; benchmark genetici su popolazione completa | Qualsiasi conclusione basata sul campione visivo |
| R-18 | **Assenza di chunk eviction** | `worldScale.benchmark.ts:33-50`: chunk materializzati tendono al costo dense-grid | Medio: memoria/snapshot crescono con mondi lunghi | Misurare heap e dimensione snapshot nelle nuove metriche; nessun locus che aumenti per-cell storage senza benchmark | Crescita non misurata di heap/snapshot |
| R-19 | **UI pannelli non estesi** | `OrganismInspector.tsx:98-105` mostra solo 13 tratti; `SpeciesGenetics.tsx:20-58` copre solo `TraitName` legacy | Basso: nuovi geni invisibili all'utente | Estendere i pannelli solo dopo checkpoint; mantenere `StatsPanel` come riferimento | Nuovo gene senza visualizzazione o default documentato |

---

## 4. Rischi introdotti dalla revisione architetturale

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-20 | **Catalogo alleli scambiato per genotipo** | Rilievo 1 della review: il catalogo disponibile non può essere l'individuo | Critico: diploidia e segregazione non rappresentabili | `AlleleDefinition` solo nel registry; `AlleleInstance` solo dentro `Chromosome`; test T-01; validatore dedica | Qualsiasi API che derivi `GeneticGenome` da `registry.alleles` |
| R-21 | **Dominanza come valore globale per locus** | Rilievo 2 della review: modello troppo povero per codominanza/epistasi | Alto: espressione non componibile | `ExpressionRule` distinte da `AlleleDefinition`; gerarchie/pesi per regola; test T-05/T-06/T-07 | Un solo campo `dominance` usato per tutti i contesti |
| R-22 | **Pedigree con due genitori obbligatori** | Rilievo 3 della review: fondatori e asessuata devono essere legittimi | Alto: genealogie parziali non rappresentabili | `parents: readonly ParentLink[]` con 0/1/2 elementi e `organismId: null`; test T-09/T-10 | Qualsiasi validazione che rigetti 0 o 1 genitore |
| R-23 | **Evento mutazionale incompleto o mescolato agli effetti** | Rilievo 4 della review: serve ricostruzione esatta della modifica | Alto: replay impossibile, falsa attribuzione di fitness | Tutti i campi di `MutationEvent` + `RngTrace`; effetti e fitness in strutture separate; test T-08 | Evento senza allele prima/dopo, tick, origine, organismo o RNG |
| R-24 | **Ambiente che modifica il genotipo ereditabile** | Rilievo 5 della review: separazione dei sette contratti | Critico: ereditarietà contaminata da plasticità | Firme vietate esplicitamente in `GENOME_API_CONTRACTS.md` §5; `PlasticResponse.heritable = false`; test G4-R1/G5-R1 | Qualsiasi funzione che restituisca `GeneticGenome` da ambiente/sviluppo |
| R-25 | **Contratti mancanti su config/RNG/serializzazione/migrazione** | Rilievo 6 della review | Alto: implementazioni non confrontabili e snapshot non migrabili | `GenomeConfig`, `EnvironmentalContext`, `RngTrace`, `SerializedGeneticGenome`, `MigrationResult` definiti; test T-11/T-12/T-13 | Nuovo modulo con tipi impliciti o versioni non dichiarate |
| R-26 | **Test statistici sottodimensionati o single-seed** | Rilievo 8 della review: servono popolazioni grandi e più seed | Medio: conclusioni apparentemente valide ma non robuste | ≥5 seed, N dichiarati per categoria, α=0,05 e CI 95% prima dell'esecuzione (`GENOME_VALIDATION_PLAN.md` §6) | Risultato presentato senza seed/N/intervalli |

---

## 5. Matrice rischio → fase

| Fase | Rischi principali |
|---|---|
| Rev 0/1 GEN-0 | R-06, R-12, R-13, R-20…R-26 |
| pre-GEN-2 | R-01, R-26 |
| GEN-1 | R-01, R-04, R-10, R-16, R-20…R-26 |
| GEN-2 | R-02, R-03, R-01, R-20, R-22, R-26 |
| GEN-3 | R-05, R-02, R-23 |
| GEN-4 | R-04, R-12, R-21, R-24 |
| GEN-5 | R-03, R-07, R-24 |
| GEN-6 | R-07, R-08, R-09, R-11 |
| GEN-7 | R-09, R-12 |
| GEN-8 | R-01, R-12, R-14, R-26 |

---

## 6. Regole di escalation

1. Se un rischio con impatto **Critico** si verifica: **stop immediato**, documentazione del problema in un report dedicato, nessun workaround silenzioso.
2. Se un failure nuovo appare in un baseline quiescente: stop sulla feature, confronto con `main@5672f12`, classificazione prima di procedere.
3. Se un contratto condiviso deve cambiare: stop, aggiornamento del checkpoint §13, approvazione esplicita prima di qualsiasi modifica.
4. Se una classificazione `INFERRED` viene richiesta per una conclusione evolutiva: rifiuto, registrazione come `NON_EVALUABLE`.
5. Se un test statistico obbligatorio (T-01…T-13) non è stato eseguito con seed e output verificabili: GEN-1 non può essere proposto come pronto.

---

## 7. Conferma esplicita

Questa revisione ha modificato solo documentazione. **Nessun codice di produzione**, nessuna modifica a G3.1, persistence, simulazione core o Planet Engine; nessun merge. `main` resta `5672f12296e484a4ba02ba2876e2f5e82d266cb1`. La baseline di riferimento resta `gen0-baseline-quiescent.log` con **22 failure / 17 timeout / 252,56 s / EXIT=1**; la corsa con 4 agenti paralleli è solo un confronto storico.
