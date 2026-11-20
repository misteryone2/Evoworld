# GENOME — Contratti API completi

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 1 (correzione del modello genetico dopo review tecnica).  
**Stato:** contratti **osservati** nel codice attuale + contratti **proposti** per il Genome Engine. I proposti non sono implementati e non sono approvati: richiedono la nuova review e il checkpoint di `GENOME_ARCHITECTURE.md` §13.

---

## 1. Contratti esistenti (OBSERVED — invariati)

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

13 tratti base + 20 geni estesi = 33 geni registrati (`geneRegistry.ts:150-158`). `ext` è opzionale e il suo campo assente è uno stato legittimo.

### 1.2 `GeneDefinition` — `geneRegistry.ts:22-38`

```ts
interface GeneDefinition {
  id: string; key: string; category: string; description: string;
  min: number; max: number; defaultValue: number;
  mutationStdFraction: number; distanceWeight: number;
  hook?: (...) => ...;
}
```

ID stabili, non rinumerare. `GENOME_VERSION_CURRENT = 2` (`geneRegistry.ts:40`).

### 1.3 Contratti di contesto

| Contratto | File | Contenuto |
|---|---|---|
| `Phenotype` | `geneExpression.ts:57-84` | 26 campi derivati; cache `WeakMap`; nessuna scrittura nel genoma |
| `Organism` | `types/index.ts:99-125` | `genome`, `brain: Float32Array` (119 pesi), energia, età, memoria |
| `WorldSnapshot` | `types/index.ts:300-333` | `randomState`, `speciesRegistry`, `genomeVersion?`, `advancedGenome?`, `geneEffects?` |
| `RenderFrame` | `types/index.ts:405-433` | array per organismo + 3 canali MOR opzionali e maschera bit |
| `PhenotypeProfile` | `lib/phenotype/types.ts:10-63` | `gene-direct`/`gene-derived`/`undetermined`/`aesthetic`, `certainty` |

### 1.4 Funzioni geniche esistenti

| Funzione | File | Contratto |
|---|---|---|
| `randomGenome`, `inheritGenome`, `cloneWithMutation` | `genome.ts:37,65,83` | media + mutazione gaussiana |
| `geneticDistance`, `geneticDistanceV2` | `genome.ts:168,195` | v1.10 se nessun `ext`, altrimenti V2 pesata |
| `areGeneticallyCompatible` | `genome.ts:214` | soglia legacy 0,16 |
| `getGene`, `inheritExt`, `cloneExt` | `genomeExt.ts:19,103,114` | vista `ext` con default del registry |
| `deriveGeneRandom` | `genomeExt.ts:84` | RNG derivato, non consuma il mondo |
| `migrateGenome`, `migrateSnapshot` | `genomeMigration.ts:18,47` | v1→v2 idempotente |

---

## 2. Regole fondamentali del nuovo modello

1. **Catalogo ≠ genotipo.** `GenomeRegistry.alleles` e `LocusDefinition.alleleCatalog` sono definizioni. Il genotipo è solo l'insieme di `AlleleInstance` dentro `GeneticGenome.chromosomes`.
2. **Una copia per oggetto.** `Chromosome` è una singola copia cromosomica; un diploide ha due istanze per `homologousGroup`.
3. **Un allele per locus per copia.** `LocusCall.allele` è unico; `AllelePresence = "known" | "unknown" | "absent"`.
4. **Genotipo readonly.** Nessuna funzione di ambiente, espressione, sviluppo o rendering accetta o restituisce un `GeneticGenome` modificabile.
5. **Definizioni separate dalle regole.** `AlleleDefinition` descrive proprietà; `ExpressionRule` descrive come combinarle.
6. **Pedigree flessibile.** 0, 1 o 2 genitori; link con `organismId: null` sono legittimi.
7. **Mutazione ≠ effetto.** `MutationEvent` non contiene fitness né effetti fenotipici.

---

## 3. Registry — definizioni condivise

