# GENOME — Contratti API completi (Rev 3)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 3 (hardening: replay discriminato, mutazioni strutturali, assi riproduzione/ploidia separati, espressione quantitativa vincolata, ploidia per gruppo, sviluppo/ambiente formalizzati).  
**Stato:** contratti **osservati** invariati + contratti **proposti** non implementati e non approvati. Richiedono nuova review e checkpoint `GENOME_ARCHITECTURE.md` §13. Nessuna modifica al codice di produzione.

---

## 1. Contratti esistenti (OBSERVED — invariati)

Riferimento invariato: `BaseGenome`/`Genome` (`types/index.ts`), `GeneDefinition`/`GENE_REGISTRY` (`simulation/biology/geneRegistry.ts`), `Phenotype`, `Organism`, `WorldSnapshot`, `RenderFrame`, `PhenotypeProfile`, funzioni `randomGenome`/`inheritGenome`/`cloneWithMutation`, `getGene`/`inheritExt`/`cloneExt`/`deriveGeneRandom`, `migrateGenome`/`migrateSnapshot`. Nessun contratto esistente è modificato.

---

## 2. Regole fondamentali (Rev 3)

1. **Catalogo ≠ genotipo.** Registry = definizioni; genotipo = occorrenze/stati individuali.
2. **Copia singola, ploidia per gruppo.** `Chromosome` è una copia fisica; `PloidyModel` determina le copie per `HomologousGroupId`.
3. **Stati allelici non ambigui.** Vietato `null` o token unico per assenza biologica/sconosciuto/non valutabile.
4. **Assi riproduttivi separati.** `ReproductionMode`, `PloidyModel`, `GameteFormationMode` e cardinalità contributori sono proprietà distinte.
5. **Provenienza tracciabile.** `contributionId`/`contributorId`/`gameteId`; identità ≠ ruolo biologico; 0..N contributori.
6. **Quantitativo e deterministico.** Valori finiti (no `NaN`/`±Infinity`), unità, domini, normalizzazione e conflitti espliciti.
7. **Replay verificabile.** `ReplayResult<T>` discriminato: `ok` con valore, `incompatible` con `value: null` e mismatch espliciti non vuoti.
8. **Ambiente esterno autorevole.** `EnvironmentalSnapshot` deriva da Planet Engine; nessun modello ambientale parallelo.
9. **Maturità esplicita.** Tutti i contratti sotto sono **progettati**, non implementati/integrati/attivi.

---

## 3. Registry, canali, regole ed espressione quantitativa

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
type UnitId = string;

type FiniteNumber = number; // vincolo: Number.isFinite(value) === true; NaN e Infinity vietati

interface TraitChannelDefinition {
  readonly id: TraitChannelId;
  readonly description: string;
  readonly unit: UnitId; // unità dichiarata e versionata nel registry (es. "ratio", "index", "1")
  readonly semantics: string; // significato del canale/scala
  readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber };
  readonly normalization: {
    readonly method: "linear" | "saturating" | "none" | "custom";
    readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
    readonly customFunctionId?: string; // richiesto se method === "custom"
    readonly customFunctionVersion?: SemVer; // richiesto se method === "custom"
  };
  readonly clampPolicy: "clamp" | "error" | "mark-non-evaluable";
  readonly missingInputPolicy:
    | "propagate-non-evaluable"
    | "propagate-undetermined"
    | "explicit-fallback";
  readonly fallbackValue?: FiniteNumber; // usato solo se policy esplicita e valido nel dominio
}

interface ChromosomeDefinition {
  readonly id: ChromosomeDefinitionId;
  readonly homologousGroup: HomologousGroupId;
  readonly lengthBp: number;
  readonly centromereBp: number;
  readonly recombinationRateCmPerMb: FiniteNumber;
  readonly locusOrder: readonly LocusId[];
}

