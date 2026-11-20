# GENOME — Contratti API (audit GEN-0)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit`  
**Stato:** contratti **osservati** nel codice attuale + proposti per il Genome Engine. I contratti proposti non sono implementati e non possono essere considerati stabili fino al checkpoint di `GENOME_ARCHITECTURE.md` §9.

---

## 1. Contratti esistenti (OBSERVED)

### 1.1 `BaseGenome` / `Genome` — `types/index.ts:14-67`

```ts
interface BaseGenome {
  size: number; speed: number; metabolism: number; vision: number;
  fertility: number; lifespan: number; carnivory: number;
  preferredTemperature: number; temperatureTolerance: number;
  preferredWater: number; waterTolerance: number;
  evasion: number; huntingSkill: number;
}
type GeneMap = Record<string, number>;
interface Genome extends BaseGenome { ext?: GeneMap }
```

- 13 tratti base + 20 geni estesi = 33 geni registrati (`geneRegistry.ts:150-158`).
- `ext` è opzionale: la sua assenza è uno stato legittimo e usato dai mondi legacy.

### 1.2 `GeneDefinition` — `geneRegistry.ts:22-38`

```ts
interface GeneDefinition {
  id: string; key: string; category: string; description: string;
  min: number; max: number; defaultValue: number;
  mutationStdFraction: number; distanceWeight: number;
  hook?: (...) => ...;
}
```

ID stabili e congelati: 13 legacy + `MOR-01..03`, `REP-01`, `ENV-*`, `SOC-*`, `LOC-*`, ecc. **Non rinumerare.**

### 1.3 `Phenotype` — `geneExpression.ts:57-84`

26 campi calcolati, tra cui `upkeepExtra`, `defenseFactor`, `flockGain`, `maturityFraction`. `expressGenome()` e `phenotypeOf()` usano cache `WeakMap`; il fenotipo non riscrive il genoma.

### 1.4 `Organism` — `types/index.ts:99-125`

`genome: Genome`, `brain: Float32Array` (119 pesi), energia, età, memoria, `speciesId`. Il cervello è ereditato separatamente da `brain.ts:83-106`.

### 1.5 `WorldSnapshot` — `types/index.ts:300-333`

```ts
interface WorldSnapshot {
  organisms: ...; randomState: ...; speciesRegistry: ...;
  genomeVersion?: number; advancedGenome?: ...; geneEffects?: ...;
}
```

`toSnapshot()` / `fromSnapshot()` in `world.ts:488-536`; migrazione idempotente in `genomeMigration.ts:18-68`.

### 1.6 `RenderFrame` — `types/index.ts:405-433`

Payload worker → UI. Campi per organismo: `organismsX`, `organismsY`, `organismsSpecies`, `organismsSize`, `organismsSpeed`, `organismsCarnivory`, `organismsVision`, `organismsEvasion`, `organismsHuntingSkill`. Canali MOR opzionali:

```ts
organismsBodyStature?: Float32Array;
organismsFurDensity?: Float32Array;
organismsDermalArmor?: Float32Array;
organismsMorphologyPresence?: Uint8Array; // bit 1/2/4
```

La vecchia proposta `organismsMorphology?: Float32Array` (`G2_MISSING_GENETIC_DATA.md:11-20`) è **superata** da questa implementazione.

### 1.7 Fenotipo G2 — `lib/phenotype/types.ts:10-63`

```ts
type ProvenanceKind = "gene-direct" | "gene-derived" | "undetermined" | "aesthetic";
type Certainty = "exact" | "derived" | "speculative";
interface DataSource { kind: ProvenanceKind; genes: readonly string[]; certainty: Certainty; note?: string }
interface PhenotypeProfile { ...; traits: Record<string, PhenotypeTrait> }
```

`derive.ts:18` legge solo `size`, `bodyStature`, `furDensity`, `dermalArmor`; dieci caratteristiche sono `undetermined` (`:33-45`).

### 1.8 Funzioni geniche esistenti

| Funzione | File | Contratto |
|---|---|---|
| `randomGenome(rng)` | `genome.ts:37` | genoma legacy casuale |
| `inheritGenome(a,b,rng)` | `genome.ts:65` | media + mutazione gaussiana |
| `cloneWithMutation(a,rng)` | `genome.ts:83` | variante asessuata |
| `geneticDistance(a,b)` | `genome.ts:168` | v1.10 se nessun `ext`, altrimenti V2 |
| `geneticDistanceV2(a,b)` | `genome.ts:195` | distanza pesata su tutto il registry |
| `areGeneticallyCompatible` | `genome.ts:214` | soglia 0,16 |
| `getGene`, `inheritExt`, `cloneExt` | `genomeExt.ts:19,103,114` | vista `ext` con default |
| `deriveGeneRandom(state,salt)` | `genomeExt.ts:84` | RNG derivato, non consuma il mondo |
| `inheritGenomeV2`, `cloneGenomeWithMutationV2` | `genomeExt.ts:119,125` | API V2 **non usate dal loop live** |
| `migrateGenome`, `migrateSnapshot` | `genomeMigration.ts:18,47` | v1→v2, idempotenti |
| `expressGenome`, `phenotypeOf` | `geneExpression.ts:114,160` | geni → `Phenotype` |

