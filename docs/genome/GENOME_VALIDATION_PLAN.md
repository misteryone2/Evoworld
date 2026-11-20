# GENOME — Piano di validazione (Rev 2)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 2 (stati allelici espliciti, provenienza generalizzata, maturità scaffolding/attivo, contratti quantitativi, replay compatibile, ambiente Planet Engine).  
**Stato:** piano progettuale. **Nessun test del Genome Engine eseguito.** Unica baseline eseguita: GEN-0 quiescente su `main@5672f12`. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**.

---

## 1. Principi

1. **Output verificabile:** commit, comando, seed, config/registry fingerprint, log, conteggi.
2. **Nessun allentamento:** timeout/soglie/asserzioni invariati; failure nuovi ⇒ stop e classificazione.
3. **Classificazioni:** `OBSERVED`, `DERIVED`, `INFERRED` (non autorizzato per selezione vs deriva), `NON_EVALUABLE`.
4. **Maturità verificabile:** un test di modulo isolato non prova integrazione o attivazione.
5. **Statistiche dichiarate a priori:** ≥5 seed dove richiesto, α=0,05, IC 95% o test equivalente dichiarato prima dell'esecuzione.
6. **Nessuna prova biologica reale:** validazione di implementazione, non di organismi reali.

---

## 2. Baseline verificata (invariata)

Ambiente: Node `v22.14.0`, Vitest `4.1.12`, Windows 11, Intel i7-1365U.

| Esecuzione | Tempo | Passati | Failed | Nota |
|---|---:|---:|---:|---|
| Integrazione finale (`aac7516`, 2026-11-19) | ~380 s | 1098 | 6 | storico |
| `main@5672f12` rerun (2026-11-19) | ~419 s | 1096 | 8 | +2 timeout planet |
| `main@5672f12` GEN-0 con 4 agenti paralleli (2026-11-20) | ~1047 s | 1072 | 22 | carico non rappresentativo |
| `main@5672f12` GEN-0 quiescente (`gen0-baseline-quiescent.log`) | 252,56 s | 1082 | 22 | **baseline di riferimento**; 17 timeout, 1 skipped, EXIT=1 |

Failure deterministici (5): `fauna180.test.ts:256`, `reproduction.test.ts:53`, `reproduction.test.ts:75`, `vibeGenomeV1110.test.ts:99`, `vibeGenomeV1110.test.ts:241`. Timeout (17): `hydrology` (5), `planet` (3), `speciesHabitat` (3), `settlementDefaults` (2), `iv1/invariance` (2), `livingBehavior:230`, `vibeGenomeV1110:128`. Nessun test/timeout modificato.

---

## 3. Criteri per livello di maturità

| Dichiarazione | Evidenza minima richiesta |
|---|---|
| **Progettato** | contratti/invarianti/test plan documentati e coerenti |
| **Implementato (non integrato)** | modulo presente, `tsc` ok, test unitari del modulo verdi, nessun call-site live |
| **Integrato** | test di integrazione verdi, wiring documentato, default/legacy invariato se feature disattivata |
| **Attivo/Operativo** | test end-to-end + regressione + osservabilità, abilitazione documentata, confronto baseline quiescente |

GEN-1 non può essere dichiarato operativo per meiosi/mutazione/pedigree se esiste solo come scaffolding isolato.

---

## 4. Validazione per fase (progettuale)

### GEN-1 — Predisposizione isolata

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G1-V1 | Contratti e registry caricabili | Functional | N loci arbitrari, versioni/fingerprint presenti |
| G1-V2 | Ploidia/copie/contributi | Functional | `ploidy` copie per gruppo; provenienza tracciata senza ruoli fissi |
| G1-V3 | Stati allelici espliciti | Functional | `identified/biologically-absent/undetermined/non-evaluable` preservati; nessun collasso in `null` |
| G1-V4 | Round-trip/migrazione | Functional | canonico, idempotente, versioni future `unsupported` |
| G1-V5 | Isolamento | Regression | diff limitato a `simulation/genome/**` e `tests/genomeEngine/**`; nessun wiring live |
| G1-P1 | Costo | Performance | mediana/P95 misurati, non stimati |

