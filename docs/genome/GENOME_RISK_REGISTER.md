# GENOME — Registro dei rischi (Rev 2)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 2 (correzioni su stati allelici, provenienza, maturità, espressione quantitativa, replay RNG, ambiente Planet Engine).  
**Metodo:** rischi da codice verificato, documenti e review; ogni rischio con evidenza, impatto, mitigazione, trigger di stop. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 1. Rischi tecnici pre-esistenti

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-01 | Distanza genetica V2 sotto-tarata | `docs/GENOMA-v1.11.0.md:75-78` | Alto | ricalibrazione multi-seed pre-integrazione; separare metriche legacy/locus | modifica soglie senza esperimento documentato |
| R-02 | Consumo/deriva RNG | `genomeExt.ts:83-90`, IV1-A | Alto | stream derivati, trace, replay compatibile, test T-10/T-08 | fingerprint IV1-A diverso / consumo world RNG |
| R-03 | Regressione determinismo | `tools/iv1/invariance.ts` | Critico | IV1-A + replay compatibile a ogni PR rilevante | divergenza tick-per-tick |
| R-04 | Espansione non controllata registry/ext | `geneRegistry.ts`, `genomeMigration.ts` | Medio | registry versionato, fingerprint, validazione | loci/canali non definiti |
| R-05 | Fitness implicita nelle mutazioni | requisito G3/Rev2 | Alto | `MutationEvent` senza fitness; `FitnessAssessment` separato e `NON_EVALUABLE` | fitness dipendente da `isMutation` |
| R-06 | Baseline fluttuante per carico | `gen0-baseline-quiescent.log` 22/17/252,56s | Medio | confronto con baseline quiescente; no aumento timeout | nuovo failure non presente nel baseline |

---

## 2. Rischi di integrazione con G e core

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-07 | Body plan speculativo scambiato per biologia | `G3_FINAL_LIMITATIONS.md`, `derive.ts` | Alto | mantenere `undetermined/speculative` finché senza loci/provenienza reale | anatomia dichiarata determinata senza prova |
| R-08 | Rottura contratti G3.1/core | 185 test G3 + 115 E2 + worker/persistence | Critico | checkpoint §13, PR dedicate, riuso generatori esistenti | modifica shared/core senza approvazione |
| R-09 | Costo/scalabilità non misurata | IV1-B, benchmark storici, `gpu: null` | Medio | mediana/P95 `costPerGenome/Organism/Generation`, stessa sessione | regressione misurata non giustificata |
| R-10 | Snapshot/persistence incompatibili | `WorldSnapshot`, migrazione v1→v2 | Alto | campi opzionali, migrazione monotonica/idempotente, T-12 | modifica campi obbligatori o perdita round-trip |
| R-11 | Fallback legacy non coperto | mondi v1/v2, `ext` assente | Medio | T-11, feature disattivata di default, percorsi separati | eccezione su snapshot legacy |

---

## 3. Rischi architetturali specifici Rev 2

| ID | Rischio | Evidenza (Rev 1 / review) | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-20 | Collasso semantico tra assenza biologica e dato sconosciuto | `AllelePresence`+`null` ambiguo in Rev 1 | Critico | `AlleleState` discriminato a 4 stati; test T-01/T-07; round-trip preservato | qualsiasi rappresentazione che renda indistinguibili i casi |
| R-21 | Provenienza vincolata a ruoli/genitori fissi | `maternal/paternal`, limite 2 in Rev 1 | Alto | `GeneticContribution` con `contributionId`, N contributori, ruoli opzionali; test T-09 | schema che impone 2 genitori o ruoli come identità |
| R-22 | Scaffolding confuso con funzionalità attiva | ambiguità GEN-1/2/3 | Critico di processo | livelli e criteri verificabili; T-14; divieto dichiarazioni operative senza evidenza | GEN-1 dichiarato completamento operativo senza integrazione/test live |
| R-23 | Espressione quantitativa arbitraria | effetti numerici senza unità/normalizzazione completa | Alto | `TraitChannelDefinition`, domini, normalizzazione, conflitti, policy mancanti; T-05/T-06/T-07 | regola ad hoc o dipendenza da numero fisso di geni |
| R-24 | Replay apparentemente valido ma incompatibile | trace incompleta rispetto a versioni/parametri | Critico | `ReplayCompatibilityInput`, mismatch ⇒ `incompatible`; T-08 | replay eseguito con input/versioni diversi senza errore |
| R-25 | Modello ambientale parallelo a Planet Engine | `EnvironmentalContext` semplificato in Rev 1 | Alto | `EnvironmentalSnapshot` come adattatore read-only della fonte Planet Engine; T-13 | stato ambientale autorevole duplicato in GENOME |
| R-26 | Pedigree/poliploidia non rappresentabili | contributi non generalizzati | Medio/Alto | modello N-contributori, ploidia parametrica, metriche `NON_EVALUABLE` su rami ignoti | perdita di tracciabilità contributi/gameti |
| R-27 | Serializzazione che altera stati speciali | migrazione/default | Alto | preservare `biologically-absent/undetermined/non-evaluable`; T-12 | round-trip che converte stati in `null`/default valido |
| R-28 | Conflitti di regole risolti implicitamente | pipeline componibile | Medio | priorità/strategia dichiarata; esito `non-evaluable` se irrisolvibile; T-06 | risultato dipendente da ordine accidentale |

