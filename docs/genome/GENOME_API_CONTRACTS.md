# GENOME — Contratti API completi (Rev 4)

**Data:** 2026-11-20  
**Branch:** `milestone/genome/gen0-audit` — PR #4  
**Revisione:** Rev 4 (G1 mutazioni discriminated union, G2 separazione sviluppo/fenotipo, G3 formazione gameti/poliploidia, G4 coerenza mutazioni, G5 registry funzioni custom).  
**Stato:** contratti **osservati** invariati + contratti **proposti** non implementati e non approvati. Richiedono nuova review indipendente e checkpoint `GENOME_ARCHITECTURE.md` §13. Nessuna modifica al codice di produzione. **GEN-1 non avviato.**

---

## 1. Contratti esistenti (OBSERVED — invariati)

Riferimento invariato: `BaseGenome`/`Genome` (`types/index.ts`), `GeneDefinition`/`GENE_REGISTRY` (`simulation/biology/geneRegistry.ts`), `Phenotype`, `Organism`, `WorldSnapshot`, `RenderFrame`, `PhenotypeProfile`, funzioni `randomGenome`/`inheritGenome`/`cloneWithMutation`, `getGene`/`inheritExt`/`cloneExt`/`deriveGeneRandom`, `migrateGenome`/`migrateSnapshot`. Nessun contratto esistente è modificato.

---

## 2. Regole fondamentali (Rev 4)

1. **Catalogo ≠ genotipo.** Registry = definizioni; genotipo = occorrenze/stati individuali.
2. **Copia singola, ploidia per gruppo.** `Chromosome` è una copia fisica; `PloidyModel` organismo determina le copie per `HomologousGroupId`.
3. **Stati allelici non ambigui.** Vietato `null` o token unico per assenza biologica/sconosciuto/non valutabile.
4. **Assi riproduttivi separati.** `ReproductionMode`, `PloidyModel` organismo, `GameteFormationMode`, ploidia gamete, regole di segregazione, anomalie meiotiche e cardinalità contributori sono proprietà distinte ed esplicite.
5. **Provenienza tracciabile.** `contributionId`/`contributorId`/`gameteId`; identità ≠ ruolo biologico; 0..N contributori.
6. **Quantitativo e deterministico.** Valori finiti (no `NaN`/`±Infinity`), unità, domini, normalizzazione e conflitti espliciti; funzioni custom solo da registry versionato con implementazione compatibile.
7. **Replay verificabile.** `ReplayResult<T>` discriminato: `ok` con valore, `incompatible` con `value: null` e mismatch espliciti non vuoti.
8. **Mutazioni tipizzate e coerenti.** `MutationEvent` come discriminated union per operazione con struttura precedente/risultante e invarianti verificabili.
9. **Pipeline sviluppo/fenotipo separata.** `develop()` → `DevelopmentalState`; `derivePhenotype()` → `FinalPhenotype` (passo distinto e verificabile).
10. **Ambiente esterno autorevole.** `EnvironmentalSnapshot` deriva da Planet Engine; nessun modello ambientale parallelo.
11. **Maturità esplicita.** Tutti i contratti sotto sono **progettati**, non implementati/integrati/attivi.

---

## 3. Registry, canali, regole, funzioni custom ed espressione quantitativa

```ts
type SemVer = string;
type LocusId = string;
type AlleleId = string;
type ChromosomeDefinitionId = string;
type HomologousGroupId = string;
type TraitChannelId = string;
type ExpressionRuleId = string;
type MutationRuleId = string;
type CustomFunctionId = string;
type RegistryId = string;
type UnitId = string;

type FiniteNumber = number; // vincolo: Number.isFinite(value) === true; NaN e Infinity vietati

interface TraitChannelDefinition {
  readonly id: TraitChannelId;
  readonly description: string;
  readonly unit: UnitId; // unità dichiarata e versionata nel registry
  readonly semantics: string;
  readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber };
  readonly normalization: {
    readonly method: "linear" | "saturating" | "none" | "custom";
    readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
    readonly customFunctionId?: CustomFunctionId; // richiesto se method === "custom"
    readonly customFunctionVersion?: SemVer;      // richiesto se method === "custom"
  };
  readonly clampPolicy: "clamp" | "error" | "mark-non-evaluable";
  readonly missingInputPolicy:
    | "propagate-non-evaluable"
    | "propagate-undetermined"
    | "explicit-fallback";
  readonly fallbackValue?: FiniteNumber;
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
  readonly effectProfile: Readonly<Record<TraitChannelId, FiniteNumber>>;
  readonly baselineActivity: FiniteNumber;
  readonly regulatoryTargets: readonly LocusId[];
  readonly interactionTags: readonly string[];
  readonly catalogOrigin: "founder" | "engine" | "migration";
}
```

