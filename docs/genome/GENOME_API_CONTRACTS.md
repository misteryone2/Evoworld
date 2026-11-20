# GENOME — Contratti API completi (Rev 2)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 2 (correzioni: stati allelici espliciti, provenienza generalizzata, contratti quantitativi, replay compatibile, ambiente Planet Engine).  
**Stato:** contratti **osservati** invariati + contratti **proposti** non implementati e non approvati. Richiedono nuova review e checkpoint `GENOME_ARCHITECTURE.md` §13. Nessuna modifica al codice di produzione.

---

## 1. Contratti esistenti (OBSERVED — invariati)

Riferimento invariato alla Rev 1/Rev 0: `BaseGenome`/`Genome` (`types/index.ts`), `GeneDefinition`/`GENE_REGISTRY` (`simulation/biology/geneRegistry.ts`), `Phenotype`, `Organism`, `WorldSnapshot`, `RenderFrame`, `PhenotypeProfile`, funzioni `randomGenome`/`inheritGenome`/`cloneWithMutation`, `getGene`/`inheritExt`/`cloneExt`/`deriveGeneRandom`, `migrateGenome`/`migrateSnapshot`. Nessun contratto esistente è modificato in questa revisione.

---

## 2. Regole fondamentali (Rev 2)

1. **Catalogo ≠ genotipo.** Registry = definizioni; genotipo = occorrenze/stati individuali.
2. **Copia singola.** `Chromosome` è una copia fisica; ploidia parametrica.
3. **Stati allelici non ambigui.** Vietato usare `null` o un unico token per rappresentare sia assenza biologica sia dato sconosciuto/non valutabile.
4. **Provenienza tracciabile e generale.** Contributi via `contributionId`/`contributorId`/`gameteId`; nessun vincolo fisso `maternal|paternal` né limite a 2 contributori.
5. **Quantitativo e deterministico.** Canali con unità/intervalli/normalizzazione; conflitti risolti deterministicamente o marcati `non-evaluable`.
6. **Replay verificabile.** Incompatibilità di versioni/parametri/algoritmo ⇒ errore esplicito.
7. **Ambiente esterno autorevole.** `EnvironmentalSnapshot` deriva da Planet Engine; nessun modello ambientale parallelo in GENOME.
8. **Maturità esplicita.** Tutti i contratti sotto sono **progettati**, non implementati/integrati/attivi.

---

## 3. Registry e definizioni quantitative

```ts
type SemVer = string;
type LocusId = string;
type AlleleId = string;
type ChromosomeDefinitionId = string;
type HomologousGroupId = string;
type TraitChannelId = string;
type ExpressionRuleId = string;
type MutationRuleId = string;
type RegistryId = string;

interface TraitChannelDefinition {
  readonly id: TraitChannelId;
  readonly description: string;
  readonly unit: string; // es. "ratio", "1", "index", unità dichiarata
  readonly domain: { readonly min: number; readonly max: number };
  readonly normalization: {
    readonly method: "linear" | "saturating" | "none" | "custom";
    readonly parameters: Readonly<Record<string, number | string>>;
  };
  readonly clampPolicy: "clamp" | "error" | "mark-non-evaluable";
  readonly missingInputPolicy:
    | "propagate-non-evaluable"
    | "propagate-undetermined"
    | "explicit-fallback";
  readonly fallbackValue?: number; // usato solo se policy esplicita
}

interface ChromosomeDefinition {
  readonly id: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly lengthBp: number;
  readonly centromereBp: number;
  readonly recombinationRateCmPerMb: number;
  readonly locusOrder: readonly LocusId[];
}

interface LocusDefinition {
  readonly id: LocusId;
  readonly chromosomeId: ChromosomeDefinitionId;
  readonly positionBp: number;
  readonly positionCm: number;
  readonly strand: "+" | "-";
  readonly alleleCatalog: readonly AlleleId[];
  readonly traitChannels: readonly TraitChannelId[];
  readonly expressionRuleIds: readonly ExpressionRuleId[];
  readonly recombination: {
    readonly crossoverAllowed: boolean;
    readonly interference: number;
    readonly hotspot: boolean;
  };
}

interface AlleleDefinition {
  readonly id: AlleleId;
  readonly locusId: LocusId;
  readonly symbol: string;
  readonly effectProfile: Readonly<Record<TraitChannelId, number>>; // scala coerente al canale
  readonly baselineActivity: number; // normalizzato [0,1] salvo diversa unità dichiarata
  readonly regulatoryTargets: readonly LocusId[];
  readonly interactionTags: readonly string[];
  readonly catalogOrigin: "founder" | "engine" | "migration";
}
```

### 3.1 Regole di espressione e conflitti

