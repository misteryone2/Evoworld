# GENOME — Piano di implementazione (Rev 1)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 (open)  
**Baseline GEN-0:** commit `2234eec6bb18e0ff5822247346a90461001737fd`  
**Revisione:** Rev 1, conseguente alla revisione tecnica di PR #4.  
**Stato:** piano proposto, **in attesa di nuova review**. Nessuna fase implementata. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**. Nessun merge.

---

## 0. Copertura dei rilievi della review

| Rilievo | Dove è stato corretto | Fase di verifica |
|---|---|---|
| 1. Separare locus/allele/cromosoma/genoma/registry; diploidia reale; posizione loci e ricombinazione | `GENOME_ARCHITECTURE.md` §2, `GENOME_API_CONTRACTS.md` §3–§4 | T-01, T-03, T-04 |
| 2. Espressione componibile, non dominanza globale per locus | `GENOME_ARCHITECTURE.md` §3, `GENOME_API_CONTRACTS.md` §3.1, §5 | T-05, T-06, T-07, G4-F1…F4 |
| 3. Pedigree con 0/1/2 genitori, sessuata/asessuata/parziale | `GENOME_ARCHITECTURE.md` §4, `GENOME_API_CONTRACTS.md` §6 | T-09, T-10 |
| 4. Evento mutazionale completo e separato dagli effetti | `GENOME_ARCHITECTURE.md` §5, `GENOME_API_CONTRACTS.md` §7 | T-08, G3-F1, G3-N1 |
| 5. Sette contratti distinti; ambiente non scrive il genotipo | `GENOME_ARCHITECTURE.md` §6–§7, `GENOME_API_CONTRACTS.md` §5 | G4-R1, G5-R1 |
| 6. `GenomeConfig`, `Environment`, RNG, serializzazione, migrazione, versionamento | `GENOME_API_CONTRACTS.md` §8–§9 | T-11, T-12, T-13 |
| 7. Documentazione e incongruenze commit/baseline | tutti i documenti aggiornati; baseline quiescente confermato | §2 di questo documento |
| 8. Test progettuali obbligatori e multi-seed | `GENOME_VALIDATION_PLAN.md` §6 | T-01…T-13 |
| 9. Vincoli | §11 di questo documento, `GENOME_ARCHITECTURE.md` §13 | verifica diff |

---

## 1. Sequenza e dipendenze

```text
GEN-0 Rev 0 — audit documentale ──────────────► commit 2234eec (già pubblicato)
        │
        ▼
GEN-0 Rev 1 — revisione architetturale ───────► PR #4 aggiornata ──► NUOVA REVIEW
        │
        ├─ pre-GEN-2: ricalibrazione distanza V2 (R-01) ──► esperimento ≥5 seed
        │
        ▼
GEN-1 moduli puri simulation/genome/** ──► GEN-2 meiosi + pedigree + innesto
        │                                       │
        │                                       ├─► GEN-3 eventi mutazionali completi
        │                                       └─► GEN-4 regole di espressione componibili
        │                                                    │
        │                                                    └─► GEN-5 sviluppo e plasticità
        │                                                                 │
        └─► checkpoint §13 ──► GEN-6 adattatori G3.1 ──► GEN-7 fisiologia ──► GEN-8 evoluzione
```

**Regola:** il checkpoint architetturale (`GENOME_ARCHITECTURE.md` §13) è un gate tecnico, non una formalità. Nessun file sotto `types/`, `lib/anatomy/`, `lib/phenotype/`, renderer o persistence viene toccato prima della sua approvazione esplicita.

---

## 2. Fase 0 — Chiusura audit (stato verificato)

| Azione | Stato |
|---|---|
| Audit repository, Git, test, genetica, fenotipo, anatomia, G, persistence | **completato** |
| Classificazione componenti con file:righe | **completata** in `GENOME_CURRENT_STATE.md` §6 |
| 7 documenti GEN-0 | **completati** e committati in `2234eec` |
| Push del branch e apertura PR #4 | **completati** (`mergeable=True`, 1 commit, 7 file) |
| Baseline quiescente senza agenti paralleli | **eseguito**: `252,56 s`, `1082 passed`, `22 failed`, `1 skipped`, `EXIT=1` |
| Log baseline verificabile | **presente**: `gen0-baseline-quiescent.log` |
| Rev 1 (5 documenti richiesti) | **in consegna su PR #4**, nessun codice toccato |
| Nuova review della Rev 1 | **in attesa** |
| Checkpoint architetturale §13 | **NON APPROVATO** |
| GEN-1 | **non avviato** |
| Merge su `main` | **non autorizzato** |

