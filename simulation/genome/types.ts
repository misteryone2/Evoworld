export type SemVer = string;
export type LocusId = string;
export type AlleleId = string;
export type ChromosomeDefinitionId = string;
export type HomologousGroupId = string;
export type TraitChannelId = string;
export type ExpressionRuleId = string;
export type MutationRuleId = string;
export type CustomFunctionId = string;
export type RegistryId = string;
export type UnitId = string;

export type FiniteNumber = number;

export type ValidationIssue = {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
};

export type ValidationResult = {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
};

export interface TraitChannelDefinition {
  readonly id: TraitChannelId;
  readonly description: string;
  readonly unit: UnitId;
  readonly semantics: string;
  readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber };
  readonly normalization: {
    readonly method: "linear" | "saturating" | "none" | "custom";
    readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
    readonly customFunctionId?: CustomFunctionId;
    readonly customFunctionVersion?: SemVer;
  };
  readonly clampPolicy: "clamp" | "error" | "mark-non-evaluable";
  readonly missingInputPolicy:
    | "propagate-non-evaluable"
    | "propagate-undetermined"
    | "explicit-fallback";
  readonly fallbackValue?: FiniteNumber;
}

export interface ChromosomeDefinition {
  readonly id: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly lengthBp: number;
  readonly centromereBp: number;
  readonly recombinationRateCmPerMb: FiniteNumber;
  readonly locusOrder: readonly LocusId[];
}

export interface LocusDefinition {
  readonly id: LocusId;
  readonly chromosomeId: ChromosomeDefinitionId;
  readonly positionBp: number;
  readonly positionCm: FiniteNumber;
  readonly strand: "+" | "-";
  readonly alleleCatalog: readonly AlleleId[];
  readonly traitChannels: readonly TraitChannelId[];
  readonly expressionRuleIds: readonly ExpressionRuleId[];
  readonly recombination: {
    readonly crossoverAllowed: boolean;
    readonly interference: FiniteNumber;
    readonly hotspot: boolean;
  };
}

export interface AlleleDefinition {
  readonly id: AlleleId;
  readonly locusId: LocusId;
  readonly symbol: string;
  readonly effectProfile: Readonly<Record<TraitChannelId, FiniteNumber>>;
  readonly baselineActivity: FiniteNumber;
  readonly regulatoryTargets: readonly LocusId[];
  readonly interactionTags: readonly string[];
  readonly catalogOrigin: "founder" | "engine" | "migration";
}

export interface CustomFunctionSignature {
  readonly inputs: readonly {
    readonly name: string;
    readonly unit: UnitId;
    readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber };
  }[];
  readonly output: {
    readonly unit: UnitId;
    readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber };
  };
}

export interface CustomFunctionImplementationRef {
  readonly kind: "registered-implementation";
  readonly implementationId: string;
  readonly implementationHash?: string;
}

export interface CustomFunctionDefinition {
  readonly functionId: CustomFunctionId;
  readonly version: SemVer;
  readonly signature: CustomFunctionSignature;
  readonly implementation: CustomFunctionImplementationRef;
  readonly deterministic: true;
  readonly determinismContract: string;
  readonly replayCompatible: boolean;
  readonly serializationCompatible: boolean;
}

export type CustomFunctionRegistry = Readonly<Record<string, CustomFunctionDefinition>>;

export type ConflictResolution =
  | { readonly strategy: "priority-order"; readonly priorities: readonly ExpressionRuleId[] }
  | { readonly strategy: "weighted-merge"; readonly weights: Readonly<Record<ExpressionRuleId, FiniteNumber>> }
  | { readonly strategy: "mark-non-evaluable"; readonly reason: string };

export interface ExpressionRuleBase {
  readonly id: ExpressionRuleId;
  readonly targetChannels: readonly TraitChannelId[];
  readonly priority: number;
  readonly conflictResolution: ConflictResolution;
}

export interface DominanceRule extends ExpressionRuleBase {
  readonly kind: "complete-dominance" | "incomplete-dominance" | "codominance" | "allelic-dosage";
  readonly alleleOrder?: readonly AlleleId[];
  readonly weights?: Readonly<Record<AlleleId, FiniteNumber>>;
}

