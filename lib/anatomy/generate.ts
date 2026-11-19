import type { DataSource, PhenotypeProfile } from "../phenotype/types";
import { SURFACE_COVERING_THRESHOLD } from "../phenotype/derive";
import { assembleDescriptor } from "./assemble";
import { BODY_PLAN_CATALOG, LEGACY_DEFAULT_BODY_PLAN_ID, speculativeBodyPlanId, type AppendageGroupSpec, type BodyPlanSpec, type OddAppendagePolicy } from "./bodyPlan";
import { reduceAnatomyDetail } from "./lod";
import {
  MAX_APPENDAGES, REQUIRED_PROVENANCE_KEYS,
  type AnatomyDescriptor, type AnatomyDiagnostic, type Appendage, type AppendageSide, type BodyPlanOrigin, type DetailTier, type Joint, type JointType, type LocomotionMode, type Segment, type SymmetryType, type Vec3,
} from "./types";
import { clamp, hashToUint, mulberry32, rd } from "./util";

/**
 * G2 — Generatore anatomico deterministico: (fenotipo, body plan, seme opzionale) → AnatomyDescriptor.
 * Funzione pura: nessun Math.random, nessun accesso a React/Three.js/renderer. Senza `seed` la variazione estetica è nulla.
 * Le caratteristiche biologiche provengono solo da `phenotype` (geni morfologici); la struttura (segmenti, appendici,
 * articolazioni, simmetria) viene dal body plan ed è dichiarata "undetermined" nella provenienza.
 */
export interface AnatomyInput {
  readonly phenotype: PhenotypeProfile;
  readonly bodyPlan: BodyPlanSpec;
  /** Seme della variazione ESTETICA (es. id organismo). Assente = nessuna variazione. */
  readonly seed?: number;
  readonly origin?: BodyPlanOrigin;
  readonly lod?: DetailTier;
  /** Sovrascrive il numero di appendici per gruppo (limitato a [minCount, maxCount] del gruppo e a MAX_APPENDAGES). */
  readonly appendageCounts?: Readonly<Record<string, number>>;
}

const OVERLAP = 0.85;
const ARMOR_PLATE_MIN = 2;
const ARMOR_PLATE_MAX = 8;
const q3 = (v: number): number => Math.round(v * 1000) / 1000;
const v3 = (x: number, y: number, z: number): Vec3 => ({ x: rd(x), y: rd(y), z: rd(z) });
const norm3 = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z) || 1;
  return v3(x / l, y / l, z / l);
};
const und = (note: string): DataSource => ({ kind: "undetermined", genes: [], certainty: "speculative", note });
const dofOf = (t: JointType): 0 | 1 | 2 | 3 => (t === "fixed" ? 0 : t === "hinge" ? 1 : t === "segmental" ? 2 : 3);

interface Slot {
  x: number; y: number; z: number;
  side: AppendageSide;
  angle: number | null;
  host: Segment;
  dir: Vec3;
  /** Bucket di jitter: indice della coppia per la simmetria bilaterale, indice otherwise. */
  bucket: number;
  idx: number;
}

function hostsFor(segs: readonly Segment[], attach: string): Segment[] {
  const byId = segs.filter((s) => s.id === attach);
  if (byId.length) return byId;
  const byRole = segs.filter((s) => s.role === attach);
  return byRole.length ? byRole : [segs.find((s) => s.parentId === null) ?? segs[0]];
}

/** Seleziona il segmento il cui intervallo Z contiene il punto; in mancanza, il più vicino. */
function hostFor(hosts: readonly Segment[], z: number): Segment {
  const containing = hosts.find((h) => z >= h.center.z - h.halfExtents.z && z <= h.center.z + h.halfExtents.z);
  if (containing) return containing;
  let best = hosts[0];
  for (const h of hosts) if (Math.abs(z - h.center.z) < Math.abs(z - best.center.z)) best = h;
  return best;
}