```ts
type LocusId = string;
type AlleleId = string;
type ChromosomeDefinitionId = string;
type HomologousGroupId = string;
type ExpressionRuleId = string;
type MutationRuleId = string;
type TraitChannelId = string; // chiave legacy o nuovo canale fenotipico
type RegistryId = string;
type SemVer = string;         // "1.0.0"

interface ChromosomeDefinition {
  readonly id: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly lengthBp: number;
  readonly centromereBp: number;
  readonly recombinationRateCmPerMb: number;
  readonly locusOrder: readonly LocusId[]; // ordinato per positionBp
}

interface LocusDefinition {
  readonly id: LocusId;
  readonly chromosomeId: ChromosomeDefinitionId;
  readonly positionBp: number;              // posizione fisica esplicita
  readonly positionCm: number;              // posizione genetica esplicita
  readonly strand: "+" | "-";
  readonly alleleCatalog: readonly AlleleId[]; // CATALOGO, non genotipo
  readonly traitChannels: readonly TraitChannelId[]; // pleiotropia
  readonly expressionRuleIds: readonly ExpressionRuleId[];
  readonly recombination: {
    readonly crossoverAllowed: boolean;
    readonly interference: number;
    readonly hotspot: boolean;
  };
  readonly ploidyConstraint?: { readonly min: number; readonly max: number };
}

interface AlleleDefinition {
  readonly id: AlleleId;
  readonly locusId: LocusId;
  readonly symbol: string;
  readonly effectProfile: Readonly<Record<TraitChannelId, number>>;
  readonly baselineActivity: number;        // 0..1
  readonly regulatoryTargets: readonly LocusId[];
  readonly interactionTags: readonly string[];
  readonly catalogOrigin: "founder" | "engine" | "migration"; // provenienza del catalogo
}
```

### 3.1 Regole di espressione

```ts
interface DominanceRule {
  readonly id: ExpressionRuleId;
  readonly kind: "complete-dominance" | "incomplete-dominance" | "codominance" | "allelic-dosage";
  readonly alleleHierarchy?: readonly AlleleId[]; // per complete/incomplete
  readonly weights?: Readonly<Record<AlleleId, number>>; // per incomplete/dosage
}

interface PolygenicRule {
  readonly id: ExpressionRuleId;
  readonly kind: "polygenic-aggregate";
  readonly locusIds: readonly LocusId[];
  readonly targetChannel: TraitChannelId;
  readonly weights: Readonly<Record<LocusId, number>>;
  readonly reducer: "sum" | "weighted-sum" | "product";
}

interface PleiotropyRule {
  readonly id: ExpressionRuleId;
  readonly kind: "pleiotropic-projection";
  readonly sourceLocusIds: readonly LocusId[];
  readonly channels: readonly TraitChannelId[];
}

interface EpistasisRule {
  readonly id: ExpressionRuleId;
  readonly kind: "epistatic-interaction";
  readonly targetLocusIds: readonly LocusId[];
  readonly modifierLocusIds: readonly LocusId[];
  readonly operation: "suppress" | "enhance" | "mask" | "additive-modifier";
  readonly strength: number;
}

interface RegulatoryRule {
  readonly id: ExpressionRuleId;
  readonly kind: "regulatory-modulation" | "gene-gene-interaction";
  readonly regulatorLocusIds: readonly LocusId[];
  readonly targetLocusIds: readonly LocusId[];
  readonly response: "linear" | "saturating" | "threshold";
  readonly parameters: Readonly<Record<string, number>>;
}

type ExpressionRule =
  | DominanceRule | PolygenicRule | PleiotropyRule | EpistasisRule | RegulatoryRule;
```

Le regole sono indipendenti da `AlleleDefinition`: cambiare una regola non richiede di riscrivere gli alleli.

### 3.2 Registry

```ts
interface GenomeRegistry {
  readonly id: RegistryId;
  readonly version: SemVer;          // versione delle definizioni
  readonly engineVersion: SemVer;    // versione delle regole
  readonly chromosomes: Readonly<Record<ChromosomeDefinitionId, ChromosomeDefinition>>;
  readonly loci: Readonly<Record<LocusId, LocusDefinition>>;
  readonly alleles: Readonly<Record<AlleleId, AlleleDefinition>>;
  readonly expressionRules: Readonly<Record<ExpressionRuleId, ExpressionRule>>;
  readonly mutationRules: Readonly<Record<MutationRuleId, unknown>>;
  readonly configDefaults: GenomeConfig;
  readonly fingerprint: string;
}
```