```ts
type ConflictResolution =
  | { readonly strategy: "priority-order"; readonly priorities: readonly ExpressionRuleId[] }
  | { readonly strategy: "weighted-merge"; readonly weights: Readonly<Record<ExpressionRuleId, number>> }
  | { readonly strategy: "mark-non-evaluable" };

interface ExpressionRuleBase {
  readonly id: ExpressionRuleId;
  readonly targetChannels: readonly TraitChannelId[];
  readonly priority: number;
  readonly conflictResolution: ConflictResolution;
}

interface DominanceRule extends ExpressionRuleBase {
  readonly kind: "complete-dominance" | "incomplete-dominance" | "codominance" | "allelic-dosage";
  readonly alleleOrder?: readonly AlleleId[];
  readonly weights?: Readonly<Record<AlleleId, number>>;
}

interface PolygenicRule extends ExpressionRuleBase {
  readonly kind: "polygenic-aggregate";
  readonly locusIds: readonly LocusId[];
  readonly reducer: "sum" | "weighted-sum" | "product";
  readonly weights?: Readonly<Record<LocusId, number>>;
}

interface EpistasisRule extends ExpressionRuleBase {
  readonly kind: "epistatic-interaction";
  readonly targetLocusIds: readonly LocusId[];
  readonly modifierLocusIds: readonly LocusId[];
  readonly operation: "suppress" | "enhance" | "mask" | "additive-modifier";
  readonly strength: number;
}

interface RegulatoryOrInteractionRule extends ExpressionRuleBase {
  readonly kind: "pleiotropic-projection" | "regulatory-modulation" | "gene-gene-interaction";
  readonly sourceLocusIds: readonly LocusId[];
  readonly targetLocusIds?: readonly LocusId[];
  readonly parameters: Readonly<Record<string, number | string>>;
}

type ExpressionRule = DominanceRule | PolygenicRule | EpistasisRule | RegulatoryOrInteractionRule;

interface GenomeRegistry {
  readonly id: RegistryId;
  readonly version: SemVer;
  readonly engineVersion: SemVer;
  readonly schemaVersion: number;
  readonly traitChannels: Readonly<Record<TraitChannelId, TraitChannelDefinition>>;
  readonly chromosomes: Readonly<Record<ChromosomeDefinitionId, ChromosomeDefinition>>;
  readonly loci: Readonly<Record<LocusId, LocusDefinition>>;
  readonly alleles: Readonly<Record<AlleleId, AlleleDefinition>>;
  readonly expressionRules: Readonly<Record<ExpressionRuleId, ExpressionRule>>;
  readonly mutationRules: Readonly<Record<MutationRuleId, unknown>>;
  readonly fingerprint: string;
}
```

Il motore non dipende da un numero prefissato di geni: loci/canali/regole sono definiti dal registry.

---

## 4. Genotipo, stati allelici e provenienza

```ts
type AlleleStateKind = "identified" | "biologically-absent" | "undetermined" | "non-evaluable";

type AlleleState =
  | { readonly kind: "identified"; readonly alleleId: AlleleId }
  | { readonly kind: "biologically-absent"; readonly reason: "deletion" | "structural-absence" | "null-allele" }
  | { readonly kind: "undetermined"; readonly reason: "data-unavailable" | "not-yet-determined" | "legacy-missing" }
  | { readonly kind: "non-evaluable"; readonly reason: string; readonly context?: string };

interface GeneticContribution {
  readonly contributionId: string;
  readonly contributorId: string | null; // identità contributore, se nota
  readonly organismId: number | null;
  readonly gameteId: string | null;
  readonly confidence: "known" | "partial" | "unknown" | "non-evaluable";
  readonly role: string | null; // ruolo biologico opzionale, non identità
}

interface LocusCall {
  readonly locusId: LocusId;
  readonly positionBp: number;
  readonly alleleState: AlleleState;
  readonly source: "founder" | "inherited" | "mutation" | "migration";
  readonly mutationEventIds: readonly string[];
}

interface Chromosome {
  readonly copyId: string;
  readonly definitionId: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly contributionId: string; // collega a GeneticContribution
  readonly loci: readonly LocusCall[];
}

interface GeneticGenome {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly organismId: number;
  readonly ploidy: number;
  readonly chromosomes: readonly Chromosome[]; // ploidy copie per gruppo omologo
  readonly contributions: Readonly<Record<string, GeneticContribution>>;
  readonly fingerprint: string;
}
```

Invarianti: un `LocusCall` per locus per copia; `identified` ⇒ `alleleId` valido nel registry/versione; `biologically-absent`/`undetermined`/`non-evaluable` ⇒ nessun `alleleId`; numero di copie coerente con ploidia/gruppi.

