import { GENE_BY_KEY } from "../../simulation/biology/geneRegistry";
import { STATURE_RADIUS } from "../../simulation/biology/geneExpression";
import {
  PHENOTYPE_SCHEMA_VERSION,
  type DataSource,
  type DerivedNumber,
  type PhenotypeProfile,
  type PhenotypeTrait,
  type SurfaceCovering,
} from "./types";

/**
 * G2 — Interpretazione dei dati biologici. Legge SOLO i geni realmente morfologici presenti nel registro:
 * `size` (tratto storico), MOR-01 furDensity, MOR-02 dermalArmor, MOR-03 bodyStature.
 * Velocità, carnivoria, vista, evasione, abilità di caccia e ogni altro gene NON vengono letti: nessuna struttura
 * anatomica viene dedotta da correlazioni estetiche.
 */
export const MORPHOLOGICAL_GENE_KEYS = ["size", "bodyStature", "furDensity", "dermalArmor"] as const;
export type MorphologicalGeneKey = (typeof MORPHOLOGICAL_GENE_KEYS)[number];

/** Id nel registro dei geni morfologici letti (valore di `DataSource.genes`). */
export const MORPHOLOGICAL_GENE_IDS: readonly string[] = Object.freeze(
  MORPHOLOGICAL_GENE_KEYS.map((k) => {
    const def = GENE_BY_KEY.get(k);
    if (!def) throw new Error(`G2: gene morfologico assente dal registro: ${k}`);
    return def.id;
  }),
);

/** Soglia (frazione normalizzata) oltre cui una copertura è rappresentata (scelta di rappresentazione, non biologica). */
export const SURFACE_COVERING_THRESHOLD = 0.25;

/** Caratteristiche anatomiche non determinabili con i dati genetici attuali (vedi docs/graphics/G2_MISSING_GENETIC_DATA.md). */
export const UNDETERMINED_CHARACTERISTICS: readonly string[] = Object.freeze([
  "bodyPlan",
  "symmetry",
  "segmentation",
  "appendageCount",
  "limbCount",
  "jointStructure",
  "locomotionMode",
  "sensoryOrgans",
  "internalOrgans",
  "eyeCount",
]);

/** Forma minima di genoma accettata: un `Genome` del motore la soddisfa, ma si accetta anche un oggetto parziale. */
export interface PhenotypeGenomeInput {
  readonly size?: number;
  readonly ext?: Readonly<Record<string, number>>;
}

function readTrait(key: MorphologicalGeneKey, raw: unknown): PhenotypeTrait {
  const def = GENE_BY_KEY.get(key)!;
  const source: DataSource = Object.freeze({ kind: "gene-direct", genes: Object.freeze([def.id]), certainty: "exact" });
  const base = { key, geneId: def.id, source };
  if (raw === undefined || raw === null) return Object.freeze({ ...base, raw: null, value: null, status: "missing" as const });
  if (typeof raw !== "number" || !Number.isFinite(raw)) return Object.freeze({ ...base, raw: null, value: null, status: "invalid" as const });
  const clampedValue = raw < def.min ? def.min : raw > def.max ? def.max : raw;
  const span = def.max - def.min;
  const value = span > 0 ? (clampedValue - def.min) / span : 0;
  return Object.freeze({ ...base, raw, value, status: clampedValue !== raw ? ("clamped" as const) : ("present" as const) });
}

const undetermined = (note: string): DataSource => Object.freeze({ kind: "undetermined", genes: Object.freeze([]), certainty: "speculative", note });

function classifyCovering(fur: number | null, armor: number | null): { value: SurfaceCovering; source: DataSource } {
  const hasFur = fur !== null && fur >= SURFACE_COVERING_THRESHOLD;
  const hasArmor = armor !== null && armor >= SURFACE_COVERING_THRESHOLD;
  const genes = Object.freeze(["MOR-01", "MOR-02"].filter((id, i) => (i === 0 ? fur !== null : armor !== null)));
  if (hasFur && hasArmor) return { value: "mixed", source: Object.freeze({ kind: "gene-derived", genes, certainty: "derived", note: "pelo e corazza sopra soglia" }) };
  if (hasArmor) return { value: "dermal-plates", source: Object.freeze({ kind: "gene-derived", genes, certainty: "derived", note: "corazza sopra soglia" }) };
  if (hasFur) return { value: "fur", source: Object.freeze({ kind: "gene-derived", genes, certainty: "derived", note: "pelo sopra soglia" }) };
  if (fur !== null && armor !== null) return { value: "bare", source: Object.freeze({ kind: "gene-derived", genes, certainty: "derived", note: "entrambe le coperture sotto soglia" }) };
  return { value: "unspecified", source: undetermined("dati di copertura mancanti: non si afferma né presenza né assenza") };
}

export function derivePhenotype(input?: PhenotypeGenomeInput | null): PhenotypeProfile {
  const ext = input && typeof input.ext === "object" && input.ext !== null ? input.ext : undefined;
  const size = readTrait("size", input?.size);
  const bodyStature = readTrait("bodyStature", ext?.bodyStature);
  const furDensity = readTrait("furDensity", ext?.furDensity);
  const dermalArmor = readTrait("dermalArmor", ext?.dermalArmor);

  const issues: string[] = [];
  for (const t of [size, bodyStature, furDensity, dermalArmor]) if (t.status !== "present") issues.push(`${t.status}:${t.key}`);

  const sizeScale: DerivedNumber =
    size.value !== null
      ? { value: 0.9 + 0.6 * size.value, source: Object.freeze({ kind: "gene-derived", genes: Object.freeze([size.geneId]), certainty: "derived", note: "mappa monotona della taglia in scala di rappresentazione (0,9..1,5)" }) }
      : { value: 1.2, source: undetermined("taglia mancante: scala neutra") };
  const radiusFactor: DerivedNumber =
    bodyStature.value !== null
      ? { value: 1 + STATURE_RADIUS * 2 * (bodyStature.value - 0.5), source: Object.freeze({ kind: "gene-derived", genes: Object.freeze([bodyStature.geneId]), certainty: "derived", note: "stessa regola di bodyRadiusFactor del motore (MOR-03)" }) }
      : { value: 1, source: undetermined("corporatura mancante: fattore neutro") };

  return Object.freeze({
    schemaVersion: PHENOTYPE_SCHEMA_VERSION,
    traits: Object.freeze({ size, bodyStature, furDensity, dermalArmor }),
    derived: Object.freeze({
      sizeScale: Object.freeze(sizeScale),
      radiusFactor: Object.freeze(radiusFactor),
      surfaceCovering: Object.freeze(classifyCovering(furDensity.value, dermalArmor.value)),
    }),
    issues: Object.freeze(issues),
    undetermined: UNDETERMINED_CHARACTERISTICS,
  });
}
