# GENOME — Analisi dei gap (Rev 2)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 open  
**Baseline:** `2234eec` (Rev 0), `2c800cf` (Rev 1), Rev 2 in preparazione.  
**Confronto:** requisiti GEN-1…GEN-8 vs codice verificato in `main@5672f12`.  
**Revisione:** Rev 2 corregge ambiguità documentali della Rev 1 (stati allelici, provenienza, scaffolding vs attivazione, espressione quantitativa, replay, ambiente Planet Engine). Nessuna modifica al codice.

---

## 1. Sintesi

Il progetto ha un genoma vettoriale funzionante (33 geni), espressione fenotipica modulare, speciazione emergente, determinismo verificato e renderer G3.1 integrato. **Non** ha un motore genetico mendeliano operativo: alleli/loci/copie cromosomiche individuali, meiosi/gameti/ricombinazione tracciata, pedigree generalizzato, mutazioni tipizzate con replay e regole di espressione quantitative formali sono assenti dal codice.

Rev 2 chiarisce che tali elementi sono **progettati** ma **non implementati, non integrati e non attivi**. Le correzioni Rev 2 riducono il gap documentale/contrattuale; il gap implementativo resta.

---

## 2. Matrice requisito → stato

| Fase/Area | Requisito | Stato verificato | Gap | Classificazione |
|---|---|---|---|---|
| GEN-1 | Modello loci/alleli/cromosomi/copie/genoma/registry | assente nel codice; contratto Rev 2 definito | implementazione isolata + test | **MISSING** codice / **Progettato** |
| GEN-1 | Stati allelici distinti (presente, assenza biologica, undetermined, non-evaluable) | Rev 1 ambiguo (`null`); Rev 2 corretto nei documenti | applicazione runtime/validazione/serializzazione | **MISSING** / **Progettato** |
| GEN-1 | Provenienza generalizzata (N contributori, poliploidia, no ruoli fissi) | assente; Rev 1 limitato | modello contributi/gameti tracciabili | **MISSING** / **Progettato** |
| GEN-1 | Ploidia parametrica | blending legacy, non copie omologhe | rappresentazione N-copie per gruppo | **MISSING** |
| GEN-1 | RNG e versionamento | RNG deterministico esistente; replay compatibile nuovo assente | trace, compatibilità, incompatibilità esplicita | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-1 | Serialization/migration | v1→v2 esistente per schema attuale | migrazione schema genome esteso e stati speciali | `EXISTING_NEEDS_EXTENSION` |
| GEN-2 | Meiosi/gameti/ricombinazione/pedigree operativi | assenti nel live | integrazione controllata, fallback legacy | **MISSING** |
| GEN-2 | Compatibilità riproduttiva | distanza vettoriale esistente; V2 sotto-tarata | ricalibrazione R-01 e metrica target | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` da R-01 |
| GEN-3 | Mutazioni tipizzate con evento completo | solo mutazione gaussiana/blending | tipi evento, previous/resulting state, replay, storia | **MISSING** |
| GEN-3 | Neutralità fitness da costruzione | invariante desiderata, non contrattualizzata in eventi nuovi | separazione evento/effetti/fitness | `EXISTING_NEEDS_EXTENSION` |
| GEN-4 | Espressione quantitativa formale | 26 campi derivati ma contratti unità/normalizzazione/confitti incompleti nel nuovo modello | `TraitChannelDefinition`, regole quantitative, gestione stati | `EXISTING_NEEDS_EXTENSION` / **Progettato** |
| GEN-4 | Dominanza/codominanza/dosaggio/epistasi/pleiotropia/poligenia | effetti parziali in calcolo; non regole formali generalizzate | engine regole componibili | **MISSING** (formale) |
| GEN-5 | Sviluppo ontogenetico distinto | età/lifespan/maturity parziali | stadi, plasticità non ereditaria, genotipo invariato | **MISSING** |
| GEN-5 | Ambiente da Planet Engine | nessun adattatore contratto | `EnvironmentalSnapshot` read-only da fonte autorevole | **MISSING** / **Progettato** |
| GEN-6 | Body plan genetico reale | pipeline G esiste ma body plan speculativo, 4 geni MOR | loci/provenienza anatomica, adattatore post-checkpoint | `EXISTING_NEEDS_EXTENSION` / `BLOCKED` |
| GEN-6 | Renderer G3.1 | completo e testato | nessuna riscrittura | `EXISTING_COMPLETE` |
| GEN-7 | Fisiologia/comportamento | hook esistenti | passare da nuovi canali senza sistemi paralleli | `EXISTING_NEEDS_EXTENSION` |
| GEN-8 | Evoluzione osservabile | speciazione/metriche parziali | multi-seed, pedigree/diversità, controlli; selezione vs deriva `NON_EVALUABLE` | `EXISTING_NEEDS_EXTENSION` / `NON_EVALUABLE` |

---

## 3. Gap documentali corretti in Rev 2 (chiusi a livello progettuale)

| Gap Rev 1 | Correzione Rev 2 | Stato |
|---|---|---|
| `unknown/absent/null` ambiguo | `AlleleState` a 4 stati espliciti | **chiuso in documentazione** |
| Provenienza `maternal/paternal` e 0/1/2 genitori | contributi generalizzati 0..N, identità≠ruolo | **chiuso in documentazione** |
| Rischio di leggere GEN-1 come completamento operativo | livelli maturità + criteri verificabili + fasi predisposizione/integrazione/attivazione | **chiuso in documentazione** |
| Espressione senza unità/intervalli/conflitti completi | `TraitChannelDefinition`, normalizzazione, conflitti, policy stati | **chiuso in documentazione** |
| Replay non vincolato a compatibilità versioni/parametri | `ReplayCompatibility`, mismatch esplicito | **chiuso in documentazione** |
| Ambiente locale non ancorato a Planet Engine | `EnvironmentalSnapshot` adattatore da fonte autorevole, no modello parallelo | **chiuso in documentazione** |

Questi punti restano **aperti nel codice** finché non implementati/integrati con evidenza.

---

## 4. Gap trasversali

- **Maturità:** nessun componente Genome Engine è implementato/integrato/attivo; ogni claim futuro deve includere evidenza di livello.
- **Contratti condivisi:** `types/index.ts`, `WorldSnapshot`, `RenderFrame`, worker, persistence, core richiedono checkpoint §13.
- **R-01:** soglie/metrica compatibilità non ricalibrate per V2/locus.
- **Performance:** costi per genoma/organismo/generazione non misurati; GPU/FPS `UNVERIFIED`.
- **Test:** assenza suite `genomeEngine`; test esistenti con difetti noti non sono prova del nuovo motore.
- **Ambiente:** mapping concreto Planet Engine snapshot → `EnvironmentalSnapshot` non definito (D-14).

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
| P0 | Approvazione Rev 2 + checkpoint policy | prerequisito governance/contratti | GEN-0 |
| P0 | R-01 ricalibrazione distanza | blocca semantica compatibilità/speciazione | pre-GEN-2 |
| P1 | Predisposizione isolata contratti/stati/contributi/validazione/serializzazione | fondazione verificabile senza rischio live | GEN-1 |
| P1 | Replay compatibile e mutazioni/eventi isolati | integrità e tracciabilità | GEN-1/3 design |
| P1 | Espressione quantitativa e gestione stati mancanti | correttezza fenotipica | GEN-1/4 design |
| P2 | Integrazione ereditarietà/pedigree controllata | passaggio a comportamento genetico reale | GEN-2 |
| P2 | Integrazione mutazioni e ambiente Planet Engine | variabilità e input ambientale autorevole | GEN-3/5 |
| P3 | Adattamento G3.1 con provenienza reale | solo con loci anatomici validati | GEN-6 |
| P3 | Metriche evolutive multi-seed e performance dedicate | evidenza scalabilità/evoluzione | GEN-7/8 |

Nessuna priorità autorizza implementazione o integrazione prima della nuova review e dei checkpoint richiesti.