**Correzione delle incongruenze:** i documenti della Rev 0 indicavano "baseline da eseguire" e "commit da eseguire"; entrambi sono invece già stati eseguiti prima della consegna della PR. La baseline di riferimento resta la corsa quiescente, non quella con 4 agenti paralleli (che ha gli stessi 22 failure ma tempi dilatati e hook IV1-A a 300 s).

---

## 3. Fase pre-GEN-2 — Ricalibrazione distanza (P0 / R-01)

**Perché prima di tutto:** `geneticDistanceV2` diluisce i 13 tratti di `sqrt(13/23,5)=0,744`; le soglie 0,16/0,26 non sono state ricalibrate (`docs/GENOMA-v1.11.0.md:75-78`). Collegare la meiosi a queste soglie amplificherebbe l'errore.

| Passo | Azione | Criterio |
|---|---|---|
| 1 | Eseguire esperimento multi-seed (≥5 seed) misurando distanza iniziale, specie a 4.000 tick, frequenza di accoppiamento | output salvato con comando, seed, log e conteggi |
| 2 | Confrontare tre opzioni: soglie invariate, ricalibrate, modalità separata per `genetics` | decisione documentata prima dell'implementazione |
| 3 | Aggiornare `GENOME_ARCHITECTURE.md` e `GENOME_RISK_REGISTER.md` | R-01 chiuso o mitigato con evidenza |
| 4 | Nessuna modifica a `genome.ts` senza test dedicato | regressione IV1-A verde, fingerprint invariato |

---

## 4. GEN-1 — Architettura del Genome Engine (solo moduli puri)

**Branch:** `milestone/genome/gen1-engine` (da `milestone/genome/gen0-audit`, dopo nuova review)  
**Limite di modifica:** solo `simulation/genome/**` e `tests/genomeEngine/**`.

| Passo | File | Azione |
|---|---|---|
| 1.1 | `types.ts` | tipi completi di `GENOME_API_CONTRACTS.md`: registry, genotipo, gamete, pedigree, mutazione, 7 contratti, config, RNG |
| 1.2 | `config.ts` | `GenomeConfig` versionato; ploidia, gruppi omologhi, tassi, ricombinazione, pipeline, policy RNG |
| 1.3 | `registry.ts` | registry loci/alleli/regole con `positionBp`, `positionCm`, hotspot e fingerprint; **nessuna rinumerazione dei 33 ID legacy** |
| 1.4 | `genotype.ts` | `GeneticGenome` con una `Chromosome` per copia; due copie omologhe per un diploide |
| 1.5 | `validate.ts` | copie mancanti/duplicate, locus duplicati, alleleId sconosciuti, presenza `unknown`/`absent` |
| 1.6 | `rng.ts` | stream derivati con namespace/salt; `RngTrace` con stato prima/dopo e conteggio estrazioni |
| 1.7 | `recombination.ts` | `RecombinationPlan`, crossover, donatore per intervallo, gamete a copia singola |
| 1.8 | `mutation.ts` | `MutationEvent` completo e replayable; nessun campo fitness |
| 1.9 | `pedigree.ts` | fondatori, 0/1/2 link, sessuata/asessuata/parziale, niente cicli |
| 1.10 | `resolution.ts` | `ResolvedGenotype` con dosage per copia |
| 1.11 | `expression.ts` | regole componibili: dominanza, incomplete, codominanza, dosage, poligenia, pleiotropia, epistasi, regolazione, interazioni |
| 1.12 | `environment.ts` | `EnvironmentalContext` read-only → `PlasticResponse`, **mai** `GeneticGenome` |
| 1.13 | `development.ts` | `DevelopmentalState` → `FinalPhenotype`; fingerprint del genotipo costante |
| 1.14 | `serialization.ts`, `migration.ts` | round-trip canonico, migrazione monotonica/idempotente, versioni future `unsupported` |
| 1.15 | `metrics.ts` | mediana/P95 di costo costruzione, clonazione, serializzazione |
| 1.16 | `tests/genomeEngine/*.test.ts` | T-01…T-13 da `GENOME_VALIDATION_PLAN.md` §6 |