### GEN-2 — Integrazione ereditarietà/pedigree

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G2-V1 | Formazione gameti/fusione tracciata | Functional | contributi e copie coerenti; stati allelici propagati correttamente |
| G2-V2 | Ricombinazione deterministica | Functional | stesso input+trace compatibile ⇒ stesso risultato; incompatibile ⇒ errore |
| G2-V3 | Pedigree 0..N contributori | Functional | fondatore, sessuato, asessuato, parziale, poliploide/multi-contributore, nessun ciclo |
| G2-V4 | Trasmissione | Statistical | frequenze attese entro IC 95% (≥5 seed) |
| G2-R1 | Regressione | Regression | fallback legacy invariato quando disattivo; IV1-A invariato |

### GEN-3 — Integrazione mutazioni

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G3-V1 | Evento completo | Functional | tipo, locus, posizione, previous/resulting `AlleleState`, tick, origine, organismo, versioni, RNG |
| G3-V2 | Replay compatibile | Functional | compatibile ⇒ replay identico; mismatch ⇒ `incompatible` esplicito |
| G3-V3 | Effetti separati | Functional | `ExpressionDelta` e `FitnessAssessment` separati; fitness `NON_EVALUABLE` |
| G3-V4 | Distribuzione | Statistical | N eventi elevato, ≥5 seed, metriche riportate |

### GEN-4 — Espressione quantitativa

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G4-V1 | Canali e unità | Functional | ogni canale con unità, dominio, normalizzazione dichiarata |
| G4-V2 | Dominanza/codominanza/dosaggio | Functional | risultati attesi per regole e stati noti |
| G4-V3 | Epistasi/pleiotropia/poligenia | Functional | N loci arbitrari; effetti secondo regole, non numero fisso |
| G4-V4 | Conflitti e dati mancanti | Functional | conflitti deterministici o `non-evaluable`; `biologically-absent` ≠ `undetermined` ≠ `non-evaluable` |
| G4-R1 | Separazione | Regression | genotipo mai scritto da espressione/ambiente/sviluppo |

### GEN-5 — Sviluppo e ambiente

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G5-V1 | Contratti separati | Functional | 7 contratti distinti; plasticità/sviluppo non ereditabili |
| G5-V2 | Fonte ambientale | Functional | input da `EnvironmentalSnapshot` (Planet Engine) con unità/origine/coordinate/granularità/versione/stati campo |
| G5-V3 | Mancanze ambientali | Functional | campi `MISSING`/`NON_EVALUABLE` propagati senza inventare valori |
| G5-R1 | Stabilità genotipo | Regression | fingerprint genotipo invariato durante sviluppo |

### GEN-6…GEN-8

G6 richiede checkpoint §13 e prove di provenienza anatomica reale (`undetermined/speculative` finché assenti), nessuna regressione G3/E2. G7 usa hook esistenti. G8: metriche multi-seed; selezione vs deriva resta `NON_EVALUABLE`.

---

## 5. Criteri globali per future PR implementative

1. `npx tsc --noEmit --pretty false` → exit 0.
2. Test del modulo/fase verdi con log verificabile.
3. E2 (115) e G3 (185) senza nuovi failure quando rilevanti.
4. `npx next build --webpack` → exit 0 quando rilevante.
5. Nessun nuovo failure deterministico rispetto a `gen0-baseline-quiescent.log`.
6. Nessuna modifica a `types/index.ts`, persistence, workers, renderer, core condiviso senza checkpoint approvato.
7. Ogni dichiarazione di maturità supportata da evidenza del livello corrispondente.

---

## 6. Test progettuali obbligatori (T-01…T-14)

Tutti **progettati, non eseguiti**. Esecuzione futura: ≥5 seed, campioni grandi, α=0,05 e IC 95% dichiarati a priori, log completo.

