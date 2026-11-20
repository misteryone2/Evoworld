# GENOME — Analisi dei gap

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 (open), baseline `2234eec`  
**Revisione:** Rev 1 dopo la review tecnica di PR #4.  
**Confronto:** requisiti GEN-1…GEN-8 vs codice verificato in `main@5672f12`.  
**Regola:** un gap è dichiarato solo se non esiste evidenza nel codice. Un sistema presente ma incompleto è classificato `EXISTING_NEEDS_EXTENSION`, non `MISSING`.

---

## 1. Sintesi esecutiva

Il progetto **non parte da zero**: possiede un genoma vettoriale funzionante (33 geni), espressione fenotipica modulare, speciazione emergente, determinismo verificato (IV1-A) e un renderer G3.1 completamente integrato.

Il gap strategico è che **il genoma non è genetico in senso mendeliano**: non ci sono alleli, loci, cromosomi, diploidia reale, meiosi, gameti, dominanza o epistasi. L'ereditarietà è media + mutazione gaussiana; la compatibilità è distanza vettoriale. Il body plan è speculativo e indipendente dal genotipo.

Per questo la milestone non deve riscrivere il renderer né la simulazione: deve **aggiungere un motore genetico sotto il fenotipo esistente** e poi collegarlo gradualmente ai sistemi G.

---

## 2. Matrice requisito → stato → gap

