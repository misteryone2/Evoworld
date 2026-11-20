import { describe, expect, it } from "vitest";
import { createRegistry, buildCustomFunctionRegistry, ENGINE_VERSION } from "../../simulation/genome/id";
import { createRng } from "../../simulation/genome/rng";
import { createFounderGenome, validateGenome } from "../../simulation/genome/genotype";
import { deserializeGenome, migrateGenome, serializeGenome } from "../../simulation/genome/serialization";
import type { GenomeConfig, GenomeRegistry, PloidyModel, VersionSet } from "../../simulation/genome/types";

function reg(): GenomeRegistry {
  return createRegistry({
    id: "reg-s",
    version: "1.0.0",
    engineVersion: ENGINE_VERSION,
    schemaVersion: 1,
    traitChannels: {
      ch: { id: "ch", description: "c", unit: "u", semantics: "s", domain: { min: 0, max: 1 }, normalization: { method: "none", parameters: {} }, clampPolicy: "clamp", missingInputPolicy: "propagate-undetermined" },
    },
    chromosomes: {
      c1: { id: "c1", homologousGroup: "g1", lengthBp: 100, centromereBp: 50, recombinationRateCmPerMb: 1, locusOrder: ["l1"] },
      c2: { id: "c2", homologousGroup: "g2", lengthBp: 100, centromereBp: 50, recombinationRateCmPerMb: 1, locusOrder: ["l2"] },
    },
    loci: {
      l1: { id: "l1", chromosomeId: "c1", positionBp: 10, positionCm: 0.1, strand: "+", alleleCatalog: ["a"], traitChannels: ["ch"], expressionRuleIds: [], recombination: { crossoverAllowed: true, interference: 0, hotspot: false } },
      l2: { id: "l2", chromosomeId: "c2", positionBp: 20, positionCm: 0.2, strand: "+", alleleCatalog: ["b"], traitChannels: ["ch"], expressionRuleIds: [], recombination: { crossoverAllowed: true, interference: 0, hotspot: false } },
    },
    alleles: {
      a: { id: "a", locusId: "l1", symbol: "A", effectProfile: { ch: 1 }, baselineActivity: 1, regulatoryTargets: [], interactionTags: [], catalogOrigin: "founder" },
      b: { id: "b", locusId: "l2", symbol: "B", effectProfile: { ch: 1 }, baselineActivity: 1, regulatoryTargets: [], interactionTags: [], catalogOrigin: "founder" },
    },
    expressionRules: {},
    mutationRules: {},
    customFunctions: buildCustomFunctionRegistry([]),
  });
}

function cfg(ploidy: PloidyModel): GenomeConfig {
  return {
    schemaVersion: 1,
    registryId: "reg-s",
    registryVersion: "1.0.0",
    engineVersion: ENGINE_VERSION,
    planetEnvironmentContractVersion: "1.0.0",
    homologousGroups: ["g1", "g2"],
    defaultPloidyModel: ploidy,
    founderStrategy: "seeded-draw",
    mutationRates: {},
    recombination: { crossoversPerChromosome: { min: 0, max: 1 }, interference: 0, hotspotsEnabled: false },
    gameteFormationModes: ["none"],
    segregationRules: [],
    expressionPipeline: [],
    missingStatePolicy: "propagate",
    rng: { algorithm: "mulberry32-derived", algorithmVersion: "1.0.0", derivedNamespaces: [] },
  };
}

describe("GEN-1 serialization/migration and variable ploidy", () => {
  it("round-trips genomes canonically and preserves special allele states", () => {
    const registry = reg();
    const config = cfg({ kind: "uniform", byGroup: { g1: 2, g2: 2 }, globalPloidy: 2 });
    const g = createFounderGenome({ organismId: 1, registry, config, rng: createRng(3) });
    const mutated = {
      ...g,
      chromosomes: g.chromosomes.map((c, i) =>
        i === 0
          ? { ...c, loci: c.loci.map((l) => ({ ...l, alleleState: { kind: "biologically-absent" as const, reason: "deletion" as const } })) }
          : c,
      ),
    };
    const withFp = { ...mutated, fingerprint: "" } as typeof mutated;
    const serialized = serializeGenome(withFp);
    const d = deserializeGenome(serialized, registry);
    expect(d.status).toBe("ok");
    expect(d.value?.chromosomes[0].loci[0].alleleState.kind).toBe("biologically-absent");
    expect(JSON.stringify(serializeGenome(d.value!))).toBe(JSON.stringify(serialized));
  });

  it("migration is explicit for unsupported versions", () => {
    const registry = reg();
    const config = cfg({ kind: "uniform", byGroup: { g1: 1, g2: 1 }, globalPloidy: 1 });
    const g = createFounderGenome({ organismId: 1, registry, config, rng: createRng(3) });
    const from: VersionSet = { schemaVersion: 1, registryVersion: "1.0.0", engineVersion: ENGINE_VERSION, rngAlgorithmVersion: "1.0.0" };
    const toBad: VersionSet = { schemaVersion: 2, registryVersion: "1.0.0", engineVersion: ENGINE_VERSION, rngAlgorithmVersion: "1.0.0" };
    const res = migrateGenome(g, from, toBad, registry);
    expect(res.status).toBe("unsupported");
    expect(res.value).toBeNull();
  });

  it("handles variable sizes and aneuploid per-group counts", () => {
    const registry = reg();
    const cases: PloidyModel[] = [
      { kind: "uniform", byGroup: { g1: 1, g2: 1 }, globalPloidy: 1 },
      { kind: "uniform", byGroup: { g1: 4, g2: 4 }, globalPloidy: 4 },
      { kind: "aneuploid", byGroup: { g1: 2, g2: 3 }, globalPloidy: null },
      { kind: "aneuploid", byGroup: { g1: 1, g2: 5 }, globalPloidy: null },
    ];
    for (const p of cases) {
      const config = cfg(p);
      const g = createFounderGenome({ organismId: 10, registry, config, rng: createRng(11) });
      expect(validateGenome(g, registry).ok).toBe(true);
      expect(g.chromosomes.filter((c) => c.homologousGroup === "g1").length).toBe(p.byGroup.g1);
      expect(g.chromosomes.filter((c) => c.homologousGroup === "g2").length).toBe(p.byGroup.g2);
      for (const c of g.chromosomes) expect(c.loci.length).toBe(1);
    }
  });

  it("RNG streams are explicit and deterministic without global side effects", () => {
    const r = createRng(123, "ns", "salt");
    const a = [r.next(), r.next(), r.next()];
    const r2 = createRng(123, "ns", "salt");
    const b = [r2.next(), r2.next(), r2.next()];
    expect(a).toEqual(b);
    const fork = r2.fork("child", "x");
    expect(fork.next()).toBe(createRng(123, "ns/child", "x").next());
  });
});
