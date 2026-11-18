# G2 — Architettura: Procedural Anatomy & Phenotype System

## Principi
1. Indipendenza dal renderer: `lib/phenotype/` e `lib/anatomy/` non importano React, Three.js, componenti, `renderFrame`, `lib/visual`, animazione. Verificato da un test sui sorgenti.
2. Provenienza esplicita: ogni caratteristica è `gene-direct`, `gene-derived`, `undetermined` o `aesthetic`. Il validatore rifiuta provenienze genetiche che citano geni non morfologici.
3. Nessuna biologia inventata: struttura (body plan, simmetria, segmenti, appendici, articolazioni, locomozione) è `undetermined`: nessun gene la codifica. Velocità, carnivoria, vista, evasione, caccia e ogni altro gene NON influenzano l'anatomia (test).
4. Componibilità: 13 body plan nel catalogo sono dati costruiti con `seg()` e `grp()`; il generatore è unico.
5. Immutabilità e determinismo: output congelato, serializzazione canonica (chiavi ordinate), arrotondamento a 1e-6, PRNG locale (`mulberry32`), nessun `Math.random`.

## Moduli
| File | Ruolo |
|---|---|
| `lib/phenotype/types.ts` | `DataSource`, `PhenotypeTrait`, `PhenotypeProfile` |
| `lib/phenotype/derive.ts` | `derivePhenotype(genome)`: legge `size`, MOR-01/02/03, normalizza sul registro, gestisce mancanti/non validi/fuori intervallo |
| `lib/anatomy/types.ts` | `AnatomyDescriptor` e sotto-contratti, `MAX_APPENDAGES = 64` |
| `lib/anatomy/geometry.ts` | profilo e superficie dei segmenti (posizionamento delle radici) |
| `lib/anatomy/bodyPlan.ts` | `BodyPlanSpec`, catalogo, `validateBodyPlanSpec`, `speculativeBodyPlanId` |
| `lib/anatomy/generate.ts` | `generateAnatomy`, `generateAnatomyCached`, `anatomyFromPhenotype` |
| `lib/anatomy/assemble.ts` | proporzioni, complessità, fingerprint, freeze |
| `lib/anatomy/validate.ts` | `validateAnatomy` (non lancia) |
| `lib/anatomy/serialize.ts` | `serializeAnatomy`, `deserializeAnatomy` |
| `lib/anatomy/lod.ts` | `reduceAnatomyDetail` (livelli 3→0) |
| `lib/anatomy/legacyAdapter.ts` | legacy → descriptor, `compareLegacyAnatomy` |

## AnatomyDescriptor (schemaVersion 2)
`fingerprint`, `lod`, `bodyPlan {id, family, origin}`, `symmetry {type, order}`, `segments[]`, `appendages[]`, `joints[]`, `proportions` (estensioni del corpo, estensioni complessive, `bounds`, `groundY`, `groundClearance`, `heightAboveGround`: terreno `null` se non determinabile), `surface {covering, furCoverage, armorCoverage}`, `locomotion {mode, supportingLimbs}`, `complexity`, `aesthetic {seed, jitter}`, `provenance` (14 chiavi obbligatorie), `phenotypeIssues`.
Convenzioni geometriche complete: `G2_GEOMETRY_CONVENTIONS.md` (+Z avanti, +Y su, +X sinistra; il terreno NON è y = 0).
Articolazioni: `axial` (segmento↔segmento), `root` (segmento→appendice), `internal` (tra sezioni). Riferimenti validati.

## Body plan: famiglie rappresentabili
A semplici (sfera, allungato, asimmetrico), B multicellulari (verme segmentato, radiale, con supporti), C complessi (quadrupede, bipede, esapode, multipede, serpentiforme senza arti), D specializzati (corazzato differenziato, multi-braccio radiale speculativo). Sono capacità rappresentative, non stadi evolutivi. Il numero di appendici è variabile per gruppo (`appendageCounts`, limiti per gruppo + tetto globale).

## Scelta del body plan (nessun gene lo determina)
- Default: input esplicito, o quadrupede legacy (`origin: "legacy-default"`) per le creature esistenti.
- Opzione B, **spenta di default**: `speculativeBodyPlan: true` + `seed` → body plan scelto dal solo seme, `origin: "seeded-speculative"`, provenienza `undetermined`. Mai legata a tratti biologici.

## Dati biologici realmente usati
`size` → `sizeScale` (gene-derived); MOR-03 → robustezza e spessore (stessa regola di `bodyRadiusFactor`); MOR-01 → `furCoverage`; MOR-02 → `armorCoverage` e numero di placche dorsali (2–8, solo se ≥ 0,25); copertura classificata da MOR-01/02 (soglia di rappresentazione 0,25).

## Dettaglio adattivo
`reduceAnatomyDetail`: 3 completo; 2 senza articolazioni interne; 1 solo appendici essenziali (zampe, braccia, tentacoli, pinne, code, flagelli, pseudopodi); 0 solo segmenti. Ogni livello è un descriptor valido; la locomozione resta quella dell'organismo intero; `complexity` descrive la rappresentazione presente.

## Performance (misurata, Node, non GPU/browser)
3000 organismi, body plan misti, dopo riscaldamento (Node, CPU): 1090 ms a freddo (~363 µs/organismo, dopo la revisione); con cache calda 27 ms (~9 µs/organismo, dominati dalla costruzione della chiave). Nessuna ottimizzazione applicata: il costo è accettabile se i descriptor si calcolano alla nascita/cambio genoma e non a ogni frame. Il costo maggiore è probabilmente il fingerprint canonico e il deep-freeze (ipotesi, non profilata).

## Compatibilità
`descriptorFromLegacyAnatomy` / `descriptorFromLegacyTraits` convertono l'anatomia legacy (tutta `aesthetic`, nessun dato genetico). `compareLegacyAnatomy` confronta struttura e proporzioni. Il sistema NON è collegato al renderer.