---

## 4. Rischi scientifici e di processo

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-12 | Selezione vs deriva presentata come dimostrata | E2 protocolli | Critico | `NON_EVALUABLE`, no `INFERRED` autorizzato | attribuzione causale senza controlli |
| R-13 | Test tautologici/flaky usati come prova | `vibeGenomeV1110.test.ts`, baseline timeout | Medio | non usarli come evidenza; no modifiche per farli passare | criterio di accettazione basato su test non probante |
| R-14 | Piante evolvevoli dichiarate senza integrazione | `plantGenome.ts` scollegato | Medio | gap esplicito | affermazione non supportata |
| R-15 | Modifica `main`/merge/config GitHub non autorizzati | governance | Critico | solo branch/PR dedicati | push/merge/rebase distruttivo non autorizzato |
| R-16 | Riscrittura architetturale senza analisi impatto | vincolo programma | Alto | aggiornare architettura prima del codice, checkpoint | PR multi-sottosistema senza analisi |
| R-17 | Conclusioni da campionamento visivo | `renderSampling.ts` | Medio | usare popolazione completa per metriche genetiche | evidenza evolutiva da sample renderer |
| R-18 | Crescita memoria/snapshot non misurata | chunk eviction assente | Medio | misurare heap/snapshot nelle fasi future | crescita non misurata |
| R-19 | UI non allineata a nuovi contratti | pannelli legacy | Basso | estensione solo dopo checkpoint e contratti stabili | nuovo dato senza rappresentazione/default documentato |

---

## 5. Matrice rischio → fase

| Fase | Rischi principali |
|---|---|
| Rev 2 (documentale) | R-06, R-12, R-13, R-15, R-20…R-28 |
| pre-GEN-2 | R-01, R-12 |
| GEN-1 predisposizione | R-04, R-10, R-20, R-21, R-23, R-24, R-25, R-27, R-28 |
| GEN-2 integrazione | R-02, R-03, R-11, R-21, R-26 |
| GEN-3 integrazione | R-02, R-05, R-24, R-27 |
| GEN-4 | R-03, R-23, R-24, R-28 |
| GEN-5 | R-03, R-07, R-25 |
| GEN-6 | R-07, R-08, R-09, R-11 |
| GEN-7/8 | R-01, R-09, R-12, R-14, R-17 |

---

## 6. Regole di escalation

1. Rischio critico materializzato ⇒ stop immediato, report, nessun workaround silenzioso.
2. Nuovo failure rispetto a baseline quiescente ⇒ stop, classificazione prima di procedere.
3. Modifica a shared/core/persistence/workers/renderer ⇒ checkpoint §13 e approvazione esplicita.
4. Richiesta di inferenza causale evolutiva non autorizzata ⇒ `NON_EVALUABLE`.
5. Replay incompatibile non rilevato o stato allelico collassato ⇒ blocco rilascio e revisione contratti.

**Conferma:** Rev 2 modifica solo documentazione. Nessun codice di produzione toccato. `main` invariato (`5672f12`).