### 3.1 Funzioni custom (G5)

```ts
interface CustomFunctionSignature {
  readonly inputs: readonly { readonly name: string; readonly unit: UnitId; readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber } }[];
  readonly output: { readonly unit: UnitId; readonly domain: { readonly min: FiniteNumber; readonly max: FiniteNumber } };
}

interface CustomFunctionImplementationRef {
  readonly kind: "registered-implementation";
  readonly implementationId: string; // riferimento stabile all'implementazione registrata
  readonly implementationHash?: string; // opzionale ma raccomandato per compatibilità/replay
}

interface CustomFunctionDefinition {
  readonly functionId: CustomFunctionId;
  readonly version: SemVer;
  readonly signature: CustomFunctionSignature;
  readonly implementation: CustomFunctionImplementationRef;
  readonly deterministic: true; // contratto: deterministica rispetto a input/contesto dichiarato
  readonly determinismContract: string; // descrive assenza di stato esterno/RNG non tracciato
  readonly replayCompatible: boolean;
  readonly serializationCompatible: boolean;
}

type CustomFunctionRegistry = Readonly<Record<string, CustomFunctionDefinition>>; // chiave raccomandata: `${functionId}@${version}`
```

**Vincoli G5:** uso valido solo se funzione/versione presente in registry e implementazione disponibile/compatibile con firma, unità/domini e determinismo. Funzione mancante/non compatibile/non deterministica ⇒ `ValidationError` o esito `non-evaluable` esplicito secondo policy (mai fallback silenzioso). Serializzazione/replay usano riferimenti versionati; incompatibilità o implementazione non risolvibile ⇒ `ReplayResult` `incompatible` con mismatch esplicito. L'id da solo non garantisce riproducibilità.

### 3.2 Regole di espressione, pesi e conflitti (D-01 circoscritto)

```ts
type ConflictResolution =
  | { readonly strategy: "priority-order"; readonly priorities: readonly ExpressionRuleId[] }
  | { readonly strategy: "weighted-merge"; readonly weights: Readonly<Record<ExpressionRuleId, FiniteNumber>> }
  | { readonly strategy: "mark-non-evaluable"; readonly reason: string };

interface ExpressionRuleBase {
  readonly id: ExpressionRuleId;
  readonly targetChannels: readonly TraitChannelId[];
  readonly priority: number;
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
  readonly customFunctions: CustomFunctionRegistry;
  readonly fingerprint: string;
}
```

**Vincoli:** `domain.min <= domain.max`; tutti i numeri finiti; pesi invalidi/mancanti dove richiesti ⇒ `non-evaluable`; conflitto non risolvibile o priorità ambigue ⇒ `mark-non-evaluable` (no tie-break implicito). Catalogo concreto canali/unità specifiche: registry/deployment-specifico (D-07 circoscritto).

---