---

## 4. Genotipo individuale

```ts
type AllelePresence = "known" | "unknown" | "absent";
type ChromosomeCopyId = string; // es. "org-42:G1:mat"
type MutationEventId = string;

interface AlleleInstance {
  readonly alleleId: AlleleId | null; // null se unknown/absent
  readonly presence: AllelePresence;
  readonly source: "founder" | "inherited" | "mutation";
  readonly mutationEventIds: readonly MutationEventId[];
}

interface LocusCall {
  readonly locusId: LocusId;
  readonly positionBp: number;
  readonly allele: AlleleInstance;
}

interface Chromosome {           // SINGOLA copia fisica
  readonly copyId: ChromosomeCopyId;
  readonly definitionId: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly parentOrigin: "maternal" | "paternal" | "asexual" | "unknown";
  readonly loci: readonly LocusCall[]; // ordinato per positionBp
}

interface GeneticGenome {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly organismId: number;
  readonly ploidy: number;
  readonly chromosomes: readonly Chromosome[];
  readonly fingerprint: string;
}
```

Invarianti verificabili:

- per ogni `homologousGroup` esistono esattamente `ploidy` copie;
- ogni copia contiene un solo `LocusCall` per locus;
- se `presence = "known"` allora `alleleId` esiste nel registry e appartiene al locus;
- due copie omologhe possono avere alleli diversi allo stesso locus.

```ts
interface RecombinationTrace {
  readonly chromosomeCopyId: ChromosomeCopyId;
  readonly crossoverPositionsBp: readonly number[];
  readonly donorByInterval: readonly ChromosomeCopyId[];
  readonly interference: number;
  readonly rng: RngTrace;
}

interface Gamete {
  readonly id: string;
  readonly sourceOrganismId: number;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly chromosomes: readonly Chromosome[]; // una copia per gruppo omologo
  readonly recombinationTraces: readonly RecombinationTrace[];
}
```

---

## 5. Risoluzione, espressione, ambiente, sviluppo, fenotipo

```ts
interface ResolvedLocusCall {
  readonly chromosomeCopyId: ChromosomeCopyId;
  readonly alleleId: AlleleId | null;
  readonly presence: AllelePresence;
  readonly dosage: number;
}

interface ResolvedLocus {
  readonly locusId: LocusId;
  readonly calls: readonly ResolvedLocusCall[];
  readonly ruleIds: readonly ExpressionRuleId[];
}

interface ResolvedGenotype {
  readonly organismId: number;
  readonly registryVersion: SemVer;
  readonly ploidy: number;
  readonly loci: Readonly<Record<LocusId, ResolvedLocus>>;
}

interface GeneticExpression {
  readonly organismId: number;
  readonly channels: Readonly<Record<TraitChannelId, number>>; // potenziale, senza ambiente
  readonly appliedRules: readonly ExpressionRuleId[];
  readonly derivation: "DERIVED";
}

interface EnvironmentalContext {
  readonly tick: number;
  readonly biome: string;
  readonly temperature: number;
  readonly water: number;
  readonly foodAvailability: number;
  readonly predationPressure: number;
  readonly crowding: number;
  readonly source: "OBSERVED" | "DERIVED";
}

interface PlasticResponse {
  readonly organismId: number;
  readonly tick: number;
  readonly channelDeltas: Readonly<Record<TraitChannelId, number>>;
  readonly heritable: false;
}

interface DevelopmentalState {
  readonly organismId: number;
  readonly tick: number;
  readonly age: number;
  readonly stage: string;                  // id configurabile, non hardcodato
  readonly growth: Readonly<Record<string, number>>; // struttura → fattore
  readonly heritable: false;
}

type TraitProvenance =
  | "gene-direct" | "gene-derived" | "environmental"
  | "plastic" | "developmental" | "undetermined";

interface FinalPhenotype {
  readonly organismId: number;
  readonly tick: number;
  readonly channels: Readonly<Record<TraitChannelId, number>>;
  readonly provenance: Readonly<Record<TraitChannelId, TraitProvenance>>;
  readonly genotypeFingerprint: string; // riferimento, mai modificato
}
```