```ts
interface RecombinationInterval {
  readonly fromBp: number;
  readonly toBp: number;
  readonly donorCopyId: string;
  readonly donorContributionId: string;
}

interface RecombinationTrace {
  readonly homologousGroup: HomologousGroupId;
  readonly crossoverPositionsBp: readonly number[];
  readonly intervals: readonly RecombinationInterval[];
  readonly rng: RngTrace;
}

interface Gamete {
  readonly id: string;
  readonly sourceOrganismId: number;
  readonly contributionId: string;
  readonly chromosomes: readonly Chromosome[]; // una copia per gruppo omologo
  readonly recombinationTraces: readonly RecombinationTrace[];
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
}
```

---

## 5. Risoluzione, espressione, sviluppo, fenotipo

```ts
type ChannelState = "value" | "biologically-absent" | "undetermined" | "non-evaluable";

interface ResolvedLocusCall {
  readonly chromosomeCopyId: string;
  readonly contributionId: string;
  readonly alleleState: AlleleState;
  readonly dosageContribution: number | null; // null se non valutabile
}

interface ResolvedLocus {
  readonly locusId: LocusId;
  readonly calls: readonly ResolvedLocusCall[];
  readonly state: "resolved" | "partial" | "non-evaluable";
}

interface ResolvedGenotype {
  readonly organismId: number;
  readonly registryVersion: SemVer;
  readonly loci: Readonly<Record<LocusId, ResolvedLocus>>;
}

interface ChannelValue {
  readonly channelId: TraitChannelId;
  readonly unit: string;
  readonly state: ChannelState;
  readonly value: number | null;
  readonly reason?: string;
  readonly appliedRuleIds: readonly ExpressionRuleId[];
}

interface GeneticExpression {
  readonly organismId: number;
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
}

interface PlasticResponse {
  readonly organismId: number;
  readonly tick: number;
  readonly channelDeltas: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly heritable: false;
}

interface DevelopmentalState {
  readonly organismId: number;
  readonly tick: number;
  readonly age: number;
  readonly stage: string;
  readonly growth: Readonly<Record<string, number>>;
  readonly heritable: false;
}

interface FinalPhenotype {
  readonly organismId: number;
  readonly tick: number;
  readonly genotypeFingerprint: string;
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly provenance: Readonly<Record<TraitChannelId, string>>;
}
```

Firme vietate: qualunque funzione che restituisca `GeneticGenome` da ambiente, plasticità, sviluppo o fenotipo.

---

## 6. Pedigree

```ts
type ReproductionMode = "sexual" | "asexual" | "polyploid" | "multi-contributor" | "unknown";

interface PedigreeRecord {
  readonly organismId: number;
  readonly birthTick: number;
  readonly mode: ReproductionMode;
  readonly founder: boolean;
  readonly contributors: readonly GeneticContribution[]; // 0..N
  readonly contributionsUsed: readonly string[]; // contributionId delle copie ereditate
  readonly genomeFingerprint: string;
}

interface PedigreeGraph {
  readonly records: Readonly<Record<number, PedigreeRecord>>;
}
```

Regole: fondatore ⇒ `contributors=[]`, `founder=true`; asessuato ⇒ almeno un contributo sorgente tracciabile; parziale ⇒ contributor con `confidence`/id nulli; nessun ciclo; metriche su rami ignoti/non valutabili ⇒ `NON_EVALUABLE`.

---

## 7. Mutazioni, RNG, replay e ambiente

```ts
type MutationType = "point" | "insertion" | "deletion" | "duplication" | "structural" | "regulatory";
type MutationOrigin = "germline-de-novo" | "germline-inherited" | "somatic" | "engine-configured" | "legacy-migration";

interface RngTrace {
  readonly algorithm: string;
  readonly algorithmVersion: SemVer;
  readonly rootSeed: number | string;
  readonly namespace: string;
  readonly salt: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly drawCount: number;
  readonly engineVersion: SemVer;
}

interface ReplayCompatibilityInput {
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly registryFingerprint: string;
  readonly engineVersion: SemVer;
  readonly schemaVersion: number;
  readonly rngAlgorithm: string;
  readonly rngAlgorithmVersion: SemVer;
  readonly parametersHash: string;
}

interface ReplayResult<T> {
  readonly status: "ok" | "incompatible";
  readonly value: T | null;
  readonly mismatches: readonly { readonly field: string; readonly expected: string; readonly actual: string }[];
}

interface MutationEvent {
  readonly id: string;
  readonly tick: number;
  readonly type: MutationType;
  readonly origin: MutationOrigin;
  readonly organismId: number;
  readonly generation: number | null;
  readonly chromosomeCopyId: string;
  readonly contributionId: string;
  readonly locusId: LocusId;
  readonly positionBp: number;
  readonly previousState: AlleleState;
  readonly resultingState: AlleleState;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly schemaVersion: number;
  readonly causedBy: readonly string[];
  readonly rng: RngTrace;
  readonly replay: ReplayCompatibilityInput & { readonly operation: string };
}

interface ExpressionDelta {
  readonly eventId: string;
  readonly channelDeltas: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
}

interface FitnessAssessment {
  readonly eventId: string;
  readonly status: "NON_EVALUABLE";
  readonly reason: "external-controls-required";
}
```

