# GENOME — Analisi dei gap (Rev 3)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 open  
**Baseline:** `2234eec` (Rev 0), `2c800cf` (Rev 1), `319d975` (Rev 2), Rev 3 in questa revisione.  
**Confronto:** requisiti GEN-1…GEN-8 vs codice verificato in `main@5672f12`.  
**Revisione:** Rev 3 applica hardening contrattuale P1/P2 (replay discriminato, mutazioni strutturali, assi riproduzione/ploidia separati, espressione quantitativa vincolata, ploidia per gruppo, sviluppo/ambiente formalizzati) mantenendo architettura e struttura documentale. Nessuna modifica al codice.

---

## 1. Sintesi

Il progetto ha un genoma vettoriale funzionante (33 geni), espressione fenotipica modulare, speciazione emergente, determinismo verificato e renderer G3.1 integrato. **Non** ha un motore genetico mendeliano operativo: alleli/loci/copie cromosomiche individuali, meiosi/gameti/ricombinazione tracciata, pedigree generalizzato, mutazioni tipizzate con replay e regole di espressione quantitative formali sono assenti dal codice.

Rev 3 chiarisce e rafforza tali contratti a livello progettuale ma **non implementa, non integra e non attiva** alcun componente. Il gap implementativo resta aperto; il gap documentale/contrattuale sui rilievi P1/P2 è ridotto/chiuso in documentazione.

---

## 2. Matrice requisito → stato

| Fase/Area | Requisito | Stato verificato | Gap | Classificazione |
|---|---|---|---|---|
| GEN-1 | Modello loci/alleli/cromosomi/copie/genoma/registry | assente nel codice; contratto Rev 3 definito | implementazione isolata + test | **MISSING** codice / **Progettato** |
| GEN-1 | Stati allelici distinti (presente, assenza biologica, undetermined, non-evaluable) | non presente nel codice; contratto esplicito in Rev 2/3 | applicazione runtime/validazione/serializzazione | **MISSING** / **Progettato** |
| GEN-1 | Provenienza e assi riproduttivi generalizzati | assente; Rev 3 separa `ReproductionMode`/`PloidyModel`/`GameteFormationMode`/contributori 0..N | modello tracciabile e test | **MISSING** / **Progettato** |
| GEN-1 | Ploidia per gruppo omologo (uniforme/aneuploide) | blending legacy, non copie per gruppo | rappresentazione, invarianti, riepilogo globale condizionato | **MISSING** / **Progettato** |
| GEN-1 | RNG/replay versionato e discriminato | RNG deterministico esistente; replay nuovo assente | trace, compatibilità, `ReplayResult<T>` discriminato | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-1 | Serialization/migration estesa | v1→v2 esistente per schema attuale | migrazione schema esteso, mutazioni strutturali, stati speciali | `EXISTING_NEEDS_EXTENSION` |
| GEN-2 | Meiosi/gameti/ricombinazione/pedigree operativi | assenti nel live | integrazione controllata, fallback legacy | **MISSING** |
| GEN-2 | Compatibilità riproduttiva | distanza vettoriale esistente; V2 sotto-tarata | ricalibrazione R-01 e metrica target | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` da R-01 |
| GEN-3 | Mutazioni tipizzate (point/local/interval/chromosomal) | solo mutazione gaussiana/blending | evento completo, `affectedLoci`/intervalli/copie, replay, storia | **MISSING** |
| GEN-3 | Neutralità fitness da costruzione | invariante desiderata, non contrattualizzata | separazione evento/effetti/fitness `NON_EVALUABLE` | `EXISTING_NEEDS_EXTENSION` |
| GEN-4 | Espressione quantitativa vincolata | 26 campi derivati ma contratti formali incompleti | canali/unità/domini finiti, normalizzazione/pesi, conflitti, custom versionato | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-4 | Dominanza/codominanza/dosaggio/epistasi/pleiotropia/poligenia | effetti parziali in calcolo; non regole formali generalizzate | engine regole componibili | **MISSING** (formale) |
| GEN-5 | Sviluppo ontogenetico distinto e formalizzato | età/lifespan/maturity parziali | stadi, unità temporali/crescita, stati non valutabili, non ereditabile | **MISSING** |
| GEN-5 | Ambiente da Planet Engine | nessun adattatore contratto | `EnvironmentalSnapshot` read-only, stati uniformati, coerenza temporale, campionamento | **MISSING** / **Progettato** |
| GEN-6 | Body plan genetico reale | pipeline G esiste ma body plan speculativo, 4 geni MOR | loci/provenienza anatomica, adattatore post-checkpoint | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` |
| GEN-6 | Renderer G3.1 | completo e testato | nessuna riscrittura | `EXISTING_COMPLETE` |
| GEN-7 | Fisiologia/comportamento | hook esistenti | passare da nuovi canali senza sistemi paralleli | `EXISTING_NEEDS_EXTENSION` |
| GEN-8 | Evoluzione osservabile | speciazione/metriche parziali | multi-seed, pedigree/diversità, controlli; selezione vs deriva `NON_EVALUABLE` | `EXISTING_NEEDS_EXTENSION` / `NON_EVALUABLE` |