**Firme vietate:**

```ts
// NON esistono:
applyEnvironment(genome: GeneticGenome, env: EnvironmentalContext): GeneticGenome;
develop(genome: GeneticGenome, ...): GeneticGenome;
```

Le firme corrette sono:

```ts
regulate(expr: GeneticExpression, env: EnvironmentalContext): PlasticResponse;
develop(genomeFingerprint: string, expr: GeneticExpression, plastic: PlasticResponse, state: DevelopmentalState): FinalPhenotype;
```

---

## 6. Pedigree

```ts
type ReproductionMode = "sexual" | "asexual" | "unknown";
type ParentConfidence = "known" | "partial" | "unknown";
type ParentRole = "parent-a" | "parent-b" | "mother" | "father" | "sole-parent";

interface ParentLink {
  readonly organismId: number | null; // null = genitore non conosciuto
  readonly role: ParentRole;
  readonly confidence: ParentConfidence;
  readonly gameteId?: string;
  readonly unknownReason?: "founder" | "not-observed" | "legacy-snapshot" | "migration";
}

interface PedigreeRecord {
  readonly organismId: number;
  readonly birthTick: number;
  readonly mode: ReproductionMode;
  readonly founder: boolean;
  readonly parents: readonly ParentLink[]; // 0, 1 o 2 elementi
  readonly genomeFingerprint: string;
}

interface PedigreeGraph {
  readonly records: Readonly<Record<number, PedigreeRecord>>;
}
```

Regole:

- fondatore ⇒ `parents = []`, `founder = true`;
- asessuata ⇒ esattamente 1 link con `role = "sole-parent"`;
- sessuata completa ⇒ 2 link noti; sessuata parziale ⇒ 1 noto + 1 con `organismId: null`;
- nessun ciclo genealogico;
- metriche dipendenti da entrambi i genitori sono `NON_EVALUABLE` se un link è sconosciuto.

---

## 7. Mutazioni, RNG ed effetti separati

```ts
type MutationType =
  | "point" | "insertion" | "deletion"
  | "duplication" | "structural" | "regulatory";
type MutationOrigin =
  | "germline-de-novo" | "germline-inherited"
  | "somatic" | "engine-configured" | "legacy-migration";

interface RngTrace {
  readonly algorithm: "mulberry32";
  readonly seed: number;
  readonly namespace: string;   // es. "genome.mutation.point"
  readonly salt: string;
  readonly stateBefore: number;
  readonly stateAfter: number;
  readonly drawCount: number;
  readonly engineVersion: SemVer;
}

interface MutationEvent {
  readonly id: MutationEventId;
  readonly tick: number;
  readonly type: MutationType;
  readonly origin: MutationOrigin;
  readonly organismId: number;
  readonly generation: number | null;
  readonly chromosomeCopyId: ChromosomeCopyId;
  readonly locusId: LocusId;
  readonly positionBp: number;
  readonly previousAlleleId: AlleleId | null;
  readonly previousPresence: AllelePresence;
  readonly resultingAlleleId: AlleleId | null;
  readonly resultingPresence: AllelePresence;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly causedBy: readonly MutationEventId[];
  readonly rng: RngTrace;
  readonly replay: { readonly operation: string; readonly parametersHash: string };
}

interface ExpressionDelta {
  readonly eventId: MutationEventId;
  readonly channelDeltas: Readonly<Record<TraitChannelId, number>>;
  readonly derivation: "DERIVED";
}

interface FitnessAssessment {
  readonly eventId: MutationEventId;
  readonly status: "NON_EVALUABLE";
  readonly reason: "external-controls-required";
}
```