export interface PolygenicRule extends ExpressionRuleBase {
  readonly kind: "polygenic-aggregate";
  readonly locusIds: readonly LocusId[];
  readonly reducer: "sum" | "weighted-sum" | "product";
  readonly weights?: Readonly<Record<LocusId, FiniteNumber>>;
  readonly weightSemantics?: "normalized" | "unnormalized";
}

export interface EpistasisRule extends ExpressionRuleBase {
  readonly kind: "epistatic-interaction";
  readonly targetLocusIds: readonly LocusId[];
  readonly modifierLocusIds: readonly LocusId[];
  readonly operation: "suppress" | "enhance" | "mask" | "additive-modifier";
  readonly strength: FiniteNumber;
}

export interface RegulatoryOrInteractionRule extends ExpressionRuleBase {
  readonly kind: "pleiotropic-projection" | "regulatory-modulation" | "gene-gene-interaction";
  readonly sourceLocusIds: readonly LocusId[];
  readonly targetLocusIds?: readonly LocusId[];
  readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
}

export type ExpressionRule =
  | DominanceRule
  | PolygenicRule
  | EpistasisRule
  | RegulatoryOrInteractionRule;

export interface GenomeRegistry {
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
  readonly customFunctions: CustomFunctionRegistry;
  readonly fingerprint: string;
}

export type AlleleState =
  | { readonly kind: "identified"; readonly alleleId: AlleleId }
  | { readonly kind: "biologically-absent"; readonly reason: "deletion" | "structural-absence" | "null-allele" }
  | { readonly kind: "undetermined"; readonly reason: "data-unavailable" | "not-yet-determined" | "legacy-missing" }
  | { readonly kind: "non-evaluable"; readonly reason: string; readonly context?: string };

export type PloidyModel =
  | {
      readonly kind: "uniform";
      readonly byGroup: Readonly<Record<HomologousGroupId, number>>;
      readonly globalPloidy: number;
    }
  | {
      readonly kind: "aneuploid";
      readonly byGroup: Readonly<Record<HomologousGroupId, number>>;
      readonly globalPloidy: null;
    };

export interface GeneticContribution {
  readonly contributionId: string;
  readonly contributorId: string | null;
  readonly organismId: number | null;
  readonly gameteId: string | null;
  readonly confidence: "known" | "partial" | "unknown" | "non-evaluable";
  readonly role: string | null;
}

export interface LocusCall {
  readonly locusId: LocusId;
  readonly positionBp: number;
  readonly alleleState: AlleleState;
  readonly source: "founder" | "inherited" | "mutation" | "migration";
  readonly mutationEventIds: readonly string[];
}

export interface Chromosome {
  readonly copyId: string;
  readonly definitionId: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly contributionId: string;
  readonly loci: readonly LocusCall[];
}

export interface GeneticGenome {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly organismId: number;
  readonly ploidyModel: PloidyModel;
  readonly chromosomes: readonly Chromosome[];
  readonly contributions: Readonly<Record<string, GeneticContribution>>;
  readonly fingerprint: string;
}

export type ReproductionMode = "sexual" | "asexual" | "unknown";
export type GameteFormationMode = "meiotic" | "amitotic" | "apomictic" | "none" | "unknown";
export type ContributorSelectionMode = "pair" | "single" | "multi" | "none" | "unknown";
export type GametePloidy = Readonly<Record<HomologousGroupId, number>>;

export interface SegregationRule {
  readonly ruleId: string;
  readonly version: SemVer;
  readonly kind: "disomic" | "polysomic" | "custom" | "none" | "unknown";
  readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
}

export type MeioticAnomaly =
  | { readonly kind: "none" }
  | { readonly kind: "non-disjunction"; readonly group: HomologousGroupId; readonly details?: string }
  | { readonly kind: "unbalanced-gamete"; readonly groups: readonly HomologousGroupId[]; readonly details?: string }
  | { readonly kind: "custom"; readonly code: string; readonly details?: string };

export interface RecombinationInterval {
  readonly fromBp: number;
  readonly toBp: number;
  readonly donorCopyId: string;
  readonly donorContributionId: string;
  readonly intergenic?: boolean;
}