**Verifica:** `tsc` exit 0; test dedicati verdi; full suite senza nuovi failure rispetto al baseline quiescente; diff limitato alle due cartelle indicate.

---

## 5. GEN-2 — Ereditarietà mendeliana

**Branch:** `milestone/genome/gen2-inheritance`  
**Gate:** checkpoint §13 approvato perché `reproduction.ts` è simulazione core.

| Passo | Azione |
|---|---|
| 2.1 | Implementare `meiosis()` da `RecombinationPlan`: una sola copia per gruppo omologo nel gamete |
| 2.2 | Implementare `fuse(a, b)`: figlio con `ploidy` copie e alleli identificabili per copia |
| 2.3 | Implementare `cloneAsexual()`: pedigree con `sole-parent`, fingerprint uguale al genitore salvo mutazioni configurate |
| 2.4 | `pedigree.ts`: fondatori (`[]`), sessuata completa (2), sessuata parziale (1 + `null`), legacy; **nessun obbligo di due genitori** |
| 2.5 | Innestare in `reproduction.ts` solo se entrambi i genitori hanno `genetics`; per asessuata se ne porta uno |
| 2.6 | Mantenere blending legacy come fallback; non toccare soglia energia 130 |
| 2.7 | Test T-02, T-03, T-04, T-09, T-10, G2-F5, G2-R1; non consumo del RNG del mondo |

**Divieto:** la media dei genomi parentali non è ereditarietà mendeliana e non può essere presentata come tale.

---

## 6. GEN-3 — Eventi mutazionali completi

| Passo | Azione |
|---|---|
| 3.1 | `mutation.ts`: `point`, `insertion`, `deletion`, `duplication`, `structural`, `regulatory` |
| 3.2 | Ogni evento registra tipo, locus, `positionBp`, allele precedente/risultante, tick, origine, organismo, `registryVersion`, `engineVersion`, `causedBy`, `RngTrace`, `replay` |
| 3.3 | `ExpressionDelta` calcolato da funzione separata; `FitnessAssessment` resta `NON_EVALUABLE` |
| 3.4 | Storia eventi e contatori opzionali nello snapshot (solo dopo checkpoint persistence) |
| 3.5 | Test T-08, G3-F1, G3-S1, G3-R1, G3-N1 |
| 3.6 | Nessun termine fitness dipendente da `isMutation`: una mutazione non è vantaggiosa o svantaggiosa *per costruzione* |

---

## 7. GEN-4 — Espressione genotipo → fenotipo

**Gate:** tocca `geneExpression.ts`, richiede checkpoint §13 approvato.

| Passo | Azione |
|---|---|
| 4.1 | `resolution.ts` + `expression.ts`: pipeline dichiarata in `GenomeConfig.expressionPipeline` |
| 4.2 | Dominanza non singleton: regole complete/incomplete/codominanza/dosaggio con gerarchie e pesi per locus |
| 4.3 | Poligenia, pleiotropia, epistasi, regolazione e interazioni come `ExpressionRule` distinte da `AlleleDefinition` |
| 4.4 | `resolve()` produce gli stessi 26 campi di `Phenotype`; nessun nuovo campo obbligatorio |
| 4.5 | `PhenotypeProfile` resta immutabile; cache `WeakMap` preservata |
| 4.6 | Test T-05, T-06, T-07, G4-F1…F4, G4-S1, G4-R1 |

---

## 8. GEN-5 — Sviluppo e contratti separati

