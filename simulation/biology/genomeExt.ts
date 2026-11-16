/**
 * v1.11.0 — Genoma esteso (specifica di Vibe §4): validazione, mutazione, ereditarietà, lettura. Tutto puro.
 *
 * Il flusso casuale del mondo non viene consumato dai geni estesi quando si usano `inheritExt` / `cloneExt` /
 * `founderExt` con un generatore derivato (`deriveGeneRandom`): così, con i geni estesi spenti, la simulazione è
 * identica alla v1.10 e con i geni accesi differisce solo per gli effetti dei geni.
 */
import type { GeneMap, Genome } from "../../types";
import { Random } from "../core/random";
import { inheritGenome, cloneWithMutation } from "./genome";
import { MUTATION_RATE } from "./traitRanges";
import { TRAIT_RANGES } from "./traitRanges";
import { EXTENDED_GENES, GENE_BY_KEY, LEGACY_KEYS, clampToGene, type GeneDefinition } from "./geneRegistry";

/** Deviazione dei fondatori attorno al predefinito, come frazione di metà intervallo (variazione di partenza, non estremi casuali). */
export const FOUNDER_GENE_SPREAD = 0.4;

/** Valore effettivo di un gene: tratti storici = campo di primo livello; estesi = `ext[key] ?? defaultValue` (punto UNICO di lettura per gli hook). */
export function getGene(g: Genome, key: string): number {
  const def = GENE_BY_KEY.get(key);
  if (!def) return 0;
  if (def.category === "legacy") return (g as unknown as Record<string, number>)[key];
  const v = g.ext?.[key];
  return typeof v === "number" && Number.isFinite(v) ? clampToGene(def, v) : def.defaultValue;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
  /** Copia corretta del genoma (valori riportati nell'intervallo, non validi → predefinito, chiavi sconosciute conservate). */
  genome: Genome;
}

/**
 * - tratti storici: clamp negli intervalli attuali; NaN/Infinity → punto medio (issue "invalid");
 * - ext: chiavi sconosciute → issue "unknown-gene:<chiave>" (non bloccante, conservate); fuori intervallo → clamp
 *   + issue "clamped:<chiave>"; NaN/Infinity → predefinito + issue "invalid:<chiave>".
 */
export function validateGenome(g: Genome): ValidationResult {
  const issues: string[] = [];
  const out = { ...g } as Genome;
  for (const key of LEGACY_KEYS) {
    const def = GENE_BY_KEY.get(key)!;
    const v = (g as unknown as Record<string, number>)[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      issues.push(`invalid:${key}`);
      (out as unknown as Record<string, number>)[key] = def.defaultValue;
    } else if (v < def.min || v > def.max) {
      issues.push(`clamped:${key}`);
      (out as unknown as Record<string, number>)[key] = clampToGene(def, v);
    }
  }
  if (g.ext) {
    const ext: GeneMap = {};
    for (const [key, v] of Object.entries(g.ext)) {
      const def = GENE_BY_KEY.get(key);
      if (!def) {
        issues.push(`unknown-gene:${key}`);
        ext[key] = v;
      } else if (def.category === "legacy") {
        issues.push(`unknown-gene:${key}`); // un tratto storico non vive in ext: conservato ma ignorato
        ext[key] = v;
      } else if (typeof v !== "number" || !Number.isFinite(v)) {
        issues.push(`invalid:${key}`);
        ext[key] = def.defaultValue;
      } else if (v < def.min || v > def.max) {
        issues.push(`clamped:${key}`);
        ext[key] = clampToGene(def, v);
      } else {
        ext[key] = v;
      }
    }
    out.ext = ext;
  }
  return { ok: issues.length === 0, issues, genome: out };
}

/** Gaussiana(0, intervallo × mutationStdFraction), poi clamp: stessa matematica dei tratti storici, parametrizzata dal registro. */
export function mutateGeneValue(def: GeneDefinition, value: number, rng: Random): number {
  return clampToGene(def, value + rng.gaussian(0, (def.max - def.min) * def.mutationStdFraction));
}

/** Generatore SEPARATO per i geni estesi: derivato dallo stato del mondo e da un sale (id), senza consumare numeri dal mondo. */
export function deriveGeneRandom(worldRngState: number, salt: number): Random {
  let h = Math.imul((worldRngState ^ 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return new Random(h >>> 0);
}

/** `ext` di un fondatore: attorno al predefinito, dentro l'intervallo. */
export function founderExt(rng: Random): GeneMap {
  const ext: GeneMap = {};
  for (const def of EXTENDED_GENES) {
    const half = (def.max - def.min) / 2;
    ext[def.key] = clampToGene(def, def.defaultValue + (rng.next() * 2 - 1) * FOUNDER_GENE_SPREAD * half);
  }
  return ext;
}

/** `ext` di un figlio: media dei valori effettivi dei genitori (mancante = predefinito), poi mutazione per gene con probabilità MUTATION_RATE. */
export function inheritExt(a: Genome, b: Genome, rng: Random): GeneMap {
  const ext: GeneMap = {};
  for (const def of EXTENDED_GENES) {
    let value = (getGene(a, def.key) + getGene(b, def.key)) / 2;
    if (rng.chance(MUTATION_RATE)) value = mutateGeneValue(def, value, rng);
    ext[def.key] = value;
  }
  return ext;
}

/** Variante asessuata (un solo genitore). */
export function cloneExt(parent: Genome, rng: Random): GeneMap {
  return inheritExt(parent, parent, rng);
}

/** Specifica §4: tratti storici = media + mutazione (identici a `inheritGenome`), poi `ext`. Con un solo generatore, tutto da `rng`. */
export function inheritGenomeV2(a: Genome, b: Genome, rng: Random): Genome {
  const child = inheritGenome(a, b, rng);
  child.ext = inheritExt(a, b, rng);
  return child;
}

export function cloneGenomeWithMutationV2(parent: Genome, rng: Random): Genome {
  const child = cloneWithMutation(parent, rng);
  child.ext = cloneExt(parent, rng);
  return child;
}

/** Intervalli dei tratti storici (comodità per i test e l'analisi). */
export { TRAIT_RANGES };