export interface RecombinationTrace {
  readonly homologousGroup: HomologousGroupId;
  readonly crossoverPositionsBp: readonly number[];
  readonly intervals: readonly RecombinationInterval[];
  readonly segregationRuleApplied: SegregationRule;
  readonly meioticAnomaly: MeioticAnomaly;
  readonly rng: RngTrace;
}

export interface Gamete {
  readonly id: string;
  readonly sourceOrganismId: number;
  readonly contributionId: string;
  readonly chromosomes: readonly Chromosome[];
  readonly gametePloidy: GametePloidy;
  readonly recombinationTraces: readonly RecombinationTrace[];
  readonly formationMode: GameteFormationMode;
  readonly segregationRule: SegregationRule;
  readonly meioticAnomalies: readonly MeioticAnomaly[];
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
}

export interface PedigreeRecord {
  readonly organismId: number;
  readonly birthTick: number;
  readonly reproductionMode: ReproductionMode;
  readonly gameteFormationMode: GameteFormationMode;
  readonly contributorSelectionMode: ContributorSelectionMode;
  readonly ploidyModel: PloidyModel;
  readonly founder: boolean;
  readonly contributors: readonly GeneticContribution[];
  readonly contributionsUsed: readonly string[];
  readonly genomeFingerprint: string;
}

export interface PedigreeGraph {
  readonly records: Readonly<Record<number, PedigreeRecord>>;
}

export type ChannelState = "value" | "biologically-absent" | "undetermined" | "non-evaluable";

export interface ResolvedLocusCall {
  readonly chromosomeCopyId: string;
  readonly contributionId: string;
  readonly alleleState: AlleleState;
  readonly dosageContribution: FiniteNumber | null;
}

export interface ResolvedLocus {
  readonly locusId: LocusId;
  readonly calls: readonly ResolvedLocusCall[];
  readonly state: "resolved" | "partial" | "non-evaluable";
}

export interface ResolvedGenotype {
  readonly organismId: number;
  readonly registryVersion: SemVer;
  readonly loci: Readonly<Record<LocusId, ResolvedLocus>>;
}

export interface ChannelValue {
  readonly channelId: TraitChannelId;
  readonly unit: UnitId;
  readonly state: ChannelState;
  readonly value: FiniteNumber | null;
  readonly reason?: string;
  readonly appliedRuleIds: readonly ExpressionRuleId[];
}

export interface GeneticExpression {
  readonly organismId: number;
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
  readonly fingerprint: string;
}

export interface PlasticResponse {
  readonly organismId: number;
  readonly tick: number;
  readonly channelDeltas: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
  readonly heritable: false;
  readonly fingerprint: string;
}

export interface DevelopmentProcessState {
  readonly processId: string;
  readonly status: "active" | "completed" | "suspended" | "undetermined" | "non-evaluable";
  readonly progress: FiniteNumber | null;
  readonly unit: UnitId | null;
  readonly reason?: string;
}

export interface DevelopmentalConditionRef {
  readonly source: "environmental" | "plastic";
  readonly refId: string;
  readonly relevance: string;
}

export interface DevelopmentalState {
  readonly organismId: number;
  readonly tick: number;
  readonly tickReference: string;
  readonly age: FiniteNumber;
  readonly ageUnit: UnitId;
  readonly stage: string;
  readonly stageStatus: "value" | "undetermined" | "non-evaluable";
  readonly growth: Readonly<Record<string, DevelopmentProcessState>>;
  readonly maturation: Readonly<Record<string, DevelopmentProcessState>>;
  readonly processes: Readonly<Record<string, DevelopmentProcessState>>;
  readonly relevantConditions: readonly DevelopmentalConditionRef[];
  readonly expressionRef: string;
  readonly plasticityRef: string | null;
  readonly heritable: false;
}

export interface FinalPhenotype {
  readonly organismId: number;
  readonly tick: number;
  readonly genotypeFingerprint: string;
  readonly expressionRef: string;
  readonly plasticityRef: string | null;
  readonly developmentalStateRef: string;
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly provenance: Readonly<Record<TraitChannelId, string>>;
  readonly derivation: "DERIVED";
}

