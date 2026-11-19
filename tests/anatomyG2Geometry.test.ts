import { describe, expect, it } from "vitest";
import {
  BODY_PLAN_CATALOG, BODY_PLAN_IDS, computeComplexity, computeExtents, computeFingerprint,
  descriptorFromLegacyTraits, deserializeAnatomy, generateAnatomy, generateAnatomyCached, inspectAnatomy,
  reduceAnatomyDetail, serializeAnatomy, validateAnatomy, validateBodyPlanSpec,
  type AnatomyDescriptor, type Appendage, type Segment, type Vec3,
} from "../lib/anatomy";
import { derivePhenotype } from "../lib/phenotype";

const ph = derivePhenotype({ size: 1.1, ext: { bodyStature: 0.7, furDensity: 0.6, dermalArmor: 0.3 } });
const gen = (id: string, extra: Partial<Parameters<typeof generateAnatomy>[0]> = {}) =>
  generateAnatomy({ phenotype: ph, bodyPlan: BODY_PLAN_CATALOG[id], ...extra });
const clone = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const refingerprint = (d: any): any => { d.fingerprint = computeFingerprint(d); return d; };
const firstLegGroup = (id: string): string | undefined => BODY_PLAN_CATALOG[id].groups.find((g) => g.kind === "leg")?.id;
const box = (s: Segment) => ({
  min: { x: s.center.x - s.halfExtents.x, y: s.center.y - s.halfExtents.y, z: s.center.z - s.halfExtents.z },
  max: { x: s.center.x + s.halfExtents.x, y: s.center.y + s.halfExtents.y, z: s.center.z + s.halfExtents.z },
});

function manualExtents(segments: readonly Segment[], appendages: readonly Appendage[]) {
  const boxes = segments.map(box).concat(appendages.map((a) => {
    const tip = { x: a.position.x + a.direction.x * a.length, y: a.position.y + a.direction.y * a.length, z: a.position.z + a.direction.z * a.length };
    return {
      min: { x: Math.min(a.position.x, tip.x) - a.radius, y: Math.min(a.position.y, tip.y) - a.radius, z: Math.min(a.position.z, tip.z) - a.radius },
      max: { x: Math.max(a.position.x, tip.x) + a.radius, y: Math.max(a.position.y, tip.y) + a.radius, z: Math.max(a.position.z, tip.z) + a.radius },
    };
  }));
  const min: Vec3 = { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) };
  const max: Vec3 = { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) };
  return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
}

describe("G2.1 — geometria ed extents su tutti i body plan", () => {
  const cases = BODY_PLAN_IDS.flatMap((id) => [undefined, 42].map((seed) => ({ id, seed })));

  it.each(cases)("$id (seed=$seed): AABB del corpo e anatomico derivati dalla geometria", ({ id, seed }) => {
    const d = gen(id, { seed });
    const body = manualExtents(d.segments, []);
    const anatomy = manualExtents(d.segments, d.appendages);
    const p = d.proportions;
    for (const axis of ["x", "y", "z"] as const) {
      expect(p.bodyExtents.min[axis]).toBeCloseTo(body.min[axis], 5);
      expect(p.bodyExtents.max[axis]).toBeCloseTo(body.max[axis], 5);
      expect(p.anatomicalExtents.min[axis]).toBeCloseTo(anatomy.min[axis], 5);
      expect(p.anatomicalExtents.max[axis]).toBeCloseTo(anatomy.max[axis], 5);
      expect(p.anatomicalExtents.size[axis]).toBeCloseTo(anatomy.size[axis], 5);
      expect(p.anatomicalExtents.scaledSize[axis]).toBeCloseTo(anatomy.size[axis] * p.sizeScale, 5);
      expect(p.anatomicalExtents.center[axis]).toBeCloseTo((anatomy.min[axis] + anatomy.max[axis]) / 2, 5);
    }
    expect(p.totalHeight).toBeCloseTo(anatomy.size.y, 5);
    expect(p.bodyLength).toBeCloseTo(body.size.z, 5);
    expect(p.bodyWidth).toBeCloseTo(body.size.x, 5);
    expect(p.bodyHeight).toBeCloseTo(body.size.y, 5);
    expect(p.maxLimbLength).toBeCloseTo(Math.max(0, ...d.appendages.filter((a) => a.kind === "leg").map((a) => a.length)), 5);
    expect(inspectAnatomy(d).status).toBe("VALID");
  });

  it("il corpo asimmetrico usa il vero AABB, non il raddoppio della massima ascissa", () => {
    const d = gen("simple-asymmetric");
    const xs = d.segments.flatMap((s) => [s.center.x - s.halfExtents.x, s.center.x + s.halfExtents.x]);
    expect(d.proportions.bodyWidth).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 5);
    expect(d.proportions.bodyWidth).toBeLessThan(2 * Math.max(...xs.map(Math.abs)));
  });

  it("le appendici contribuiscono all'altezza totale e sono separate dalla clearance", () => {
    const d = gen("quadruped");
    expect(d.proportions.anatomicalExtents.size.y).toBeGreaterThan(d.proportions.bodyExtents.size.y);
    expect(d.proportions.totalHeight).toBeGreaterThan(d.proportions.bodyHeight);
    expect(d.proportions.groundClearance).not.toBeNull();
    expect(d.proportions.groundClearance).not.toBeCloseTo(d.proportions.maxLimbLength, 3);
    expect(d.locomotion.groundClearance).toBe(d.proportions.groundClearance);
  });

  it.each(["simple-sphere", "radial-sessile", "limbless-serpentine", "speculative-multi-arm"])(
    "%s: senza zampe la clearance è non determinabile e motivata", (id) => {
      const d = gen(id);
      expect(d.proportions.groundClearance).toBeNull();
      expect(d.proportions.groundClearanceStatus).toBe("undetermined");
      expect(d.proportions.groundClearanceReason.length).toBeGreaterThan(0);
      expect(d.proportions.maxLimbLength).toBe(0);
    });

  it("rigetta extents e clearance manomessi", () => {
    const base = gen("quadruped");
    const wrongExtents = refingerprint(clone(base));
    wrongExtents.proportions.bodyLength += 1;
    expect(inspectAnatomy(wrongExtents).errors).toContain("extents-mismatch:bodyLength");
    const wrongClearance = refingerprint(clone(base));
    wrongClearance.proportions.groundClearance = 99;
    expect(inspectAnatomy(wrongClearance).errors).toContain("ground-clearance-mismatch");
    const fake = refingerprint(clone(base));
    fake.proportions.groundClearance = null;
    fake.proportions.groundClearanceStatus = "undetermined";
    expect(inspectAnatomy(fake).errors).toContain("ground-clearance-status-mismatch");
  });
});

