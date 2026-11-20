# GENOME — Piano di implementazione

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit`  
**Stato:** piano proposto. **Nessuna fase implementata.** Ogni fase richiede PR dedicata e approvazione prima del merge.

---

## 1. Sequenza e dipendenze

```text
GEN-0 audit (questi 7 documenti)
   │
   ├─ pre-GEN-2: ricalibrazione distanza V2 (R-01) ──► esperimento multi-seed
   │
   GEN-1 moduli puri simulation/genome/**  ──► GEN-2 meiosi + innesto riproduzione
        │                                           │
        │                                           ├─► GEN-3 mutazioni tipizzate
        │                                           └─► GEN-4 risoluzione allelica → geneExpression
        │                                                        │
        │                                                        └─► GEN-5 sviluppo ontogenetico
        │                                                                     │
        └─► checkpoint architettura ──► GEN-6 G/body plan/renderer ──► GEN-7 fisiologia ──► GEN-8 evoluzione
```

**Regola:** il checkpoint architetturale (`GENOME_ARCHITECTURE.md` §9) è un gate tecnico, non una formalità. Nessun file sotto `types/`, `lib/anatomy/`, `lib/phenotype/`, renderer o persistence viene toccato prima della sua approvazione.

---

## 2. Fase 0 — Chiusura audit (stato attuale)

| Azione | Stato |
|---|---|
| Audit repository, Git, test, genetica, fenotipo, anatomia, G, persistence | completato |
| Classificazione componenti con file:righe | completata in `GENOME_CURRENT_STATE.md` §6 |
| 7 documenti GEN-0 | completati |
| Baseline quiescente ripetuta senza agenti paralleli | **da eseguire** prima della prima PR implementativa |
| Commit documenti su `milestone/genome/gen0-audit` | **da eseguire** |
| Merge su `main` | **non autorizzato** |

---

## 3. Fase pre-GEN-2 — Ricalibrazione distanza (P0 / R-01)

**Perché prima di tutto:** `geneticDistanceV2` diluisce i 13 tratti di `sqrt(13/23,5)=0,744`; le soglie 0,16/0,26 non sono state ricalibrate (`docs/GENOMA-v1.11.0.md:75-78`). Collegare la meiosi a queste soglie amplificherebbe l'errore.

| Passo | Azione | Criterio |
|---|---|---|
| 1 | Eseguire esperimento multi-seed (≥5 seed) misurando distanza iniziale, specie a 4.000 tick, frequenza di accoppiamento | output salvato con comando e log |
| 2 | Confrontare tre opzioni: soglie invariate, ricalibrate, modalità separata per `genetics` | decisione documentata |
| 3 | Aggiornare `GENOME_ARCHITECTURE.md` e `GENOME_RISK_REGISTER.md` | R-01 chiuso o mitigato |
| 4 | Nessuna modifica a `genome.ts` senza test dedicato | regressione IV1-A verde |

---

## 4. GEN-1 — Architettura del Genome Engine (solo moduli puri)

**Branch:** `milestone/genome/gen1-engine` (da `milestone/genome/gen0-audit`)

| Passo | File | Azione |
|---|---|---|
| 1.1 | `simulation/genome/types.ts` | tipi da `GENOME_API_CONTRACTS.md` §2 |
| 1.2 | `simulation/genome/registry.ts` | registry loci/alleli versionato; nessuna rinumerazione dei 33 ID |
| 1.3 | `simulation/genome/ploidy.ts` | diploidia iniziale, ploidia parametrica |
| 1.4 | `simulation/genome/migration.ts` | schema opzionale, idempotente |
| 1.5 | `simulation/genome/metrics.ts` | misure di costo, mediana/P95 |
| 1.6 | `tests/genomeEngine/*.test.ts` | G1-F1/F2/F3/G1-P1/G1-R1 |

**Verifica:** `tsc` exit 0; test dedicati verdi; full suite senza nuovi failure; nessun file fuori `simulation/genome/**` e `tests/genomeEngine/**`.

---

## 5. GEN-2 — Ereditarietà mendeliana

**Branch:** `milestone/genome/gen2-inheritance`  
**Gate:** checkpoint architettura approvato perché `reproduction.ts` è simulazione core.

| Passo | Azione |
|---|---|
| 2.1 | Implementare `meiosis.ts`: un allele per locus per gamete, ricombinazione seeded |
| 2.2 | Implementare `fuse`: figlio con `ploidy` copie per locus |
| 2.3 | Aggiungere `pedigree.ts`: due genitori noti, nessun ciclo |
| 2.4 | Innestare in `reproduction.ts` solo se entrambi i genitori hanno `genetics` |
| 2.5 | Mantenere blending legacy come fallback; non toccare soglia energia 130 |
| 2.6 | Test G2-F1…F5, G2-R1, non consumo RNG mondo |

**Divieto:** la media dei genomi parentali non è ereditarietà mendeliana e non può essere presentata come tale.

---

## 6. GEN-3 — Mutazioni tipizzate

| Passo | Azione |
|---|---|
| 3.1 | `mutation.ts`: point, insertion, deletion, duplication, structural, regulatory |
| 3.2 | Ogni evento registra tipo, loci, tick, RNG consumato |
| 3.3 | `mutationEvents` e contatori nello snapshot |
| 3.4 | Test G3-F1, G3-S1, G3-F2, G3-N1, G3-R1 |
| 3.5 | Nessun termine fitness dipendente da `isMutation` |

---

## 7. GEN-4 — Espressione genotipo → fenotipo

**Gate:** tocca `geneExpression.ts`, richiede checkpoint approvato.

| Passo | Azione |
|---|---|
| 4.1 | `expression.ts`: dominanza, codominanza, dosaggio, epistasi, pleiotropia, regolazione |
| 4.2 | `resolve()` produce gli stessi 26 campi di `Phenotype`; nessun nuovo campo obbligatorio |
| 4.3 | `PhenotypeProfile` resta immutabile; cache `WeakMap` preservata |
| 4.4 | Test G4-F1…F4, G4-S1, G4-R1 |

---

## 8. GEN-5 — Sviluppo

| Passo | Azione |
|---|---|
| 5.1 | `development.ts`: stadi derivati da età/tick e regolazione |
| 5.2 | Almeno due strutture con traiettorie di crescita diverse e misurate |
| 5.3 | Plasticità non ereditaria |
| 5.4 | Test G5-F1/F2/F3/G5-R1: fingerprint genoma costante |

---

## 9. GEN-6 — Integrazione con G (checkpoint obbligatorio)

**Gate:** approvazione esplicita di `GENOME_ARCHITECTURE.md` §9.

| Passo | Azione |
|---|---|
| 6.1 | Loci anatomici reali alimentano `derivePhenotype()` solo con prove di provenienza |
| 6.2 | `bodyPlan` generato dal genoma quando i loci esistono; altrimenti `undetermined`/`speculative` |
| 6.3 | Nuovi canali `RenderFrame` opzionali + maschera |
| 6.4 | Nessuna modifica a cache, pool, fallback, adaptive rendering senza benchmark |
| 6.5 | 185 test G3 + 115 E2 verdi; benchmark G3.1/IV1-B-R1 senza regressione |

---

## 10. GEN-7 / GEN-8 — Fisiologia ed evoluzione

- GEN-7: i nuovi tratti passano dagli hook esistenti (metabolismo, nicchia, alimentazione, predazione, movimento, collisioni, comportamento, riproduzione). Nessun sistema parallelo.
- GEN-8: metriche multi-seed, bottleneck, founder effect, speciazione emergente. Selezione vs deriva resta `NON_EVALUABLE`; nessun `INFERRED` autorizzato.

---

## 11. Governance delle PR

1. Un branch per fase, partendo dal branch della fase precedente.
2. Nessun push diretto su `main`; nessun merge senza autorizzazione.
3. Ogni PR contiene: diff, comandi esatti, log, classificazioni, cambiamenti ai documenti.
4. Ogni modifica a test esistenti richiede giustificazione separata; **non si allentano asserzioni per far passare i test**.
5. Secompare un failure nuovo nel baseline quiescente: stop e indagine prima di procedere.
6. Se un contratto condiviso cambia: stop, aggiornamento architettura, approvazione.

---

## 12. Prima azione concreta (dopo l'approvazione del piano)

1. Eseguire baseline full quiescente su `main@5672f12` e salvare il log.
2. Eseguire l'esperimento di ricalibrazione R-01 con ≥5 seed.
3. Aprire la PR `milestone/genome/gen1-engine` con i soli moduli puri e test dedicati.

**Non viene toccato alcun codice di produzione finché i 7 documenti non sono committati e il checkpoint non è approvato.**
