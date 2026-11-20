# GENOME — Piano di implementazione (Rev 3)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Baseline GEN-0:** commit `2234eec6bb18e0ff5822247346a90461001737fd` (Rev 0), Rev 1 `2c800cf`, Rev 2 `319d975`  
**Revisione:** Rev 3 (hardening contrattuale: replay discriminato, mutazioni strutturali, assi riproduzione/ploidia separati, espressione quantitativa vincolata, ploidia per gruppo, sviluppo/ambiente formalizzati).  
**Stato:** piano proposto, **in attesa di nuova review**. Nessuna fase implementata. Nessuna integrazione nel motore. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 0. Correzioni Rev 3 coperte

| Priorità | Correzione | Documenti |
|---|---|---|
| P1 | `ReplayResult<T>` union discriminata (`ok` ⇒ valore non nullo, `mismatches: []`; `incompatible` ⇒ `value: null`, mismatch espliciti non vuoti) | Arch §5/§9.2, API §7, Validation/Risk |
| P1 | Mutazioni strutturali con `scope` (`point/local/interval/chromosomal`), `kind`, `affectedLoci`/intervalli/copie, previous/resulting per elemento, provenienza e replay; nessuna riduzione a singolo locus | Arch §5.1, API §7 |
| P1 | Separazione `ReproductionMode`, `PloidyModel` per gruppo, `GameteFormationMode`, cardinalità/selezione contributori; sessuata/asessuata compatibili con poliploidia/aneuploidia | Arch §2.2/§4, API §4/§6 |
| P2 | Espressione quantitativa: valori finiti (no NaN/Infinity), unità/semantica, domini, normalizzazione/pesi formali, `custom` registrato/versionato o `non-evaluable`; D-01/D-07 circoscritti | Arch §3.3/§12, API §3/§3.1/§5 |
| P2 | Ploidia valutata per gruppo omologo, uniforme vs aneuploidia, riepilogo globale solo se matematicamente valido, invarianti documentate | Arch §2.2/§9.1, API §4/§8 |
| P2 | Sviluppo: unità temporali, unità/semantica crescita, stadi dichiarati/versionati, dati non valutabili espliciti, non ereditabile | Arch §6.3, API §5 |
| P2 | Ambiente: coordinate/campionamento locale, coerenza temporale, stati campo uniformati (`value|missing|non-evaluable`, provenienza), Planet Engine unica fonte autorevole, mapping concreto subordinato al contratto Planet Engine (D-14) | Arch §6.4/§9.3, API §7 |

---

## 1. Livelli di maturità e criteri verificabili

| Livello | Definizione | Criteri verificabili per dichiararlo |
|---|---|---|
| **Progettato** | Definito solo in documentazione/contratti | documenti aggiornati e coerenti; invarianti e test plan presenti; nessun codice/modulo richiesto; nessuna dichiarazione operativa |
| **Implementato (non integrato)** | Predisposto/scaffolding isolato | file/moduli presenti nel branch; API conforme ai contratti approvati; `tsc` e test unitari del modulo verdi; nessun import/call-site nel percorso live; nessun effetto su simulazione esistente |
| **Integrato** | Collegato al flusso ma non necessariamente attivo | call-site o adapter presente; feature flag/config/versione esplicita; test di integrazione verdi; percorso legacy/default invariato se disattivato; impatto documentato |
| **Attivo/Operativo** | Usato nel percorso live previsto | abilitazione supportata documentata; test end-to-end/regressione verdi; osservabilità/eventi/snapshot coerenti; confronto con baseline quiescente senza regressioni non giustificate |

**Regola:** una funzionalità non può essere dichiarata a un livello superiore senza evidenza per tutti i criteri di quel livello.

---

## 2. Stato attuale (verificato)

| Ambito | Livello | Evidenza |
|---|---|---|
| Contratti/architettura GENOME Rev 3 | **Progettato** | documenti in `docs/genome/` (questa revisione) |
| Moduli `simulation/genome/**` | **Non presenti** | nessun codice creato |
| Meiosi, ricombinazione, mutazione, pedigree (nuovo motore) | **Progettati, non implementati, non integrati, non attivi** | assenza nel codice; solo descrizione contrattuale |
| Motore legacy simulazione | **Attivo** (esistente) | codice e baseline storica `main@5672f12` |
| GEN-1 / GEN-2 / GEN-3 | **Non avviati** | nessuna PR/branch implementativa |

---

## 3. Sequenza corretta

