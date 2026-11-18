import { MAX_APPENDAGES, type AppendageKind, type BodyPlanFamily, type JointType, type SegmentRole, type SegmentShape, type SymmetryType } from "./types";
import { hashToUint } from "./util";

/**
 * G2 — Body plan componibili. Un body plan è DATI: segmenti + gruppi di appendici. Non esiste un body plan universale:
 * il catalogo qui sotto è composto con gli stessi due costruttori (`seg`, `grp`), non è un insieme di modelli indipendenti.
 * Le famiglie A–D del brief sono capacità rappresentative, non stadi evolutivi.
 *
 * IMPORTANTE: nessun gene codifica il body plan (vedi docs/graphics/G2_MISSING_GENETIC_DATA.md). Il body plan è quindi
 * un input esplicito del generatore o, in modo opzionale e dichiarato, scelto da un seme (`speculativeBodyPlanId`).
 */
export type Placement = "lateral" | "dorsal" | "ventral" | "terminal-front" | "terminal-rear" | "radial";
export type Orientation = "down" | "outward" | "up" | "forward" | "back";
export type LocomotionPlan = "legged" | "undulatory" | "radial" | "sessile" | "amorphous" | "appendage-driven";

export interface SegmentSpec {
  readonly id: string;
  readonly role: SegmentRole;
  readonly shape: SegmentShape;
  readonly parent: string | null;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly dy?: number;
  /** Posizione esplicita (layout "explicit"). */
  readonly at?: readonly [number, number, number];
}

export interface AppendageGroupSpec {
  readonly id: string;
  readonly kind: AppendageKind;
  readonly variant?: string;
  /** Id di segmento oppure ruolo (tutti i segmenti con quel ruolo formano la zona di attacco). */
  readonly attach: string;
  readonly placement: Placement;
  readonly orientation: Orientation;
  readonly count: number;
  readonly minCount: number;
  readonly maxCount: number;
  readonly length: number;
  readonly radius: number;
  readonly sections: 1 | 2 | 3;
  readonly joint: JointType;
  /** Frazione della zona di attacco occupata (0..1). */
  readonly span: number;
  /** Offset verticale in frazioni della semialtezza del segmento ospite. */
  readonly yOffset: number;
}

export interface BodyPlanSpec {
  readonly id: string;
  readonly family: BodyPlanFamily;
  readonly symmetry: SymmetryType;
  readonly layout: "axial" | "explicit";
  readonly locomotion: LocomotionPlan;
  readonly axialJoint: JointType;
  readonly segments: readonly SegmentSpec[];
  readonly groups: readonly AppendageGroupSpec[];
}

type SegExtra = { dy?: number; at?: readonly [number, number, number] };
const seg = (id: string, role: SegmentRole, shape: SegmentShape, parent: string | null, length: number, width: number, height: number, extra: SegExtra = {}): SegmentSpec =>
  Object.freeze({ id, role, shape, parent, length, width, height, ...extra });

interface GrpOpts { variant?: string; min?: number; max?: number; sections?: 1 | 2 | 3; joint?: JointType; span?: number; yOffset?: number }
const grp = (id: string, kind: AppendageKind, attach: string, placement: Placement, orientation: Orientation, count: number, length: number, radius: number, o: GrpOpts = {}): AppendageGroupSpec =>
  Object.freeze({
    id, kind, ...(o.variant ? { variant: o.variant } : {}), attach, placement, orientation, count,
    minCount: o.min ?? 0, maxCount: o.max ?? 40, length, radius,
    sections: o.sections ?? 1, joint: o.joint ?? "fixed", span: o.span ?? 0.7, yOffset: o.yOffset ?? 0,
  });

const plan = (p: Omit<BodyPlanSpec, "segments" | "groups"> & { segments: SegmentSpec[]; groups?: AppendageGroupSpec[] }): BodyPlanSpec =>
  Object.freeze({ ...p, segments: Object.freeze(p.segments), groups: Object.freeze(p.groups ?? []) });

const eyes = (attach: string) => grp("eyes", "sensory", attach, "lateral", "outward", 2, 0.12, 0.12, { variant: "eye", max: 4, yOffset: 0.3 });

const CHAIN = (prefix: string, n: number, rootParent: string | null, length: number, width: number, height: number): SegmentSpec[] =>
  Array.from({ length: n }, (_, i) => seg(`${prefix}${i + 1}`, "trunk", "capsule", i === 0 ? rootParent : `${prefix}${i}`, length, width, height));