| Fase | Requisito | Stato verificato | Gap | Classificazione |
|---|---|---|---|---|
| GEN-1 | Genoma senza numero arbitrario massimo di loci | `ext: Record<string, number>` non ha limite tecnico, ma solo 20 chiavi del registry vengono lette | Registry, validazione, schema versionato per loci arbitrari | `EXISTING_NEEDS_EXTENSION` |
| GEN-1 | Alleli, loci, cromosomi | nessun tipo, nessun campo | Intera astrazione assente | `MISSING` |
| GEN-1 | Diploidia iniziale, ploidia estendibile | media di due genitori, non coppie omologhe | Modello di ploidia parametrico | `MISSING` |
| GEN-1 | Dominanza, recessività, codominanza | nessun modello allele→fenotipo | Regole di risoluzione | `MISSING` |
| GEN-1 | Epistasi, pleiotropia, poligenia | pleiotropia/poligenia come effetti di calcolo in `geneExpression.ts`; epistasi assente | Astrazioni dedicate; epistasi | `EXISTING_NEEDS_EXTENSION` / `MISSING` |
| GEN-1 | Epigenetica | `markExtInert()` è `WeakSet` di processo, non ereditabile | Marcatore persistente e versionato, **solo se architetturalmente giustificato** | `MISSING` |
| GEN-1 | Genealogia | `SpeciesRecord` ha `parentSpeciesId`, ma non pedigree individuale | Pedigree per organismo | `MISSING` |
| GEN-1 | RNG deterministico | `Random` mulberry32 + RNG derivato con salt; IV1-A verificato | Nessuno; estendere le regole di derivazione ai nuovi campioni | `EXISTING_COMPLETE` |
| GEN-1 | Serialization e migration | `migrateGenome` / `migrateSnapshot` idempotenti | Migrazione per nuovi schema di loci | `EXISTING_NEEDS_EXTENSION` |
| GEN-2 | Gameti, meiosi, ricombinazione | nessuno; solo `plantGenome.ts:130-135` sceglie per-tratto (modulo scollegato) | Intero sistema | `MISSING` |
| GEN-2 | Trasmissione allelica | non applicabile, alleli assenti | — | `MISSING` |
| GEN-2 | Compatibilità riproduttiva | `areGeneticallyCompatible`, soglia 0,16; live loop usa la versione legacy | Ricalibrazione V2 (R-01) | `EXISTING_NEEDS_EXTENSION` |
| GEN-2 | Inbreeding, diversità | `genomeStats`, Shannon index, analisi per specie | Metriche su pedigree mendeliano | `MISSING` |
| GEN-3 | Point/insertion/deletion/duplication/structural/regulatory | solo mutazione gaussiana per tratto, più pesi cervello | Tipi di evento, storia, statistiche | `MISSING` |
| GEN-3 | Tassi configurabili | `MUTATION_RATE`, `MUTATION_STD_FRACTION`, std cervello | Estendere ai nuovi eventi senza rompere i valori legacy | `EXISTING_NEEDS_EXTENSION` |
| GEN-3 | Mutazioni non vantaggiose | non c'è termine fitness legato alla mutazione | Mantenere esplicitamente l'invariante con test G3-N1 | `EXISTING_COMPLETE` (invariante da preservare) |
| GEN-4 | Genotipo → allele resolution → expression → development → fenotipo | `expressGenome()` salta direttamente geni → 26 campi | Stadio di risoluzione allelica e stadio di sviluppo | `MISSING` |
| GEN-4 | Dominanza, dosaggio, regolazione, ambiente | default neutri, modulatori ambientali già collegati | Regole allele-specifiche | `EXISTING_NEEDS_EXTENSION` |
| GEN-4 | Separazione genotipo/fenotipo | `PhenotypeProfile` immutable, `WeakMap` cache | Nessuno; preservare | `EXISTING_COMPLETE` |
| GEN-5 | Crescita, fasi, maturazione, ontogenesi | `age`, `lifespan`, `maturityFraction` in fenotipo | Stadi di sviluppo con traiettorie non uniformi | `MISSING` |
| GEN-5 | Plasticità non ereditaria | pelo/corteccia modulano l'ambiente, ma non c'è sviluppo dedicato | Modulo sviluppo | `MISSING` |
| GEN-6 | Genome → body plan → anatomy → descriptors → render plan → renderer | pipeline esiste ed è genome-agnostica; il body plan è `speculativeBodyPlanId(speciesId)` (`runtimeAnatomyRenderSource.ts:270-284`); `derive.ts` legge 4 geni | Generare il body plan da loci anatomici reali e estendere provenienza/identità cache | `EXISTING_NEEDS_EXTENSION` |
| GEN-6 | Innesto completo genotipo → body plan live | `AnatomyInput` accetta già `BodyPlanSpec` arbitrario e validatore pronto, ma non esiste `bodyPlanFromGenome` | Provider genetico + origine additiva | `BLOCKED` dai `MISSING` genetici, non dal renderer |
| GEN-6 | Preservare renderer, MOR, cache, pool, fallback, adaptive | tutti presenti e testati (185 G3 + 115 E2) | Nessuno; **non riscrivere** | `EXISTING_COMPLETE` |
| GEN-7 | Metabolismo, energia, sensori, locomozione, comportamento | già collegati a `Phenotype` (9 hook verificati) | Nuovi tratti devono passare dagli hook esistenti, non creare paralleli | `EXISTING_NEEDS_EXTENSION` |
| GEN-8 | Selezione, popolazione, diversità, speciazione | speciazione per distanza + separazione geografica; 6 specie/contesto | Ricalibrazione e metriche multi-seed | `EXISTING_NEEDS_EXTENSION` |
| GEN-8 | Specie non predeterminate | `SpeciesRecord` emergente da distanza | Nessuno; preservare | `EXISTING_COMPLETE` |
| GEN-8 | Selezione vs deriva | non prodotto, `INFERRED` non autorizzato (E2) | Controlli esterni dedicati | `NON_EVALUABLE` |

---

## 3. Gap trasversali

### 3.1 Contratti e versionamento
- `GENE_REGISTRY` è congelato con ID stabili (`MOR-01`, `LOC-01`, …). Nuovi loci devono **aggiungere**, non rinumerare.
- `WorldSnapshot` ha `genomeVersion`; il numero attuale è 2. Un nuovo schema richiede monotonía e migrazione idempotente.
- `RenderFrame` è un payload worker→UI con array tipizzati: nuovi canali devono essere opzionali e con maschera di presenza, come i canali MOR (`types/index.ts:421-425`).

