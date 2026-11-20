import { canonicalJson, stableHash } from "./rng";
import type {
  AlleleDefinition,
  Chromosome,
  ChromosomeDefinition,
  CustomFunctionDefinition,
  CustomFunctionRegistry,
  GeneticGenome,
  GenomeConfig,
  GenomeRegistry,
  LocusDefinition,
  PloidyModel,
  TraitChannelDefinition,
  ValidationIssue,
  ValidationResult,
} from "./types";

export const ENGINE_VERSION = "0.0.0-gen1";

export function createGenomeId(prefix: string, ...parts: Array<string | number>): string {
  const base = parts.map((p) => String(p)).join(":");
  return `${prefix}_${stableHash(`${prefix}|${base}`)}_${parts.map((p) => String(p).replace(/[^a-zA-Z0-9._-]/g, "-")).join("_")}`.slice(0, 160);
}

export function computeFingerprint(value: unknown): string {
  return stableHash(canonicalJson(value));
}

export function customFunctionKey(def: Pick<CustomFunctionDefinition, "functionId" | "version">): string {
  return `${def.functionId}@${def.version}`;
}

export function buildCustomFunctionRegistry(defs: readonly CustomFunctionDefinition[]): CustomFunctionRegistry {
  const out: Record<string, CustomFunctionDefinition> = {};
  for (const d of defs) out[customFunctionKey(d)] = d;
  return out;
}

export function computeRegistryFingerprint(registry: Omit<GenomeRegistry, "fingerprint">): string {
  return computeFingerprint(registry);
}

export function createRegistry(input: Omit<GenomeRegistry, "fingerprint">): GenomeRegistry {
  return { ...input, fingerprint: computeRegistryFingerprint(input) };
}

export function computeGenomeFingerprint(genome: Omit<GeneticGenome, "fingerprint">): string {
  return computeFingerprint(genome);
}

export function withGenomeFingerprint(genome: Omit<GeneticGenome, "fingerprint">): GeneticGenome {
  return { ...genome, fingerprint: computeGenomeFingerprint(genome) };
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function ok(): ValidationResult {
  return { ok: true, issues: [] };
}

export function fail(issues: readonly ValidationIssue[]): ValidationResult {
  return { ok: issues.length === 0, issues };
}

export function issue(code: string, path: string, detail: string): ValidationIssue {
  return { code, path, detail };
}

export function groupChromosomeCounts(chromosomes: readonly Chromosome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of chromosomes) counts[c.homologousGroup] = (counts[c.homologousGroup] ?? 0) + 1;
  return counts;
}

export function expectedGroups(config: GenomeConfig): readonly string[] {
  return config.homologousGroups;
}

export function ploidyForGroup(model: PloidyModel, group: string): number | null {
  const v = model.byGroup[group];
  return typeof v === "number" ? v : null;
}

export function collectLocusIndex(registry: GenomeRegistry): Record<string, LocusDefinition> {
  return { ...registry.loci };
}

export function chromosomeDef(registry: GenomeRegistry, id: string): ChromosomeDefinition | undefined {
  return registry.chromosomes[id];
}

export function alleleDef(registry: GenomeRegistry, id: string): AlleleDefinition | undefined {
  return registry.alleles[id];
}

export function channelDef(registry: GenomeRegistry, id: string): TraitChannelDefinition | undefined {
  return registry.traitChannels[id];
}
