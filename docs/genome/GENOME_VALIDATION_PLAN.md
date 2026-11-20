# GENOME — Piano di validazione (Rev 4)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 4 (G1 mutazioni discriminated union, G2 separazione sviluppo/fenotipo, G3 gametogenesi/segregazione/poliploidia, G4 coerenza mutazioni, G5 registry funzioni custom).  
**Stato:** piano progettuale. **Nessun test del Genome Engine eseguito. Nessun test eseguito in Rev 4.** Unica baseline eseguita: GEN-0 quiescente su `main@5672f12`. Checkpoint `GENOME_ARCHITECTURE.md` §13 **NON APPROVATO**. **GEN-1 non avviato.**

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

GEN-1 non può essere dichiarato operativo per meiosi/gametogenesi/mutazione/pedigree se esiste solo come scaffolding isolato.

---

## 4. Validazione per fase (progettuale)

### GEN-1 — Predisposizione isolata

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G1-V1 | Contratti e registry caricabili | Functional | N loci/canali/regole arbitrari, versioni/fingerprint presenti (incluso registry funzioni custom quando applicabile) |
| G1-V2 | Ploidia organismo per gruppo e invarianti | Functional | copie per `HomologousGroupId` coerenti con `PloidyModel`; `uniform` ⇒ `globalPloidy`; `aneuploid` ⇒ `globalPloidy: null` |
| G1-V3 | Stati allelici espliciti | Functional | `identified/biologically-absent/undetermined/non-evaluable` preservati; nessun collasso in `null` |
| G1-V4 | Validazione numerica/canali | Functional | domini finiti, no NaN/Infinity, unità/semantica e normalizzazione dichiarate |
| G1-V5 | Registry funzioni custom (G5) | Functional | id/versione/firma/unità/domini/implementazione registrata/determinismo presenti e validati; funzione mancante/non compatibile/non deterministica ⇒ errore esplicito o `non-evaluable` (no fallback silenzioso) |
| G1-V6 | Assi riproduttivi e gametogenesi (G3) | Functional | `ReproductionMode`, `GameteFormationMode`, ploidia organismo, `GametePloidy`, `SegregationRule`, anomalie meiotiche e cardinalità contributori indipendenti/espliciti; nessuna assunzione di una copia per gruppo nel gamete |
| G1-V7 | Mutazioni discriminated union e invarianti (G1/G4) | Functional | operazioni coperte con struttura pre/op/post, materiali/intervalli/copie/posizioni-orientamenti; `affectedLoci` non richiesto per intergenico puro/intero cromosoma; combinazioni impossibili rifiutate |
| G1-V8 | Replay discriminato | Functional | `ok` ⇒ valore non nullo e mismatch vuoti; `incompatible` ⇒ `value: null` e mismatch espliciti non vuoti (incluso mismatch funzioni custom/versioni) |
| G1-V9 | Pipeline sviluppo/fenotipo (G2) | Functional | `develop()` ⇒ `DevelopmentalState` (età/tempo, stadio, crescita/maturazione, processi, condizioni rilevanti, riferimenti senza duplicazioni); `derivePhenotype()` ⇒ `FinalPhenotype` come passo distinto/verificabile |
| G1-V10 | Ambiente (contratto) | Functional | snapshot Planet Engine con coerenza temporale, coordinate/campionamento, stati campo uniformati; adattatore read-only; mapping subordinato a contratto (D-14) |
| G1-V11 | Round-trip/migrazione | Functional | canonico, idempotente, stati speciali/mutazioni strutturali/riferimenti custom preservati, versioni future `unsupported` |
| G1-V12 | Isolamento | Regression | diff limitato a `simulation/genome/**` e `tests/genomeEngine/**`; nessun wiring live |
| G1-P1 | Costo | Performance | mediana/P95 misurati, non stimati |

### GEN-2 — Integrazione ereditarietà/gametogenesi/pedigree

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G2-V1 | Formazione gameti/segregazione tracciata | Functional | ploidia gamete per gruppo, regola applicata, anomalie meiotiche e copie coerenti con configurazione dichiarata (diploide/poliploide) |
| G2-V2 | Ricombinazione deterministica | Functional | stesso input+contesto compatibile ⇒ stesso risultato; incompatibile ⇒ esito non valido esplicito |
| G2-V3 | Pedigree 0..N contributori e assi separati | Functional | fondatore, sessuato, asessuato, parziale, poliploide/aneuploide, multi-contributore, nessun ciclo |
| G2-V4 | Trasmissione | Statistical | frequenze attese entro IC 95% (≥5 seed) secondo regole di segregazione dichiarate |
| G2-R1 | Regressione | Regression | fallback legacy invariato quando disattivo; IV1-A invariato |

