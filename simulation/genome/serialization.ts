import { computeFingerprint, customFunctionKey, withGenomeFingerprint } from "./id";
import type { GeneticGenome, GenomeRegistry, MigrationResult, VersionSet } from "./types";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortDeep(obj[k]);
    return out;
  }
  return value;
}

export function serializeGenome(genome: GeneticGenome): unknown {
  return sortDeep(withGenomeFingerprint({ ...genome, fingerprint: undefined as never }));
}

export function deserializeGenome(raw: unknown, registry: GenomeRegistry): MigrationResult<GeneticGenome> {
  const to: VersionSet = {
    schemaVersion: 1,
    registryVersion: registry.version,
    engineVersion: registry.engineVersion,
    rngAlgorithmVersion: "1.0.0",
  };
  if (!raw || typeof raw !== "object") {
    return { status: "error", value: null, from: to, to, issues: [{ code: "deserialize.invalid", path: "", detail: "raw must be object" }] };
  }
  const obj = raw as Partial<GeneticGenome> & Record<string, unknown>;
  const from: VersionSet = {
    schemaVersion: typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0,
    registryVersion: typeof obj.registryVersion === "string" ? obj.registryVersion : "0.0.0",
    engineVersion: typeof obj.engineVersion === "string" ? obj.engineVersion : "0.0.0",
    rngAlgorithmVersion: "1.0.0",
  };
  if (from.schemaVersion !== 1) {
    return { status: "unsupported", value: null, from, to, issues: [{ code: "deserialize.schema", path: "schemaVersion", detail: `unsupported schemaVersion ${String(from.schemaVersion)}` }] };
  }
  const genome = raw as GeneticGenome;
  // preserve as-is except fingerprint normalization
  const normalized = withGenomeFingerprint({ ...genome, fingerprint: undefined as never });
  return { status: "ok", value: normalized, from, to, issues: [] };
}

export function migrateGenome(
  raw: unknown,
  from: VersionSet,
  to: VersionSet,
  registry: GenomeRegistry,
): MigrationResult<GeneticGenome> {
  // GEN-1: only identity migration for schema 1 with same registry/engine versions; others unsupported.
  if (from.schemaVersion !== 1 || to.schemaVersion !== 1) {
    return { status: "unsupported", value: null, from, to, issues: [{ code: "migrate.schema", path: "schemaVersion", detail: "only schemaVersion 1 supported in GEN-1" }] };
  }
  if (from.registryVersion !== to.registryVersion || from.engineVersion !== to.engineVersion) {
    return { status: "unsupported", value: null, from, to, issues: [{ code: "migrate.version", path: "", detail: "registry/engine version migration not supported in GEN-1" }] };
  }
  const des = deserializeGenome(raw, registry);
  if (des.status !== "ok" || !des.value) return { ...des, from, to };
  return { status: from.registryVersion === to.registryVersion ? "ok" : "migrated", value: des.value, from, to, issues: [] };
}

export function canonicalGenomeFingerprint(genome: GeneticGenome): string {
  return computeFingerprint({ ...withGenomeFingerprint({ ...genome, fingerprint: undefined as never }), fingerprint: undefined });
}

export { customFunctionKey };
