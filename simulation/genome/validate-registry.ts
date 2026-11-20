import { isFiniteNumber, issue } from "./id";
import type { CustomFunctionDefinition, GenomeConfig, GenomeRegistry, PloidyModel, ValidationIssue } from "./types";

export function validatePloidyModel(model: PloidyModel, groups: readonly string[], path = "ploidyModel"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = Object.keys(model.byGroup);
  for (const g of groups) {
    if (!(g in model.byGroup)) issues.push(issue("ploidy.missing-group", `${path}.byGroup.${g}`, `missing ploidy for group ${g}`));
  }
  for (const [g, n] of Object.entries(model.byGroup)) {
    if (!Number.isInteger(n) || n < 0) issues.push(issue("ploidy.invalid-copy-count", `${path}.byGroup.${g}`, "copy count must be integer >= 0"));
    if (!groups.includes(g)) issues.push(issue("ploidy.unknown-group", `${path}.byGroup.${g}`, "group not declared in config/registry context"));
  }
  if (model.kind === "uniform") {
    const values = Object.values(model.byGroup);
    if (values.length === 0) issues.push(issue("ploidy.empty", path, "uniform ploidy must declare groups"));
    const first = values[0];
    if (values.some((v) => v !== first)) issues.push(issue("ploidy.non-uniform-values", path, "uniform ploidy requires equal copy counts"));
    if (!Number.isInteger(model.globalPloidy) || model.globalPloidy < 1) {
      issues.push(issue("ploidy.invalid-global", `${path}.globalPloidy`, "uniform ploidy requires valid globalPloidy"));
    } else if (first !== undefined && model.globalPloidy !== first) {
      issues.push(issue("ploidy.global-mismatch", `${path}.globalPloidy`, "globalPloidy must equal group copy count"));
    }
  } else {
    if (model.globalPloidy !== null) issues.push(issue("ploidy.aneuploid-global", `${path}.globalPloidy`, "aneuploid ploidy must have globalPloidy null"));
  }
  void keys;
  return issues;
}

export function validateCustomFunctionDefinition(def: CustomFunctionDefinition, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!def.functionId) issues.push(issue("custom.id.missing", `${path}.functionId`, "functionId required"));
  if (!def.version) issues.push(issue("custom.version.missing", `${path}.version`, "version required"));
  if (def.deterministic !== true) issues.push(issue("custom.determinism.flag", `${path}.deterministic`, "custom function must declare deterministic true"));
  if (!def.determinismContract) issues.push(issue("custom.determinism.contract", `${path}.determinismContract`, "determinismContract required"));
  if (!def.implementation?.implementationId) issues.push(issue("custom.impl.missing", `${path}.implementation`, "implementation required"));
  if (!def.signature) issues.push(issue("custom.signature.missing", `${path}.signature`, "signature required"));
  const checkDomain = (dom: { min: number; max: number }, p: string) => {
    if (!isFiniteNumber(dom?.min) || !isFiniteNumber(dom?.max)) issues.push(issue("custom.domain.non-finite", p, "domain bounds must be finite"));
    else if (dom.min > dom.max) issues.push(issue("custom.domain.order", p, "domain.min must be <= domain.max"));
  };
  for (let i = 0; i < (def.signature?.inputs?.length ?? 0); i++) {
    const inp = def.signature.inputs[i];
    checkDomain(inp.domain, `${path}.signature.inputs.${i}.domain`);
    if (!inp.unit) issues.push(issue("custom.unit.missing", `${path}.signature.inputs.${i}.unit`, "unit required"));
  }
  if (def.signature?.output) {
    checkDomain(def.signature.output.domain, `${path}.signature.output.domain`);
    if (!def.signature.output.unit) issues.push(issue("custom.unit.missing", `${path}.signature.output.unit`, "unit required"));
  }
  if (typeof def.replayCompatible !== "boolean") issues.push(issue("custom.replay.flag", `${path}.replayCompatible`, "replayCompatible must be boolean"));
  if (typeof def.serializationCompatible !== "boolean") issues.push(issue("custom.serialization.flag", `${path}.serializationCompatible`, "serializationCompatible must be boolean"));
  return issues;
}