### GEN-3 — Integrazione mutazioni

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G3-V1 | Evento completo (G1) | Functional | variante corretta, struttura pre/op/post, cromosomi/intervalli/copie, materiali/posizione-orientamento, provenienza, versioni, RNG |
| G3-V2 | Coerenza e invarianti (G4) | Functional | combinazioni ammissibili accettate; combinazioni impossibili/payload incoerenti ⇒ validazione fallita senza applicazione parziale |
| G3-V3 | Replay compatibile/discriminato | Functional | compatibile ⇒ replay identico; mismatch ⇒ `incompatible`, `value: null`, mismatch espliciti |
| G3-V4 | Effetti separati | Functional | `ExpressionDelta` e `FitnessAssessment` separati; fitness `NON_EVALUABLE` |
| G3-V5 | Distribuzione | Statistical | N eventi elevato, ≥5 seed, metriche riportate |

### GEN-4 — Espressione quantitativa e funzioni custom

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G4-V1 | Canali, unità e domini | Functional | ogni canale con unità/semantica, dominio finito, normalizzazione dichiarata |
| G4-V2 | Validazione numerica | Functional | no NaN/Infinity in input/output/canali; fuori dominio secondo policy |
| G4-V3 | Dominanza/codominanza/dosaggio/poligenia | Functional | N loci arbitrari, pesi finiti e semantica dichiarata |
| G4-V4 | Epistasi/pleiotropia/interazioni | Functional | effetti secondo regole, non numero fisso di geni |
| G4-V5 | Conflitti e dati mancanti | Functional | strategie deterministiche o `non-evaluable`; `biologically-absent` ≠ `undetermined` ≠ `non-evaluable` |
| G4-V6 | Custom functions (G5) | Functional | risoluzione da registry versionato; firma/unità/domini rispettati; assenza/incompatibilità/non-determinismo dichiarato ⇒ esito esplicito; replay/serializzazione coerenti |
| G4-R1 | Separazione | Regression | genotipo mai scritto da espressione/ambiente/plasticità/sviluppo/fenotipo |

### GEN-5 — Sviluppo, fenotipo e ambiente

| ID | Verifica | Tipo | Criterio |
|---|---|---|---|
| G5-V1 | Contratti separati e non ereditabili | Functional | 7 contratti distinti; plasticità/sviluppo non ereditabili |
| G5-V2 | Sviluppo/fenotipo separati (G2) | Functional | `develop()` produce `DevelopmentalState` con età/tempo, stadio, crescita/maturazione, stato processi, condizioni rilevanti e riferimenti (no duplicazioni); `derivePhenotype()` produce `FinalPhenotype` distinto e verificabile |
| G5-V3 | Fonte ambientale Planet Engine | Functional | `EnvironmentalSnapshot` read-only con coerenza temporale, coordinate/campionamento, unità/provenienza/stati campo uniformati |
| G5-V4 | Mancanze ambientali/sviluppo | Functional | `missing`/`non-evaluable`/`undetermined` propagati senza inventare valori; mapping concreto subordinato a contratto Planet Engine |
| G5-R1 | Stabilità genotipo | Regression | fingerprint genotipo invariato durante sviluppo/regolazione/derivazione fenotipo |

### GEN-6…GEN-8

G6 richiede checkpoint §13 e prove di provenienza anatomica reale; nessuna regressione G3/E2. G7 usa hook esistenti. G8: metriche multi-seed; selezione vs deriva resta `NON_EVALUABLE`.

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

## 6. Test progettuali obbligatori (T-01…T-17)

Tutti **progettati, non eseguiti**. Esecuzione futura: ≥5 seed, campioni grandi, α=0,05 e IC 95% dichiarati a priori, log completo.