| Passo | Azione |
|---|---|
| 5.1 | Mantenere distinti: `GeneticGenome`, `ResolvedGenotype`, `GeneticExpression`, `EnvironmentalContext`, `PlasticResponse`, `DevelopmentalState`, `FinalPhenotype` |
| 5.2 | Verificare che non esistano firme `applyEnvironment(genome, env): GeneticGenome` né equivalenti |
| 5.3 | `development.ts`: stadi derivati da età/tick e regolazione, non scala uniforme |
| 5.4 | Almeno due strutture con traiettorie di crescita diverse e misurate |
| 5.5 | Plasticità `heritable: false`; test G5-F1/F2/F3/G5-R1 con fingerprint costante |

---

## 9. GEN-6 — Integrazione con G (checkpoint obbligatorio)

**Gate:** approvazione esplicita di `GENOME_ARCHITECTURE.md` §13.

| Passo | Azione |
|---|---|
| 6.1 | Loci anatomici reali alimentano `derivePhenotype()` solo con prove di provenienza |
| 6.2 | `bodyPlan` generato dal genoma quando i loci esistono; altrimenti `undetermined`/`speculative` |
| 6.3 | Nuovi canali `RenderFrame` opzionali + maschera; nessun field obbligatorio |
| 6.4 | Riutilizzare `AnatomyInput`/`generate.ts`/`validateBodyPlanSpec()`; nessuna riscrittura di anatomy, descriptor, render plan, MOR, pool, cache o adaptive |
| 6.5 | Innesto minimo `runtimeAnatomyRenderSource.ts:270-284` solo dopo approvazione |
| 6.6 | 185 test G3 + 115 E2 verdi; benchmark G3.1/IV1-B-R1 senza regressione misurata |

---

## 10. GEN-7 / GEN-8 — Fisiologia ed evoluzione

- GEN-7: i nuovi tratti passano dagli hook esistenti (metabolismo, nicchia, alimentazione, predazione, movimento, collisioni, comportamento, riproduzione). Nessun sistema parallelo.
- GEN-8: metriche multi-seed, bottleneck, founder effect, speciazione emergente. Selezione vs deriva resta `NON_EVALUABLE`; nessun `INFERRED` autorizzato.
- Nessuna integrazione con Planet Engine in questa roadmap.

---

## 11. Governance e vincoli

1. Un branch per fase, partendo dal branch della fase precedente.
2. **Nessuna modifica a `main`**, nessun push diretto, nessun merge senza autorizzazione.
3. **Nessuna modifica al codice di produzione** in questa revisione; **nessuna modifica a G3.1**, persistence o simulazione core.
4. Ogni PR contiene: diff, comandi esatti, log, classificazioni, cambiamenti ai documenti.
5. Ogni modifica a test esistenti richiede giustificazione separata; **non si allentano asserzioni per far passare i test**.
6. Se compare un failure nuovo nel baseline quiescente: stop e indagine prima di procedere.
7. Se un contratto condiviso cambia: stop, aggiornamento architettura §13, approvazione esplicita.
8. Nessuna dichiarazione di test superati senza output verificabile.

---

## 12. Prima azione concreta dopo la nuova review

1. Ottenere approvazione esplicita della Rev 1 e del checkpoint §13 per le fasi che toccano contratti condivisi.
2. Eseguire l'esperimento di ricalibrazione R-01 con ≥5 seed e salvare log/seed/comandi.
3. Aprire la PR `milestone/genome/gen1-engine` con i soli moduli puri e i test T-01…T-13.
4. Rieseguire `tsc`, test mirati, suite E2/G3, build e confronto con il baseline quiescente `gen0-baseline-quiescent.log`.

---

## 13. Conferma esplicita

In questa revisione **nessun file di codice di produzione è stato modificato**: solo i documenti `GENOME_ARCHITECTURE.md`, `GENOME_API_CONTRACTS.md`, `GENOME_IMPLEMENTATION_PLAN.md`, `GENOME_VALIDATION_PLAN.md`, `GENOME_RISK_REGISTER.md` e le correzioni di stato in `GENOME_CURRENT_STATE.md`. Nessuna modifica a G3.1, persistence, simulazione core o Planet Engine. Nessun merge eseguito. `main` resta `5672f12296e484a4ba02ba2876e2f5e82d266cb1`.