export type MutationScope = "point" | "local" | "interval" | "chromosomal";
export type MutationOrigin = "germline-de-novo" | "germline-inherited" | "somatic" | "engine-configured" | "legacy-migration";

export interface AffectedLocusState {
  readonly locusId: LocusId;
  readonly chromosomeCopyId: string;
  readonly positionBp: number | null;
  readonly intervalBp: { readonly from: number; readonly to: number } | null;
  readonly previousState: AlleleState;
  readonly resultingState: AlleleState;
}

export interface AffectedInterval {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly chromosomeCopyId: string | null;
  readonly fromBp: number;
  readonly toBp: number;
  readonly intergenic: boolean;
}

export interface GenomicSegment {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly fromBp: number;
  readonly toBp: number;
  readonly orientation: "forward" | "reverse";
  readonly loci: readonly AffectedLocusState[];
  readonly payloadRef?: string;
}

export interface ChromosomeStructureRef {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly chromosomeCopyId: string;
  readonly homologousGroup: HomologousGroupId;
  readonly interval: { readonly fromBp: number; readonly toBp: number } | null;
}

export interface RngTrace {
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

export interface ReplayCompatibilityInput {
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly registryFingerprint: string;
  readonly engineVersion: SemVer;
  readonly schemaVersion: number;
  readonly rngAlgorithm: string;
  readonly rngAlgorithmVersion: SemVer;
  readonly parametersHash: string;
  readonly customFunctionRegistryFingerprint?: string;
}

export type ReplayMismatch = { readonly field: string; readonly expected: string; readonly actual: string };
export type ReplayResult<T> =
  | { readonly status: "ok"; readonly value: T; readonly mismatches: readonly [] }
  | { readonly status: "incompatible"; readonly value: null; readonly mismatches: readonly [ReplayMismatch, ...ReplayMismatch[]] };

interface MutationEventBase {
  readonly id: string;
  readonly tick: number;
  readonly origin: MutationOrigin;
  readonly organismId: number;
  readonly generation: number | null;
  readonly contributionId: string;
  readonly chromosomeIds: readonly ChromosomeDefinitionId[];
  readonly copyIds: readonly string[];
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly schemaVersion: number;
  readonly causedBy: readonly string[];
  readonly rng: RngTrace;
  readonly replay: ReplayCompatibilityInput & { readonly operation: string };
}

export type MutationEvent =
  | (MutationEventBase & {
      readonly operation: "point-mutation";
      readonly scope: "point";
      readonly positionBp: number;
      readonly affectedLoci: readonly [AffectedLocusState, ...AffectedLocusState[]];
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
    })
  | (MutationEventBase & {
      readonly operation: "insertion";
      readonly scope: "local" | "interval";
      readonly target: ChromosomeStructureRef;
      readonly insertionPositionBp: number;
      readonly insertedMaterial: GenomicSegment;
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "deletion";
      readonly scope: "local" | "interval" | "chromosomal";
      readonly target: ChromosomeStructureRef;
      readonly deletedInterval: AffectedInterval;
      readonly removedMaterial: GenomicSegment;
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "duplication";
      readonly scope: "local" | "interval" | "chromosomal";
      readonly sourceInterval: AffectedInterval;
      readonly insertionPositionBp: number;
      readonly resultingOrientation: "forward" | "reverse" | "tandem" | "dispersed";
      readonly duplicatedMaterial: GenomicSegment;
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "inversion";
      readonly scope: "interval" | "chromosomal";
      readonly interval: AffectedInterval;
      readonly previousOrientation: "forward" | "reverse";
      readonly resultingOrientation: "forward" | "reverse";
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "translocation";
      readonly scope: "interval" | "chromosomal";
      readonly source: ChromosomeStructureRef & { readonly interval: { readonly fromBp: number; readonly toBp: number } };
      readonly destination: ChromosomeStructureRef & { readonly insertionPositionBp: number; readonly resultingOrientation: "forward" | "reverse" };
      readonly movedMaterial: GenomicSegment;
      readonly previousStructures: readonly [GenomicSegment, ...GenomicSegment[]];
      readonly resultingStructures: readonly [GenomicSegment, ...GenomicSegment[]];
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "chromosome-level-event";
      readonly scope: "chromosomal";
      readonly eventKind: "chromosome-loss" | "chromosome-gain" | "arm-event" | "whole-chromosome-rearrangement" | "other";
      readonly affectedChromosomes: readonly ChromosomeStructureRef[];
      readonly previousStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly resultingStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "aneuploidy";
      readonly scope: "chromosomal";
      readonly homologousGroup: HomologousGroupId;
      readonly previousCopyCount: number;
      readonly resultingCopyCount: number;
      readonly affectedCopies: readonly string[];
      readonly previousStructures: readonly ChromosomeStructureRef[];
      readonly resultingStructures: readonly ChromosomeStructureRef[];
      readonly affectedLoci?: readonly AffectedLocusState[];
    })
  | (MutationEventBase & {
      readonly operation: "structural-variation";
      readonly scope: "local" | "interval" | "chromosomal";
      readonly variationKind: string;
      readonly previousStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly resultingStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly insertedMaterial?: readonly GenomicSegment[];
      readonly removedMaterial?: readonly GenomicSegment[];
      readonly duplicatedMaterial?: readonly GenomicSegment[];
      readonly resultingPositions?: readonly { readonly chromosomeCopyId: string; readonly positionBp: number; readonly orientation?: "forward" | "reverse" }[];
      readonly affectedIntervals?: readonly AffectedInterval[];
      readonly affectedLoci?: readonly AffectedLocusState[];
    });

export interface ExpressionDelta {
  readonly eventId: string;
  readonly channelDeltas: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
}

export interface FitnessAssessment {
  readonly eventId: string;
  readonly status: "NON_EVALUABLE";
  readonly reason: "external-controls-required";
}

export interface SamplingDefinition {
  readonly coordinateSystem: string;
  readonly spatialReference: string;
  readonly granularity: string;
  readonly method: "point" | "cell" | "radius" | "area" | "volume" | "custom";
  readonly parameters: Readonly<Record<string, FiniteNumber | string>>;
}

export interface TemporalCoherence {
  readonly tick: number;
  readonly mode: "instant" | "interval";
  readonly startTick?: number;
  readonly endTick?: number;
  readonly timeReference: string;
}

export interface EnvironmentalField {
  readonly status: "value" | "missing" | "non-evaluable";
  readonly provenance: "OBSERVED" | "DERIVED" | "UNKNOWN";
  readonly unit: UnitId | null;
  readonly value: FiniteNumber | string | null;
  readonly reason?: string;
  readonly source: string;
}

export interface EnvironmentalSnapshot {
  readonly source: "planet-engine";
  readonly contractVersion: SemVer;
  readonly snapshotVersion: string;
  readonly producerId: string;
  readonly temporal: TemporalCoherence;
  readonly sampling: SamplingDefinition;
  readonly fields: Readonly<Record<string, EnvironmentalField>>;
}

export interface GenomeConfig {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly planetEnvironmentContractVersion: SemVer;
  readonly homologousGroups: readonly HomologousGroupId[];
  readonly defaultPloidyModel: PloidyModel;
  readonly founderStrategy: "registry-default" | "seeded-draw" | "provided";
  readonly mutationRates: Readonly<Record<string, FiniteNumber>>;
  readonly recombination: {
    readonly crossoversPerChromosome: { readonly min: number; readonly max: number };
    readonly interference: FiniteNumber;
    readonly hotspotsEnabled: boolean;
  };
  readonly gameteFormationModes: readonly GameteFormationMode[];
  readonly segregationRules: readonly SegregationRule[];
  readonly expressionPipeline: readonly ExpressionRuleId[];
  readonly missingStatePolicy: "error" | "propagate" | "explicit-fallback";
  readonly rng: {
    readonly algorithm: string;
    readonly algorithmVersion: SemVer;
    readonly derivedNamespaces: readonly string[];
  };
}

export interface VersionSet {
  readonly schemaVersion: number;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly rngAlgorithmVersion: SemVer;
  readonly customFunctionRegistryVersion?: SemVer;
}

export interface MigrationResult<T> {
  readonly status: "ok" | "migrated" | "unsupported" | "error";
  readonly value: T | null;
  readonly from: VersionSet;
  readonly to: VersionSet;
  readonly issues: readonly { readonly code: string; readonly path: string; readonly detail: string }[];
}

export interface FounderInput {
  readonly organismId: number;
  readonly registry: GenomeRegistry;
  readonly config: GenomeConfig;
  readonly rng?: GenomeRng;
  readonly draw?: (ctx: { locusId: LocusId; alleleCatalog: readonly AlleleId[]; rng: GenomeRng }) => AlleleState;
}

export interface RecombinationInput {
  readonly parentGenome: GeneticGenome;
  readonly gameteId: string;
  readonly contributionId: string;
  readonly segregationRule: SegregationRule;
  readonly formationMode: GameteFormationMode;
  readonly rng: GenomeRng;
  readonly config: GenomeConfig;
  readonly registry: GenomeRegistry;
}

export interface GameteInput extends RecombinationInput {}

export interface FusionInput {
  readonly organismId: number;
  readonly gametes: readonly Gamete[];
  readonly reproductionMode: ReproductionMode;
  readonly contributorSelectionMode: ContributorSelectionMode;
  readonly gameteFormationMode: GameteFormationMode;
  readonly ploidyModel: PloidyModel;
  readonly registry: GenomeRegistry;
  readonly config: GenomeConfig;
}

export interface AsexualInput {
  readonly organismId: number;
  readonly parent: GeneticGenome;
  readonly reproductionMode: ReproductionMode;
  readonly gameteFormationMode: GameteFormationMode;
  readonly contributorSelectionMode: ContributorSelectionMode;
  readonly registry: GenomeRegistry;
  readonly config: GenomeConfig;
}

export interface MutationInput {
  readonly genome: GeneticGenome;
  readonly registry: GenomeRegistry;
  readonly config: GenomeConfig;
  readonly tick: number;
  readonly origin: MutationOrigin;
  readonly rng: GenomeRng;
  readonly eventIdPrefix?: string;
}

export interface DevelopmentInput {
  readonly organismId: number;
  readonly tick: number;
  readonly tickReference: string;
  readonly age: FiniteNumber;
  readonly ageUnit: UnitId;
  readonly expression: GeneticExpression;
  readonly plasticity: PlasticResponse | null;
  readonly environment?: EnvironmentalSnapshot;
  readonly stage?: string;
  readonly processes?: Readonly<Record<string, DevelopmentProcessState>>;
  readonly relevantConditions?: readonly DevelopmentalConditionRef[];
}

export interface FinalPhenotypeInput {
  readonly organismId: number;
  readonly tick: number;
  readonly genotypeFingerprint: string;
  readonly expression: GeneticExpression;
  readonly plasticity: PlasticResponse | null;
  readonly developmentalState: DevelopmentalState;
}

export interface GenomeRngState {
  readonly algorithm: "mulberry32-derived";
  readonly algorithmVersion: SemVer;
  readonly rootSeed: number | string;
  readonly namespace: string;
  readonly salt: string;
  readonly state: number;
  readonly drawCount: number;
}

export interface GenomeRng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  getState(): GenomeRngState;
  fork(namespace: string, salt?: string): GenomeRng;
  snapshot(stateBefore?: GenomeRngState): RngTrace;
}

export interface GenomeEngineApi {
  validateGenome(genome: GeneticGenome, registry: GenomeRegistry): ValidationResult;
  validateMutationEvent(event: MutationEvent, registry: GenomeRegistry): ValidationResult;
  validateCustomFunctionUse(ref: { functionId: CustomFunctionId; version: SemVer }, registry: GenomeRegistry): ValidationResult;
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
  develop(input: DevelopmentInput): DevelopmentalState;
  derivePhenotype(input: FinalPhenotypeInput): FinalPhenotype;
  serialize(genome: GeneticGenome): unknown;
  deserialize(raw: unknown, registry: GenomeRegistry): MigrationResult<GeneticGenome>;
  migrate(raw: unknown, from: VersionSet, to: VersionSet): MigrationResult<GeneticGenome>;
}
