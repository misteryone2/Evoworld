# GENOME — Piano di implementazione (Rev 2)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Baseline GEN-0:** commit `2234eec6bb18e0ff5822247346a90461001737fd` (Rev 0), Rev 1 `2c800cf`  
**Revisione:** Rev 2 (chiarimento scaffolding vs integrazione/attivazione, correzioni contrattuali).  
**Stato:** piano proposto, **in attesa di nuova review**. Nessuna fase implementata. Nessuna integrazione nel motore. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 0. Correzioni coperte

1. Stati allelici distinti (`identified` / `biologically-absent` / `undetermined` / `non-evaluable`).
2. Provenienza generalizzata (`contributionId`, N contributori, no vincolo materno/paterno).
3. Separazione esplicita tra predisposizione (scaffolding), integrazione e attivazione.
4. Contratti quantitativi di espressione e gestione conflitti/dati mancanti.
5. Replay RNG con compatibilità verificata e fallimento esplicito.
6. Ambiente come adattatore dell'Environment Snapshot del Planet Engine.

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
| Contratti/architettura GENOME Rev 2 | **Progettato** | documenti in `docs/genome/` (questa revisione) |
| Moduli `simulation/genome/**` | **Non presenti** | nessun codice creato in Rev 2 |
| Meiosi, ricombinazione, mutazione, pedigree (nuovo motore) | **Progettati, non implementati, non integrati, non attivi** | assenza nel codice; solo descrizione contrattuale |
| Motore legacy simulazione | **Attivo** (esistente) | codice e baseline storica `main@5672f12` |
| GEN-1 / GEN-2 / GEN-3 | **Non avviati** | nessuna PR/branch implementativa |

---

## 3. Sequenza corretta

```text
GEN-0 Rev 0 (2234eec) → Rev 1 (2c800cf) → Rev 2 (questa consegna) → NUOVA REVIEW
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
            └─ GEN-4 espressione quantitativa → GEN-5 sviluppo → GEN-6 adattatori G3.1 → GEN-7/8
```

Ogni passaggio da un livello di maturità al successivo richiede PR dedicata, evidenza verificabile e, se tocca shared/core/persistence/renderer, checkpoint approvato.

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
| Contratti runtime isolati | `simulation/genome/types.ts`, `config.ts`, `registry.ts` | Implementato (non integrato) | nessun import da core/simulazione |
| Genotipo e validazione | `genotype.ts`, `validate.ts` | Implementato (non integrato) | nessun campo in `Organism`/`WorldSnapshot` |
| Riproduzione genetica isolata | `recombination.ts`, `pedigree.ts` | Implementato (non integrato) | nessuna chiamata da `reproduction.ts`, nessun gamete live |
| Mutazione isolata | `mutation.ts`, `rng.ts` | Implementato (non integrato) | nessun evento nel tick, nessuna persistenza live |
| Espressione/sviluppo isolati | `resolution.ts`, `expression.ts`, `environment.ts` adapter, `development.ts` | Implementato (non integrato) | nessun wiring a `geneExpression.ts`/renderer |
| Serializzazione isolata | `serialization.ts`, `migration.ts`, `metrics.ts` | Implementato (non integrato) | nessuna modifica a persistence esistente |
| Test | `tests/genomeEngine/*` T-01…T-13 (progettuali → eseguiti solo se implementati) | Evidenza di livello | nessun allentamento test esistenti |

**Criterio per dire "GEN-1 predisposto":** moduli presenti, API conformi, test unitari verdi, `tsc` ok, diff limitato a `simulation/genome/**` e `tests/genomeEngine/**`, baseline quiescente senza nuovi failure.  
**Ciò che GEN-1 NON significa:** meiosi/mutazione/pedigree operativi nella simulazione, snapshot live estesi, feature attiva.

---

## 6. GEN-2 — Integrazione/attivazione ereditarietà e pedigree (futura)

**Prerequisiti:** GEN-1 predisposto e verificato, R-01 deciso, checkpoint §13 approvato per `reproduction.ts`/core.  
**Obiettivo:** passaggio controllato da `implementato-non-integrato` a `integrato` e solo poi, se esplicitamente abilitato e testato, a `attivo` per i casi supportati.

- Integrare gameti/fusione/contributi solo dietro modalità/versione esplicita.
- Supportare 0..N contributori, asessuato e casi parziali/non valutabili senza imporre 2 genitori.
- Mantenere fallback legacy e soglia energia invariata salvo decisione separata approvata.
- Test di integrazione, determinismo, pedigree e non-regressione IV1-A/E2 prima di qualunque dichiarazione "attivo".

---

## 7. GEN-3 — Integrazione/attivazione mutazioni (futura)

**Prerequisiti:** GEN-2 integrato secondo criteri, checkpoint persistence se necessario.  
**Obiettivo:** eventi mutazionali completi nel flusso previsto, con `AlleleState` precedente/risultante, `RngTrace`, replay compatibile, effetti/fenotipo/fitness separati.

- Nessun campo fitness nell'evento; fitness `NON_EVALUABLE` per default.
- Replay incompatibile ⇒ errore esplicito, mai risultato valido apparente.
- Persistenza storia solo se contratto snapshot approvato e migrato.

---

## 8. GEN-4 … GEN-8 (future, vincolate)

- **GEN-4:** integrazione espressione quantitativa (unità/intervalli/normalizzazione/conflitti/stati mancanti), dietro checkpoint per `geneExpression.ts`.
- **GEN-5:** sviluppo/plasticità come contratti separati, genotipo invariato.
- **GEN-6:** adattatori verso G3.1 solo con loci/provenienza reali e checkpoint; riuso anatomia esistente, nessuna riscrittura.
- **GEN-7/8:** fisiologia/evoluzione tramite hook esistenti e metriche multi-seed; selezione vs deriva `NON_EVALUABLE`.

---

## 9. Governance e vincoli

1. Nessuna modifica a `main`, nessun merge/rebase distruttivo, nessuna modifica config GitHub.
2. Nessuna modifica a codice di produzione, `types/index.ts`, persistence, workers, renderer G3.1 o shared core in Rev 2.
3. Nessuna integrazione meiosi/mutazione/riproduzione nel motore esistente.
4. Nessuna dichiarazione di architettura approvata o funzionalità operativa senza evidenza.
5. Ogni PR futura: diff, comandi, log, seed, classificazioni, confronto baseline quiescente.
6. Nuovo failure rispetto a `gen0-baseline-quiescent.log` ⇒ stop e classificazione.

---

## 10. Prima azione concreta dopo nuova review

1. Ottenere esito review Rev 2 (nessuna approvazione implicita).
2. Se richiesto, aggiornare ancora i documenti fino a checkpoint approvabile.
3. Solo dopo approvazione: eseguire R-01 e, se autorizzato, aprire PR GEN-1 di predisposizione isolata.

**Conferma:** Rev 2 modifica solo documentazione in `docs/genome/`. Nessun codice di produzione toccato.
