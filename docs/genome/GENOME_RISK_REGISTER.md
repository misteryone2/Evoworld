# GENOME — Registro dei rischi (Rev 4)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 4 (correzioni G1–G5 post-review indipendente Rev 3).  
**Metodo:** rischi da codice verificato, documenti e review; ogni rischio con evidenza, impatto, mitigazione, trigger di stop. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**. **GEN-1 non avviato.**

---

## 1. Rischi tecnici pre-esistenti

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-01 | Distanza genetica V2 sotto-tarata | `docs/GENOMA-v1.11.0.md:75-78` | Alto | ricalibrazione multi-seed pre-integrazione; separare metriche legacy/locus | modifica soglie senza esperimento documentato |
| R-02 | Consumo/deriva RNG | `genomeExt.ts:83-90`, IV1-A | Alto | stream derivati, trace, replay discriminato e compatibile, test T-11/T-13 | fingerprint IV1-A diverso / consumo world RNG |
| R-03 | Regressione determinismo | `tools/iv1/invariance.ts` | Critico | IV1-A + compatibilità replay a ogni PR rilevante | divergenza tick-per-tick |
| R-04 | Espansione non controllata registry/ext | `geneRegistry.ts`, `genomeMigration.ts` | Medio | registry versionato, fingerprint, validazione domini/unità/funzioni custom registrate | loci/canali/funzioni non definiti o non validati |
| R-05 | Fitness implicita nelle mutazioni | requisito G3/Rev 2–4 | Alto | `MutationEvent` senza fitness; `ExpressionDelta` e `FitnessAssessment` separati e `NON_EVALUABLE` | fitness dipendente da `isMutation` |
| R-06 | Baseline fluttuante per carico | `gen0-baseline-quiescent.log` 22/17/252,56s | Medio | confronto con baseline quiescente; no aumento timeout | nuovo failure non presente nel baseline |

---

## 2. Rischi di integrazione con G e core

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-07 | Body plan speculativo scambiato per biologia | `G3_FINAL_LIMITATIONS.md`, `derive.ts` | Alto | mantenere `undetermined/speculative` finché senza loci/provenienza reale | anatomia dichiarata determinata senza prova |
| R-08 | Rottura contratti G3.1/core | 185 test G3 + 115 E2 + worker/persistence | Critico | checkpoint §13, PR dedicate, riuso generatori esistenti | modifica shared/core senza approvazione |
| R-09 | Costo/scalabilità non misurata | IV1-B, benchmark storici, `gpu: null` | Medio | mediana/P95 `costPerGenome/Organism/Generation`, stessa sessione | regressione misurata non giustificata |
| R-10 | Snapshot/persistence incompatibili | `WorldSnapshot`, migrazione v1→v2 | Alto | campi opzionali, migrazione monotonica/idempotente, T-15 | modifica campi obbligatori o perdita round-trip |
| R-11 | Fallback legacy non coperto | mondi v1/v2, `ext` assente | Medio | T-14, feature disattivata di default, percorsi separati | eccezione su snapshot legacy |

---

## 3. Rischi architetturali specifici Rev 3/Rev 4

| ID | Rischio | Evidenza (review) | Impatto | Mitigazione Rev 4 | Trigger di stop |
|---|---|---|---|---|---|
| R-20 | Collasso semantico tra assenza biologica e dato sconosciuto | ambiguità Rev 1–2 | Critico | `AlleleState` discriminato a 4 stati; T-01/T-10/T-15; round-trip preservato | qualsiasi rappresentazione che renda indistinguibili i casi |
| R-21 | Provenienza/assi riproduttivi mescolati | ruoli/genitori fissi o enum misti | Alto | `GeneticContribution`, assi separati, regole gametogenesi/segregazione esplicite (G3), T-08/T-12 | schema che impone 2 genitori, ruoli come identità, assi/gametogenesi impliciti |
| R-22 | Scaffolding confuso con funzionalità attiva | ambiguità GEN-1/2/3 | Critico di processo | livelli e criteri verificabili; T-17; divieto dichiarazioni operative senza evidenza | GEN-1 dichiarato completamento operativo senza integrazione/test live |
| R-23 | Espressione quantitativa non valida o arbitraria | valori non finiti, unità/pesi/normalizzazione incompleti | Alto | domini finiti, no NaN/Infinity, unità/semantica, pesi/normalizzazione formali; D-01/D-07 circoscritti; T-06/T-09/T-10 | valore non finito propagato, regola ad hoc |
| R-24 | Replay apparentemente valido ma incompatibile | contratto replay non discriminato in Rev 2 | Critico | `ReplayResult<T>` discriminato: `ok` ⇒ valore, `incompatible` ⇒ `value: null` + mismatch espliciti non vuoti; T-11/T-13 | replay incompatibile eseguito/ritornato come valido o senza mismatch espliciti |
| R-25 | Modello ambientale parallelo o stato campo ambiguo | ambiente semplificato | Alto | `EnvironmentalSnapshot` read-only da Planet Engine, coerenza temporale, coordinate/campionamento, stati campo uniformati, mapping subordinato a contratto (D-14); T-16 | stato ambientale autorevole duplicato, campo senza stato/provenienza chiari |
| R-26 | Ploidia/pedigree/gameti non rappresentabili o incoerenti | ploidia globale implicita, gameti assunti sempre a copia singola | Medio/Alto | ploidia organismo per gruppo, ploidia gamete e segregazione/anomalie esplicite, estendibilità poliploide senza rompere diploide, 0..N contributori; T-02/T-03/T-04/T-08/T-12 | globale usato in aneuploidia, gamete assunto sempre n=1, copie incoerenti, perdita tracciabilità |
| R-27 | Mutazioni strutturali o serializzazione con perdita semantica | mutazione ridotta a singolo locus, eventi intergenici mal rappresentati, combinazioni impossibili | Critico | `MutationEvent` discriminated union per operazione (G1), struttura pre/op/post completa, `affectedLoci` non obbligatorio solo per intergenici/interi cromosomi, invarianti G4, preservazione stati in round-trip; T-05/T-07/T-13/T-15 | mutazione strutturale ridotta a singolo locus, evento intergenico forzato a loci fittizi, combinazione scope/operation/payload impossibile accettata, stati alterati in serializzazione |
| R-28 | Conflitti di regole o sviluppo/tempi/fenotipo impliciti o duplicati | ordine accidentale, unità/stadi non definiti, `develop()` che restituisce fenotipo, duplicazioni di stato | Medio/Alto | strategie deterministiche o `non-evaluable`, unità/stadi dichiarati, `develop() → DevelopmentalState` e `derivePhenotype()` distinto, nessuna duplicazione di `GeneticExpression`/`PlasticResponse` (G2); T-06/T-09/T-16 | risultato dipendente da tie-break implicito, valore valido inventato, sviluppo che restituisce fenotipo o duplica stato |
| R-29 | Funzioni custom non riproducibili o non disponibili | identificativo funzione trattato come garanzia sufficiente | Alto | registry custom con id stabile, versione, firma/unità/domini, implementazione registrata, determinismo dichiarato/verificabile, gestione assenza/incompatibilità, compatibilità replay/serializzazione (G5); T-07/T-11/T-15 | replay/serializzazione che dipende da implementazione assente o incompatibile senza errore esplicito; funzione non deterministica accettata |

