import { describe, expect, it } from "vitest";
import { createRegistry, buildCustomFunctionRegistry, ENGINE_VERSION } from "../../simulation/genome/id";
import { createRng } from "../../simulation/genome/rng";
import { createFounderGenome, validateGenome } from "../../simulation/genome/genotype";
import { validateCustomFunctionUse, validateMutationEvent, replayEvent, develop, derivePhenotype } from "../../simulation/genome/engine";
import type {
  AffectedLocusState,
  CustomFunctionDefinition,
  GameteFormationMode,
  GeneticExpression,
  GenomeConfig,
  GenomeRegistry,
  LocusDefinition,
  MutationEvent,
  PloidyModel,
  TraitChannelDefinition,
} from "../../simulation/genome/types";

function makeRegistry(): GenomeRegistry {
  const customFn: CustomFunctionDefinition = {
    functionId: "scale",
    version: "1.0.0",
    signature: {
      inputs: [{ name: "x", unit: "u", domain: { min: 0, max: 1 } }],
      output: { unit: "u", domain: { min: 0, max: 1 } },
    },
    implementation: { kind: "registered-implementation", implementationId: "scale#v1", implementationHash: "h1" },
    deterministic: true,
    determinismContract: "pure function over declared inputs",
    replayCompatible: true,
    serializationCompatible: true,
  };
  const channel: TraitChannelDefinition = {
    id: "ch.size",
    description: "size",
    unit: "u",
    semantics: "size channel",
    domain: { min: 0, max: 10 },
    normalization: { method: "linear", parameters: { a: 1, b: 0 } },
    clampPolicy: "clamp",
    missingInputPolicy: "propagate-non-evaluable",
  };
  const chromosome = {
    id: "chr1",
    homologousGroup: "g1",
    lengthBp: 1000,
    centromereBp: 500,
    recombinationRateCmPerMb: 1,
    locusOrder: ["loc1", "loc2"],
  };
  const loci: Record<string, LocusDefinition> = {
    loc1: {
      id: "loc1",
      chromosomeId: "chr1",
      positionBp: 100,
      positionCm: 0.1,
      strand: "+",
      alleleCatalog: ["a1", "a2"],
      traitChannels: ["ch.size"],
      expressionRuleIds: [],
      recombination: { crossoverAllowed: true, interference: 0, hotspot: false },
    },
    loc2: {
      id: "loc2",
      chromosomeId: "chr1",
      positionBp: 200,
      positionCm: 0.2,
      strand: "+",
      alleleCatalog: ["b1"],
      traitChannels: ["ch.size"],
      expressionRuleIds: [],
      recombination: { crossoverAllowed: true, interference: 0, hotspot: false },
    },
  };
  return createRegistry({
    id: "reg1",
    version: "1.0.0",
    engineVersion: ENGINE_VERSION,
    schemaVersion: 1,
    traitChannels: { [channel.id]: channel },
    chromosomes: { [chromosome.id]: chromosome },
    loci,
    alleles: {
      a1: { id: "a1", locusId: "loc1", symbol: "A1", effectProfile: { "ch.size": 1 }, baselineActivity: 1, regulatoryTargets: [], interactionTags: [], catalogOrigin: "founder" },
      a2: { id: "a2", locusId: "loc1", symbol: "A2", effectProfile: { "ch.size": 2 }, baselineActivity: 1, regulatoryTargets: [], interactionTags: [], catalogOrigin: "founder" },
      b1: { id: "b1", locusId: "loc2", symbol: "B1", effectProfile: { "ch.size": 1 }, baselineActivity: 1, regulatoryTargets: [], interactionTags: [], catalogOrigin: "founder" },
    },
    expressionRules: {},
    mutationRules: {},
    customFunctions: buildCustomFunctionRegistry([customFn]),
  });
}

function makeConfig(ploidy?: PloidyModel): GenomeConfig {
  return {
    schemaVersion: 1,
    registryId: "reg1",
    registryVersion: "1.0.0",
    engineVersion: ENGINE_VERSION,
    planetEnvironmentContractVersion: "1.0.0",
    homologousGroups: ["g1"],
    defaultPloidyModel: ploidy ?? { kind: "uniform", byGroup: { g1: 2 }, globalPloidy: 2 },
    founderStrategy: "seeded-draw",
    mutationRates: { "point-mutation": 0.001 },
    recombination: { crossoversPerChromosome: { min: 0, max: 2 }, interference: 0, hotspotsEnabled: false },
    gameteFormationModes: ["meiotic" as GameteFormationMode],
    segregationRules: [{ ruleId: "disomic", version: "1.0.0", kind: "disomic", parameters: {} }],
    expressionPipeline: [],
    missingStatePolicy: "propagate",
    rng: { algorithm: "mulberry32-derived", algorithmVersion: "1.0.0", derivedNamespaces: ["founder"] },
  };
}

