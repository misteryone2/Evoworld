# GENOME — Stato attuale del repository (GEN-0)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4 open  
**Baseline GEN-0:** `main@5672f12296e484a4ba02ba2876e2f5e82d266cb1`; commit audit Rev 0 `2234eec`, Rev 1 `2c800cf`; Rev 2 in preparazione su questo branch.  
**Revisione:** Rev 2 (correzioni documentali/architetturali dopo review tecnica Rev 1).  
**Metodo:** lettura diretta del codice, verifica Git, baseline test eseguita. **Nessuna modifica al codice di produzione.**  
**Classificazioni:** `EXISTING_COMPLETE`, `EXISTING_NEEDS_EXTENSION`, `EXISTING_DEFECT`, `MISSING`, `BLOCKED`, `UNVERIFIED`.

---

## 1. Stato Git verificato

| Ref | Hash | Verifica |
|---|---|---|
| `main` / `origin/main` | `5672f12296e484a4ba02ba2876e2f5e82d266cb1` | invariati |
| `milestone/genome/gen0-audit` | `2c800cf…` (HEAD pubblicato prima di Rev 2) | branch dedicato, PR #4 open, solo documentazione |
| `graphics/g3-renderer-integration` | `717da65c81329188dc3ce25f5e83dcdf405cd1be` | storico G, uguale a `archive/g3.1` |
| `iv1-r1-approved` | tag → `dbb114ecf849b90c74cf776f171e27a45e427ead` | approvazione finale IV1 |
| PR #1/#2/#3 | closed, merged=false/true/true | storico verificato |

Tag `origin` rilevanti: `archive/baseline-e1`, `archive/baseline-iv1-a`, `archive/e2.3.1`, `archive/g1-pr1-remote`, `archive/g3.1`, `archive/iv1-a-r1`, `archive/iv1-b-r1`, `iv1-r1-approved`. Sequenza G1→G3.1 già integrata in `main`; non va ricostruita.

---

## 2. Stato del codice (osservato, invariato)

### 2.1 Genoma e simulazione
- Genoma vettoriale a 33 geni: 13 tratti base + `ext` con 20 geni estesi (`types/index.ts`, `simulation/biology/geneRegistry.ts`, `traitRanges.ts`).
- Ereditarietà live: blending/media + mutazione gaussiana (`genome.ts`, `genomeExt.ts`); `inheritGenomeV2`/`cloneGenomeWithMutationV2`/`areGeneticallyCompatibleV2` esistono ma non sono usati dal loop live.
- Espressione: `geneExpression.ts` (26 campi fenotipici, cache `WeakMap`), separata dal renderer.
- Riproduzione live: `simulation/core/reproduction.ts` (soglia energia 130, costo, fallback asessuato), innesto reale.
- Speciazione per distanza + separazione geografica (`speciation.ts`); distanza V2 sotto-tarata (`docs/GENOMA-v1.11.0.md`).
- Determinismo: RNG mulberry32, `deriveGeneRandom` con salt; IV1-A verificato storicamente (fingerprint `82e1bb79…`).

### 2.2 Anatomia e G3.1
- Pipeline genome-agnostica: `RenderFrame` → `derivePhenotype` → anatomia/descriptor → render plan → instancing.
- `derivePhenotype` usa 4 geni MOR; molte caratteristiche restano `undetermined/speculative`.
- Contratti G3.1 da preservare: schema v1, MOR, cache, dynamic pool, fallback, adaptive rendering.
- Innesto minimo potenziale a `runtimeAnatomyRenderSource.ts:270-284`; `AnatomyInput` accetta già `BodyPlanSpec` arbitrario.

### 2.3 Persistence, worker, UI
- `World.toSnapshot/fromSnapshot`, `genomeMigration.ts` (idempotente), `RenderFrame`/worker contract generici.
- UI: `StatsPanel`/`formatAverageGenome` coprono 13 tratti + `ext.*`; altri pannelli/species inspector parziali.

### 2.4 Genome Engine mendeliano
- **MISSING nel codice:** alleli/loci/cromosomi come istanze, ploidia generalizzata, meiosi/gameti/ricombinazione, dominanza/codominanza/epistasi come regole formali, pedigree individuale completo, mutazioni tipizzate con replay, ambiente adattato da Planet Engine.
- **Progettato in Rev 2 (solo documentazione):** contratti corretti per stati allelici, contributi generalizzati, espressione quantitativa, replay compatibile, livelli di maturità.
- **Non implementato, non integrato, non attivo:** nessun modulo `simulation/genome/**`, nessun wiring live.

---

## 3. Baseline e difetti noti (riferimento)

Baseline quiescente GEN-0: `252,56 s`, `1082 passed`, `22 failed`, `1 skipped`, `EXIT=1` (`gen0-baseline-quiescent.log`). Failure deterministici: `fauna180:256`, `reproduction:53`, `reproduction:75`, `vibeGenomeV1110:99`, `vibeGenomeV1110:241`. Timeout load-sensitive: 17 occorrenze (vedi `GENOME_VALIDATION_PLAN.md` §2). Nessun test modificato.

Difetti/classificazioni note: fixture riproduzione, regex/tautologie test Vibe, `simulation/biology/phenotype.ts` vuoto, churn `lib/renderSampling.ts`, chunk eviction assente, performance GPU/FPS `UNVERIFIED`.

---

## 4. Classificazione componenti

| Componente | Classificazione | Note |
|---|---|---|
| `BaseGenome`/`Genome`/`Organism`/`SpeciesRecord`/`WorldSnapshot` | `EXISTING_COMPLETE` | contratti attuali usati |
| `geneRegistry`, `traitRanges`, `genome*`, `geneExpression`, `genomeMigration` | `EXISTING_COMPLETE` / `EXISTING_DEFECT` | modello vettoriale; V2 sotto-tarata; V2 APIs non live |
| `reproduction.ts` | `EXISTING_COMPLETE` | innesto reale; test fixture difettose |
| `speciation.ts` | `EXISTING_NEEDS_EXTENSION` | taratura/metrica da rivedere |
| `plantGenome.ts` | `EXISTING_COMPLETE` modulo / piante evolvevoli `MISSING` | scollegato |
| `lib/phenotype/*`, bridge visuale | `EXISTING_NEEDS_EXTENSION` | 4 geni, body plan speculativo |
| Anatomia/renderer G3.1, cache, MOR, fallback, adaptive | `EXISTING_COMPLETE` | preservare |
| Persistence, RNG, StatsPanel/genome formatting | `EXISTING_COMPLETE` | invariati |
| Worker/UI pannelli genetici estesi | `EXISTING_NEEDS_EXTENSION` | nessun messaggio genome-specifico; UI parziale |
| Genome Engine mendeliano (nuovo) | **MISSING** (codice) / **Progettato** (Rev 2 docs) | non implementato/integrato/attivo |
| Chunk eviction, fitness field globale | `MISSING` | fuori perimetro immediato |
| GPU/FPS, root cause alcuni timeout/failure | `UNVERIFIED` | non indagati in GEN-0 |

---

## 5. Implicazioni Rev 2 (documentali)

- I contratti proposti correggono ambiguità Rev 1: stati allelici a 4 valori, provenienza N-contributori, espressione quantitativa, replay compatibile, ambiente derivato da Planet Engine.
- Queste correzioni **non cambiano il comportamento del codice** e non costituiscono implementazione.
- Ogni integrazione futura richiede checkpoint `GENOME_ARCHITECTURE.md` §13, PR dedicata e evidenza di maturità.

**Conferma:** nessun codice di produzione modificato; `main` invariato.