const PLANS: BodyPlanSpec[] = [
  // ---- A: organismi semplici ----
  plan({ id: "simple-sphere", family: "simple", symmetry: "spherical", layout: "explicit", locomotion: "amorphous", axialJoint: "fixed",
    segments: [seg("body", "core", "sphere", null, 1.6, 1.6, 1.6, { at: [0, 0, 0] })] }),
  plan({ id: "simple-elongated", family: "simple", symmetry: "bilateral", layout: "axial", locomotion: "undulatory", axialJoint: "fixed",
    segments: [seg("body", "core", "capsule", null, 2.4, 0.8, 0.8)],
    groups: [grp("flagella", "flagellum", "body", "terminal-rear", "back", 1, 1.0, 0.05, { max: 3, sections: 2, joint: "flexible" })] }),
  plan({ id: "simple-asymmetric", family: "simple", symmetry: "none", layout: "explicit", locomotion: "amorphous", axialJoint: "flexible",
    segments: [
      seg("lobe-a", "core", "ellipsoid", null, 1.4, 1.1, 1.0, { at: [0, 0, 0] }),
      seg("lobe-b", "lobe", "ellipsoid", "lobe-a", 0.9, 0.8, 0.7, { at: [0.5, 0.1, 0.7] }),
      seg("lobe-c", "lobe", "ellipsoid", "lobe-a", 0.8, 0.7, 0.9, { at: [-0.4, -0.1, -0.6] }),
    ],
    groups: [grp("pseudopods", "pseudopod", "lobe-a", "lateral", "outward", 3, 0.5, 0.12, { max: 8, joint: "flexible" })] }),
  // ---- B: organismi multicellulari ----
  plan({ id: "segmented-worm", family: "multicellular", symmetry: "bilateral", layout: "axial", locomotion: "undulatory", axialJoint: "segmental",
    segments: [seg("head", "head", "sphere", "t1", 0.7, 0.7, 0.7), ...CHAIN("t", 4, null, 0.8, 0.7, 0.7), seg("tail", "tail", "cone", "t4", 0.9, 0.5, 0.5)] }),
  plan({ id: "radial-sessile", family: "multicellular", symmetry: "radial", layout: "explicit", locomotion: "radial", axialJoint: "fixed",
    segments: [seg("disc", "core", "ellipsoid", null, 1.2, 1.2, 0.5, { at: [0, 0, 0] })],
    groups: [grp("arms", "arm", "disc", "radial", "outward", 5, 0.9, 0.18, { min: 2, max: 12, sections: 2, joint: "flexible" })] }),
  plan({ id: "supported-multicellular", family: "multicellular", symmetry: "bilateral", layout: "axial", locomotion: "appendage-driven", axialJoint: "flexible",
    segments: [seg("head", "head", "sphere", "trunk", 0.8, 0.8, 0.8), seg("trunk", "trunk", "capsule", null, 1.6, 1.0, 0.9), seg("tail", "tail", "cone", "trunk", 1.0, 0.5, 0.5)],
    groups: [
      grp("fins", "fin", "trunk", "lateral", "outward", 4, 0.6, 0.1, { max: 8, joint: "hinge" }),
      grp("supports", "spine", "trunk", "dorsal", "up", 3, 0.5, 0.08, { variant: "support", max: 8 }),
    ] }),
  // ---- C: organismi complessi ----
  plan({ id: "quadruped", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "flexible",
    segments: [seg("head", "head", "sphere", "trunk", 0.9, 0.9, 0.9, { dy: 0.2 }), seg("trunk", "trunk", "ellipsoid", null, 2.0, 1.4, 1.2), seg("tail", "tail", "cone", "trunk", 1.0, 0.5, 0.5)],
    groups: [grp("legs", "leg", "trunk", "lateral", "down", 4, 0.9, 0.14, { max: 12, sections: 2, joint: "ball", yOffset: -0.8 }), eyes("head")] }),
  plan({ id: "biped", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "flexible",
    segments: [seg("head", "head", "sphere", "trunk", 0.8, 0.8, 0.8, { dy: 0.3 }), seg("trunk", "trunk", "ellipsoid", null, 1.2, 0.9, 1.6), seg("tail", "tail", "cone", "trunk", 0.7, 0.4, 0.4)],
    groups: [
      grp("legs", "leg", "trunk", "lateral", "down", 2, 1.2, 0.16, { max: 4, sections: 3, joint: "ball", yOffset: -0.8 }),
      grp("arms", "arm", "trunk", "lateral", "outward", 2, 0.9, 0.11, { max: 4, sections: 3, joint: "ball", yOffset: 0.5 }),
      eyes("head"),
    ] }),
  plan({ id: "hexapod", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "segmental",
    segments: [seg("head", "head", "sphere", "thorax", 0.7, 0.7, 0.7), seg("thorax", "thorax", "ellipsoid", null, 1.2, 0.9, 0.8), seg("abdomen", "abdomen", "ellipsoid", "thorax", 1.6, 1.0, 0.9)],
    groups: [
      grp("legs", "leg", "thorax", "lateral", "down", 6, 1.0, 0.06, { max: 12, sections: 3, joint: "hinge", yOffset: -0.6, span: 0.8 }),
      grp("antennae", "sensory", "head", "terminal-front", "forward", 2, 0.8, 0.03, { variant: "antenna", max: 4, sections: 2, joint: "flexible" }),
    ] }),
  plan({ id: "many-legged", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "segmental",
    segments: [seg("head", "head", "sphere", "t1", 0.6, 0.6, 0.6), ...CHAIN("t", 8, null, 0.9, 0.8, 0.7), seg("tail", "tail", "cone", "t8", 0.8, 0.4, 0.4)],
    groups: [
      grp("legs", "leg", "trunk", "lateral", "down", 16, 0.6, 0.05, { min: 2, max: 40, sections: 2, joint: "hinge", yOffset: -0.6, span: 0.9 }),
      grp("antennae", "sensory", "head", "terminal-front", "forward", 2, 0.6, 0.03, { variant: "antenna", max: 4, sections: 2, joint: "flexible" }),
    ] }),
  plan({ id: "limbless-serpentine", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "undulatory", axialJoint: "segmental",
    segments: [seg("head", "head", "capsule", "t1", 0.9, 0.6, 0.55), ...CHAIN("t", 7, null, 1.0, 0.55, 0.5), seg("tail", "tail", "cone", "t7", 1.2, 0.3, 0.3)],
    groups: [eyes("head")] }),
  // ---- D: organismi specializzati ----
  plan({ id: "armored-specialist", family: "specialized", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "segmental",
    segments: [
      seg("head", "head", "sphere", "thorax", 0.8, 0.8, 0.7), seg("thorax", "thorax", "ellipsoid", null, 1.4, 1.1, 0.9),
      seg("abdomen", "abdomen", "ellipsoid", "thorax", 1.6, 1.2, 1.0), seg("telson", "tail", "cone", "abdomen", 0.8, 0.4, 0.4),
    ],
    groups: [
      grp("legs", "leg", "thorax", "lateral", "down", 6, 1.0, 0.07, { max: 12, sections: 3, joint: "ball", yOffset: -0.6, span: 0.8 }),
      grp("claws", "claw", "head", "terminal-front", "forward", 2, 0.9, 0.14, { max: 4, sections: 3, joint: "ball" }),
      grp("antennae", "sensory", "head", "terminal-front", "forward", 2, 0.8, 0.03, { variant: "antenna", max: 4, sections: 2, joint: "flexible" }),
      grp("ridges", "spine", "abdomen", "dorsal", "up", 4, 0.4, 0.1, { variant: "protective", max: 8 }),
    ] }),
  plan({ id: "speculative-multi-arm", family: "specialized", symmetry: "radial", layout: "explicit", locomotion: "radial", axialJoint: "fixed",
    segments: [seg("core", "core", "sphere", null, 1.2, 1.2, 1.2, { at: [0, 0, 0] })],
    groups: [
      grp("arms", "arm", "core", "radial", "outward", 6, 1.2, 0.12, { min: 3, max: 12, sections: 3, joint: "ball" }),
      grp("stalks", "sensory", "core", "dorsal", "up", 3, 0.7, 0.05, { variant: "stalk", max: 6, sections: 2, joint: "flexible" }),
    ] }),
];