### 3.2 Coerenza scientifica
- La distanza V2 diluisce i 13 tratti di un fattore 0,744 (§1 del report v1.11.0); le soglie 0,16/0,26 non sono state ricalibrate. **Prima di collegare la meiosi**, va deciso se calibrare sulle vecchie unità o mantenerle separate.
- I test `vibeGenomeV1110.test.ts` contengono asserzioni tautologiche documentate. Non possono essere usati come prova di correttezza del nuovo motore.
- `INFERRED` resta non autorizzato per selezione vs deriva.

### 3.3 Performance
- Il costo attuale è noto solo per G3.1/IV1-B. Non esistono benchmark `costPerGenome`, `costPerOrganism`, `costPerGeneration`.
- `gpu: null`: nessuna misura di FPS, upload o fill-rate. Non si possono fare confronti con renderer GPU.

### 3.4 Test
- Nessun file `tests/*genomeEngine*`.
- Nessun test multi-seed di frequenze alleliche, eterozigosità, bottleneck o founder effect.
- I 22 failure del baseline quiescente GEN-0 (5 deterministici + 17 timeout) e i 6 failure della corsa storica di integrazione restano il confronto, non vanno "riparati" cambiando le asserzioni.

---

## 4. Cosa NON è un gap (vincoli di non-regressione)

| Sistema | Perché non va toccato |
|---|---|
| Renderer 3D/2D, `creatureInstancing.ts`, adaptive rendering | 185 test G3 + profilazione G3.1; i problemi del Genome Engine non si risolvono qui |
| `lib/anatomy/assemble.ts`, `bodyPlan.ts`, `lod.ts`, `validate.ts` | contratti G2.1 consolidati; da estendere solo dopo checkpoint |
| `tools/iv1/invariance.ts`, fingerprint canonico | 60 run/45 confronti/0 divergenze; hash `82e1bb79…` |
| Dataset E1/E2/IV1-B e tag `archive/*` | evidenza storica; nessuna riscrittura |
| `Random` mulberry32 e RNG derivato | determinismo verificato; nuovi campioni devono usare salt |
| Test esistenti | nessuna soglia o asserzione va allentata |

---

## 5. Priorizzazione proposta

| Priorità | Gap | Motivo | Fase |
|---|---|---|---|
| P0 | Ricalibrazione distanza/soglie V2 | Blocca ogni collegamento dell'eredità mendeliana | pre-GEN-2 |
| P0 | Checkpoint contratti condivisi | Blocca modifiche a G/persistence/core | pre-GEN-6 |
| P1 | Registry loci/alleli + modello ploidia | Fondamento di tutto il resto | GEN-1 |
| P1 | Gameti, meiosi, ricombinazione | Requisito esplicito "non copie dei genomi" | GEN-2 |
| P1 | Risoluzione allelica in espressione | Separazione genotipo/fenotipo | GEN-4 |
| P2 | Tipi di mutazione + storia | Variabilità controllata | GEN-3 |
| P2 | Sviluppo ontogenetico | Fenotipo non solo scala | GEN-5 |
| P2 | Metriche pedigree/diversità | Validazione statistica | GEN-2/8 |
| P3 | Body plan genetico | Dipende da loci anatomici validati | GEN-6 |
| P3 | Benchmark dedicati | Necessari prima di affermare scalabilità | GEN-1/6/8 |

---

## 6. Criterio di "non ricostruzione"

Prima di scrivere una nuova funzione, verificare che non esista già:

- Creazione/eredità/mutazione → `genome.ts`, `genomeExt.ts`, `brain.ts`, `plantGenome.ts`
- Espressione → `geneExpression.ts`, `lib/phenotype/derive.ts`
- Specie/speciazione → `speciation.ts`, `types/index.ts`
- Anatomia/descriptor → `lib/anatomy/*`, `lib/phenotype/*`
- Rendering → `components/simulation/planet3d/*`, `lib/adaptiveRender.ts`, `lib/visual/*`
- Save/load → `world.ts`, `genomeMigration.ts`
- Determinismo → `random.ts`, `tools/iv1/invariance.ts`
- Benchmark → `scripts/*benchmark.ts`, `docs/research/iv1b/*`

Se esiste, si estende; se non esiste, si aggiunge con contratto nuovo e test dedicato.