describe("G2.1 — posizionamento e appendici dispari", () => {
  it.each(BODY_PLAN_IDS)("%s: radici ancorate, direzioni non degenerate, nessuna coincidenza", (id) => {
    const group = firstLegGroup(id) ?? BODY_PLAN_CATALOG[id].groups[0]?.id;
    const counts = group ? { [group]: 5 } : {};
    const d = gen(id, { appendageCounts: counts, seed: 11 });
    const report = inspectAnatomy(d);
    expect(report.ok).toBe(true);
    expect(report.warnings.filter((w) => w.startsWith("coincident-appendages"))).toEqual([]);
    for (const a of d.appendages) {
      const host = d.segments.find((s) => s.id === a.segmentId)!;
      const b = box(host);
      const gap = Math.hypot(Math.max(b.min.x - a.position.x, 0, a.position.x - b.max.x),
        Math.max(b.min.y - a.position.y, 0, a.position.y - b.max.y),
        Math.max(b.min.z - a.position.z, 0, a.position.z - b.max.z));
      expect(gap).toBeLessThanOrEqual(0.05 + a.radius + 0.1 * Math.max(host.halfExtents.x, host.halfExtents.y, host.halfExtents.z) + 1e-6);
      expect(Math.hypot(a.direction.x, a.direction.y, a.direction.z)).toBeGreaterThan(0.5);
    }
  });

  it("conteggio dispari di zampe: policy staggered, nessuna zampa mediana posteriore, anomalia dichiarata", () => {
    const d = gen("quadruped", { appendageCounts: { legs: 5 } });
    const legs = d.appendages.filter((a) => a.kind === "leg");
    expect(legs).toHaveLength(5);
    expect(legs.some((a) => a.side === "mid")).toBe(false);
    expect(legs.every((a) => a.direction.y < -0.5)).toBe(true);
    expect(d.declaredAnomalies.map((x) => x.code)).toContain("odd-appendage-count:legs");
    expect(inspectAnatomy(d).status).toBe("WARNING");
    expect(validateAnatomy(d).ok).toBe(true);
  });

  it("override esplicito 'omit' emette solo coppie e dichiara l'omissione", () => {
    const spec = BODY_PLAN_CATALOG["quadruped"];
    const custom = { ...spec, groups: spec.groups.map((g) => g.id === "legs" ? { ...g, oddPolicy: "omit" as const } : g) };
    expect(validateBodyPlanSpec(custom)).toEqual([]);
    const d = generateAnatomy({ phenotype: ph, bodyPlan: custom, appendageCounts: { legs: 5 } });
    expect(d.appendages.filter((a) => a.kind === "leg")).toHaveLength(4);
    expect(d.declaredAnomalies.map((x) => x.code)).toContain("omitted-appendages:legs");
  });

  it("le coppie bilaterali sono speculari anche in posizione, direzione e dimensioni", () => {
    const d = gen("biped", { seed: 7 });
    for (const a of d.appendages.filter((x) => x.side === "left")) {
      const m = d.appendages.find((b) => b.side === "right" && b.groupId === a.groupId && b.kind === a.kind &&
        Math.abs(b.position.x + a.position.x) < 1e-9 && b.position.y === a.position.y && b.position.z === a.position.z);
      expect(m, `specchio mancante per ${a.id}`).toBeDefined();
      expect(m!.length).toBeCloseTo(a.length, 9);
      expect(m!.radius).toBeCloseTo(a.radius, 9);
      expect(m!.direction.x).toBeCloseTo(-a.direction.x, 9);
      expect(m!.direction.y).toBeCloseTo(a.direction.y, 9);
      expect(m!.direction.z).toBeCloseTo(a.direction.z, 9);
    }
  });

  it("rileva direzioni speculari manomesse e appendici staccate", () => {
    const badDir = refingerprint(clone(gen("biped")));
    const left = badDir.appendages.find((a: any) => a.side === "left" && a.kind === "leg");
    left.direction = { x: 1, y: 0, z: 0 };
    expect(inspectAnatomy(badDir).errors.some((e) => e.startsWith("asymmetric-pair"))).toBe(true);
    const detached = refingerprint(clone(gen("quadruped")));
    detached.appendages[0].position.x += 5;
    expect(inspectAnatomy(detached).errors.some((e) => e.startsWith("appendage-detached"))).toBe(true);
  });
});

