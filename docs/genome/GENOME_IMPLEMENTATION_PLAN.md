# GENOME — Piano di implementazione (Rev 4)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Baseline GEN-0:** commit `2234eec6bb18e0ff5822247346a90461001737fd` (Rev 0), Rev 1 `2c800cf`, Rev 2 `319d975`, Rev 3 `df9d533a626d1e2b9ff91124b3e8ff2eb77378c8`  
**Revisione:** Rev 4 (correzioni G1–G5 post-review indipendente Rev 3).  
**Stato:** piano proposto, **in attesa di review indipendente**. Nessuna fase implementata. Nessuna integrazione nel motore. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**. **GEN-1 non avviato.**

---

## 0. Correzioni Rev 4 coperte

| Criticità | Correzione | Documenti |
|---|---|---|
| G1 | `MutationEvent` come discriminated union per operazione (point mutation, insertion, deletion, duplication, inversion, translocation, chromosome-level event, aneuploidy, structural variation compatibile) con struttura precedente/operazione/risultante, cromosomi/intervalli/copie, materiale inserito/rimosso/duplicato, posizione/orientamento risultanti, provenienza/causalità. `affectedLoci` non richiesto per eventi esclusivamente intergenici o a intero cromosoma. Nessun limite arbitrario a loci/complessità. | Arch §5.1, API §7, Validation, Risk |
| G2 | Pipeline `GeneticGenome → ResolvedGenotype → GeneticExpression → PlasticResponse → DevelopmentalState → FinalPhenotype`. `develop()` restituisce `DevelopmentalState`; `deriveFinalPhenotype()` è passo distinto e verificabile; `DevelopmentalState` senza duplicazioni di `GeneticExpression`/`PlasticResponse`. | Arch §6, API §6/§9, Validation, Risk |
| G3 | Regole esplicite formazione gameti: ploidia organismo distinta da ploidia gamete, numero contributori, modalità riproduttiva, regole di segregazione, anomalie meiotiche. Nessuna assunzione di una copia per gruppo omologo nel gamete. Estendibile a poliploidia senza compromettere correttezza del diploide iniziale. | Arch §4, API §5, Validation, Risk |
| G4 | Combinazioni ammissibili formalizzate (scope/operation/payload/cromosomi/loci/intervalli), invarianti verificabili e comportamenti di errore (validazione fallita senza applicazione parziale, replay incompatibile esplicito). | Arch §5.2, API §7/§9, Validation, Risk |
| G5 | Registry funzioni custom: id stabile, versione, firma input/output, unità/domini, implementazione registrata, determinismo, gestione funzioni mancanti/non compatibili, compatibilità replay/serializzazione. Id non sufficiente senza implementazione disponibile e compatibile. | Arch §2.5/§3.4/§9.4, API §3.1/§9, Validation, Risk |

---

## 1. Livelli di maturità e criteri verificabili

| Livello | Definizione | Criteri verificabili per dichiararlo |
|---|---|---|
| **Progettato** | Definito solo in documentazione/contratti | documenti aggiornati e coerenti; invarianti e test plan presenti; nessun codice/modulo richiesto; nessuna dichiarazione operativa |
| **Implementato (non integrato)** | Predisposizione/scaffolding isolato | file/moduli presenti nel branch; API conforme ai contratti approvati; `tsc` e test unitari del modulo verdi; nessun import/call-site nel percorso live; nessun effetto su simulazione esistente |
| **Integrato** | Collegato al flusso ma non necessariamente attivo | call-site o adapter presente; feature flag/config/versione esplicita; test di integrazione verdi; percorso legacy/default invariato se disattivato; impatto documentato |
| **Attivo/Operativo** | Usato nel percorso live previsto | abilitazione supportata documentata; test end-to-end/regressione verdi; osservabilità/eventi/snapshot coerenti; confronto con baseline quiescente senza regressioni non giustificate |

**Regola:** una funzionalità non può essere dichiarata a un livello superiore senza evidenza per tutti i criteri di quel livello.

---

## 2. Stato attuale (verificato)

| Ambito | Livello | Evidenza |
|---|---|---|
| Contratti/architettura GENOME Rev 4 | **Progettato** | documenti in `docs/genome/` (questa revisione) |
| Moduli `simulation/genome/**` | **Non presenti** | nessun codice creato |
| Meiosi, ricombinazione, gametogenesi, mutazione, pedigree (nuovo motore) | **Progettati, non implementati, non integrati, non attivi** | assenza nel codice; solo descrizione contrattuale |
| Motore legacy simulazione | **Attivo** (esistente) | codice e baseline storica `main@5672f12` |
| GEN-1 / GEN-2 / GEN-3 | **Non avviati** | nessuna PR/branch implementativa |