export function validateRegistry(registry: GenomeRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!registry.id) issues.push(issue("registry.id", "id", "id required"));
  if (!registry.version) issues.push(issue("registry.version", "version", "version required"));
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion < 1) issues.push(issue("registry.schema", "schemaVersion", "schemaVersion must be >= 1"));
  for (const [id, ch] of Object.entries(registry.chromosomes)) {
    if (ch.id !== id) issues.push(issue("registry.chromosome.id", `chromosomes.${id}`, "chromosome key/id mismatch"));
    if (!Number.isInteger(ch.lengthBp) || ch.lengthBp <= 0) issues.push(issue("registry.chromosome.length", `chromosomes.${id}.lengthBp`, "lengthBp must be > 0"));
    if (!Number.isInteger(ch.centromereBp) || ch.centromereBp < 0 || ch.centromereBp > ch.lengthBp) issues.push(issue("registry.chromosome.centromere", `chromosomes.${id}.centromereBp`, "centromereBp out of range"));
    if (!isFiniteNumber(ch.recombinationRateCmPerMb) || ch.recombinationRateCmPerMb < 0) issues.push(issue("registry.chromosome.rate", `chromosomes.${id}.recombinationRateCmPerMb`, "recombination rate must be finite >= 0"));
  }
  for (const [id, locus] of Object.entries(registry.loci)) {
    if (locus.id !== id) issues.push(issue("registry.locus.id", `loci.${id}`, "locus key/id mismatch"));
    const chr = registry.chromosomes[locus.chromosomeId];
    if (!chr) issues.push(issue("registry.locus.chromosome", `loci.${id}.chromosomeId`, "unknown chromosome"));
    else {
      if (!Number.isInteger(locus.positionBp) || locus.positionBp < 0 || locus.positionBp > chr.lengthBp) issues.push(issue("registry.locus.position", `loci.${id}.positionBp`, "positionBp out of chromosome range"));
    }
    if (!isFiniteNumber(locus.positionCm)) issues.push(issue("registry.locus.positionCm", `loci.${id}.positionCm`, "positionCm must be finite"));
    for (const a of locus.alleleCatalog) if (!registry.alleles[a]) issues.push(issue("registry.locus.allele", `loci.${id}.alleleCatalog`, `unknown allele ${a}`));
    for (const c of locus.traitChannels) if (!registry.traitChannels[c]) issues.push(issue("registry.locus.channel", `loci.${id}.traitChannels`, `unknown channel ${c}`));
    if (!isFiniteNumber(locus.recombination.interference) || locus.recombination.interference < 0) issues.push(issue("registry.locus.interference", `loci.${id}.recombination.interference`, "interference must be finite >= 0"));
  }
  for (const [id, allele] of Object.entries(registry.alleles)) {
    if (allele.id !== id) issues.push(issue("registry.allele.id", `alleles.${id}`, "allele key/id mismatch"));
    if (!registry.loci[allele.locusId]) issues.push(issue("registry.allele.locus", `alleles.${id}.locusId`, "unknown locus"));
    if (!isFiniteNumber(allele.baselineActivity)) issues.push(issue("registry.allele.activity", `alleles.${id}.baselineActivity`, "baselineActivity must be finite"));
    for (const [chId, v] of Object.entries(allele.effectProfile)) {
      if (!registry.traitChannels[chId]) issues.push(issue("registry.allele.channel", `alleles.${id}.effectProfile.${chId}`, "unknown channel"));
      if (!isFiniteNumber(v)) issues.push(issue("registry.allele.effect", `alleles.${id}.effectProfile.${chId}`, "effect must be finite"));
    }
  }
  for (const [id, chDef] of Object.entries(registry.traitChannels)) {
    if (chDef.id !== id) issues.push(issue("registry.channel.id", `traitChannels.${id}`, "channel key/id mismatch"));
    if (!isFiniteNumber(chDef.domain.min) || !isFiniteNumber(chDef.domain.max)) issues.push(issue("registry.channel.domain", `traitChannels.${id}.domain`, "domain must be finite"));
    else if (chDef.domain.min > chDef.domain.max) issues.push(issue("registry.channel.domain-order", `traitChannels.${id}.domain`, "domain.min must be <= domain.max"));
    if (!chDef.unit) issues.push(issue("registry.channel.unit", `traitChannels.${id}.unit`, "unit required"));
    if (chDef.normalization.method === "custom") {
      if (!chDef.normalization.customFunctionId || !chDef.normalization.customFunctionVersion) {
        issues.push(issue("registry.channel.custom-ref", `traitChannels.${id}.normalization`, "custom normalization requires function id and version"));
      } else {
        const key = `${chDef.normalization.customFunctionId}@${chDef.normalization.customFunctionVersion}`;
        if (!registry.customFunctions[key]) issues.push(issue("registry.channel.custom-missing", `traitChannels.${id}.normalization`, `custom function ${key} not in registry`));
      }
    }
    if (chDef.clampPolicy === "explicit-fallback" as never) {
      // unreachable by type, ignore
    }
    if (chDef.missingInputPolicy === "explicit-fallback" && !isFiniteNumber(chDef.fallbackValue)) {
      issues.push(issue("registry.channel.fallback", `traitChannels.${id}.fallbackValue`, "explicit-fallback requires finite fallbackValue"));
    }
  }
  for (const [key, fn] of Object.entries(registry.customFunctions)) {
    if (key !== `${fn.functionId}@${fn.version}`) issues.push(issue("registry.custom.key", `customFunctions.${key}`, "custom function key must be functionId@version"));
    issues.push(...validateCustomFunctionDefinition(fn, `customFunctions.${key}`));
  }
  return issues;
}

