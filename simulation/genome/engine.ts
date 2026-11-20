import { issue } from "./id";
import { validateCustomFunctionDefinition } from "./validate-registry";
import type {
  AffectedInterval,
  AffectedLocusState,
  ChromosomeStructureRef,
  CustomFunctionDefinition,
  CustomFunctionId,
  DevelopmentalState,
  EnvironmentalSnapshot,
  FinalPhenotype,
  FounderInput,
  FusionInput,
  Gamete,
  GameteInput,
  GeneticExpression,
  GeneticGenome,
  GenomeConfig,
  GenomeRegistry,
  MigrationResult,
  MutationEvent,
  MutationInput,
  PlasticResponse,
  RecombinationInput,
  RecombinationTrace,
  ReplayCompatibilityInput,
  ReplayResult,
  ResolvedGenotype,
  SemVer,
  ValidationIssue,
  ValidationResult,
  VersionSet,
} from "./types";

export function validateCustomFunctionUse(
  ref: { functionId: CustomFunctionId; version: SemVer },
  registry: GenomeRegistry,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const key = `${ref.functionId}@${ref.version}`;
  const fn = registry.customFunctions[key];
  if (!fn) {
    issues.push(issue("custom.missing", `customFunctions.${key}`, "custom function missing from registry"));
    return { ok: false, issues };
  }
  issues.push(...validateCustomFunctionDefinition(fn, `customFunctions.${key}`));
  if (fn.functionId !== ref.functionId || fn.version !== ref.version) {
    issues.push(issue("custom.ref-mismatch", `customFunctions.${key}`, "function id/version mismatch"));
  }
  // availability/compatibility contract in GEN-1: presence in registry with compatible declared metadata is required.
  if (!fn.replayCompatible || !fn.serializationCompatible) {
    issues.push(issue("custom.compatibility", `customFunctions.${key}`, "custom function not replay/serialization compatible"));
  }
  return { ok: issues.length === 0, issues };
}

function checkInterval(interval: { fromBp: number; toBp: number } | { from: number; to: number }, path: string, issues: ValidationIssue[]) {
  const from = "fromBp" in interval ? interval.fromBp : interval.from;
  const to = "toBp" in interval ? interval.toBp : interval.to;
  if (!Number.isInteger(from) || !Number.isInteger(to)) issues.push(issue("mutation.interval.integer", path, "interval bounds must be integers"));
  if (from < 0 || to < 0 || from > to) issues.push(issue("mutation.interval.order", path, "interval bounds must be ordered and >= 0"));
}

function checkAffectedLocusState(s: AffectedLocusState, path: string, issues: ValidationIssue[]) {
  if (!s.locusId) issues.push(issue("mutation.affected-locus.id", `${path}.locusId`, "locusId required"));
  if (!s.chromosomeCopyId) issues.push(issue("mutation.affected-locus.copy", `${path}.chromosomeCopyId`, "chromosomeCopyId required"));
  if (s.positionBp !== null && !Number.isInteger(s.positionBp)) issues.push(issue("mutation.affected-locus.position", `${path}.positionBp`, "positionBp must be integer or null"));
  if (s.intervalBp) checkInterval(s.intervalBp, `${path}.intervalBp`, issues);
}

function checkStructureRef(r: ChromosomeStructureRef, path: string, issues: ValidationIssue[]) {
  if (!r.chromosomeDefinitionId) issues.push(issue("mutation.structure.chromosome", `${path}.chromosomeDefinitionId`, "chromosomeDefinitionId required"));
  if (!r.chromosomeCopyId) issues.push(issue("mutation.structure.copy", `${path}.chromosomeCopyId`, "chromosomeCopyId required"));
  if (!r.homologousGroup) issues.push(issue("mutation.structure.group", `${path}.homologousGroup`, "homologousGroup required"));
  if (r.interval) checkInterval(r.interval, `${path}.interval`, issues);
}

function checkAffectedInterval(i: AffectedInterval, path: string, issues: ValidationIssue[]) {
  if (!i.chromosomeDefinitionId) issues.push(issue("mutation.interval.chromosome", `${path}.chromosomeDefinitionId`, "chromosomeDefinitionId required"));
  checkInterval({ fromBp: i.fromBp, toBp: i.toBp }, path, issues);
}

