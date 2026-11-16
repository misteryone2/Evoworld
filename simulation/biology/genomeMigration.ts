/**
 * v1.11.0 — Migrazione del genoma (specifica di Vibe §6): al caricamento, pura, idempotente, senza perdita di
 * informazione, mai eccezioni (un salvataggio deve sempre caricare). Non usa il generatore casuale né stato globale.
 */
import type { GeneMap, Genome, WorldSnapshot } from "../../types";
import { EXTENDED_GENES, GENE_BY_KEY, GENOME_VERSION_CURRENT, LEGACY_KEYS, clampToGene } from "./geneRegistry";

export interface MigrationResult {
  genome: Genome;
  issues: string[];
}

/**
 * v1 → v2: ogni gene esteso mancante = predefinito; i 13 tratti storici passano intatti (clamp difensivo); NaN/Infinity/
 * fuori intervallo → clamp o predefinito con una issue; chiavi sconosciute conservate in `ext` (ignorate da espressione e
 * distanza); assenza di dati (null, oggetto vuoto) = tutto predefinito.
 */
export function migrateGenome(raw: unknown, fromVersion: number): MigrationResult {
  void fromVersion; // oggi una sola catena (v1 → v2): la versione resta nel contratto per le catene future
  const issues: string[] = [];
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  for (const key of LEGACY_KEYS) {
    const def = GENE_BY_KEY.get(key)!;
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      out[key] = def.defaultValue;
      issues.push(`invalid:${key}`);
    } else if (v < def.min || v > def.max) {
      out[key] = clampToGene(def, v);
      issues.push(`clamped:${key}`);
    }
  }
  const srcExt = src.ext && typeof src.ext === "object" ? (src.ext as Record<string, unknown>) : {};
  const ext: GeneMap = {};
  for (const [key, v] of Object.entries(srcExt)) {
    if (!GENE_BY_KEY.has(key) || GENE_BY_KEY.get(key)!.category === "legacy") ext[key] = v as number; // conservata, non letta
  }
  for (const def of EXTENDED_GENES) {
    const v = srcExt[def.key];
    if (v === undefined) ext[def.key] = def.defaultValue;
    else if (typeof v !== "number" || !Number.isFinite(v)) {
      ext[def.key] = def.defaultValue;
      issues.push(`invalid:${def.key}`);
    } else if (v < def.min || v > def.max) {
      ext[def.key] = clampToGene(def, v);
      issues.push(`clamped:${def.key}`);
    } else ext[def.key] = v;
  }
  out.ext = ext;
  return { genome: out as unknown as Genome, issues };
}

/**
 * Migra tutti i genomi di uno snapshot e lo marca con la versione corrente. Non modifica l'originale. Il cervello, le
 * specie, il pianeta e tutto il resto passano intatti. Con `advancedGenome === false` (mondo senza geni estesi) i genomi non si toccano.
 */
export function migrateSnapshot(snapshot: WorldSnapshot): { snapshot: WorldSnapshot; issues: string[] } {
  const issues: string[] = [];
  if (snapshot.advancedGenome === false) return { snapshot, issues };
  const from = snapshot.genomeVersion ?? 1;
  const organisms = snapshot.organisms.map((o) => {
    const res = migrateGenome(o.genome, from);
    for (const i of res.issues) issues.push(`organism ${o.id}: ${i}`);
    return { ...o, genome: res.genome };
  });
  return { snapshot: { ...snapshot, organisms, genomeVersion: GENOME_VERSION_CURRENT }, issues };
}