/** Mantiene l'attacco dentro il segmento ospite (con un piccolo margine). */
function clampZ(host: Segment, z: number): number {
  const margin = host.halfExtents.z * 0.95;
  return Math.max(host.center.z - margin, Math.min(host.center.z + margin, z));
}

/** frazioni equamente spaziate in [-span/2, span/2]; 1 → centro. Evita divisioni per zero. */
function fractions(n: number, span: number): number[] {
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, k) => (k / (n - 1) - 0.5) * span);
}

function direction(o: AppendageGroupSpec["orientation"], sx: number): Vec3 {
  switch (o) {
    case "down": return norm3(sx * 0.3, -1, 0);
    case "outward": return v3(sx === 0 ? 1 : sx, 0, 0);
    case "up": return norm3(sx * 0.2, 1, 0);
    case "forward": return v3(0, 0, 1);
    default: return v3(0, 0, -1);
  }
}

const mirrorX = (sx: number, ax: number): number => (sx === 0 ? 0 : sx * rd(ax));

/** `auto` risolve la policy in base a placement e simmetria; non impone la regola "coppie + coda" a tutti. */
function resolveOddPolicy(g: AppendageGroupSpec, symmetry: SymmetryType): OddAppendagePolicy {
  if (g.oddPolicy !== "auto") return g.oddPolicy;
  if (g.placement === "lateral") return "staggered";
  if (g.placement === "terminal-front" || g.placement === "terminal-rear") return "center-line";
  return "staggered"; // dorsal/ventral/radial: distribuzione, non accoppiamento
}

