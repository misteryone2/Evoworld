import { createGenomeId, computeFingerprint, fail, groupChromosomeCounts, isFiniteNumber, issue, ok, withGenomeFingerprint } from "./id";
import { validatePloidyModel, validateRegistry } from "./validate-registry";
import type {
  AlleleState,
  Chromosome,
  FounderInput,
  GeneticContribution,
  GeneticGenome,
  GenomeRegistry,
  LocusCall,
  ValidationIssue,
  ValidationResult,
} from "./types";

export function validateAlleleState(state: AlleleState, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!state || typeof state !== "object") return [issue("allele.invalid", path, "allele state must be object")];
  if (state.kind === "identified") {
    if (!state.alleleId) issues.push(issue("allele.identified.missing-id", `${path}.alleleId`, "identified allele requires alleleId"));
  } else if (state.kind === "biologically-absent") {
    if (!state.reason) issues.push(issue("allele.absent.reason", `${path}.reason`, "biologically-absent requires reason"));
  } else if (state.kind === "undetermined") {
    if (!state.reason) issues.push(issue("allele.undetermined.reason", `${path}.reason`, "undetermined requires reason"));
  } else if (state.kind === "non-evaluable") {
    if (!state.reason) issues.push(issue("allele.non-evaluable.reason", `${path}.reason`, "non-evaluable requires reason"));
  } else {
    issues.push(issue("allele.kind.unknown", `${path}.kind`, "unknown allele state kind"));
  }
  return issues;
}

export function validateGenome(genome: GeneticGenome, registry: GenomeRegistry): ValidationResult {
  const issues: ValidationIssue[] = [];
  issues.push(...validateRegistry(registry));
  if (genome.schemaVersion !== 1) issues.push(issue("genome.schema", "schemaVersion", "schemaVersion must be 1"));
  if (genome.registryId !== registry.id) issues.push(issue("genome.registry.id", "registryId", "genome.registryId must match registry.id"));
  if (genome.registryVersion !== registry.version) issues.push(issue("genome.registry.version", "registryVersion", "genome.registryVersion must match registry.version"));
  const groups = Array.from(new Set(Object.values(registry.chromosomes).map((c) => c.homologousGroup))).sort();
  issues.push(...validatePloidyModel(genome.ploidyModel, groups, "ploidyModel"));
  const counts = groupChromosomeCounts(genome.chromosomes);
  for (const g of groups) {
    const expected = genome.ploidyModel.byGroup[g];
    const actual = counts[g] ?? 0;
    if (expected !== actual) issues.push(issue("genome.ploidy.count", `chromosomes.group.${g}`, `expected ${expected} copies, got ${actual}`));
  }
  for (let i = 0; i < genome.chromosomes.length; i++) {
    const c = genome.chromosomes[i];
    const path = `chromosomes.${i}`;
    const def = registry.chromosomes[c.definitionId];
    if (!def) issues.push(issue("genome.chromosome.def", `${path}.definitionId`, "unknown chromosome definition"));
    else {
      if (c.homologousGroup !== def.homologousGroup) issues.push(issue("genome.chromosome.group", `${path}.homologousGroup`, "chromosome group must match definition"));
    }
    if (!c.copyId) issues.push(issue("genome.chromosome.copy-id", `${path}.copyId`, "copyId required"));
    if (!c.contributionId) issues.push(issue("genome.chromosome.contribution", `${path}.contributionId`, "contributionId required"));
    else if (!genome.contributions[c.contributionId]) issues.push(issue("genome.chromosome.contribution-missing", `${path}.contributionId`, "contribution not found"));
    for (let j = 0; j < c.loci.length; j++) {
      const lc = c.loci[j];
      const lp = `${path}.loci.${j}`;
      const ldef = registry.loci[lc.locusId];
      if (!ldef) issues.push(issue("genome.locus.def", `${lp}.locusId`, "unknown locus"));
      else {
        if (ldef.chromosomeId !== c.definitionId) issues.push(issue("genome.locus.chromosome", `${lp}.locusId`, "locus chromosome mismatch"));
        if (!Number.isInteger(lc.positionBp)) issues.push(issue("genome.locus.position", `${lp}.positionBp`, "positionBp must be integer"));
        else if (lc.positionBp !== ldef.positionBp) issues.push(issue("genome.locus.position-mismatch", `${lp}.positionBp`, "positionBp must match locus definition"));
      }
      issues.push(...validateAlleleState(lc.alleleState, `${lp}.alleleState`));
      if (lc.alleleState.kind === "identified") {
        const ad = registry.alleles[lc.alleleState.alleleId];
        if (!ad) issues.push(issue("genome.allele.unknown", `${lp}.alleleState.alleleId`, "unknown allele"));
        else if (ad.locusId !== lc.locusId) issues.push(issue("genome.allele.locus-mismatch", `${lp}.alleleState.alleleId`, "allele does not belong to locus"));
      }
      for (const m of lc.mutationEventIds) if (!m) issues.push(issue("genome.locus.mutation-id", `${lp}.mutationEventIds`, "mutation event id must be non-empty"));
    }
  }
  // copy ids unique
  const copyIds = new Set<string>();
  for (let i = 0; i < genome.chromosomes.length; i++) {
    const id = genome.chromosomes[i].copyId;
    if (copyIds.has(id)) issues.push(issue("genome.copy-id.duplicate", `chromosomes.${i}.copyId`, "duplicate copyId"));
    copyIds.add(id);
  }
  // fingerprint consistency if provided
  const expectedFingerprint = computeFingerprint({ ...genome, fingerprint: undefined });
  if (genome.fingerprint && genome.fingerprint !== expectedFingerprint) {
    issues.push(issue("genome.fingerprint.mismatch", "fingerprint", "fingerprint does not match canonical genome content"));
  }
  // numeric sanity on contributions
  for (const [id, c] of Object.entries(genome.contributions)) {
    if (c.contributionId !== id) issues.push(issue("genome.contribution.id", `contributions.${id}`, "contribution key/id mismatch"));
  }
  void isFiniteNumber;
  return fail(issues);
}

