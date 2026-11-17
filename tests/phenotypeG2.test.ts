import { describe, expect, it } from "vitest";
import { GENE_BY_ID, GENE_BY_KEY } from "../simulation/biology/geneRegistry";
import { MORPHOLOGICAL_GENE_IDS, MORPHOLOGICAL_GENE_KEYS, UNDETERMINED_CHARACTERISTICS, derivePhenotype } from "../lib/phenotype";

const full = { size: 1.2, speed: 1.5, carnivory: 0.7, vision: 5, evasion: 0.4, huntingSkill: 0.6, ext: { bodyStature: 0.8, furDensity: 0.5, dermalArmor: 0.3, endurance: 0.9, burstPower: 0.2 } };

describe("G2 fenotipo — lettura dei geni morfologici", () => {
  it("legge solo geni realmente presenti nel registro e li normalizza sul loro intervallo", () => {
    const p = derivePhenotype(full);
    for (const k of MORPHOLOGICAL_GENE_KEYS) expect(GENE_BY_KEY.has(k)).toBe(true);
    for (const id of MORPHOLOGICAL_GENE_IDS) expect(GENE_BY_ID.has(id)).toBe(true);
    expect(p.traits.furDensity.value).toBeCloseTo(0.5, 6);
    expect(p.traits.dermalArmor.value).toBeCloseTo(0.5, 6); // 0,3 su un massimo di 0,6
    expect(p.traits.bodyStature.value).toBeCloseTo(0.8, 6);
    for (const t of Object.values(p.traits)) {
      expect(t.source.kind).toBe("gene-direct");
      expect(t.source.genes).toEqual([t.geneId]);
    }
    expect(p.issues).toEqual([]);
  });

  it("i geni non morfologici non hanno alcun effetto (nessuna correlazione estetica)", () => {
    const base = derivePhenotype(full);
    const other = derivePhenotype({ ...full, speed: 2.4, carnivory: 1, vision: 9, evasion: 0.9, huntingSkill: 0.95, ext: { ...full.ext, endurance: 0, burstPower: 1, peripheralAcuity: 1, memorySpan: 0 } } as typeof full);
    expect(other).toEqual(base);
  });

  it("gestisce i dati mancanti senza inventarli", () => {
    const p = derivePhenotype({ size: 1 });
    expect(p.traits.furDensity.status).toBe("missing");
    expect(p.traits.furDensity.value).toBeNull();
    expect(p.derived.surfaceCovering.value).toBe("unspecified");
    expect(p.derived.surfaceCovering.source.kind).toBe("undetermined");
    expect(p.issues).toContain("missing:furDensity");
    const none = derivePhenotype(undefined);
    expect(none.traits.size.status).toBe("missing");
    expect(none.derived.sizeScale.source.kind).toBe("undetermined");
    expect(derivePhenotype(null).issues.length).toBe(4);
  });

  it("segnala valori non validi o fuori intervallo", () => {
    const p = derivePhenotype({ size: Number.NaN, ext: { furDensity: 7, dermalArmor: -1, bodyStature: "x" as unknown as number } });
    expect(p.traits.size.status).toBe("invalid");
    expect(p.traits.furDensity.status).toBe("clamped");
    expect(p.traits.furDensity.value).toBe(1);
    expect(p.traits.dermalArmor.value).toBe(0);
    expect(p.traits.bodyStature.status).toBe("invalid");
  });

  it("classifica la copertura solo con dati sufficienti", () => {
    expect(derivePhenotype({ size: 1, ext: { furDensity: 0.9, dermalArmor: 0 } }).derived.surfaceCovering.value).toBe("fur");
    expect(derivePhenotype({ size: 1, ext: { furDensity: 0, dermalArmor: 0.5 } }).derived.surfaceCovering.value).toBe("dermal-plates");
    expect(derivePhenotype({ size: 1, ext: { furDensity: 0.9, dermalArmor: 0.5 } }).derived.surfaceCovering.value).toBe("mixed");
    expect(derivePhenotype({ size: 1, ext: { furDensity: 0, dermalArmor: 0 } }).derived.surfaceCovering.value).toBe("bare");
    expect(derivePhenotype({ size: 1, ext: { furDensity: 0 } }).derived.surfaceCovering.value).toBe("unspecified");
  });

  it("è deterministico, immutabile e dichiara ciò che non è determinabile", () => {
    expect(derivePhenotype(full)).toEqual(derivePhenotype(full));
    expect(Object.isFrozen(derivePhenotype(full))).toBe(true);
    for (const k of ["bodyPlan", "symmetry", "appendageCount", "limbCount"]) expect(UNDETERMINED_CHARACTERISTICS).toContain(k);
  });
});