function slotsFor(g: AppendageGroupSpec, n: number, segs: readonly Segment[], ring: boolean, symmetry: SymmetryType, policy: OddAppendagePolicy): Slot[] {
  const hosts = hostsFor(segs, g.attach);
  const zmin = Math.min(...hosts.map((h) => h.center.z - h.halfExtents.z));
  const zmax = Math.max(...hosts.map((h) => h.center.z + h.halfExtents.z));
  const zmid = (zmin + zmax) / 2;
  const zr = (zmax - zmin) * g.span;
  const yOf = (h: Segment): number => h.center.y + clamp(g.yOffset, -1, 1) * h.halfExtents.y;
  const out: Slot[] = [];
  const push = (x: number, y: number, z: number, side: AppendageSide, angle: number | null, host: Segment, dir: Vec3, bucket: number): void => {
    out.push({ x: rd(x), y: rd(y), z: rd(z), side, angle, host, dir, bucket, idx: out.length });
  };

  if (g.placement === "lateral") {
    const odd = n % 2 === 1;
    const paired = !odd || policy === "center-line" || policy === "omit";
    if (paired) {
      const pairs = Math.floor(n / 2);
      const fr = fractions(pairs, 1);
      for (let p = 0; p < pairs; p++) {
        const host = hostFor(hosts, zmid + fr[p] * zr);
        const z = clampZ(host, zmid + fr[p] * zr);
        for (const sx of [-1, 1]) push(mirrorX(sx, host.halfExtents.x * 0.9), yOf(host), z, sx > 0 ? "left" : "right", null, host, direction(g.orientation, sx), p);
      }
      if (odd && policy === "center-line") {
        const host = hostFor(hosts, zmid);
        push(0, yOf(host), clampZ(host, zmid), "mid", null, host, direction(g.orientation, 0), pairs);
      }
    } else {
      // Distribuzione alternata: nessuna appendice mediana, nessuna coda artificiale.
      // G-REV-04: le coppie sfalsate condividono lo stesso bucket di jitter; solo l'ultimo
      // elemento (quello spaiato) ha un bucket proprio. Senza questo, ogni "coppia" aveva
      // lunghezze diverse e l'intero gruppo doveva essere escluso dal controllo.
      const pairs = Math.floor(n / 2);
      const fr = fractions(n, 1);
      for (let k = 0; k < n; k++) {
        const host = hostFor(hosts, zmid + fr[k] * zr);
        const sx = k % 2 === 0 ? -1 : 1;
        const bucket = k < n - 1 ? Math.floor(k / 2) : pairs;
        push(mirrorX(sx, host.halfExtents.x * 0.9), yOf(host), clampZ(host, zmid + fr[k] * zr),
             sx > 0 ? "left" : "right", null, host, direction(g.orientation, sx), bucket);
      }
    }
  } else if (g.placement === "dorsal" || g.placement === "ventral") {
    const sy = g.placement === "dorsal" ? 1 : -1;
    const fr = fractions(n, 1);
    for (let k = 0; k < n; k++) {
      if (ring) {
        const host = hosts[0];
        const ang = (2 * Math.PI * k) / n;
        const r = n === 1 ? 0 : host.halfExtents.x * 0.35;
        push(Math.cos(ang) * r, host.center.y + sy * host.halfExtents.y, host.center.z + Math.sin(ang) * r,
             "mid", n === 1 ? null : rd(ang), host, direction(g.orientation, 0), k);
      } else {
        const host = hostFor(hosts, zmid + fr[k] * zr);
        push(0, host.center.y + sy * host.halfExtents.y, clampZ(host, zmid + fr[k] * zr),
             "mid", null, host, direction(g.orientation, 0), k);
      }
    }
  } else if (g.placement === "terminal-front" || g.placement === "terminal-rear") {
    const front = g.placement === "terminal-front";
    const host = hosts.reduce((a, b) => (front
      ? (b.center.z + b.halfExtents.z > a.center.z + a.halfExtents.z ? b : a)
      : (b.center.z - b.halfExtents.z < a.center.z - a.halfExtents.z ? b : a)));
    const z = host.center.z + (front ? 1 : -1) * host.halfExtents.z;
    const fr = fractions(n, 1);
    for (let k = 0; k < n; k++) {
      const sx = fr[k] > 0 ? 1 : fr[k] < 0 ? -1 : 0;
      push(mirrorX(sx, Math.abs(fr[k]) * 2 * host.halfExtents.x * 0.5), yOf(host), z,
           sx > 0 ? "left" : sx < 0 ? "right" : "mid", null, host, direction(g.orientation, sx), Math.min(k, n - 1 - k));
    }
  } else {
    const host = hosts[0];
    for (let k = 0; k < n; k++) {
      const ang = (2 * Math.PI * k) / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      const nx = c / Math.max(1e-6, host.halfExtents.x);
      const nz = s / Math.max(1e-6, host.halfExtents.z);
      push(c * host.halfExtents.x * 0.95, yOf(host), host.center.z + s * host.halfExtents.z * 0.95,
           "mid", n === 1 ? null : rd(ang), host, norm3(nx, 0, nz), k);
    }
  }
  return out;
}