`MutationEvent` non ha campi `fitness`, `adaptive`, `beneficial` o equivalenti. `ExpressionDelta` e `FitnessAssessment` sono prodotti da funzioni separate e mai memorizzati dentro l'evento.

---

## 8. Config, RNG, serializzazione, migrazione, versionamento

```ts
interface RngConfig {
  readonly algorithm: "mulberry32";
  readonly worldStream: "world";
  readonly derivedNamespaces: readonly string[]; // founder/meiosis/mutation/...
  readonly saltVersion: SemVer;
}

interface GenomeConfig {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly ploidy: number;
  readonly homologousGroups: readonly HomologousGroupId[];
  readonly founderStrategy: "registry-default" | "seeded-draw" | "provided";
  readonly mutationRates: Readonly<Record<MutationType, number>>;
  readonly recombination: {
    readonly crossoversPerChromosome: { readonly min: number; readonly max: number };
    readonly interference: number;
    readonly hotspots: readonly {
      readonly chromosomeId: ChromosomeDefinitionId;
      readonly positionBp: number;
      readonly weight: number;
    }[];
  };
  readonly compatibility: {
    readonly metric: "locus-distance" | "legacy-vector";
    readonly mateThreshold: number;
    readonly speciationThreshold: number;
  };
  readonly expressionPipeline: readonly ExpressionRuleId[];
  readonly missingAllelePolicy: "error" | "unknown" | "registry-default";
  readonly rng: RngConfig;
}
```

### 8.1 Serializzazione

```ts
interface SerializedGeneticGenome {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly organismId: number;
  readonly ploidy: number;
  readonly chromosomes: readonly {
    readonly copyId: ChromosomeCopyId;
    readonly definitionId: ChromosomeDefinitionId;
    readonly homologousGroup: HomologousGroupId;
    readonly parentOrigin: Chromosome["parentOrigin"];
    readonly loci: readonly {
      readonly locusId: LocusId;
      readonly positionBp: number;
      readonly alleleId: AlleleId | null;
      readonly presence: AllelePresence;
      readonly source: AlleleInstance["source"];
      readonly mutationEventIds: readonly MutationEventId[];
    }[];
  }[];
  readonly fingerprint: string;
}
```

Il registry **non** viene serializzato per organismo: vengono salvati solo `registryId`, versioni e riferimenti. Round-trip richiesto: `serialize(deserialize(s)) === s` in forma canonica.

### 8.2 Migrazione e versioni

```ts
interface VersionSet {
  readonly schemaVersion: number;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
}

interface MigrationIssue {
  readonly code: "missing-allele" | "unknown-locus" | "version-mismatch" | "policy-violation";
  readonly path: string;
  readonly detail: string;
}

interface MigrationResult<T> {
  readonly value: T | null;
  readonly from: VersionSet;
  readonly to: VersionSet;
  readonly issues: readonly MigrationIssue[];
  readonly status: "ok" | "migrated" | "unsupported" | "error";
}
```

- migrazione monotonica (`v1 → v2 → v3`), mai inversa implicita;
- idempotente: migrare due volte non produce modifiche aggiuntive;
- campi mancanti seguono `missingAllelePolicy`, mai default silenzioso in modalità validazione;
- `registryVersion` futura ⇒ `status = "unsupported"`, valore `NON_EVALUABLE`, errore esplicito;
- snapshot legacy senza `genetics` ⇒ percorso legacy invariato.

### 8.3 Matrice registry / organismo / sessione

| Struttura | Registry | Organismo | Sessione |
|---|---|---|---|
| `LocusDefinition`, `ChromosomeDefinition`, `AlleleDefinition` | ✔ | — | — |
| `ExpressionRule`, `MutationRule`, `GenomeConfig` default | ✔ | — | — |
| `Chromosome`, `AlleleInstance`, `LocusCall`, `GeneticGenome` | — | ✔ | — |
| `PedigreeRecord`, `MutationEvent`, `ResolvedGenotype`, `FinalPhenotype` | — | ✔ | — |
| `EnvironmentalContext`, `WorldSnapshot`, RNG state | — | — | ✔ |