| ID | Categoria | Disegno | Campione | Criterio | Classificazione attesa |
|---|---|---|---|---|---|
| T-01 | Genotipo e stati allelici | Verifica `ploidy` copie, 1 locus-call per copia, stati `identified/biologically-absent/undetermined/non-evaluable`, catalogo ≠ genotipo | 1.000 organismi × 5 seed | 0 violazioni; nessun collasso semantico | `OBSERVED` |
| T-02 | Segregazione | Incroci controllati con stati `identified`; includere caso `biologically-absent` ereditabile | ≥20.000 figli/incrocio × 5 seed | rapporti entro IC 95%/χ² α=0,05 | `OBSERVED`, `DERIVED` |
| T-03 | Ricombinazione | Loci a distanze note, `RecombinationTrace` e intervalli per contributo | ≥50.000 gameti × 5 seed | frequenze coerenti; replay compatibile identico | `OBSERVED`, `DERIVED` |
| T-04 | Associazione loci | Coppie collegate/non collegate | ≥50.000 gameti/coppia × 5 seed | indipendenza o linkage coerente con mappa | `DERIVED` |
| T-05 | Dominanza/incomplete/codominanza/dosaggio | Regole distinte su stessi/analoghi loci | matrice completa × 5 seed | esiti quantitativi attesi per regola | `DERIVED` |
| T-06 | Poligenia/pleiotropia/epistasi | N variabile, canali multipli, modificatori | matrice × 5 seed | aggregazione deterministica; conflitti espliciti | `DERIVED` |
| T-07 | Dati mancanti e non valutabili | Input `biologically-absent`, `undetermined`, `non-evaluable` | casi sistematici × 5 seed | assenza ≠ ignoto ≠ non valutabile; propagazione secondo policy | `OBSERVED`, `DERIVED` |
| T-08 | Mutazioni e replay | Tutti i tipi; previous/resulting state; replay con registry/engine/schema/parametri/algoritmo variati | ≥10.000 eventi × 5 seed | campi completi; compatibile ⇒ identico; incompatibile ⇒ `incompatible`, mai risultato valido | `OBSERVED`, `DERIVED` |
| T-09 | Pedigree generalizzato | Fondatore, sessuato, asessuato, parziale, poliploide, multi-contributore, origine sconosciuta | 10.000 record × 5 seed | 0..N contributi validi; identità ≠ ruolo; 0 cicli | `OBSERVED`, `DERIVED` |
| T-10 | Determinismo | Stesso seed/config/registry/snapshot ⇒ stessi output; world RNG non consumato | 5 seed × 2 replay; IV1-A | 0 divergenze | `OBSERVED` |
| T-11 | Compatibilità legacy | Snapshot v1/v2 senza `genetics`; fallback blending | 1.000 snapshot × 5 seed | nessuna eccezione; valori legacy invariati | `OBSERVED` |
| T-12 | Serializzazione/migrazione | Round-trip, migrazione monotonica/idempotente, versione futura | 1.000 genomi × 5 seed | stati preservati; future ⇒ `unsupported`/`NON_EVALUABLE` | `OBSERVED` |
| T-13 | Ambiente Planet Engine (contratto) | Snapshot con unità/origine/coordinate/granularità/versione/stati campo; campi mancanti/non valutabili | suite contrattuale × 5 seed | adattamento read-only; nessun modello parallelo; nessuna scrittura genotipo | `OBSERVED`, `DERIVED` |
| T-14 | Maturità/integrità wiring | Analisi statica + test di integrazione per livello dichiarato | per PR | nessuna dichiarazione "attivo" senza call-site live, test e abilitazione documentata | `OBSERVED` |

---

## 7. Evidenze e stato Rev 2

Ogni futuro report includerà: commit/branch, comandi, seed, fingerprint registry/config, log, conteggi, confronto con baseline quiescente, classificazioni e livello di maturità dimostrato.

**Stato Rev 2:** nessun test Genome Engine eseguito; nessun modulo implementato/integrato/attivo. Baseline di confronto resta `gen0-baseline-quiescent.log` (22 failed, 17 timeout, 252,56 s, EXIT=1).