---

## 2. Contratti proposti per il Genome Engine (DA APPROVARE)

Tutti opzionali e additivi. Non devono essere importati da React, DOM o renderer.

```ts
type LocusId = string;
type AlleleId = string;

interface Allele {
  readonly id: AlleleId;
  readonly values: Readonly<Record<string, number>>; // un valore per gene influenzato
  readonly origin: "founder" | "mutation" | "migration";
}

interface Locus {
  readonly id: LocusId;
  readonly geneIds: readonly string[];
  readonly alleles: readonly Allele[];
  readonly dominance: "complete" | "incomplete" | "codominant";
}

interface Chromosome { readonly id: string; readonly loci: readonly Locus[] }

interface GeneticGenome {
  readonly version: 1;
  readonly ploidy: number;          // 2 di default, estendibile
  readonly chromosomes: readonly Chromosome[];
}

interface Gamete {
  readonly sourceId: number;
  readonly chromosomes: readonly Chromosome[];
}

interface MutationEvent {
  readonly type: "point" | "insertion" | "deletion" | "duplication" | "structural" | "regulatory";
  readonly locusIds: readonly LocusId[];
  readonly tick: number;
}

interface PedigreeRecord {
  readonly id: number;
  readonly parents: readonly [number, number];
  readonly birthTick: number;
}

interface GenomeEngineApi {
  createFounderGenome(rng: Random, config: GenomeConfig): GeneticGenome;
  meiosis(genome: GeneticGenome, rng: Random): Gamete;
  fuse(gameteA: Gamete, gameteB: Gamete, rng: Random): GeneticGenome;
  mutate(genome: GeneticGenome, rng: Random): { genome: GeneticGenome; events: MutationEvent[] };
  resolve(genome: GeneticGenome, environment?: Environment): Genome; // → 33 geni legacy + ext
  serialize(genome: GeneticGenome): unknown;
  deserialize(raw: unknown): GeneticGenome;
}
```

### 2.1 Regole vincolanti

1. `resolve()` è l'unico ponte verso `expressGenome()`. Nessun altro modulo legge `GeneticGenome` per calcolare fitness.
2. `meiosis()` produce **gameti**, non copie dei genomi parentali.
3. `fuse()` restituisce un genoma con esattamente `ploidy` copie per locus.
4. Ogni `MutationEvent` ha tipo, loci e tick; `skipped` non è un evento.
5. `serialize()` / `deserialize()` sono idempotenti e non toccano i campi obbligatori di `Genome`.
6. `skipped`/campi mancanti ⇒ default del registry + `DataSource.kind = "undetermined"`, mai `INFERRED`.
7. I salt RNG sono registrati; due operazioni con salt diverso non condividono sequenza.
8. Le firme sono **proposte**: non sono ancora approvate. Cambiare `types/index.ts` richiede il checkpoint §9.

---

## 3. Compatibilità e migrazione

| Situazione | Comportamento richiesto |
|---|---|
| `genetics` assente | Tutte le API legacy funzionano come oggi |
| Snapshot v1/v2 senza `genetics` | Caricamento identico, nessun campo aggiunto |
| Snapshot con `genetics` versione futura | `NON_EVALUABLE`, nessun fallback silenzioso; errore esplicito |
| `ext` presente ma `genetics` assente | `ext` resta fonte dei 20 geni estesi |
| Entrambi presenti | `genetics` risolve i valori, `ext` è vista derivata/consistente |
| Nuovo locus senza `GeneDefinition` | `BLOCKED`: registrare default, range e hook prima dell'uso |

---

## 4. Matrice di impatto sui contratti condivisi

| Contratto | Impatto Genome Engine | Azione |
|---|---|---|
| `Genome` | aggiunta opzionale `genetics` | checkpoint §9 |
| `Phenotype` | nessun nuovo campo nel primo rilascio | nessuna |
| `Organism` | nessun campo obbligatorio aggiunto | nessuna |
| `WorldSnapshot` | eventuale `geneticsVersion` opzionale | checkpoint §9 |
| `RenderFrame` | nuovi canali solo opzionali + maschera | checkpoint §9 |
| `SpeciesRecord` | solo nuove metriche derivate | checkpoint §9 |
| `GENE_REGISTRY` | aggiunta di metadati locus, nessuna rinumerazione | PR dedicata |
| `Random` | nessuna modifica, solo salt derivati | nessuna |

---

## 5. Verifica dei contratti

Ogni contratto proposto deve avere test che verifichino:

- presenza/assenza del campo opzionale;
- round-trip serialize/deserialize;
- risoluzione allele → valore genico per genotipi noti;
- non consumo del RNG mondo;
- fallback legacy quando `genetics` è assente;
- nessuna scrittura nel genoma durante sviluppo.

I test devono essere nuovi: **nessun test esistente viene allentato** (`GENOME_VALIDATION_PLAN.md` §1).