---

## 3. Sequenza corretta

```text
GEN-0 Rev 0 (2234eec) → Rev 1 (2c800cf) → Rev 2 (319d975) → Rev 3 (df9d533) → Rev 4 (questa revisione) → REVIEW INDIPENDENTE
    │
    ├─ pre-GEN-2: ricalibrazione distanza V2 (R-01), ≥5 seed, decisione documentata
    │
    └─ (solo dopo approvazione + checkpoint) GEN-1 predisposizione isolata
            │   - contratti/moduli/validazioni isolati, test unitari, nessun wiring live
            │   - NON completa meiosi/gametogenesi/mutazione/pedigree operativi
            ▼
        GEN-2 integrazione/attivazione controllata ereditarietà/pedigree/gametogenesi
            │
            ├─ GEN-3 integrazione/attivazione mutazioni con replay compatibile
            └─ GEN-4 espressione quantitativa/custom functions → GEN-5 sviluppo/fenotipo/ambiente → GEN-6 adattatori G3.1 → GEN-7/8
```

Ogni passaggio di maturità richiede PR dedicata, evidenza verificabile e, se tocca shared/core/persistence/renderer, checkpoint approvato.

---

## 4. pre-GEN-2 — Ricalibrazione (P0 / R-01)

| Passo | Azione | Output verificabile |
|---|---|---|
| 1 | Esperimento multi-seed (≥5) su distanza iniziale, compatibilità, specie a 4.000 tick | log, seed, comandi, conteggi |
| 2 | Confronto opzioni (soglie invariate / ricalibrate / metrica locus-based) | decisione documentata |
| 3 | Aggiornare architettura/rischi | R-01 chiuso o mitigato |
| 4 | Nessuna modifica a `genome.ts` o soglie live senza test dedicato | IV1-A invariato |

---

## 5. GEN-1 — Predisposizione isolata (futura, non avviata)

**Condizione:** review indipendente positiva + checkpoint §13 quando necessario + branch `milestone/genome/gen1-engine`.  
**Scopo:** creare **scaffolding** isolato e verificabile. **Non** integrare nel motore, **non** attivare in simulazione, **non** dichiarare completamento funzionale operativo di meiosi, gametogenesi, mutazione o pedigree.

| Ambito | Deliverable (se autorizzato) | Livello target | Esclusioni esplicite |
|---|---|---|---|
| Contratti runtime isolati | `types.ts`, `config.ts`, `registry.ts` (ploidia organismo/gamete, segregazione, canali/unità, custom functions registry, replay/mutazione/pedigree/env/dev) | Implementato (non integrato) | nessun import da core/simulazione |
| Genotipo e validazione | `genotype.ts`, `validate.ts` (stati allelici, finitezza numerica, invarianti ploidia, invarianti mutazioni G4, validazione uso funzioni custom) | Implementato (non integrato) | nessun campo in `Organism`/`WorldSnapshot` |
| Riproduzione/gametogenesi isolata | `recombination.ts`, `pedigree.ts` (assi separati, `GametePloidy`, `SegregationRule`, anomalie meiotiche, 0..N contributori, gameti tracciati) | Implementato (non integrato) | nessuna chiamata da `reproduction.ts`, nessun gamete live |
| Mutazione isolata | `mutation.ts`, `rng.ts` (discriminated union G1, payload pre/op/post, replay discriminato, trace) | Implementato (non integrato) | nessun evento nel tick, nessuna persistenza live |
| Espressione/sviluppo/ambiente isolati | `resolution.ts`, `expression.ts`, `environment.ts` adapter, `development.ts` (`develop` → `DevelopmentalState`, `deriveFinalPhenotype` → `FinalPhenotype`) | Implementato (non integrato) | nessun wiring a `geneExpression.ts`/renderer/Planet Engine live |
| Serializzazione isolata | `serialization.ts`, `migration.ts`, `metrics.ts` (inclusi payload mutazionali strutturati e riferimenti custom functions) | Implementato (non integrato) | nessuna modifica a persistence esistente |
| Test | `tests/genomeEngine/*` (T-01…T-17 progettuali → eseguiti solo se implementati) | Evidenza di livello | nessun allentamento test esistenti |