```text
GEN-0 Rev 0 (2234eec) → Rev 1 (2c800cf) → Rev 2 (319d975) → Rev 3 (questa revisione) → NUOVA REVIEW
    │
    ├─ pre-GEN-2: ricalibrazione distanza V2 (R-01), ≥5 seed, decisione documentata
    │
    └─ (solo dopo approvazione + checkpoint) GEN-1 predisposizione isolata
            │   - contratti/moduli isolati, test unitari, nessun wiring live
            │   - NON completa meiosi/mutazione/pedigree operativi
            ▼
        GEN-2 integrazione/attivazione controllata ereditarietà/pedigree
            │
            ├─ GEN-3 integrazione/attivazione mutazioni con replay compatibile
            └─ GEN-4 espressione quantitativa → GEN-5 sviluppo/ambiente → GEN-6 adattatori G3.1 → GEN-7/8
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

**Condizione:** nuova review positiva + checkpoint §13 quando necessario + branch `milestone/genome/gen1-engine`.  
**Scopo:** creare **scaffolding** isolato e verificabile. **Non** integrare nel motore, **non** attivare in simulazione, **non** dichiarare completamento funzionale operativo di meiosi, ricombinazione, mutazione o pedigree.

| Ambito | Deliverable (se autorizzato) | Livello target | Esclusioni esplicite |
|---|---|---|---|
| Contratti runtime isolati | `types.ts`, `config.ts`, `registry.ts` (ploidia per gruppo, canali/unità, replay/mutazione/pedigree/env/dev) | Implementato (non integrato) | nessun import da core/simulazione |
| Genotipo e validazione | `genotype.ts`, `validate.ts` (stati allelici, finitezza numerica, invarianti ploidia) | Implementato (non integrato) | nessun campo in `Organism`/`WorldSnapshot` |
| Riproduzione genetica isolata | `recombination.ts`, `pedigree.ts` (assi separati, 0..N contributori, gameti tracciati) | Implementato (non integrato) | nessuna chiamata da `reproduction.ts`, nessun gamete live |
| Mutazione isolata | `mutation.ts`, `rng.ts` (scope/kind strutturali, replay discriminato, trace) | Implementato (non integrato) | nessun evento nel tick, nessuna persistenza live |
| Espressione/sviluppo/ambiente isolati | `resolution.ts`, `expression.ts`, `environment.ts` adapter, `development.ts` | Implementato (non integrato) | nessun wiring a `geneExpression.ts`/renderer/Planet Engine live |
| Serializzazione isolata | `serialization.ts`, `migration.ts`, `metrics.ts` | Implementato (non integrato) | nessuna modifica a persistence esistente |
| Test | `tests/genomeEngine/*` (T-01…T-15 progettuali → eseguiti solo se implementati) | Evidenza di livello | nessun allentamento test esistenti |

**Criterio "GEN-1 predisposto":** moduli presenti, API conformi, test unitari verdi, `tsc` ok, diff limitato a `simulation/genome/**` e `tests/genomeEngine/**`, baseline quiescente senza nuovi failure.  
**Non significa:** meiosi/mutazione/pedigree operativi nella simulazione, snapshot live estesi, feature attiva.

---

## 6. GEN-2 — Integrazione/attivazione ereditarietà e pedigree (futura)

**Prerequisiti:** GEN-1 predisposto e verificato, R-01 deciso, checkpoint §13 approvato per integrazione core.  
**Obiettivo:** passaggio controllato a `integrato` e solo poi, se abilitato e testato, a `attivo` per i casi supportati.

- Integrare assi separati (`ReproductionMode`/`GameteFormationMode`/`PloidyModel`/contributori) dietro modalità/versione esplicita.
- Supportare 0..N contributori, sessuato/asessuato, poliploidia uniforme/aneuploidia e casi parziali/non valutabili senza imporre 2 genitori.
- Mantenere fallback legacy; non modificare soglie live senza decisione approvata.
- Test di integrazione, determinismo, pedigree e non-regressione IV1-A/E2 prima di dichiarare "attivo".

---

## 7. GEN-3 — Integrazione/attivazione mutazioni (futura)

**Prerequisiti:** GEN-2 integrato secondo criteri, checkpoint persistence se necessario.  
**Obiettivo:** eventi mutazionali completi nel flusso previsto.

- Coprire scope `point/local/interval/chromosomal` e kind supportati con `affectedLoci`/intervalli/copie e stati previous/resulting completi.
- Replay solo se compatibile; incompatibile ⇒ `ReplayResult` `incompatible` con mismatch espliciti, nessun valore.
- `ExpressionDelta` e `FitnessAssessment` separati; fitness `NON_EVALUABLE` per default.
- Persistenza storia solo se contratto snapshot approvato e migrato.

---

## 8. GEN-4 … GEN-8 (future, vincolate)

- **GEN-4:** integrazione espressione quantitativa (validazione numerica, unità/domini, normalizzazione/pesi, conflitti, stati mancanti), dietro checkpoint per `geneExpression.ts`.
- **GEN-5:** sviluppo/plasticità/ambiente come contratti separati non ereditabili; adattatore read-only da Planet Engine, nessun modello ambientale parallelo.
- **GEN-6:** adattatori verso G3.1 solo con loci/provenienza reali e checkpoint; riuso anatomia esistente.
- **GEN-7/8:** fisiologia/evoluzione tramite hook esistenti e metriche multi-seed; selezione vs deriva `NON_EVALUABLE`.

---

## 9. Governance e vincoli

1. Nessuna modifica a `main`, nessun merge/rebase distruttivo, nessuna modifica config GitHub.
2. Nessuna modifica a codice di produzione, `types/index.ts`, persistence, workers, renderer G3.1, Planet Engine o shared core in Rev 3.
3. Nessuna integrazione meiosi/mutazione/riproduzione nel motore esistente.
4. Nessuna dichiarazione di architettura approvata o funzionalità operativa senza evidenza.
5. Ogni PR futura: diff, comandi, log, seed, classificazioni, confronto baseline quiescente.
6. Nuovo failure rispetto a `gen0-baseline-quiescent.log` ⇒ stop e classificazione.

---

## 10. Prima azione concreta dopo nuova review

1. Ottenere esito review Rev 3 (nessuna approvazione implicita).
2. Se richiesto, aggiornare ancora i documenti fino a checkpoint approvabile.
3. Solo dopo approvazione: eseguire R-01 e, se autorizzato, aprire PR GEN-1 di predisposizione isolata.

**Conferma:** Rev 3 modifica solo documentazione in `docs/genome/`. Nessun codice di produzione toccato. GEN-1 non avviato.