describe("GEN-1 foundation: registry/config/genotype", () => {
  it("creates valid founder genomes deterministically and preserves allele states", () => {
    const registry = makeRegistry();
    const config = makeConfig();
    const rng1 = createRng(42, "founder");
    const rng2 = createRng(42, "founder");
    const g1 = createFounderGenome({ organismId: 1, registry, config, rng: rng1 });
    const g2 = createFounderGenome({ organismId: 1, registry, config, rng: rng2 });
    expect(g1.fingerprint).toBe(g2.fingerprint);
    expect(validateGenome(g1, registry).ok).toBe(true);
    expect(g1.chromosomes.length).toBe(2);
    for (const c of g1.chromosomes) {
      expect(c.homologousGroup).toBe("g1");
      for (const l of c.loci) expect(["identified", "biologically-absent", "undetermined", "non-evaluable"]).toContain(l.alleleState.kind);
    }
  });

  it("supports uniform and aneuploid ploidy invariants", () => {
    const registry = makeRegistry();
    const aneuploid: PloidyModel = { kind: "aneuploid", byGroup: { g1: 3 }, globalPloidy: null };
    const config = makeConfig(aneuploid);
    const g = createFounderGenome({ organismId: 2, registry, config, rng: createRng(1) });
    expect(g.ploidyModel.kind).toBe("aneuploid");
    expect(g.ploidyModel.globalPloidy).toBeNull();
    expect(g.chromosomes.length).toBe(3);
    expect(validateGenome(g, registry).ok).toBe(true);

    // invalid uniform global/count
    const bad: PloidyModel = { kind: "uniform", byGroup: { g1: 2 }, globalPloidy: 3 };
    expect(() => makeConfig(bad)).not.toThrow();
    const badGenome = { ...g, ploidyModel: bad } as typeof g;
    expect(validateGenome(badGenome, registry).ok).toBe(false);
  });

  it("keeps stable copy IDs deterministic for same inputs", () => {
    const registry = makeRegistry();
    const config = makeConfig();
    const a = createFounderGenome({ organismId: 7, registry, config, rng: createRng(9) });
    const b = createFounderGenome({ organismId: 7, registry, config, rng: createRng(9) });
    expect(a.chromosomes.map((c) => c.copyId)).toEqual(b.chromosomes.map((c) => c.copyId));
  });
});