---

## 9. API proposta

```ts
interface GenomeEngineApi {
  validateConfig(config: GenomeConfig, registry: GenomeRegistry): ValidationResult;
  validateGenome(genome: GeneticGenome, registry: GenomeRegistry): ValidationResult;

  createFounderGenome(rng: RngStream, config: GenomeConfig, registry: GenomeRegistry): GeneticGenome;
  planRecombination(genome: GeneticGenome, config: GenomeConfig, rng: RngStream): RecombinationTrace[];
  meiosis(genome: GeneticGenome, plan: readonly RecombinationTrace[], rng: RngStream): Gamete;
  fuse(a: Gamete, b: Gamete, config: GenomeConfig): GeneticGenome;
  cloneAsexual(genome: GeneticGenome, rng: RngStream, config: GenomeConfig): GeneticGenome;

  mutate(genome: GeneticGenome, rng: RngStream, config: GenomeConfig): {
    genome: GeneticGenome;
    events: readonly MutationEvent[];
  };
  assessEffects(before: GeneticGenome, after: GeneticGenome, event: MutationEvent, registry: GenomeRegistry): {
    expression: ExpressionDelta;
    fitness: FitnessAssessment;
  };

  resolveAlleles(genome: GeneticGenome, registry: GenomeRegistry): ResolvedGenotype;
  express(resolved: ResolvedGenotype, registry: GenomeRegistry, config: GenomeConfig): GeneticExpression;
  regulate(expr: GeneticExpression, env: EnvironmentalContext): PlasticResponse;
  develop(fingerprint: string, expr: GeneticExpression, plastic: PlasticResponse, state: DevelopmentalState): FinalPhenotype;

  recordBirth(record: PedigreeRecord, graph: PedigreeGraph): PedigreeGraph;
  inbreedingCoefficient(id: number, graph: PedigreeGraph): number | "NON_EVALUABLE";

  serialize(genome: GeneticGenome): SerializedGeneticGenome;
  deserialize(raw: unknown, registry: GenomeRegistry): MigrationResult<GeneticGenome>;
  migrate(raw: unknown, from: VersionSet, registry: GenomeRegistry): MigrationResult<GeneticGenome>;
}
```

`RngStream` è un handle derivato da `deriveRng(worldState, namespace, salt, config.rng)`; non è il RNG del mondo.

---

## 10. Compatibilità con i contratti condivisi

| Contratto | Impatto | Azione |
|---|---|---|
| `Genome` (`types/index.ts`) | eventuale campo opzionale `genetics` | checkpoint §13 |
| `Phenotype` | nessun nuovo campo obbligatorio nel primo rilascio | nessuna |
| `Organism` | nessun campo obbligatorio aggiunto | nessuna |
| `WorldSnapshot` | solo versioni/field opzionali | checkpoint §13 |
| `RenderFrame` | solo canali opzionali + maschera | checkpoint §13 |
| `GENE_REGISTRY` | aggiunta di metadati, nessuna rinumerazione | PR dedicata |
| `Random` | nessuna modifica, solo stream derivati | nessuna |
| G3.1 / persistence / simulazione core | nessuna modifica in questa revisione | nessuna |

---

## 11. Verifica dei contratti (progettuale, non eseguita)

Ogni contratto proposto dovrà avere test che verifichino:

- presenza/assenza del campo opzionale `genetics`;
- due copie omologhe e un allele per copia per locus;
- catalogo alleli mai usato come genotipo;
- posizione loci e piano di ricombinazione riproducibili;
- pedigree con 0/1/2 genitori e link parziali;
- completezza dei campi `MutationEvent` e replay da `RngTrace`;
- assenza di campi fitness nell'evento di mutazione;
- firme che impediscono la scrittura del genotipo da ambiente/sviluppo;
- round-trip canonico e migrazione idempotente;
- non consumo del RNG del mondo;
- fallback legacy quando `genetics` è assente.

Il piano operativo con campioni e seed è in `GENOME_VALIDATION_PLAN.md` §6. Nessuno di questi test è stato eseguito in questa revisione.