`MutationEvent` non contiene fitness né effetti fenotipici. `replayEvent` deve restituire `incompatible` (non un valore) se cambia registry, engine, schema, parametri o algoritmo/versione RNG.

```ts
type DataAvailability = "OBSERVED" | "DERIVED" | "MISSING" | "NON_EVALUABLE";

interface EnvironmentalField<T> {
  readonly value: T | null;
  readonly unit: string;
  readonly availability: DataAvailability;
  readonly source: string;
  readonly reason?: string;
}

interface EnvironmentalSnapshot {
  readonly source: "planet-engine";
  readonly contractVersion: SemVer;
  readonly snapshotVersion: string;
  readonly producerId: string;
  readonly tick: number;
  readonly timeReference: string;
  readonly coordinateSystem: string;
  readonly spatialGranularity: string; // es. cell, chunk, region
  readonly fields: Readonly<Record<string, EnvironmentalField<number | string>>>;
}
```

GENOME consuma questo snapshot in sola lettura tramite adattatore; non mantiene una copia autorevole indipendente.

---

## 8. Config, serializzazione, migrazione

```ts
interface GenomeConfig {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly planetEnvironmentContractVersion: SemVer;
  readonly ploidy: number;
  readonly homologousGroups: readonly HomologousGroupId[];
  readonly founderStrategy: "registry-default" | "seeded-draw" | "provided";
  readonly mutationRates: Readonly<Record<MutationType, number>>;
  readonly recombination: {
    readonly crossoversPerChromosome: { readonly min: number; readonly max: number };
    readonly interference: number;
    readonly hotspotsEnabled: boolean;
  };
  readonly expressionPipeline: readonly ExpressionRuleId[];
  readonly missingStatePolicy: "error" | "propagate" | "explicit-fallback";
  readonly rng: {
    readonly algorithm: string;
    readonly algorithmVersion: SemVer;
    readonly derivedNamespaces: readonly string[];
  };
}

interface VersionSet {
  readonly schemaVersion: number;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly rngAlgorithmVersion: SemVer;
}

interface MigrationResult<T> {
  readonly status: "ok" | "migrated" | "unsupported" | "error";
  readonly value: T | null;
  readonly from: VersionSet;
  readonly to: VersionSet;
  readonly issues: readonly { readonly code: string; readonly path: string; readonly detail: string }[];
}
```

Serializzazione: round-trip canonico; preservare `AlleleState` e stati non valutabili senza collasso. Migrazione: monotonica, idempotente, nessun default silenzioso in validazione.

---

## 9. API proposta (progettata)

```ts
interface GenomeEngineApi {
  validateGenome(genome: GeneticGenome, registry: GenomeRegistry): ValidationResult;
  createFounderGenome(input: FounderInput): GeneticGenome;
  planRecombination(input: RecombinationInput): RecombinationTrace[];
  formGamete(input: GameteInput): Gamete;
  fuseContributions(input: FusionInput): GeneticGenome;
  reproduceAsexual(input: AsexualInput): GeneticGenome;
  mutate(input: MutationInput): { genome: GeneticGenome; events: readonly MutationEvent[] };
  replayEvent(event: MutationEvent, context: ReplayCompatibilityInput): ReplayResult<MutationEvent>;
  resolveAlleles(genome: GeneticGenome, registry: GenomeRegistry): ResolvedGenotype;
  express(resolved: ResolvedGenotype, registry: GenomeRegistry, config: GenomeConfig): GeneticExpression;
  regulate(expr: GeneticExpression, env: EnvironmentalSnapshot, config: GenomeConfig): PlasticResponse;
  develop(input: DevelopmentInput): FinalPhenotype;
  serialize(genome: GeneticGenome): unknown;
  deserialize(raw: unknown, registry: GenomeRegistry): MigrationResult<GeneticGenome>;
  migrate(raw: unknown, from: VersionSet, to: VersionSet): MigrationResult<GeneticGenome>;
}
```

Tutte le API sopra sono **progettate**. Nessuna è implementata, integrata o attiva in Rev 2.

---

## 10. Compatibilità e verifiche

- Nessun impatto applicato a contratti condivisi esistenti in Rev 2.
- Future modifiche a `types/index.ts`, snapshot, worker o renderer richiedono checkpoint §13.
- Verifica progettuale richiesta: distinzione stati allelici, provenienza N-contributori, replay incompatibile esplicito, propagazione stati in espressione/fenotipo, round-trip e migrazione, non-consumo world RNG, fallback legacy. Piano operativo in `GENOME_VALIDATION_PLAN.md` §6.