function checkRngTrace(event: MutationEvent, issues: ValidationIssue[]) {
  if (!event.rng?.algorithm) issues.push(issue("mutation.rng.algorithm", "rng.algorithm", "rng algorithm required"));
  if (!event.rng?.algorithmVersion) issues.push(issue("mutation.rng.version", "rng.algorithmVersion", "rng algorithm version required"));
  if (event.rng?.drawCount < 0) issues.push(issue("mutation.rng.draws", "rng.drawCount", "drawCount must be >= 0"));
}

export function validateMutationEvent(event: MutationEvent, registry: GenomeRegistry): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!event.id) issues.push(issue("mutation.id", "id", "id required"));
  if (!Number.isInteger(event.tick) || event.tick < 0) issues.push(issue("mutation.tick", "tick", "tick must be integer >= 0"));
  if (!event.organismId && event.organismId !== 0) issues.push(issue("mutation.organism", "organismId", "organismId required"));
  if (event.registryId !== registry.id) issues.push(issue("mutation.registry.id", "registryId", "registryId mismatch"));
  if (event.registryVersion !== registry.version) issues.push(issue("mutation.registry.version", "registryVersion", "registryVersion mismatch"));
  if (!event.schemaVersion) issues.push(issue("mutation.schema", "schemaVersion", "schemaVersion required"));
  checkRngTrace(event, issues);

  const op = event.operation;
  const scope = event.scope;
  const checkScope = (allowed: readonly string[]) => {
    if (!allowed.includes(scope)) issues.push(issue("mutation.scope", "scope", `scope ${scope} not allowed for ${op}`));
  };
  const checkLociOptional = (loci: readonly AffectedLocusState[] | undefined, allowEmpty: boolean, path: string) => {
    if (!loci) return;
    if (loci.length === 0 && !allowEmpty) issues.push(issue("mutation.affected-loci.empty", path, "affectedLoci cannot be empty when present"));
    loci.forEach((l, i) => checkAffectedLocusState(l, `${path}.${i}`, issues));
  };

  switch (event.operation) {
    case "point-mutation":
      checkScope(["point"]);
      if (!Number.isInteger(event.positionBp)) issues.push(issue("mutation.point.position", "positionBp", "positionBp required"));
      if (!event.affectedLoci || event.affectedLoci.length < 1) issues.push(issue("mutation.point.affected-loci", "affectedLoci", "point-mutation requires at least one affected locus"));
      else event.affectedLoci.forEach((l, i) => checkAffectedLocusState(l, `affectedLoci.${i}`, issues));
      if (!event.previousStructure || !event.resultingStructure) issues.push(issue("mutation.point.structure", "previousStructure/resultingStructure", "structures required"));
      break;
    case "insertion":
      checkScope(["local", "interval"]);
      checkStructureRef(event.target, "target", issues);
      if (!Number.isInteger(event.insertionPositionBp)) issues.push(issue("mutation.insertion.position", "insertionPositionBp", "insertionPositionBp required"));
      if (!event.insertedMaterial) issues.push(issue("mutation.insertion.material", "insertedMaterial", "insertedMaterial required"));
      if (!event.previousStructure || !event.resultingStructure) issues.push(issue("mutation.insertion.structure", "previousStructure/resultingStructure", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "deletion":
      checkScope(["local", "interval", "chromosomal"]);
      checkStructureRef(event.target, "target", issues);
      checkAffectedInterval(event.deletedInterval, "deletedInterval", issues);
      if (!event.removedMaterial) issues.push(issue("mutation.deletion.material", "removedMaterial", "removedMaterial required"));
      if (!event.previousStructure || !event.resultingStructure) issues.push(issue("mutation.deletion.structure", "previousStructure/resultingStructure", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "duplication":
      checkScope(["local", "interval", "chromosomal"]);
      checkAffectedInterval(event.sourceInterval, "sourceInterval", issues);
      if (!Number.isInteger(event.insertionPositionBp)) issues.push(issue("mutation.duplication.position", "insertionPositionBp", "insertionPositionBp required"));
      if (!event.duplicatedMaterial) issues.push(issue("mutation.duplication.material", "duplicatedMaterial", "duplicatedMaterial required"));
      if (!event.previousStructure || !event.resultingStructure) issues.push(issue("mutation.duplication.structure", "previousStructure/resultingStructure", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "inversion":
      checkScope(["interval", "chromosomal"]);
      checkAffectedInterval(event.interval, "interval", issues);
      if (!event.previousStructure || !event.resultingStructure) issues.push(issue("mutation.inversion.structure", "previousStructure/resultingStructure", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "translocation":
      checkScope(["interval", "chromosomal"]);
      checkStructureRef(event.source, "source", issues);
      if (!event.source.interval) issues.push(issue("mutation.translocation.source-interval", "source.interval", "source interval required"));
      checkStructureRef(event.destination, "destination", issues);
      if (!Number.isInteger(event.destination.insertionPositionBp)) issues.push(issue("mutation.translocation.destination", "destination.insertionPositionBp", "destination insertionPositionBp required"));
      if (!event.movedMaterial) issues.push(issue("mutation.translocation.material", "movedMaterial", "movedMaterial required"));
      if (!event.previousStructures?.length || !event.resultingStructures?.length) issues.push(issue("mutation.translocation.structures", "previousStructures/resultingStructures", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "chromosome-level-event":
      checkScope(["chromosomal"]);
      if (!event.affectedChromosomes?.length) issues.push(issue("mutation.chromosome.affected", "affectedChromosomes", "affectedChromosomes required"));
      event.affectedChromosomes?.forEach((c, i) => checkStructureRef(c, `affectedChromosomes.${i}`, issues));
      if (!event.previousStructures?.length || !event.resultingStructures?.length) issues.push(issue("mutation.chromosome.structures", "previousStructures/resultingStructures", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "aneuploidy":
      checkScope(["chromosomal"]);
      if (!event.homologousGroup) issues.push(issue("mutation.aneuploidy.group", "homologousGroup", "homologousGroup required"));
      if (!Number.isInteger(event.previousCopyCount) || !Number.isInteger(event.resultingCopyCount)) issues.push(issue("mutation.aneuploidy.counts", "previousCopyCount/resultingCopyCount", "copy counts must be integers"));
      if (!event.affectedCopies) issues.push(issue("mutation.aneuploidy.copies", "affectedCopies", "affectedCopies required"));
      if (!event.previousStructures || !event.resultingStructures) issues.push(issue("mutation.aneuploidy.structures", "previousStructures/resultingStructures", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    case "structural-variation":
      checkScope(["local", "interval", "chromosomal"]);
      if (!event.variationKind) issues.push(issue("mutation.structural.kind", "variationKind", "variationKind required"));
      if (!event.previousStructures?.length || !event.resultingStructures?.length) issues.push(issue("mutation.structural.structures", "previousStructures/resultingStructures", "structures required"));
      checkLociOptional(event.affectedLoci, false, "affectedLoci");
      break;
    default: {
      const _exhaustive: never = event;
      issues.push(issue("mutation.operation.unknown", "operation", `unknown operation ${String((_exhaustive as { operation?: string }).operation)}`));
    }
  }

  // registry/version coherence basic checks
  if (!registry.chromosomes) issues.push(issue("registry.missing", "registry", "registry invalid"));
  return { ok: issues.length === 0, issues };
}

export function replayEvent(event: MutationEvent, context: ReplayCompatibilityInput): ReplayResult<MutationEvent> {
  const mismatches: { field: string; expected: string; actual: string }[] = [];
  const expect = (field: string, expected: string | number | undefined, actual: string | number | undefined) => {
    const e = expected === undefined ? "" : String(expected);
    const a = actual === undefined ? "" : String(actual);
    if (e !== a) mismatches.push({ field, expected: e, actual: a });
  };
  expect("registryId", event.replay.registryId, context.registryId);
  expect("registryVersion", event.replay.registryVersion, context.registryVersion);
  expect("registryFingerprint", event.replay.registryFingerprint, context.registryFingerprint);
  expect("engineVersion", event.replay.engineVersion, context.engineVersion);
  expect("schemaVersion", event.replay.schemaVersion, context.schemaVersion);
  expect("rngAlgorithm", event.replay.rngAlgorithm, context.rngAlgorithm);
  expect("rngAlgorithmVersion", event.replay.rngAlgorithmVersion, context.rngAlgorithmVersion);
  expect("parametersHash", event.replay.parametersHash, context.parametersHash);
  expect("operation", event.replay.operation, event.operation);
  if (event.replay.customFunctionRegistryFingerprint || context.customFunctionRegistryFingerprint) {
    expect("customFunctionRegistryFingerprint", event.replay.customFunctionRegistryFingerprint, context.customFunctionRegistryFingerprint);
  }
  if (mismatches.length > 0) {
    return { status: "incompatible", value: null, mismatches: mismatches as unknown as readonly [typeof mismatches[number], ...typeof mismatches[number][]] };
  }
  return { status: "ok", value: event, mismatches: [] as const };
}

export function develop(input: {
  organismId: number;
  tick: number;
  tickReference: string;
  age: number;
  ageUnit: string;
  expression: GeneticExpression;
  plasticity: PlasticResponse | null;
  environment?: EnvironmentalSnapshot;
  stage?: string;
  processes?: Record<string, DevelopmentalState["processes"][string]>;
  relevantConditions?: DevelopmentalState["relevantConditions"];
}): DevelopmentalState {
  const stage = input.stage ?? "default";
  return {
    organismId: input.organismId,
    tick: input.tick,
    tickReference: input.tickReference,
    age: input.age,
    ageUnit: input.ageUnit,
    stage,
    stageStatus: "value",
    growth: {},
    maturation: {},
    processes: input.processes ?? {},
    relevantConditions: input.relevantConditions ?? [],
    expressionRef: input.expression.fingerprint,
    plasticityRef: input.plasticity?.fingerprint ?? null,
    heritable: false,
  };
}

export function derivePhenotype(input: {
  organismId: number;
  tick: number;
  genotypeFingerprint: string;
  expression: GeneticExpression;
  plasticity: PlasticResponse | null;
  developmentalState: DevelopmentalState;
}): FinalPhenotype {
  return {
    organismId: input.organismId,
    tick: input.tick,
    genotypeFingerprint: input.genotypeFingerprint,
    expressionRef: input.expression.fingerprint,
    plasticityRef: input.plasticity?.fingerprint ?? null,
    developmentalStateRef: `${input.developmentalState.organismId}:${input.developmentalState.tick}:${input.developmentalState.stage}`,
    channels: input.expression.channels,
    provenance: Object.fromEntries(Object.keys(input.expression.channels).map((k) => [k, "expression+development"])),
    derivation: "DERIVED",
  };
}

// Stubs for APIs not required by GEN-1 foundational implementation but part of contract surface
export function resolveAlleles(_genome: GeneticGenome, _registry: GenomeRegistry): ResolvedGenotype {
  throw new Error("GEN-1: resolveAlleles not implemented (scaffolding only)");
}
export function express(_resolved: ResolvedGenotype, _registry: GenomeRegistry, _config: GenomeConfig): GeneticExpression {
  throw new Error("GEN-1: express not implemented (scaffolding only)");
}
export function regulate(_expr: GeneticExpression, _env: EnvironmentalSnapshot, _config: GenomeConfig): PlasticResponse {
  throw new Error("GEN-1: regulate not implemented (scaffolding only)");
}
export function planRecombination(_input: RecombinationInput): RecombinationTrace[] {
  throw new Error("GEN-1: planRecombination not implemented (scaffolding only)");
}
export function formGamete(_input: GameteInput): Gamete {
  throw new Error("GEN-1: formGamete not implemented (scaffolding only)");
}
export function fuseContributions(_input: FusionInput): GeneticGenome {
  throw new Error("GEN-1: fuseContributions not implemented (scaffolding only)");
}
export function reproduceAsexual(_input: unknown): GeneticGenome {
  throw new Error("GEN-1: reproduceAsexual not implemented (scaffolding only)");
}
export function mutate(_input: MutationInput): { genome: GeneticGenome; events: readonly MutationEvent[] } {
  throw new Error("GEN-1: mutate not implemented (scaffolding only)");
}

void isFinite;