## 4. Genotipo, ploidia, stati allelici e provenienza

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
      readonly byGroup: Readonly<Record<HomologousGroupId, number>>; // per-gruppo
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
  readonly chromosomes: readonly Chromosome[];
  readonly contributions: Readonly<Record<string, GeneticContribution>>;
  readonly fingerprint: string;
}
```

**Invarianti:** per ogni gruppo, numero di `Chromosome` = `ploidyModel.byGroup[group]`; `uniform` ⇒ valori uguali e `globalPloidy` coerente; `aneuploid` ⇒ `globalPloidy: null`; `identified` ⇒ `alleleId` valido; altri stati ⇒ nessun `alleleId`.

---

## 5. Riproduzione, gametogenesi e pedigree (G3)

```ts
type ReproductionMode = "sexual" | "asexual" | "unknown";
type GameteFormationMode = "meiotic" | "amitotic" | "apomictic" | "none" | "unknown";
type ContributorSelectionMode = "pair" | "single" | "multi" | "none" | "unknown";

type GametePloidy = Readonly<Record<HomologousGroupId, number>>; // per gruppo, distinto dalla ploidia organismo

interface SegregationRule {
  readonly ruleId: string;
  readonly version: SemVer;
  readonly kind: "disomic" | "polysomic" | "custom" | "none" | "unknown";
  readonly parameters: Readonly<Record<string, FiniteNumber | string | boolean>>;
}

type MeioticAnomaly =
  | { readonly kind: "none" }
  | { readonly kind: "non-disjunction"; readonly group: HomologousGroupId; readonly details?: string }
  | { readonly kind: "unbalanced-gamete"; readonly groups: readonly HomologousGroupId[]; readonly details?: string }
  | { readonly kind: "custom"; readonly code: string; readonly details?: string };

interface RecombinationInterval {
  readonly fromBp: number;
  readonly toBp: number;
  readonly donorCopyId: string;
  readonly donorContributionId: string;
  readonly intergenic?: boolean; // true se l'intervallo non è ancorato a loci identificabili
}

interface RecombinationTrace {
  readonly homologousGroup: HomologousGroupId;
  readonly crossoverPositionsBp: readonly number[];
  readonly intervals: readonly RecombinationInterval[];
  readonly segregationRuleApplied: SegregationRule;
  readonly meioticAnomaly: MeioticAnomaly;
  readonly rng: RngTrace;
}

interface Gamete {
  readonly id: string;
  readonly sourceOrganismId: number;
  readonly contributionId: string;
  readonly chromosomes: readonly Chromosome[];
  readonly gametePloidy: GametePloidy; // per gruppo; NON assunto = 1
  readonly recombinationTraces: readonly RecombinationTrace[];
  readonly formationMode: GameteFormationMode;
  readonly segregationRule: SegregationRule;
  readonly meioticAnomalies: readonly MeioticAnomaly[];
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
}

interface PedigreeRecord {
  readonly organismId: number;
  readonly birthTick: number;
  readonly reproductionMode: ReproductionMode;
  readonly gameteFormationMode: GameteFormationMode;
  readonly contributorSelectionMode: ContributorSelectionMode;
  readonly ploidyModel: PloidyModel; // organismo
  readonly founder: boolean;
  readonly contributors: readonly GeneticContribution[]; // 0..N
  readonly contributionsUsed: readonly string[]; // contributionId delle copie ereditate
  readonly genomeFingerprint: string;
}