export function validateGenomeConfig(config: GenomeConfig, registry?: GenomeRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(config.schemaVersion) || config.schemaVersion < 1) issues.push(issue("config.schema", "schemaVersion", "schemaVersion must be >= 1"));
  if (!config.registryId) issues.push(issue("config.registry-id", "registryId", "registryId required"));
  if (config.homologousGroups.length === 0) issues.push(issue("config.groups", "homologousGroups", "must declare at least one homologous group"));
  issues.push(...validatePloidyModel(config.defaultPloidyModel, config.homologousGroups, "defaultPloidyModel"));
  for (const [k, v] of Object.entries(config.mutationRates)) {
    if (!isFiniteNumber(v) || v < 0) issues.push(issue("config.mutation-rate", `mutationRates.${k}`, "mutation rate must be finite >= 0"));
  }
  if (!Number.isInteger(config.recombination.crossoversPerChromosome.min) || !Number.isInteger(config.recombination.crossoversPerChromosome.max)) {
    issues.push(issue("config.recombination.crossovers", "recombination.crossoversPerChromosome", "crossover bounds must be integers"));
  } else if (config.recombination.crossoversPerChromosome.min < 0 || config.recombination.crossoversPerChromosome.max < config.recombination.crossoversPerChromosome.min) {
    issues.push(issue("config.recombination.crossovers-range", "recombination.crossoversPerChromosome", "invalid crossover range"));
  }
  if (!isFiniteNumber(config.recombination.interference)) issues.push(issue("config.recombination.interference", "recombination.interference", "interference must be finite"));
  if (registry) {
    if (registry.id !== config.registryId) issues.push(issue("config.registry-mismatch.id", "registryId", "config.registryId must match registry.id"));
    if (registry.version !== config.registryVersion) issues.push(issue("config.registry-mismatch.version", "registryVersion", "config.registryVersion must match registry.version"));
    // groups consistency: all registry chromosome groups must be declared
    const regGroups = new Set(Object.values(registry.chromosomes).map((c) => c.homologousGroup));
    for (const g of regGroups) if (!config.homologousGroups.includes(g)) issues.push(issue("config.group.missing-registry", `homologousGroups`, `missing registry group ${g}`));
  }
  return issues;
}