export const BODY_PLAN_CATALOG: Readonly<Record<string, BodyPlanSpec>> = Object.freeze(Object.fromEntries(PLANS.map((p) => [p.id, p])));
export const BODY_PLAN_IDS: readonly string[] = Object.freeze(PLANS.map((p) => p.id));
/** Body plan usato per le creature esistenti (equivalente strutturale dell'anatomia legacy). */
export const LEGACY_DEFAULT_BODY_PLAN_ID = "quadruped";

export function getBodyPlan(id: string): BodyPlanSpec | undefined {
  return BODY_PLAN_CATALOG[id];
}

/**
 * Opzione B: sceglie un body plan speculativo da un seme (es. id di specie). Dipende SOLO dal seme: mai da tratti
 * come carnivoria o velocità. L'output va marcato con origin "seeded-speculative" (provenienza "undetermined").
 */
export function speculativeBodyPlanId(seed: number, ids: readonly string[] = BODY_PLAN_IDS): string {
  return ids[hashToUint(`speculative-body-plan:${seed >>> 0}`) % ids.length];
}

const SYMMETRIES = new Set(["spherical", "bilateral", "radial", "none"]);
const JOINTS = new Set(["fixed", "hinge", "ball", "segmental", "flexible"]);
const finitePos = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Controlla la coerenza interna di uno spec. Restituisce l'elenco degli errori (vuoto = valido). */
export function validateBodyPlanSpec(spec: BodyPlanSpec): string[] {
  const errs: string[] = [];
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.segments) || !Array.isArray(spec.groups)) return ["malformed-spec"];
  if (typeof spec.id !== "string" || !spec.id) errs.push("missing-id");
  if (!SYMMETRIES.has(spec.symmetry)) errs.push(`bad-symmetry:${String(spec.symmetry)}`);
  if (spec.layout !== "axial" && spec.layout !== "explicit") errs.push(`bad-layout:${String(spec.layout)}`);
  if (!JOINTS.has(spec.axialJoint)) errs.push(`bad-axial-joint:${String(spec.axialJoint)}`);
  if (spec.segments.length === 0) errs.push("no-segments");
  const ids = new Set<string>();
  let roots = 0;
  for (const s of spec.segments) {
    if (typeof s.id !== "string" || !s.id) errs.push("segment-without-id");
    if (ids.has(s.id)) errs.push(`duplicate-segment:${s.id}`);
    ids.add(s.id);
    if (s.parent === null) roots++;
    if (!(finitePos(s.length) && finitePos(s.width) && finitePos(s.height))) errs.push(`bad-dimensions:${s.id}`);
    if (spec.layout === "explicit" && !(s.at && s.at.length === 3 && s.at.every((v: number) => Number.isFinite(v)))) errs.push(`missing-position:${s.id}`);
  }
  if (spec.segments.length > 0 && roots !== 1) errs.push(`roots:${roots}`);
  for (const s of spec.segments) if (s.parent !== null && !ids.has(s.parent)) errs.push(`unknown-parent:${s.id}->${s.parent}`);
  // niente cicli
  const parentOf = new Map(spec.segments.map((s) => [s.id, s.parent] as const));
  for (const s of spec.segments) {
    let cur: string | null = s.id;
    let steps = 0;
    while (cur !== null && steps++ <= spec.segments.length) cur = parentOf.get(cur) ?? null;
    if (cur !== null) errs.push(`parent-cycle:${s.id}`);
  }
  const gids = new Set<string>();
  let defaultTotal = 0;
  for (const g of spec.groups) {
    if (typeof g.id !== "string" || !g.id) errs.push("group-without-id");
    if (gids.has(g.id)) errs.push(`duplicate-group:${g.id}`);
    gids.add(g.id);
    if (!spec.segments.some((s) => s.id === g.attach || s.role === g.attach)) errs.push(`unknown-attach:${g.id}->${g.attach}`);
    if (![g.count, g.minCount, g.maxCount].every((n) => Number.isInteger(n)) || !(g.minCount >= 0 && g.minCount <= g.count && g.count <= g.maxCount)) errs.push(`bad-count-range:${g.id}`);
    if (!(finitePos(g.length) && finitePos(g.radius))) errs.push(`bad-appendage-dimensions:${g.id}`);
    if (![1, 2, 3].includes(g.sections)) errs.push(`bad-sections:${g.id}`);
    if (!JOINTS.has(g.joint)) errs.push(`bad-joint:${g.id}`);
    if (!(typeof g.span === "number" && g.span > 0 && g.span <= 1)) errs.push(`bad-span:${g.id}`);
    if (!Number.isFinite(g.yOffset) || Math.abs(g.yOffset) > 1) errs.push(`bad-yoffset:${g.id}`);
    // compatibilità simmetria/posizionamento: una disposizione radiale non può convivere con simmetria bilaterale e viceversa
    const ringOnly = spec.symmetry === "radial" || spec.symmetry === "spherical";
    if (ringOnly && (g.placement === "lateral" || g.placement.startsWith("terminal"))) errs.push(`placement-incompatible-with-symmetry:${g.id}:${g.placement}/${spec.symmetry}`);
    if (spec.symmetry === "bilateral" && g.placement === "radial") errs.push(`placement-incompatible-with-symmetry:${g.id}:radial/bilateral`);
    defaultTotal += g.count;
  }
  if (defaultTotal > MAX_APPENDAGES) errs.push(`too-many-default-appendages:${defaultTotal}`);
  return errs;
}