interface LocusDefinition {
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

interface AlleleDefinition {
  readonly id: AlleleId;
  readonly locusId: LocusId;
  readonly symbol: string;
  readonly effectProfile: Readonly<Record<TraitChannelId, FiniteNumber>>; // scala coerente al canale
  readonly baselineActivity: FiniteNumber; // scala dichiarata dal registry/canale
  readonly regulatoryTargets: readonly LocusId[];
  readonly interactionTags: readonly string[];
  readonly catalogOrigin: "founder" | "engine" | "migration";
}
```

### 3.1 Regole di espressione, pesi e conflitti (D-01 circoscritto)

```ts
interface WeightedRef {
  readonly id: string;
  readonly weight: FiniteNumber; // finito; semantica esplicita (normalizzato/non normalizzato dichiarato)
}

type ConflictResolution =
  | { readonly strategy: "priority-order"; readonly priorities: readonly ExpressionRuleId[] }
  | { readonly strategy: "weighted-merge"; readonly weights: Readonly<Record<ExpressionRuleId, FiniteNumber>> }
  | { readonly strategy: "mark-non-evaluable"; readonly reason: string };

interface ExpressionRuleBase {
  readonly id: ExpressionRuleId;
  readonly targetChannels: readonly TraitChannelId[];
  readonly priority: number; // ordinamento deterministico; ambiguità non risolta => mark-non-evaluable
  readonly conflictResolution: ConflictResolution;
}

interface DominanceRule extends ExpressionRuleBase {
  readonly kind: "complete-dominance" | "incomplete-dominance" | "codominance" | "allelic-dosage";
  readonly alleleOrder?: readonly AlleleId[];
  readonly weights?: Readonly<Record<AlleleId, FiniteNumber>>;
}

interface PolygenicRule extends ExpressionRuleBase {
  readonly kind: "polygenic-aggregate";
  readonly locusIds: readonly LocusId[];
  readonly reducer: "sum" | "weighted-sum" | "product";
  readonly weights?: Readonly<Record<LocusId, FiniteNumber>>;
  readonly weightSemantics?: "normalized" | "unnormalized";
}

interface EpistasisRule extends ExpressionRuleBase {
  readonly kind: "epistatic-interaction";
  readonly targetLocusIds: readonly LocusId[];
  readonly modifierLocusIds: readonly LocusId[];
  readonly operation: "suppress" | "enhance" | "mask" | "additive-modifier";
  readonly strength: FiniteNumber;
}

interface RegulatoryOrInteractionRule extends ExpressionRuleBase {
  readonly kind: "pleiotropic-projection" | "regulatory-modulation" | "gene-gene-interaction";
  readonly sourceLocusIds: readonly LocusId[];
  readonly targetLocusIds?: readonly LocusId[];
  readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
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

**Vincoli:** `domain.min <= domain.max`; tutti i numeri finiti; `custom` normalization richiede id/versione registrati e deterministici (altrimenti `non-evaluable`); pesi invalidi/mancanti dove richiesti ⇒ `non-evaluable`; conflitto non risolvibile o priorità ambigue ⇒ `mark-non-evaluable` (no tie-break implicito). Catalogo concreto canali/unità specifiche: registry/deployment-specifico (D-07 circoscritto).

---

## 4. Genotipo, ploidia per gruppo, stati allelici e provenienza

```ts
type AlleleState =
  | { readonly kind: "identified"; readonly alleleId: AlleleId }
  | { readonly kind: "biologically-absent"; readonly reason: "deletion" | "structural-absence" | "null-allele" }
  | { readonly kind: "undetermined"; readonly reason: "data-unavailable" | "not-yet-determined" | "legacy-missing" }
  | { readonly kind: "non-evaluable"; readonly reason: string; readonly context?: string };

type PloidyModel =
  | {
      readonly kind: "uniform";
      readonly byGroup: Readonly<Record<HomologousGroupId, number>>; // tutti uguali, >= 1
      readonly globalPloidy: number; // valido solo se uniforme
    }
  | {
      readonly kind: "aneuploid";
      readonly byGroup: Readonly<Record<HomologousGroupId, number>>; // per-gruppo, >= 0 o >= 1 per policy
      readonly globalPloidy: null; // riepilogo globale non valido
    };

interface GeneticContribution {
  readonly contributionId: string;
  readonly contributorId: string | null;
  readonly organismId: number | null;
  readonly gameteId: string | null;
  readonly confidence: "known" | "partial" | "unknown" | "non-evaluable";
  readonly role: string | null; // metadato opzionale, non identità
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
  readonly contributionId: string;
  readonly loci: readonly LocusCall[];
}

interface GeneticGenome {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly organismId: number;
  readonly ploidyModel: PloidyModel;
  readonly chromosomes: readonly Chromosome[]; // copie coerenti con ploidyModel per gruppo
  readonly contributions: Readonly<Record<string, GeneticContribution>>;
  readonly fingerprint: string;
}
```

**Invarianti:** per ogni gruppo, numero di `Chromosome` = `ploidyModel.byGroup[group]`; un `LocusCall` per locus per copia; `identified` ⇒ `alleleId` valido; altri stati ⇒ nessun `alleleId`; `uniform` ⇒ tutti i valori uguali e `globalPloidy` coerente; `aneuploid` ⇒ `globalPloidy: null`.

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
  readonly chromosomes: readonly Chromosome[]; // una copia per gruppo omologo secondo modello di formazione
  readonly recombinationTraces: readonly RecombinationTrace[];
  readonly formationMode: GameteFormationMode;
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
  readonly dosageContribution: FiniteNumber | null;
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
  readonly unit: UnitId;
  readonly state: ChannelState;
  readonly value: FiniteNumber | null; // null se stato non valorizzabile; finito se presente
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

interface DevelopmentMetric {
  readonly value: FiniteNumber | null;
  readonly unit: UnitId;
  readonly status: "value" | "undetermined" | "non-evaluable";
  readonly reason?: string;
}

interface DevelopmentalState {
  readonly organismId: number;
  readonly tick: number;
  readonly tickReference: string;
  readonly age: FiniteNumber;
  readonly ageUnit: UnitId;
  readonly stage: string; // dichiarato/versionato dal modello di sviluppo
  readonly stageStatus: "value" | "undetermined" | "non-evaluable";
  readonly growth: Readonly<Record<string, DevelopmentMetric>>;
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

Vietato restituire `GeneticGenome` da ambiente, plasticità, sviluppo o fenotipo.

---

## 6. Pedigree e assi riproduttivi separati

```ts
type ReproductionMode = "sexual" | "asexual" | "unknown";
type GameteFormationMode = "meiotic" | "amitotic" | "apomictic" | "none" | "unknown";
type ContributorSelectionMode = "pair" | "single" | "multi" | "none" | "unknown";

interface PedigreeRecord {
  readonly organismId: number;
  readonly birthTick: number;
  readonly reproductionMode: ReproductionMode;
  readonly gameteFormationMode: GameteFormationMode;
  readonly contributorSelectionMode: ContributorSelectionMode;
  readonly ploidyModel: PloidyModel;
  readonly founder: boolean;
  readonly contributors: readonly GeneticContribution[]; // 0..N
  readonly contributionsUsed: readonly string[]; // contributionId delle copie ereditate
  readonly genomeFingerprint: string;
}

interface PedigreeGraph {
  readonly records: Readonly<Record<number, PedigreeRecord>>;
}
```

**Regole:** proprietà indipendenti non compresse in un enum unico; sessuata/asessuata compatibili con poliploidia uniforme o aneuploidia se supportate da `ploidyModel` e `gameteFormationMode`; fondatore ⇒ `contributors=[]`, `founder=true`; genealogia parziale ammessa; nessun ciclo; metriche su rami ignoti/non valutabili ⇒ `NON_EVALUABLE`.

---

## 7. Mutazioni, RNG, replay e ambiente

```ts
type MutationScope = "point" | "local" | "interval" | "chromosomal";
type MutationKind =
  | "substitution"
  | "insertion"
  | "deletion"
  | "duplication"
  | "inversion"
  | "translocation"
  | "regulatory"
  | "complex";
type MutationOrigin = "germline-de-novo" | "germline-inherited" | "somatic" | "engine-configured" | "legacy-migration";

interface AffectedLocusState {
  readonly locusId: LocusId;
  readonly chromosomeCopyId: string;
  readonly positionBp: number | null;
  readonly intervalBp: { readonly from: number; readonly to: number } | null; // richiesto per interval/chromosomal se applicabile
  readonly previousState: AlleleState;
  readonly resultingState: AlleleState;
}

interface AffectedInterval {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly chromosomeCopyId: string | null;
  readonly fromBp: number;
  readonly toBp: number;
}

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

type ReplayMismatch = { readonly field: string; readonly expected: string; readonly actual: string };

type ReplayResult<T> =
  | { readonly status: "ok"; readonly value: T; readonly mismatches: readonly [] }
  | { readonly status: "incompatible"; readonly value: null; readonly mismatches: readonly [ReplayMismatch, ...ReplayMismatch[]] };

interface MutationEvent {
  readonly id: string;
  readonly tick: number;
  readonly scope: MutationScope;
  readonly kind: MutationKind;
  readonly origin: MutationOrigin;
  readonly organismId: number;
  readonly generation: number | null;
  readonly contributionId: string;
  readonly affectedLoci: readonly [AffectedLocusState, ...AffectedLocusState[]]; // mai vuoto; >1 o intervallo per mutazioni non puntiformi
  readonly affectedIntervals: readonly AffectedInterval[];
  readonly affectedCopyIds: readonly string[];
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

**Vincoli mutazioni:** `point` ⇒ singolo elemento puntuale coerente; `local|interval|chromosomal` ⇒ rappresentare intervalli/insiemi/copie coinvolte senza riduzione a singolo locus. `MutationEvent` non contiene fitness né effetti fenotipici. Replay incompatibile ⇒ `incompatible` con mismatch espliciti, mai valore.

```ts
interface SamplingDefinition {
  readonly coordinateSystem: string;
  readonly spatialReference: string;
  readonly granularity: string;
  readonly method: "point" | "cell" | "radius" | "area" | "volume" | "custom";
  readonly parameters: Readonly<Record<string, FiniteNumber | string>>;
}

interface TemporalCoherence {
  readonly tick: number;
  readonly mode: "instant" | "interval";
  readonly startTick?: number;
  readonly endTick?: number;
  readonly timeReference: string;
}

interface EnvironmentalField {
  readonly status: "value" | "missing" | "non-evaluable";
  readonly provenance: "OBSERVED" | "DERIVED" | "UNKNOWN";
  readonly unit: UnitId | null;
  readonly value: FiniteNumber | string | null; // finito se numerico e status=value
  readonly reason?: string;
  readonly source: string;
}

interface EnvironmentalSnapshot {
  readonly source: "planet-engine";
  readonly contractVersion: SemVer;
  readonly snapshotVersion: string;
  readonly producerId: string;
  readonly temporal: TemporalCoherence;
  readonly sampling: SamplingDefinition;
  readonly fields: Readonly<Record<string, EnvironmentalField>>;
}
```

GENOME consuma lo snapshot in sola lettura tramite adattatore; mapping concreto subordinato al contratto Planet Engine (D-14). Stati uniformati: `missing` ≠ `non-evaluable`.

---

## 8. Config, serializzazione, migrazione

```ts
interface GenomeConfig {
  readonly schemaVersion: 1;
  readonly registryId: RegistryId;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly planetEnvironmentContractVersion: SemVer;
  readonly homologousGroups: readonly HomologousGroupId[];
  readonly defaultPloidyModel: PloidyModel;
  readonly founderStrategy: "registry-default" | "seeded-draw" | "provided";
  readonly mutationRates: Readonly<Record<MutationKind, FiniteNumber>>;
  readonly recombination: {
    readonly crossoversPerChromosome: { readonly min: number; readonly max: number };
    readonly interference: FiniteNumber;
    readonly hotspotsEnabled: boolean;
  };
  readonly gameteFormationModes: readonly GameteFormationMode[];
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

Serializzazione: round-trip canonico; preservare `AlleleState`, stati sviluppo/campo ambientale e mutazioni strutturali senza collasso. Migrazione: monotonica, idempotente, nessun default silenzioso in validazione.

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

Tutte le API sono **progettate**. Nessuna implementata, integrata o attiva in Rev 3.

---

## 10. Compatibilità e verifiche

- Nessun impatto applicato a contratti condivisi esistenti.
- Future modifiche a `types/index.ts`, snapshot, worker o renderer richiedono checkpoint §13.
- Verifica progettuale richiesta: stati allelici, ploidia per-gruppo, assi riproduttivi separati, mutazioni strutturali complete, replay discriminato incompatibile, validazione numerica/unità/normalizzazione/conflitti, sviluppo non ereditabile con unità, snapshot ambientale Planet Engine con stati uniformati, round-trip/migrazione. Piano operativo in `GENOME_VALIDATION_PLAN.md`.