describe("GEN-1 foundation: custom functions and mutation/replay/development", () => {
  it("validates custom function presence and compatibility (G5)", () => {
    const registry = makeRegistry();
    expect(validateCustomFunctionUse({ functionId: "scale", version: "1.0.0" }, registry).ok).toBe(true);
    expect(validateCustomFunctionUse({ functionId: "scale", version: "2.0.0" }, registry).ok).toBe(false);
    expect(validateCustomFunctionUse({ functionId: "missing", version: "1.0.0" }, registry).ok).toBe(false);
  });

  it("validates discriminated mutation events and rejects impossible combinations (G1/G4)", () => {
    const registry = makeRegistry();
    const baseEvent = {
      id: "m1",
      tick: 10,
      origin: "germline-de-novo" as const,
      organismId: 1,
      generation: 1,
      contributionId: "c1",
      chromosomeIds: ["chr1"],
      copyIds: ["chr_1"],
      registryId: registry.id,
      registryVersion: registry.version,
      engineVersion: registry.engineVersion,
      schemaVersion: 1,
      causedBy: [],
      rng: { algorithm: "mulberry32-derived", algorithmVersion: "1.0.0", rootSeed: 1, namespace: "mut", salt: "x", stateBefore: "1", stateAfter: "2", drawCount: 1, engineVersion: ENGINE_VERSION },
      replay: { registryId: registry.id, registryVersion: registry.version, registryFingerprint: registry.fingerprint, engineVersion: registry.engineVersion, schemaVersion: 1, rngAlgorithm: "mulberry32-derived", rngAlgorithmVersion: "1.0.0", parametersHash: "ph", operation: "point-mutation" },
    };
    const affected: AffectedLocusState = {
      locusId: "loc1",
      chromosomeCopyId: "chr_1",
      positionBp: 100,
      intervalBp: null,
      previousState: { kind: "identified", alleleId: "a1" },
      resultingState: { kind: "identified", alleleId: "a2" },
    };
    const point: MutationEvent = {
      ...baseEvent,
      operation: "point-mutation",
      scope: "point",
      positionBp: 100,
      affectedLoci: [affected],
      previousStructure: { chromosomeDefinitionId: "chr1", fromBp: 100, toBp: 100, orientation: "forward", loci: [affected] },
      resultingStructure: { chromosomeDefinitionId: "chr1", fromBp: 100, toBp: 100, orientation: "forward", loci: [{ ...affected, previousState: affected.resultingState, resultingState: affected.previousState }] },
    };
    expect(validateMutationEvent(point, registry).ok).toBe(true);

    // point-mutation with chromosomal scope is invalid by type/contract; runtime should reject
    const bad = { ...point, scope: "chromosomal" } as unknown as MutationEvent;
    expect(validateMutationEvent(bad, registry).ok).toBe(false);

    // intergenic deletion without affectedLoci allowed
    const del: MutationEvent = {
      ...baseEvent,
      replay: { ...baseEvent.replay, operation: "deletion" },
      operation: "deletion",
      scope: "interval",
      target: { chromosomeDefinitionId: "chr1", chromosomeCopyId: "chr_1", homologousGroup: "g1", interval: { fromBp: 300, toBp: 350 } },
      deletedInterval: { chromosomeDefinitionId: "chr1", chromosomeCopyId: "chr_1", fromBp: 300, toBp: 350, intergenic: true },
      removedMaterial: { chromosomeDefinitionId: "chr1", fromBp: 300, toBp: 350, orientation: "forward", loci: [] },
      previousStructure: { chromosomeDefinitionId: "chr1", fromBp: 300, toBp: 350, orientation: "forward", loci: [] },
      resultingStructure: { chromosomeDefinitionId: "chr1", fromBp: 300, toBp: 300, orientation: "forward", loci: [] },
    };
    expect(validateMutationEvent(del, registry).ok).toBe(true);

    const aneuploidy: MutationEvent = {
      ...baseEvent,
      replay: { ...baseEvent.replay, operation: "aneuploidy" },
      operation: "aneuploidy",
      scope: "chromosomal",
      homologousGroup: "g1",
      previousCopyCount: 2,
      resultingCopyCount: 3,
      affectedCopies: ["chr_extra"],
      previousStructures: [{ chromosomeDefinitionId: "chr1", chromosomeCopyId: "chr_1", homologousGroup: "g1", interval: null }],
      resultingStructures: [
        { chromosomeDefinitionId: "chr1", chromosomeCopyId: "chr_1", homologousGroup: "g1", interval: null },
        { chromosomeDefinitionId: "chr1", chromosomeCopyId: "chr_extra", homologousGroup: "g1", interval: null },
      ],
    };
    expect(validateMutationEvent(aneuploidy, registry).ok).toBe(true);
  });

  it("replay is discriminated and incompatible on mismatch (G1/G5 context)", () => {
    const registry = makeRegistry();
    const event: MutationEvent = {
      id: "m2", tick: 1, origin: "germline-de-novo", organismId: 1, generation: 1, contributionId: "c1",
      chromosomeIds: ["chr1"], copyIds: ["chr_1"], registryId: registry.id, registryVersion: registry.version,
      engineVersion: registry.engineVersion, schemaVersion: 1, causedBy: [],
      rng: { algorithm: "mulberry32-derived", algorithmVersion: "1.0.0", rootSeed: 1, namespace: "mut", salt: "x", stateBefore: "1", stateAfter: "2", drawCount: 1, engineVersion: ENGINE_VERSION },
      replay: { registryId: registry.id, registryVersion: registry.version, registryFingerprint: registry.fingerprint, engineVersion: registry.engineVersion, schemaVersion: 1, rngAlgorithm: "mulberry32-derived", rngAlgorithmVersion: "1.0.0", parametersHash: "ph", operation: "point-mutation", customFunctionRegistryFingerprint: "cfp" },
      operation: "point-mutation", scope: "point", positionBp: 100,
      affectedLoci: [{ locusId: "loc1", chromosomeCopyId: "chr_1", positionBp: 100, intervalBp: null, previousState: { kind: "identified", alleleId: "a1" }, resultingState: { kind: "identified", alleleId: "a2" } }],
      previousStructure: { chromosomeDefinitionId: "chr1", fromBp: 100, toBp: 100, orientation: "forward", loci: [] },
      resultingStructure: { chromosomeDefinitionId: "chr1", fromBp: 100, toBp: 100, orientation: "forward", loci: [] },
    };
    const ok = replayEvent(event, event.replay);
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") expect(ok.value.id).toBe("m2");
    const bad = replayEvent(event, { ...event.replay, registryFingerprint: "other" });
    expect(bad.status).toBe("incompatible");
    if (bad.status === "incompatible") {
      expect(bad.value).toBeNull();
      expect(bad.mismatches.length).toBeGreaterThan(0);
    }
  });

  it("separates develop() and derivePhenotype() (G2) without duplicating expression/plasticity channels", () => {
    const expression: GeneticExpression = {
      organismId: 1,
      channels: { "ch.size": { channelId: "ch.size", unit: "u", state: "value", value: 2, appliedRuleIds: [] } },
      derivation: "DERIVED",
      fingerprint: "expr1",
    };
    const dev = develop({ organismId: 1, tick: 5, tickReference: "t5", age: 5, ageUnit: "ticks", expression, plasticity: null, stage: "juvenile" });
    expect(dev.expressionRef).toBe("expr1");
    expect((dev as unknown as Record<string, unknown>).channels).toBeUndefined();
    const fp = derivePhenotype({ organismId: 1, tick: 5, genotypeFingerprint: "gfp", expression, plasticity: null, developmentalState: dev });
    expect(fp.developmentalStateRef).toContain("juvenile");
    expect(fp.expressionRef).toBe("expr1");
    expect(fp.channels).toEqual(expression.channels);
  });
});