interface PedigreeGraph {
  readonly records: Readonly<Record<number, PedigreeRecord>>;
}
```

**Regole G3:** ploidia organismo, ploidia gamete, numero contributori, modalità riproduttiva, regole di segregazione e anomalie meiotiche sono distinti ed espliciti. Nessuna assunzione che ogni gamete contenga una sola copia per gruppo omologo. In poliploidia la segregazione deve essere dichiarata; configurazioni non supportate ⇒ errore esplicito o esito non-evaluable secondo policy. Fondatore ⇒ `contributors=[]`, `founder=true`; genealogia parziale ammessa; nessun ciclo.

---

## 6. Risoluzione, espressione, sviluppo, fenotipo (G2)

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
  readonly value: FiniteNumber | null; // null se non valorizzabile; finito se presente
  readonly reason?: string;
  readonly appliedRuleIds: readonly ExpressionRuleId[];
}

interface GeneticExpression {
  readonly organismId: number;
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
  readonly fingerprint: string;
}

interface PlasticResponse {
  readonly organismId: number;
  readonly tick: number;
  readonly channelDeltas: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly derivation: "DERIVED";
  readonly heritable: false;
  readonly fingerprint: string;
}

interface DevelopmentProcessState {
  readonly processId: string;
  readonly status: "active" | "completed" | "suspended" | "undetermined" | "non-evaluable";
  readonly progress: FiniteNumber | null; // dominio dichiarato dal modello
  readonly unit: UnitId | null;
  readonly reason?: string;
}

interface DevelopmentalConditionRef {
  readonly source: "environmental" | "plastic";
  readonly refId: string; // riferimento a snapshot/campo o artefatto plasticità
  readonly relevance: string;
}

interface DevelopmentalState {
  readonly organismId: number;
  readonly tick: number;
  readonly tickReference: string;
  readonly age: FiniteNumber;
  readonly ageUnit: UnitId;
  readonly stage: string; // dichiarato/versionato dal modello di sviluppo
  readonly stageStatus: "value" | "undetermined" | "non-evaluable";
  readonly growth: Readonly<Record<string, DevelopmentProcessState>>;
  readonly maturation: Readonly<Record<string, DevelopmentProcessState>>;
  readonly processes: Readonly<Record<string, DevelopmentProcessState>>;
  readonly relevantConditions: readonly DevelopmentalConditionRef[]; // riferimenti, non duplicazioni
  readonly expressionRef: string; // fingerprint/ref a GeneticExpression
  readonly plasticityRef: string | null; // fingerprint/ref a PlasticResponse se pertinente
  readonly heritable: false;
}

interface FinalPhenotype {
  readonly organismId: number;
  readonly tick: number;
  readonly genotypeFingerprint: string;
  readonly expressionRef: string;
  readonly plasticityRef: string | null;
  readonly developmentalStateRef: string; // fingerprint/ref a DevelopmentalState
  readonly channels: Readonly<Record<TraitChannelId, ChannelValue>>;
  readonly provenance: Readonly<Record<TraitChannelId, string>>;
  readonly derivation: "DERIVED";
}
```

**Vincoli G2:** `DevelopmentalState` non duplica canali di `GeneticExpression` o delta di `PlasticResponse` (usa riferimenti). `develop()` restituisce `DevelopmentalState`; `derivePhenotype()` restituisce `FinalPhenotype`. Vietato restituire `GeneticGenome` o `FinalPhenotype` da `develop()`.

---

## 7. Mutazioni, replay e ambiente (G1, G4)