| ID | Categoria | Disegno | Campione | Criterio | Classificazione attesa |
|---|---|---|---|---|---|
| T-01 | Genotipo e stati allelici | Ploidia per gruppo, 1 locus-call per copia, stati espliciti, catalogo ≠ genotipo | 1.000 organismi × 5 seed | 0 violazioni; nessun collasso semantico | `OBSERVED` |
| T-02 | Ploidia organismo uniforme/aneuploidia | Gruppi con copie uniformi e aneuploidi, invarianti cardinalità | matrice casi × 5 seed | riepilogo globale solo se uniforme; per-gruppo sempre coerente | `OBSERVED` |
| T-03 | Segregazione e ploidia gamete (G3) | Formazione gameti diploidi/poliploidi con regole esplicite; anomalie meiotiche rappresentate | ≥50.000 gameti/config × 5 seed | ploidia gamete per gruppo coerente con regola; nessuna assunzione di 1 copia per gruppo; anomalie tracciate | `OBSERVED`, `DERIVED` |
| T-04 | Segregazione mendeliana/poliploide e trasmissione | Incroci controllati, inclusi casi `biologically-absent` e regole poliploidi supportate | ≥20.000 figli/incrocio × 5 seed | rapporti entro IC 95%/χ² α=0,05 secondo regola dichiarata | `OBSERVED`, `DERIVED` |
| T-05 | Ricombinazione e intergenico | Loci/intervalli a distanze note, trace e intervalli per contributo, casi esclusivamente intergenici | ≥50.000 gameti × 5 seed | frequenze coerenti; replay compatibile identico; intergenico senza `affectedLoci` obbligatorio | `OBSERVED`, `DERIVED` |
| T-06 | Espressione quantitativa | Canali/unità/domini, normalizzazione/pesi, dominanza/codominanza/dosaggio | matrice completa × 5 seed | risultati finiti e deterministici; no NaN/Infinity | `DERIVED` |
| T-07 | Registry funzioni custom (G5) | Funzioni registrate/versionate, firma/unità/domini, funzione mancante, versione incompatibile, comportamento non deterministico dichiarato/rilevato | casi sistematici × 5 seed | uso valido solo se registrata/compatibile/disponibile; assenza/incompatibilità ⇒ errore o `non-evaluable`; replay/serializzazione con mismatch esplicito | `OBSERVED`, `DERIVED` |
| T-08 | Associazione loci/pedigree assi | Coppie collegate/non collegate e pedigree con assi separati | ≥50.000 gameti/coppia; 10.000 record × 5 seed | linkage/indipendenza coerenti; assi separati; 0..N contributi; 0 cicli | `DERIVED` |
| T-09 | Poligenia/epistasi/pleiotropia/conflitti | N variabile, canali multipli, conflitti espliciti | matrice × 5 seed | aggregazione deterministica; irrisolvibile ⇒ `non-evaluable` | `DERIVED` |
| T-10 | Dati mancanti e non valutabili | `biologically-absent`, `undetermined`, `non-evaluable`, custom non verificabile | casi sistematici × 5 seed | assenza ≠ ignoto ≠ non valutabile; propagazione secondo policy | `OBSERVED`, `DERIVED` |
| T-11 | Mutazioni discriminated union e replay (G1) | Point/insertion/deletion/duplication/inversion/translocation/chromosome-level/aneuploidy/structural variation; replay con mismatch versioni/parametri/algoritmo/funzioni | ≥10.000 eventi × 5 seed | struttura pre/op/post completa, materiali/posizioni/orientamenti; intergenico/cromosomico senza `affectedLoci` obbligatorio; compatibile ⇒ identico; incompatibile ⇒ `value: null`, mismatch espliciti | `OBSERVED`, `DERIVED` |
| T-12 | Coerenza mutazioni e errori (G4) | Combinazioni ammissibili e impossibili scope/operation/payload/cromosomi/loci/intervalli | matrice casi validi/invalidi | accettazione solo combinazioni ammissibili; invalidi ⇒ validazione fallita, nessuna applicazione parziale | `OBSERVED` |
| T-13 | Determinismo | Stesso seed/config/registry/snapshot ⇒ stessi output; world RNG non consumato | 5 seed × 2 replay; IV1-A | 0 divergenze | `OBSERVED` |
| T-14 | Compatibilità legacy | Snapshot v1/v2 senza `genetics`; fallback blending | 1.000 snapshot × 5 seed | nessuna eccezione; valori legacy invariati | `OBSERVED` |
| T-15 | Serializzazione/migrazione | Round-trip, migrazione monotonica/idempotente, versione futura, payload mutazionali e riferimenti custom | 1.000 genomi/eventi × 5 seed | stati speciali/strutture pre-op-post/intergenico/cromosomico preservati; future ⇒ `unsupported`/`NON_EVALUABLE` | `OBSERVED` |
| T-16 | Ambiente Planet Engine e sviluppo/fenotipo (G2) | Snapshot con coerenza temporale/coordinate/campionamento/stati campo; `develop()` vs `derivePhenotype()` | suite contrattuale × 5 seed | `DevelopmentalState` senza duplicazioni di `GeneticExpression`/`PlasticResponse`; fenotipo finale derivato in passo distinto; adattamento read-only; nessuna scrittura genotipo | `OBSERVED`, `DERIVED` |
| T-17 | Maturità/integrità wiring | Analisi statica + test di integrazione per livello dichiarato | per PR | nessuna dichiarazione "attivo" senza call-site live, test e abilitazione documentata | `OBSERVED` |

---

## 7. Evidenze e stato Rev 4

Ogni futuro report includerà: commit/branch, comandi, seed, fingerprint registry/config/custom-function registry, log, conteggi, confronto con baseline quiescente, classificazioni e livello di maturità dimostrato.

**Stato Rev 4:** nessun test Genome Engine eseguito; nessun modulo implementato/integrato/attivo. **Nessun test eseguito in Rev 4.** Baseline di confronto resta `gen0-baseline-quiescent.log` (22 failed, 17 timeout, 252,56 s, EXIT=1).