---

## 4. Rischi scientifici e di processo

| ID | Rischio | Evidenza | Impatto | Mitigazione | Trigger di stop |
|---|---|---|---|---|---|
| R-12 | Selezione vs deriva presentata come dimostrata | E2 protocolli | Critico | `NON_EVALUABLE`, no `INFERRED` autorizzato | attribuzione causale senza controlli |
| R-13 | Test tautologici/flaky usati come prova | `vibeGenomeV1110.test.ts`, baseline timeout | Medio | non usarli come evidenza; no modifiche per farli passare | criterio di accettazione basato su test non probante |
| R-14 | Piante evolvevoli dichiarate senza integrazione | `plantGenome.ts` scollegato | Medio | gap esplicito (D-12) | affermazione non supportata |
| R-15 | Modifica `main`/merge/config GitHub non autorizzati | governance | Critico | solo branch/PR dedicati | push/merge/rebase distruttivo non autorizzato |
| R-16 | Riscrittura architetturale senza analisi impatto | vincolo programma | Alto | aggiornare architettura prima del codice, checkpoint | PR multi-sottosistema senza analisi |
| R-17 | Conclusioni da campionamento visivo | `renderSampling.ts` | Medio | usare popolazione completa per metriche genetiche | evidenza evolutiva da sample renderer |
| R-18 | Crescita memoria/snapshot non misurata | chunk eviction assente | Medio | misurare heap/snapshot nelle fasi future | crescita non misurata |
| R-19 | UI non allineata a nuovi contratti | pannelli legacy | Basso | estensione solo dopo checkpoint e contratti stabili | nuovo dato senza rappresentazione/default documentato |

---

## 5. Matrice rischio → fase

| Fase | Rischi principali |
|---|---|
| Rev 4 (documentale) | R-06, R-12, R-13, R-15, R-20…R-29 |
| pre-GEN-2 | R-01, R-12 |
| GEN-1 predisposizione | R-04, R-10, R-20, R-21, R-23, R-24, R-25, R-26, R-27, R-28, R-29 |
| GEN-2 integrazione | R-02, R-03, R-11, R-21, R-26 |
| GEN-3 integrazione | R-02, R-05, R-24, R-27, R-29 |
| GEN-4 | R-03, R-23, R-24, R-28, R-29 |
| GEN-5 | R-03, R-07, R-25, R-28 |
| GEN-6 | R-07, R-08, R-09, R-11 |
| GEN-7/8 | R-01, R-09, R-12, R-14, R-17 |

---

## 6. Regole di escalation

1. Rischio critico materializzato ⇒ stop immediato, report, nessun workaround silenzioso.
2. Nuovo failure rispetto a baseline quiescente ⇒ stop, classificazione prima di procedere.
3. Modifica a shared/core/persistence/workers/renderer ⇒ checkpoint §13 e approvazione esplicita.
4. Richiesta di inferenza causale evolutiva non autorizzata ⇒ `NON_EVALUABLE`.
5. Replay incompatibile non rilevato, stato speciale collassato, valore non finito propagato, mutazione con combinazione impossibile accettata, `develop()` che restituisce fenotipo/duplica stato, o funzione custom non disponibile trattata come valida ⇒ blocco rilascio e revisione contratti.

**Conferma:** Rev 4 modifica solo documentazione in `docs/genome/`. Nessun codice di produzione toccato. `main` invariato (`5672f12`). **GEN-1 non avviato.**