```ts
type MutationScope = "point" | "local" | "interval" | "chromosomal";
type MutationOrigin = "germline-de-novo" | "germline-inherited" | "somatic" | "engine-configured" | "legacy-migration";

interface AffectedLocusState {
  readonly locusId: LocusId;
  readonly chromosomeCopyId: string;
  readonly positionBp: number | null;
  readonly intervalBp: { readonly from: number; readonly to: number } | null;
  readonly previousState: AlleleState;
  readonly resultingState: AlleleState;
}

interface AffectedInterval {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly chromosomeCopyId: string | null;
  readonly fromBp: number;
  readonly toBp: number;
  readonly intergenic: boolean;
}

interface GenomicSegment {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly fromBp: number;
  readonly toBp: number;
  readonly orientation: "forward" | "reverse";
  readonly loci: readonly AffectedLocusState[]; // vuoto consentito se intergenico
  readonly payloadRef?: string; // riferimento a materiale serializzato/versionato se necessario
}

interface ChromosomeStructureRef {
  readonly chromosomeDefinitionId: ChromosomeDefinitionId;
  readonly chromosomeCopyId: string;
  readonly homologousGroup: HomologousGroupId;
  readonly interval: { readonly fromBp: number; readonly toBp: number } | null; // null = intero cromosoma/copia
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
  readonly customFunctionRegistryFingerprint?: string;
}

type ReplayMismatch = { readonly field: string; readonly expected: string; readonly actual: string };

type ReplayResult<T> =
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
      readonly affectedLoci?: readonly AffectedLocusState[]; // omesso se esclusivamente intergenico
    })
  | (MutationEventBase & {
      readonly operation: "deletion";
      readonly scope: "local" | "interval" | "chromosomal";
      readonly target: ChromosomeStructureRef;
      readonly deletedInterval: AffectedInterval;
      readonly removedMaterial: GenomicSegment;
      readonly previousStructure: GenomicSegment;
      readonly resultingStructure: GenomicSegment;
      readonly affectedLoci?: readonly AffectedLocusState[]; // omesso se esclusivamente intergenico
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
      readonly affectedLoci?: readonly AffectedLocusState[]; // non richiesto se intero cromosoma/copia senza loci pertinenti
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
      readonly variationKind: string; // estendibile, compatibile con modello
      readonly previousStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly resultingStructures: readonly [GenomicSegment | ChromosomeStructureRef, ...(GenomicSegment | ChromosomeStructureRef)[]];
      readonly insertedMaterial?: readonly GenomicSegment[];
      readonly removedMaterial?: readonly GenomicSegment[];
      readonly duplicatedMaterial?: readonly GenomicSegment[];
      readonly resultingPositions?: readonly { readonly chromosomeCopyId: string; readonly positionBp: number; readonly orientation?: "forward" | "reverse" }[];
      readonly affectedIntervals?: readonly AffectedInterval[];
      readonly affectedLoci?: readonly AffectedLocusState[]; // non richiesto se esclusivamente intergenico o intero cromosoma
    });

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

**Invarianti G4 (contrattuali):** discriminante `operation` coerente con `scope` e payload; riferimenti validi e compatibili con registry/ploidia versionati; intervalli ordinati/validi; struttura precedente/risultante completa per la variante; materiale inserito/rimosso/duplicato e posizione/orientamento presenti quando richiesti dall'operazione; `affectedLoci` assente solo nei casi consentiti (intergenico puro o unità cromosomica/copia senza loci pertinenti); nessun limite arbitrario al numero di loci/segmenti. Violazioni ⇒ validazione fallita senza applicazione parziale implicita.

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
  readonly value: FiniteNumber | string | null;
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
  readonly mutationRates: Readonly<Record<string, FiniteNumber>>; // chiave per operation/kind definita dal modello
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

interface VersionSet {
  readonly schemaVersion: number;
  readonly registryVersion: SemVer;
  readonly engineVersion: SemVer;
  readonly rngAlgorithmVersion: SemVer;
  readonly customFunctionRegistryVersion?: SemVer;
}

interface MigrationResult<T> {
  readonly status: "ok" | "migrated" | "unsupported" | "error";
  readonly value: T | null;
  readonly from: VersionSet;
  readonly to: VersionSet;
  readonly issues: readonly { readonly code: string; readonly path: string; readonly detail: string }[];
}
```

Serializzazione: round-trip canonico; preservare `AlleleState`, stati sviluppo/campo ambientale, payload mutazionali strutturati (pre/op/post, materiali/intervalli/copie/posizioni/orientamenti) e riferimenti versionati a funzioni custom. Migrazione: monotonica, idempotente, nessun default silenzioso in validazione.

---

## 9. API proposta (progettata)

```ts
interface GenomeEngineApi {
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
```

Tutte le API sono **progettate**. Nessuna implementata, integrata o attiva in Rev 4.

---

## 10. Compatibilità e verifiche

- Nessun impatto applicato a contratti condivisi esistenti.
- Future modifiche a `types/index.ts`, snapshot, worker o renderer richiedono checkpoint §13.
- Verifica progettuale richiesta: stati allelici, ploidia per-gruppo e gamete/segregazione, assi riproduttivi separati, mutazioni discriminated union con invarianti G4, replay discriminato incompatibile, registry funzioni custom/versioning/disponibilità, validazione numerica/unità/normalizzazione/conflitti, separazione `develop()`/`derivePhenotype()` senza duplicazioni, snapshot ambientale Planet Engine con stati uniformati, round-trip/migrazione. Piano operativo in `GENOME_VALIDATION_PLAN.md`.