export function createFounderGenome(input: FounderInput): GeneticGenome {
  const { organismId, registry, config, rng, draw } = input;
  const contributionId = createGenomeId("contrib", organismId, "founder");
  const contribution: GeneticContribution = {
    contributionId,
    contributorId: null,
    organismId,
    gameteId: null,
    confidence: "known",
    role: "founder",
  };
  const contributions = { [contributionId]: contribution };
  const chromosomes: Chromosome[] = [];
  const groups = [...config.homologousGroups].sort();
  for (const group of groups) {
    const copies = config.defaultPloidyModel.byGroup[group] ?? 0;
    const chrDefs = Object.values(registry.chromosomes)
      .filter((c) => c.homologousGroup === group)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (chrDefs.length === 0) throw new Error(`no chromosome definition for group ${group}`);
    for (let copy = 0; copy < copies; copy++) {
      for (const def of chrDefs) {
        const copyId = createGenomeId("chr", organismId, group, def.id, copy);
        const loci: LocusCall[] = def.locusOrder.map((locusId) => {
          const ldef = registry.loci[locusId];
          if (!ldef) throw new Error(`unknown locus ${locusId}`);
          let alleleState: AlleleState;
          if (draw && rng) alleleState = draw({ locusId, alleleCatalog: ldef.alleleCatalog, rng });
          else if (rng) {
            const pick = rng.pick(ldef.alleleCatalog);
            alleleState = { kind: "identified", alleleId: pick };
          } else {
            const first = ldef.alleleCatalog[0];
            alleleState = first ? { kind: "identified", alleleId: first } : { kind: "undetermined", reason: "not-yet-determined" };
          }
          return {
            locusId,
            positionBp: ldef.positionBp,
            alleleState,
            source: "founder",
            mutationEventIds: [],
          };
        });
        chromosomes.push({
          copyId,
          definitionId: def.id,
          homologousGroup: group,
          contributionId,
          loci,
        });
      }
    }
  }
  const genome: Omit<GeneticGenome, "fingerprint"> = {
    schemaVersion: 1,
    registryId: registry.id,
    registryVersion: registry.version,
    engineVersion: registry.engineVersion,
    organismId,
    ploidyModel: config.defaultPloidyModel,
    chromosomes,
    contributions,
  };
  const withFp = withGenomeFingerprint(genome);
  const validation = validateGenome(withFp, registry);
  if (!validation.ok) {
    throw new Error(`invalid founder genome: ${validation.issues.map((i) => `${i.code}@${i.path}`).join(", ")}`);
  }
  return withFp;
}

export function ensureGenome(genome: GeneticGenome, registry: GenomeRegistry): GeneticGenome {
  const v = validateGenome(genome, registry);
  if (!v.ok) throw new Error(`invalid genome: ${v.issues.map((i) => `${i.code}@${i.path}`).join(", ")}`);
  return withGenomeFingerprint({ ...genome, fingerprint: undefined as never });
}