**Criterio "GEN-1 predisposto":** moduli presenti, API conformi, test unitari verdi, `tsc` ok, diff limitato a `simulation/genome/**` e `tests/genomeEngine/**`, baseline quiescente senza nuovi failure.  
**Non significa:** meiosi/gametogenesi/mutazione/pedigree/fenotipo operativo nella simulazione, snapshot live estesi, feature attiva.

---

## 6. GEN-2 — Integrazione/attivazione ereditarietà, gametogenesi e pedigree (futura)

**Prerequisiti:** GEN-1 predisposto e verificato, R-01 deciso, checkpoint §13 approvato per integrazione core.  
**Obiettivo:** passaggio controllato a `integrato` e solo poi, se abilitato e testato, a `attivo` per i casi supportati.

- Integrare assi separati e regole esplicite di gametogenesi (ploidia organismo/gamete, segregazione, anomalie meiotiche) dietro modalità/versione esplicita.
- Supportare 0..N contributori, sessuato/asessuato, poliploidia uniforme/aneuploidia e casi parziali/non valutabili senza imporre 2 genitori e senza assumere una copia per gruppo nel gamete.
- Mantenere fallback legacy; non modificare soglie live senza decisione approvata.
- Test di integrazione, determinismo, pedigree e non-regressione IV1-A/E2 prima di dichiarare "attivo".

---

## 7. GEN-3 — Integrazione/attivazione mutazioni (futura)

**Prerequisiti:** GEN-2 integrato secondo criteri, checkpoint persistence se necessario.  
**Obiettivo:** eventi mutazionali completi nel flusso previsto.

- Applicare discriminated union G1/G4 con payload pre/op/post, validazione di ammissibilità e comportamenti di errore espliciti.
- Coprire operazioni puntuali/locali/intervallo/cromosomiche/aneuploidia/structural variation senza riduzioni improprie e senza `affectedLoci` obbligatorio nei casi intergenici/intero cromosoma consentiti.
- Replay solo se compatibile; incompatibile ⇒ `ReplayResult` `incompatible` con mismatch espliciti, nessun valore.
- `ExpressionDelta` e `FitnessAssessment` separati; fitness `NON_EVALUABLE` per default.
- Persistenza storia solo se contratto snapshot approvato e migrato.

---

## 8. GEN-4 … GEN-8 (future, vincolate)

- **GEN-4:** integrazione espressione quantitativa e registry funzioni custom (validazione numerica, unità/domini, normalizzazione/pesi, determinismo/disponibilità/compatibilità funzioni, conflitti, stati mancanti), dietro checkpoint per `geneExpression.ts`.
- **GEN-5:** sviluppo/plasticità/ambiente/fenotipo come contratti separati non ereditabili; `develop()` → `DevelopmentalState`, `deriveFinalPhenotype()` distinto; adattatore read-only da Planet Engine, nessun modello ambientale parallelo.
- **GEN-6:** adattatori verso G3.1 solo con loci/provenienza reali e checkpoint; riuso anatomia esistente, nessuna riscrittura renderer.
- **GEN-7/8:** fisiologia/evoluzione tramite hook esistenti e metriche multi-seed; selezione vs deriva `NON_EVALUABLE`.

---

## 9. Governance e vincoli

1. Nessuna modifica a `main`, nessun merge/rebase distruttivo, nessuna modifica config GitHub.
2. Nessuna modifica a codice di produzione, `types/index.ts`, persistence, workers, renderer G3.1, Planet Engine o shared core in Rev 4.
3. Nessuna integrazione meiosi/gametogenesi/mutazione/riproduzione nel motore esistente.
4. Nessuna dichiarazione di architettura approvata o funzionalità operativa senza evidenza.
5. Ogni PR futura: diff, comandi, log, seed, classificazioni, confronto baseline quiescente.
6. Nuovo failure rispetto a `gen0-baseline-quiescent.log` ⇒ stop e classificazione.

---

## 10. Prima azione concreta dopo review indipendente

1. Ottenere esito review indipendente Rev 4 (nessuna approvazione implicita).
2. Se richiesto, aggiornare ancora i documenti fino a checkpoint approvabile.
3. Solo dopo approvazione: eseguire R-01 e, se autorizzato, aprire PR GEN-1 di predisposizione isolata.

**Conferma:** Rev 4 modifica solo documentazione in `docs/genome/`. Nessun codice di produzione toccato. **GEN-1 non avviato.**