export function generateAnatomy(input: AnatomyInput): AnatomyDescriptor {
  const { phenotype: ph, bodyPlan: plan } = input;
  const origin = input.origin ?? "explicit";
  const jitterOn = input.seed !== undefined;
  const rng = mulberry32(((input.seed ?? 0) ^ hashToUint(plan.id)) >>> 0);
  const jit = (): number => (jitterOn ? (rng() - 0.5) * 0.12 : 0);

  const t = ph.traits;
  const statureN = q3(t.bodyStature.value ?? 0.5);
  const furN = t.furDensity.value === null ? null : q3(t.furDensity.value);
  const armorN = t.dermalArmor.value === null ? null : q3(t.dermalArmor.value);
  const sizeScale = q3(ph.derived.sizeScale.value);
  const wf = q3(ph.derived.radiusFactor.value);
  const globalJitter = jit();

  // ---- Segmenti ----
  const lens = plan.segments.map((s) => s.length * (1 + jit()));
  const centersZ: number[] = [];
  if (plan.layout === "axial") {
    let cursor = 0;
    lens.forEach((l) => { centersZ.push(cursor - l / 2); cursor -= l * OVERLAP; });
    const lo = Math.min(...centersZ.map((c, i) => c - lens[i] / 2));
    const hi = Math.max(...centersZ.map((c, i) => c + lens[i] / 2));
    const shift = -(lo + hi) / 2;
    for (let i = 0; i < centersZ.length; i++) centersZ[i] += shift;
  }
  const segments: Segment[] = plan.segments.map((s, i) => {
    const w = 1 + jit();
    const at = s.at ?? [0, 0, 0];
    const cz = plan.layout === "axial" ? centersZ[i] : at[2];
    return { id: s.id, role: s.role, shape: s.shape, parentId: s.parent, center: v3(plan.layout === "axial" ? 0 : at[0], plan.layout === "axial" ? (s.dy ?? 0) : at[1], cz), halfExtents: v3((s.width / 2) * wf * w, (s.height / 2) * wf * w, lens[i] / 2) };
  });

  const joints: Joint[] = segments.filter((s) => s.parentId !== null).map((s) => ({ id: `j-ax-${s.id}`, kind: "axial", type: plan.axialJoint, dof: dofOf(plan.axialJoint), parentSegmentId: s.parentId, childSegmentId: s.id, appendageId: null, section: null }));

  // ---- Placche dermiche (MOR-02), solo se il dato esiste ed è sopra soglia ----
  const platesN = armorN !== null && armorN >= SURFACE_COVERING_THRESHOLD ? clamp(Math.round(2 + armorN * 6), ARMOR_PLATE_MIN, ARMOR_PLATE_MAX) : 0;
  const ring = plan.symmetry === "radial" || plan.symmetry === "spherical";
  const appendages: Appendage[] = [];
  const declaredAnomalies: AnatomyDiagnostic[] = [];
  let remaining = MAX_APPENDAGES - platesN;

  const emit = (g: AppendageGroupSpec, n: number, policy: OddAppendagePolicy, symmetry: SymmetryType): void => {
    const gJ = jit();
    const slots = slotsFor(g, n, segments, ring, symmetry, policy);
    if (n % 2 === 1 && (g.placement === "lateral") && symmetry === "bilateral") {
      const omitted = policy === "omit";
      declaredAnomalies.push({
        code: omitted ? `omitted-appendages:${g.id}` : `odd-appendage-count:${g.id}`,
        status: "WARNING",
        target: g.id,
        message: omitted
          ? `gruppo "${g.id}": richieste ${n} appendici, emesse ${slots.length} (policy "omit")`
          : `gruppo "${g.id}": ${n} appendici in un piano bilaterale → disposizione non esattamente speculare (policy "${policy}")`,
      });
    }
    slots.forEach((sl, idx) => {
      // Simmetria dichiarata ⇒ jitter identico per le membra della stessa coppia/anello.
      const jitterKey = symmetry === "none" ? `${plan.id}:${g.id}:${sl.idx}`
        : symmetry === "bilateral" ? `${plan.id}:${g.id}:${sl.bucket}`
        : `${plan.id}:${g.id}:ring`;
      const sJ = symmetry === "none" ? jit() : jitterOn ? ((hashToUint(jitterKey) % 1000) / 1000 - 0.5) * 0.12 : 0;
      const f = 1 + gJ + sJ;
      const a: Appendage = {
        id: `${g.id}-${idx}`, groupId: g.id, kind: g.kind, variant: g.variant ?? null, segmentId: sl.host.id, side: sl.side, index: idx, angle: sl.angle,
        position: v3(sl.x, sl.y, sl.z), direction: sl.dir, length: rd(g.length * f), radius: rd(g.radius * wf * (1 + (gJ + sJ) * 0.5)), sectionCount: g.sections,
      };
      appendages.push(a);
    });
  };

  for (const g of plan.groups) {
    const requested = input.appendageCounts?.[g.id];
    const base = typeof requested === "number" && Number.isFinite(requested) ? Math.round(requested) : g.count;
    const n = Math.max(0, Math.min(clamp(base, g.minCount, g.maxCount), remaining));
    remaining -= n;
    if (n > 0) emit(g, n, resolveOddPolicy(g, plan.symmetry), plan.symmetry);
  }
  if (platesN > 0) {
    const root = segments.find((s) => s.parentId === null) ?? segments[0];
    const plateGroup: AppendageGroupSpec = {
      id: "armor-plates", kind: "plate", variant: "dermal", attach: root.id, placement: "dorsal", orientation: "up",
      count: platesN, minCount: platesN, maxCount: platesN, length: 0.1 + 0.25 * (armorN ?? 0), radius: 0.18,
      sections: 1, joint: "fixed", span: 0.8, yOffset: 0, oddPolicy: "staggered",
    };
    emit(plateGroup, platesN, "staggered", plan.symmetry);
  }

  for (const a of appendages) {
    const g = plan.groups.find((x) => x.id === a.groupId);
    const jt: JointType = g ? g.joint : "fixed";
    joints.push({ id: `j-ap-${a.id}`, kind: "root", type: jt, dof: dofOf(jt), parentSegmentId: a.segmentId, childSegmentId: null, appendageId: a.id, section: 0 });
    for (let s = 1; s < a.sectionCount; s++) joints.push({ id: `j-in-${a.id}-${s}`, kind: "internal", type: "hinge", dof: 1, parentSegmentId: null, childSegmentId: null, appendageId: a.id, section: s });
  }

  // ---- Locomozione (dalla struttura, non dai geni) ----
  const legs = appendages.filter((a) => a.kind === "leg").length;
  const mode: LocomotionMode =
    plan.locomotion === "legged" ? (legs === 0 ? "limbless" : legs === 2 ? "bipedal" : legs === 4 ? "quadrupedal" : legs === 6 ? "hexapodal" : "multipedal") : plan.locomotion;

  // ---- Provenienza ----
  const trait = (tr: { value: number | null; geneId: string; source: DataSource }, note: string): DataSource => (tr.value === null ? und(`dato mancante: ${tr.geneId}`) : { ...tr.source, note });
  const provenance: Record<string, DataSource> = {
    bodyPlan: und(origin === "seeded-speculative" ? "body plan scelto da un seme: nessun gene lo codifica" : origin === "legacy-default" ? "body plan di default (compatibilità): nessun gene lo codifica" : "body plan specificato esplicitamente: nessun gene lo codifica"),
    symmetry: und("simmetria dal body plan: nessun gene la codifica"),
    segmentation: und("segmentazione dal body plan: nessun gene la codifica"),
    appendages: und("tipo e numero di appendici dal body plan: nessun gene li codifica"),
    armorPlates: platesN > 0 ? { kind: "gene-derived", genes: ["MOR-02"], certainty: "derived", note: "numero di placche rappresentato dalla corazza dermica" } : und("nessuna placca: dato assente o sotto soglia"),
    "proportions.sizeScale": ph.derived.sizeScale.source,
    "proportions.robustness": trait(t.bodyStature, "corporatura da MOR-03"),
    "proportions.extents": und("dimensioni dalla geometria generata, modulate dai soli geni morfologici"),
    "surface.covering": ph.derived.surfaceCovering.source,
    "surface.furCoverage": trait(t.furDensity, "foltezza del pelo da MOR-01"),
    "surface.armorCoverage": trait(t.dermalArmor, "corazza da MOR-02 normalizzata"),
    locomotion: und("modalità derivata dalla struttura del body plan: non implica velocità né abilità"),
    complexity: und("conteggio strutturale"),
    aesthetic: { kind: "aesthetic", genes: [], certainty: "speculative", note: jitterOn ? "variazione deterministica da seme" : "nessuna variazione" },
  };
  for (const k of REQUIRED_PROVENANCE_KEYS) if (!(k in provenance)) throw new Error(`G2: provenienza mancante: ${k}`);

  const radialGroup = plan.groups.find((g) => g.placement === "radial");
  const symmetryOrder = plan.symmetry === "bilateral" ? 2 : plan.symmetry === "spherical" ? 0 : plan.symmetry === "none" ? 1 : Math.max(1, radialGroup ? appendages.filter((a) => a.groupId === radialGroup.id).length : 1);
  const full = assembleDescriptor({
    lod: 3,
    bodyPlan: { id: plan.id, family: plan.family, origin },
    symmetry: { type: plan.symmetry, order: symmetryOrder },
    segments, appendages, joints,
    sizeScale, robustness: statureN,
    surface: { covering: ph.derived.surfaceCovering.value, furCoverage: furN, armorCoverage: armorN },
    locomotionMode: mode,
    aesthetic: { seed: jitterOn ? (input.seed as number) >>> 0 : null, jitter: rd(globalJitter) },
    provenance, phenotypeIssues: ph.issues,
    declaredAnomalies,
  });
  return input.lod === undefined || input.lod >= 3 ? full : reduceAnatomyDetail(full, input.lod);
}