---

## 3. Gap documentali/contrattuali corretti in Rev 3 (chiusi a livello progettuale)

| Gap (Rev 2 / review) | Correzione Rev 3 | Stato |
|---|---|---|
| Replay non discriminato | `ReplayResult<T>` union: `ok` ⇒ valore non nullo, mismatch vuoti; `incompatible` ⇒ `value: null`, mismatch espliciti non vuoti | **chiuso in documentazione** |
| Mutazioni strutturali riducibili a singolo locus | `MutationScope`/`MutationKind`, `affectedLoci`/intervalli/copie, previous/resulting per elemento, provenienza/replay preservati | **chiuso in documentazione** |
| `ReproductionMode`/ploidia/contributori mescolati | assi separati: `ReproductionMode`, `PloidyModel`, `GameteFormationMode`, contributori 0..N; sessuata/asessuata con poliploidia/aneuploidia supportate dal modello | **chiuso in documentazione** |
| Espressione quantitativa sottospecificata | valori finiti (no NaN/Infinity), unità/semantica, domini, normalizzazione/pesi, custom registrato/versionato o `non-evaluable`; D-01/D-07 circoscritti | **chiuso in documentazione** |
| Ploidia globale implicita | ploidia per gruppo, uniforme vs aneuploidia, riepilogo globale solo se matematicamente valido, invarianti | **chiuso in documentazione** |
| Sviluppo/ambiente incompleti | sviluppo con unità temporali/crescita/stadi/stati non valutabili non ereditabili; ambiente con coerenza temporale, coordinate/campionamento, stati campo uniformati, Planet Engine unica fonte autorevole, mapping subordinato a contratto (D-14) | **chiuso in documentazione** |

Gap documentali già chiusi in Rev 2 restano chiusi: stati allelici espliciti, provenienza generalizzata, maturità/scaffolding vs attivazione, replay concettualmente vincolato, ambiente ancorato a Planet Engine. Tutti questi punti restano **aperti nel codice** finché non implementati/integrati con evidenza.

---

## 4. Gap trasversali

- **Maturità:** nessun componente Genome Engine è implementato/integrato/attivo; ogni claim futuro deve includere evidenza di livello.
- **Contratti condivisi:** `types/index.ts`, `WorldSnapshot`, `RenderFrame`, worker, persistence, core richiedono checkpoint §13.
- **R-01:** soglie/metrica compatibilità non ricalibrate per V2/locus.
- **Performance:** costi per genoma/organismo/generazione non misurati; GPU/FPS `UNVERIFIED`.
- **Test:** assenza suite `genomeEngine`; T-01…T-15 progettuali, non eseguiti.
- **Ambiente:** mapping concreto Planet Engine snapshot → `EnvironmentalSnapshot` subordinato al contratto Planet Engine (D-14).
- **D-01/D-07:** circoscritti ma non chiusi (DSL conflitti estesa e catalogo/unità specifici registry/deployment).

---

## 5. Non-gap / vincoli di non-regressione

- Renderer G3.1, anatomia/descriptor/LOD/validator, adaptive rendering, cache/pool: preservare.
- RNG/determinismo esistente e fingerprint IV1-A: preservare.
- Fallback legacy genome v1/v2 e blending: preservare finché sostituzione non attiva e verificata.
- E2/IV1 dataset e tag storici: preservare.
- Nessun test esistente allentato.

---

## 6. Priorità

| Priorità | Elemento | Motivo | Fase |
|---|---|---|---|
| P0 | Nuova review Rev 3 + checkpoint policy | prerequisito governance/contratti | GEN-0 |
| P0 | R-01 ricalibrazione distanza | blocca semantica compatibilità/speciazione | pre-GEN-2 |
| P1 | Predisposizione isolata contratti/stati/ploidia per gruppo/assi separati/validazione/serializzazione | fondazione verificabile senza rischio live | GEN-1 |
| P1 | Replay discriminato e mutazioni strutturali isolate | integrità e tracciabilità | GEN-1/3 design |
| P1 | Espressione quantitativa vincolata e gestione stati mancanti | correttezza fenotipica | GEN-1/4 design |
| P2 | Integrazione ereditarietà/pedigree controllata | passaggio a comportamento genetico reale | GEN-2 |
| P2 | Integrazione mutazioni e adattatore ambiente Planet Engine | variabilità e input ambientale autorevole | GEN-3/5 |
| P3 | Adattamento G3.1 con provenienza reale | solo con loci anatomici validati | GEN-6 |
| P3 | Metriche evolutive multi-seed e performance dedicate | evidenza scalabilità/evoluzione | GEN-7/8 |

Nessuna priorità autorizza implementazione o integrazione prima della nuova review e dei checkpoint richiesti. **GEN-1 non avviato.**
