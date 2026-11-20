# GENOME — Architettura proposta

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit`  
**Stato:** proposta architetturale, **non ancora approvata**. Nessuna modifica al codice di produzione.  
**Scopo:** definire dove inserire il Genome Engine mendeliano senza riscrivere la simulazione, la persistence o il renderer G3.1.

---

## 1. Principi architetturali

1. **Aggiungere, non sostituire.** Il vettore a 33 geni resta il contratto pubblico e la modalità di compatibilità. Il motore mendeliano è una struttura opzionale affiancata.
2. **Flusso unidirezionale:** `Genotype (loci/alleli) → allele resolution → GeneExpression → Phenotype → Development → PhenotypeProfile → anatomy → RenderFrame`.
3. **Il renderer non è proprietario della biologia.** Come già stabilito in `G3_FINAL_LIMITATIONS.md:17`, il renderer riceve copie. Il Genome Engine non deve mai leggere stato WebGL o UI.
4. **Determinismo per derivazione.** Ogni nuovo consumatore casuale usa `deriveGeneRandom(worldRngState, salt)` o equivalente con salt esplicito (`genomeExt.ts:83-90`); è vietato consumare il RNG del mondo per campionature interne.
5. **Nessuna inferenza biologica non autorizzata.** Strutture senza locus restano `undetermined` / `speculative`; selezione vs deriva resta `NON_EVALUABLE`.
6. **Checkpoint prima dei contratti condivisi.** Qualsiasi modifica a `types/index.ts`, persistence, simulazione core o renderer richiede approvazione esplicita di questo documento e PR dedicata.

---

## 2. Stato attuale e Confederazione dei sistemi

```text
                    ┌──────────────────────── simulation/core/world.ts ───────────────────────┐
                    │  Random mulberry32 → organismi → riproduzione → speciazione → snapshot │
                    └───────┬───────────────────┬───────────────────────┬────────────────────┘
                            │                   │                       │
                genome.ts / genomeExt.ts   geneExpression.ts      renderFrame.ts
                (33 geni, media+mutazione)  (26 campi fenotipo)    (copie MOR opzionali)
                            │                   │                       │
                       Organism.genome    Phenotype (cache)       RenderFrame
                                                │                       │
                                    lib/phenotype/derive.ts   lib/anatomy/** + renderer G3.1
                                    (4 geni MOR, 10 undetermined)
```

Il wiring live usa `inheritGenome` + `inheritExt` (`reproduction.ts:3-4`), non `inheritGenomeV2` (`genomeExt.ts:119-123`). `World.toSnapshot()` / `fromSnapshot()`（`world.ts:488-536`）conserva `genomeVersion`, `advancedGenome`, `geneEffects` e `randomState`.

---

## 3. Modulo proposto: `simulation/genome/`

Nuovo sottoalbero **autonomo**, senza import da React, DOM o renderer:

| File proposto | Responsabilità | Dipendenze |
|---|---|---|
| `types.ts` | `LocusId`, `AlleleId`, `Allele`, `Locus`, `Chromosome`, `GeneticGenome`, `Gamete`, `MutationEvent`, `PedigreeRecord` | solo tipi primitivi |
| `registry.ts` | registry versionato di loci/alleli, con ID stabili e default; non rinumerare `GENE_REGISTRY` | `geneRegistry.ts` |
| `ploidy.ts` | diploidia iniziale, ploidia parametrica, coppie omologhe | `types.ts` |
| `meiosis.ts` | ricombinazione, segregazione, gameti; RNG derivato con salt | `random.ts`, `types.ts` |
| `mutation.ts` | point / insertion / deletion / duplication / structural / regulatory; evento con tipo e loci | `types.ts` |
| `expression.ts` | risoluzione allele→valore genico (dominanza, dosaggio, epistasi) verso `expressGenome` | `geneExpression.ts` |
| `development.ts` | stadi ontogenetici e crescita non uniforme; **mai scrittura nel genoma** | `Phenotype` |
| `pedigree.ts` | genealogia individuale, F, eterozigosità | `types.ts` |
| `migration.ts` | schema versionato e migrazione monotona/idempotente | `genomeMigration.ts` |
| `metrics.ts` | `costPerGenome`, `costPerOrganism`, `costPerGeneration`, mediana/P95 | nessuna |

Il modulo **non** modifica i 33 geni esistenti: li considera l'interfaccia di output della risoluzione allelica.

---

## 4. Integrazione con il genoma esistente

### 4.1 Estensione additiva di `Genome`

Proposta (solo dopo checkpoint):

```ts
interface Genome {
  // campi legacy invariati
  genetics?: GeneticGenome; // opzionale, schema versionato
}
```

- `genetics` assente ⇒ comportamento attuale identico (`EXISTING_COMPLETE`).
- `genetics` presente ⇒ `expressGenome` risolve gli alleli e produce gli stessi 26 campi di `Phenotype`.
- `ext` resta la vista dei 20 geni estesi per compatibilità con UI, snapshot e test storici.
- Nessun campo obbligatorio viene aggiunto né rimosso.

### 4.2 Riproduzione

`reproduction.ts:13-151` resta il punto di innesto:

1. Se entrambi i genitori hanno `genetics`, generare gameti via `meiosis.ts` e costruire `genetics` del figlio.
2. Risolvere gli alleli in valori genici legacy + `ext` tramite `expression.ts`.
3. Passare il `Genome` risultante a `createOrganism`, mantenendo energia, cervello e hook fenotipici attuali.
4. Se anche un solo genitore è privo di `genetics`, usare il blending legacy esistente (`fallback`, non errore).
5. Non toccare `REPRODUCTION_ENERGY_THRESHOLD = 130`: i 2 failure noti sono nelle fixture, non nel motore.

### 4.3 Speciazione e distanza

- La distanza V2 resta invariata finché non viene eseguito l'esperimento di ricalibrazione (`GENOMA-v1.11.0.md:75-78`, rischio R-01).
- La compatibilità mendeliana può usare distanza su loci **solo in una modalità separata**; non sovrascrivere `MATE_COMPATIBILITY_THRESHOLD = 0,16` senza documentazione.
- Pedigree e metriche di diversità sono aggiuntive a `SpeciesRecord` (`parentSpeciesId` resta invariato).

---

## 5. Integrazione con fenotipo, sviluppo e G

### 5.1 Espressione

`geneExpression.ts` rimane l'unico produttore di `Phenotype` (26 campi, `WeakMap` cache). L'aggiunta di `expression.ts` avviene **a monte**: converte genotipo → valori numerici attesi dai 33 geni. Nessun campo `Phenotype` viene aggiunto nel primo rilascio.

### 5.2 Sviluppo

`development.ts` riceve `Phenotype` + età/tick + ambiente e restituisce un `Phenotype` derivato, con:

- stadi discreti documentati;
- traiettorie di crescita non uniformi per almeno due strutture;
- plasticità non ereditaria;
- **divieto** di scrivere su `Organism.genome` (verifica G5-R1).

### 5.3 Body plan e renderer

La catena G3.1 resta invariata:

```text
bodyPlan → AnatomyDescriptor → RenderPlan → RenderFrame → renderer
```

Regole:

1. Finché non esistono loci anatomici validati, `speculativeBodyPlanId(speciesId)` resta `seeded-speculative` e `undetermined` (`G3_FINAL_LIMITATIONS.md:11`, `runtimeAnatomyRenderSource.ts:270-284`).
2. Quando esisteranno loci anatomici, il body plan sarà generato da essi con `DataSource.kind = "gene-direct"` o `"gene-derived"`.
3. **Innesto minimo verificato:** il generatore accetta già `BodyPlanSpec` arbitrario (`generate.ts:18-27,184-342`) con `validateBodyPlanSpec()` (`bodyPlan.ts:181-190`). Si sostituisce solo la scelta runtime (`runtimeAnatomyRenderSource.ts:275-277`) con un provider `bodyPlanFromGenome(genome, seed): BodyPlanSpec`; non si riscrivono anatomy, descriptor, render plan, MOR, pool, cache o adaptive.
4. `BodyPlanOrigin` va esteso con un valore additivo genetico (`anatomy/types.ts:12-15`); la whitelist `MORPHOLOGICAL_GENE_IDS` e il validatore di provenienza (`anatomy/validate.ts:457-467`) si allargano solo con loci reali documentati, mai allentando il controllo.
5. L'identità della cache runtime (`runtimeAnatomyRenderSource.ts:74-89`) include già id, species, bit Float32 di size/MOR/carnivory: se il body plan dipende da altri dati, aggiungere il fingerprint del `BodyPlanSpec` alla versione.
6. Nuovi canali `RenderFrame` solo opzionali + maschera di presenza, seguendo il modello MOR (`types/index.ts:421-425`).
7. Nessuna modifica a `RENDER_POOL_LIMITS`, fallback, cache, dynamic pool o adaptive rendering senza benchmark dedicati.
8. I 4 geni attualmente letti da `derive.ts:18-19` (`size`, `bodyStature`, `furDensity`, `dermalArmor`) restano il contratto minimo; nuovi geni morfologici vengono aggiunti con default neutro e `undetermined` finché non dimostrati.
9. Il catalogo dei 13 piani speculativi (`bodyPlan.ts:92-165`) e il default `quadruped` restano come fallback compatibile, non vengono eliminati.

---

## 6. Persistence e snapshot

- `genomeVersion = 2` resta; il nuovo schema introduce `geneticsVersion` **opzionale** nello snapshot o dentro `genetics`.
- Migrazione monotona: `v1 → v2 → v3`; mai migrazione inversa implicita.
- I salvataggi privi di `genetics` devono essere identici a oggi (test G1-R1 / R-10).
- `randomState` resta l'unica sorgente di riproducibility; il pedigree non sostituisce il RNG.
- Nessun array tipizzato del `RenderFrame` entra nello snapshot.

---

## 7. Determinismo e RNG

| Sorgente | Regola |
|---|---|
| RNG mondo | `Random` mulberry32 in `random.ts`; consumato solo dalle decisioni simulazioni esistenti |
| RNG genetico | derivato da `worldRngState` + salt univoco per operazione (`deriveGeneRandom`) |
| Salt | registrato nel registry; due operazioni con salt diverso non condividono sequenza |
| Test | `tests/iv1/invariance.test.ts`, fingerprint `82e1bb79…`, 60 run/45 confronti/0 divergenze |

Qualsiasi divergenza del fingerprint è **stop immediato** (R-03).

---

## 8. Fasi di attuazione e confini di modifica

| Fase | File toccati | Checkpoint richiesto |
|---|---|---|
| GEN-1 | solo `simulation/genome/**` + test dedicati | no |
| GEN-2 | `reproduction.ts`, `genome.ts`/`genomeExt.ts` solo se necessario | **sì** prima di toccare il loop live |
| GEN-3 | `simulation/genome/mutation.ts` + test | no |
| GEN-4 | `geneExpression.ts` | **sì** |
| GEN-5 | nuovo `development.ts`, test | **sì** se integrato nel tick |
| GEN-6 | `lib/phenotype/**`, `lib/anatomy/**`, renderer, `types/index.ts` | **sì, obbligatorio e approvato** |
| GEN-7 | hook fisiologici esistenti, nessun sistema parallelo | **sì** |
| GEN-8 | metriche/speciazione, nessuna soglia implicita | **sì** |

Ogni fase è una PR separata. Nessun merge senza autorizzazione esplicita.

---

## 9. Checkpoint di architettura (da approvare)

Prima di qualsiasi modifica a:

- `types/index.ts` (contratti condivisi);
- `simulation/core/world.ts` o `reproduction.ts` (simulazione core);
- `world.ts` / `genomeMigration.ts` (persistence);
- `lib/anatomy/**`, `lib/phenotype/**`, `lib/adaptiveRender.ts`, `components/simulation/planet3d/**`, `lib/visual/**` (renderer G);
- `RenderFrame` o `WorldSnapshot`;

è necessario:

1. aggiornare questo documento con l'impatto esatto (file, funzioni, test coinvolti);
2. ottenere approvazione esplicita del checkpoint;
3. aprire una PR dedicata sul branch `milestone/genome/*`;
4. eseguire e allegare `tsc`, test mirati, E2/G3, build e confronto full-suite con `main@5672f12`.

**Stato corrente del checkpoint: NON APPROVATO.** Nessun codice di produzione è stato toccato.