describe("G2.1 — simmetria strutturale", () => {
  it.each(["radial-sessile", "speculative-multi-arm"])("%s: spaziatura e coerenza radiali", (id) => {
    const d = gen(id, { seed: 3 });
    expect(inspectAnatomy(d).status).toBe("VALID");
    const radialGroup = d.appendages.find((a) => a.angle !== null)?.groupId ?? "";
    const arms = d.appendages.filter((a) => a.groupId === radialGroup && a.angle !== null);
    const step = (2 * Math.PI) / arms.length;
    const angles = arms.map((a) => a.angle as number).sort((a, b) => a - b);
    for (let k = 1; k < angles.length; k++) expect(angles[k] - angles[k - 1]).toBeCloseTo(step, 4);
  });

  it("rileva ordine radiale, spaziatura e dimensioni incoerenti", () => {
    const base = gen("radial-sessile");
    const wrongOrder = refingerprint(clone(base));
    wrongOrder.symmetry.order = 99;
    expect(inspectAnatomy(wrongOrder).errors.some((e) => e.startsWith("radial-order-mismatch"))).toBe(true);
    const spacing = refingerprint(clone(base));
    spacing.appendages[0].angle = (spacing.appendages[0].angle ?? 0) + 0.2;
    expect(inspectAnatomy(spacing).errors.some((e) => e.startsWith("radial-spacing"))).toBe(true);
    const sizes = refingerprint(clone(base));
    sizes.appendages[0].length *= 3;
    expect(inspectAnatomy(sizes).errors.some((e) => e.startsWith("radial-inconsistent"))).toBe(true);
  });

  it("il jitter con seme non rompe la simmetria radiale dichiarata", () => {
    for (const seed of [1, 2, 42, 999]) {
      const d = gen("radial-sessile", { seed });
      const lengths = d.appendages.filter((a) => a.groupId === "arms").map((a) => a.length);
      expect(new Set(lengths).size).toBe(1);
      expect(inspectAnatomy(d).status).toBe("VALID");
    }
  });

  it("il jitter con seme mantiene simmetri bilaterali e none-order/spherical-order", () => {
    expect(inspectAnatomy(gen("quadruped", { seed: 42 })).status).toBe("VALID");
    expect(inspectAnatomy(gen("simple-asymmetric", { seed: 42 })).status).toBe("VALID");
    expect(gen("simple-sphere").symmetry.order).toBe(0);
    expect(gen("simple-asymmetric").symmetry.order).toBe(1);
  });
});