// ---- Cache deterministica (per migliaia di organismi: stesso input quantizzato → stesso oggetto immutabile) ----
const CACHE_LIMIT = 4096;
const cache = new WeakMap<BodyPlanSpec, Map<string, AnatomyDescriptor>>();

function cacheKey(i: AnatomyInput): string {
  const t = i.phenotype.traits;
  const tv = (x: { value: number | null; status: string }) => `${x.status}:${x.value === null ? "x" : q3(x.value)}`;
  const counts = i.appendageCounts ? Object.keys(i.appendageCounts).sort().map((k) => `${k}=${i.appendageCounts![k]}`).join(",") : "";
  return [i.seed === undefined ? "n" : i.seed >>> 0, i.origin ?? "explicit", i.lod ?? 3, counts, tv(t.size), tv(t.bodyStature), tv(t.furDensity), tv(t.dermalArmor)].join("|");
}

export function generateAnatomyCached(input: AnatomyInput): AnatomyDescriptor {
  let m = cache.get(input.bodyPlan);
  if (!m) { m = new Map(); cache.set(input.bodyPlan, m); }
  const key = cacheKey(input);
  const hit = m.get(key);
  if (hit) return hit;
  const d = generateAnatomy(input);
  if (m.size >= CACHE_LIMIT) m.clear();
  m.set(key, d);
  return d;
}

export interface GenomeAnatomyOptions {
  readonly bodyPlan?: BodyPlanSpec;
  readonly seed?: number;
  /** Opzione B (spenta di default): con `seed` sceglie un body plan speculativo dal solo seme. */
  readonly speculativeBodyPlan?: boolean;
  readonly lod?: DetailTier;
}

/** Comodità: fenotipo già derivato → descriptor, con il body plan di default (quadrupede legacy) se non specificato. */
export function anatomyFromPhenotype(phenotype: PhenotypeProfile, opts: GenomeAnatomyOptions = {}): AnatomyDescriptor {
  let plan = opts.bodyPlan;
  let origin: BodyPlanOrigin = "explicit";
  if (!plan && opts.speculativeBodyPlan && opts.seed !== undefined) {
    plan = BODY_PLAN_CATALOG[speculativeBodyPlanId(opts.seed)];
    origin = "seeded-speculative";
  }
  if (!plan) {
    plan = BODY_PLAN_CATALOG[LEGACY_DEFAULT_BODY_PLAN_ID];
    origin = "legacy-default";
  }
  return generateAnatomyCached({ phenotype, bodyPlan: plan, seed: opts.seed, origin, lod: opts.lod });
}