describe("G2.1 — controlli anatomici con tre categorie", () => {
  it("VALID / WARNING / INVALID sono distinti e i codici sono diagnostici", () => {
    expect(inspectAnatomy(gen("hexapod")).status).toBe("VALID");
    const coincident: any = clone(gen("quadruped"));
    const legs = coincident.appendages.filter((a: any) => a.kind === "leg");
    for (const src of legs) {
      const dup = { ...src, id: `${src.id}-copy`, index: src.index + 100 };
      coincident.appendages.push(dup);
      for (const j of coincident.joints.filter((x: any) => x.appendageId === src.id)) coincident.joints.push({ ...j, id: `${j.id}-copy`, appendageId: dup.id });
    }
    coincident.complexity = computeComplexity(coincident.segments, coincident.appendages, coincident.joints);
    coincident.locomotion = { ...coincident.locomotion, supportingLimbs: legs.length * 2, mode: "multipedal" };
    refingerprint(coincident);
    const report = inspectAnatomy(coincident);
    expect(report.status).toBe("WARNING");
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.startsWith("coincident-appendages"))).toBe(true);

    const zeroDir = refingerprint(clone(gen("quadruped")));
    zeroDir.appendages[0].direction = { x: 0, y: 0, z: 0 };
    const bad = inspectAnatomy(zeroDir);
    expect(bad.status).toBe("INVALID");
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("degenerate-direction:legs-0");
    expect(bad.diagnostics.find((x) => x.code === "degenerate-direction:legs-0")!.message.length).toBeGreaterThan(0);
    expect(validateAnatomy(zeroDir)).toEqual({ ok: false, errors: bad.errors });
  });

  it("segnala sovrapposizioni anomale tra segmenti non articolati", () => {
    const d: any = clone(gen("quadruped"));
    const head = d.segments.find((s: any) => s.id === "head");
    const tail = d.segments.find((s: any) => s.id === "tail");
    head.center = { ...tail.center };
    head.halfExtents = { ...tail.halfExtents };
    refingerprint(d);
    const report = inspectAnatomy(d);
    expect(report.warnings.some((w) => w.startsWith("segment-overlap"))).toBe(true);
  });
});

describe("G2.1 — determinismo, cache, LOD e regressione", () => {
  it("cache e generazione diretta producono lo stesso descriptor, LOD incluso", () => {
    for (const lod of [0, 1, 2, 3] as const) {
      const input = { phenotype: ph, bodyPlan: BODY_PLAN_CATALOG.hexapod, seed: 9, lod };
      const direct = generateAnatomy(input);
      const cached = generateAnatomyCached(input);
      expect(serializeAnatomy(cached)).toBe(serializeAnatomy(direct));
      expect(inspectAnatomy(cached).status).toBe("VALID");
    }
  });

  it("ogni LOD ricalcola extents e clearance sulla geometria ridotta", () => {
    for (const id of BODY_PLAN_IDS) {
      const full = gen(id);
      for (const tier of [0, 1, 2] as const) {
        const r = reduceAnatomyDetail(full, tier);
        const derived = computeExtents(r.segments, r.appendages, r.proportions.sizeScale);
        expect(r.proportions.bodyLength).toBeCloseTo(derived.bodyLength, 5);
        expect(r.proportions.anatomicalExtents.min.y).toBeCloseTo(derived.anatomicalExtents.min.y, 5);
        expect(r.proportions.groundClearance).toBe(derived.groundClearance);
        expect(r.locomotion.groundClearance).toBe(derived.groundClearance);
        expect(r.proportions.sizeScale).toBe(full.proportions.sizeScale);
        expect(inspectAnatomy(r).status).toBe("VALID");
      }
    }
  });

  it("migra descrittori salvati prima dell'hardening senza inventare geometria", () => {
    const d = clone(gen("quadruped"));
    const legacy: any = d;
    for (const k of ["bodyExtents", "anatomicalExtents", "totalHeight", "groundClearanceStatus", "groundClearanceReason", "maxLimbLength"]) delete legacy.proportions[k];
    delete legacy.declaredAnomalies;
    legacy.locomotion.groundClearance = 0.9; // vecchio proxy: lunghezza massima di una zampa
    legacy.fingerprint = computeFingerprint(legacy);
    const text = JSON.stringify(legacy);
    const r = deserializeAnatomy(text);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.proportions.anatomicalExtents).toBeDefined();
      expect(r.value.proportions.groundClearance).not.toBe(0.9);
      expect(inspectAnatomy(r.value).status).toBe("VALID");
    }
  });

  it("l'adattatore legacy resta valido con il nuovo validatore", () => {
    const d = descriptorFromLegacyTraits({ speed: 1.4, carnivory: 0.6, vision: 5, evasion: 0.3, huntingSkill: 0.5 });
    expect(inspectAnatomy(d).status).toBe("VALID");
    expect(validateAnatomy(d)).toEqual({ ok: true, errors: [] });
    expect(d.proportions.anatomicalExtents.size.y).toBeGreaterThan(0);
  });
});
