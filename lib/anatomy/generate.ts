import type { DataSource, PhenotypeProfile } from "../phenotype/types";
import { SURFACE_COVERING_THRESHOLD } from "../phenotype/derive";
import { assembleDescriptor } from "./assemble";
import { BODY_PLAN_CATALOG, LEGACY_DEFAULT_BODY_PLAN_ID, speculativeBodyPlanId, validateBodyPlanSpec, type AppendageGroupSpec, type BodyPlanSpec } from "./bodyPlan";
import { BODY_ROLES, profile, surfaceEndZ, surfaceHalfWidth, surfaceY } from "./geometry";
import { reduceAnatomyDetail } from "./lod";
import {
  LOCOMOTOR_KINDS, MAX_APPENDAGES, REQUIRED_PROVENANCE_KEYS,
  type Appendage, type AppendageSide, type AnatomyDescriptor, type BodyPlanOrigin, type DetailTier, type Joint, type JointType, type LocomotionMode, type Segment, type SymmetryType, type Vec3,
} from "./types";
import { canonicalJson, clamp, hashToUint, mulberry32, rd } from "./util";

/**
 * G2 — Generatore anatomico deterministico: (fenotipo, body plan, seme opzionale) → AnatomyDescriptor.
 * Funzione pura: nessun Math.random, nessun accesso a React/Three.js/renderer. Senza `seed` la variazione estetica è nulla.
 * Le caratteristiche biologiche provengono solo da `phenotype` (geni morfologici); la struttura (segmenti, appendici,
 * articolazioni, simmetria) viene dal body plan ed è dichiarata "undetermined" nella provenienza.
 * Un `BodyPlanSpec` non valido provoca un Error descrittivo (mai un descriptor parziale).
 */
export interface AnatomyInput {
  readonly phenotype: PhenotypeProfile;
  readonly bodyPlan: BodyPlanSpec;
  /** Seme della variazione ESTETICA (es. id organismo). Assente = nessuna variazione. */
  readonly seed?: number;
  readonly origin?: BodyPlanOrigin;
  readonly lod?: DetailTier;
  /** Sovrascrive il numero di appendici per gruppo (limitato a [minCount, maxCount] del gruppo e, nel complesso, a MAX_APPENDAGES). */
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
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const normLod = (l: number | undefined): DetailTier => (l === undefined || !Number.isFinite(l) ? 3 : (clamp(Math.trunc(l), 0, 3) as DetailTier));
const normSeed = (s: number | undefined): number | undefined => (s === undefined ? undefined : s >>> 0);
const PLATE_ATTACH = "*body";

interface Slot { x: number; y: number; z: number; side: AppendageSide; angle: number | null; host: Segment; dir: Vec3; bucket: number }

function hostsFor(segs: readonly Segment[], attach: string): Segment[] {
  if (attach === PLATE_ATTACH) {
    const body = segs.filter((s) => BODY_ROLES.has(s.role));
    return body.length ? body : [segs.find((s) => s.parentId === null) ?? segs[0]];
  }
  const byId = segs.filter((s) => s.id === attach);
  if (byId.length) return byId;
  const byRole = segs.filter((s) => s.role === attach);
  return byRole.length ? byRole : [segs.find((s) => s.parentId === null) ?? segs[0]];
}

function nearest(hosts: readonly Segment[], z: number): Segment {
  let best = hosts[0];
  for (const h of hosts) if (Math.abs(z - h.center.z) < Math.abs(z - best.center.z)) best = h;
  return best;
}

function direction(o: AppendageGroupSpec["orientation"], sx: number): Vec3 {
  switch (o) {
    case "down": return norm3(sx * 0.3, -1, 0);
    case "outward": return sx === 0 ? v3(0, 1, 0) : v3(sx, 0, 0); // un'appendice sulla linea mediana "verso l'esterno" punta in alto
    case "up": return norm3(sx * 0.2, 1, 0);
    case "forward": return v3(0, 0, 1);
    default: return v3(0, 0, -1);
  }
}

const mirrorX = (sx: number, ax: number): number => (sx === 0 ? 0 : sx * rd(ax));
/** Posizione normalizzata in [-0,5; 0,5] del k-esimo di n elementi. Aritmetica intera: f(k) e f(n-1-k) sono esattamente opposti (nessun rumore in virgola mobile che rompa le simmetrie). */
const frac = (k: number, n: number): number => (n === 1 ? 0 : (2 * k - (n - 1)) / (2 * (n - 1)));

function slotsFor(g: AppendageGroupSpec, n: number, segs: readonly Segment[], ring: boolean): Slot[] {
  const hosts = hostsFor(segs, g.attach);
  const zmin = Math.min(...hosts.map((h) => h.center.z - h.halfExtents.z));
  const zmax = Math.max(...hosts.map((h) => h.center.z + h.halfExtents.z));
  const zmid = (zmin + zmax) / 2;
  const zr = (zmax - zmin) * g.span;
  const out: Slot[] = [];
  if (g.placement === "lateral") {
    const pairs = Math.floor(n / 2);
    for (let p = 0; p < pairs; p++) {
      const z = zmid + frac(p, pairs) * zr;
      const host = nearest(hosts, z);
      const y = host.center.y + g.yOffset * host.halfExtents.y * profile(host, z);
      const hw = surfaceHalfWidth(host, y, z);
      for (const sx of [-1, 1]) out.push({ x: host.center.x + mirrorX(sx, hw), y, z, side: sx > 0 ? "left" : "right", angle: null, host, dir: direction(g.orientation, sx), bucket: p });
    }
    if (n % 2 === 1) {
      // appendice dispari: sulla linea mediana, all'estremità posteriore della zona, con l'orientamento del gruppo
      const z = zmid - zr / 2;
      const host = nearest(hosts, z);
      const down = g.orientation === "down";
      const y = surfaceY(host, host.center.x, z, down ? -1 : 1);
      out.push({ x: host.center.x, y, z, side: "mid", angle: null, host, dir: direction(g.orientation, 0), bucket: pairs });
    }
  } else if (g.placement === "dorsal" || g.placement === "ventral") {
    const sy: 1 | -1 = g.placement === "dorsal" ? 1 : -1;
    for (let k = 0; k < n; k++) {
      if (ring) {
        const host = hosts[0];
        const ang = (2 * Math.PI * k) / n;
        const r = n === 1 ? 0 : host.halfExtents.x * 0.35;
        const x = host.center.x + Math.cos(ang) * r;
        const z = host.center.z + Math.sin(ang) * r;
        out.push({ x, y: surfaceY(host, x, z, sy), z, side: "mid", angle: n === 1 ? null : rd(ang), host, dir: direction(g.orientation, 0), bucket: k });
      } else {
        const z = zmid + frac(k, n) * zr;
        const host = nearest(hosts, z);
        out.push({ x: host.center.x, y: surfaceY(host, host.center.x, z, sy), z, side: "mid", angle: null, host, dir: direction(g.orientation, 0), bucket: k });
      }
    }
  } else if (g.placement === "terminal-front" || g.placement === "terminal-rear") {
    const front = g.placement === "terminal-front";
    const host = hosts.reduce((a, b) => (front ? (b.center.z + b.halfExtents.z > a.center.z + a.halfExtents.z ? b : a) : (b.center.z - b.halfExtents.z < a.center.z - a.halfExtents.z ? b : a)));
    for (let k = 0; k < n; k++) {
      const f = frac(k, n);
      const sx = f > 0 ? 1 : f < 0 ? -1 : 0;
      const ax = Math.abs(f) * 2 * host.halfExtents.x * 0.5;
      const z = surfaceEndZ(host, host.center.x + ax, host.center.y, front);
      out.push({ x: host.center.x + mirrorX(sx, ax), y: host.center.y, z, side: sx > 0 ? "left" : sx < 0 ? "right" : "mid", angle: null, host, dir: direction(g.orientation, sx), bucket: Math.min(k, n - 1 - k) });
    }
  } else {
    const host = hosts[0];
    for (let k = 0; k < n; k++) {
      const ang = (2 * Math.PI * k) / n;
      out.push({ x: host.center.x + Math.cos(ang) * host.halfExtents.x * 0.95, y: host.center.y + g.yOffset * host.halfExtents.y, z: host.center.z + Math.sin(ang) * host.halfExtents.z * 0.95, side: "mid", angle: rd(ang), host, dir: norm3(Math.cos(ang), 0, Math.sin(ang)), bucket: k });
    }
  }
  return out;
}

const specChecked = new WeakSet<object>();
const deepFrozenSpecs = new WeakSet<object>();

function assertValidSpec(plan: BodyPlanSpec): void {
  if (specChecked.has(plan)) return;
  const errs = validateBodyPlanSpec(plan);
  if (errs.length) throw new Error(`G2: BodyPlanSpec non valido (${String(plan?.id)}): ${errs.slice(0, 5).join(", ")}`);
  if (isDeepFrozen(plan)) specChecked.add(plan); // uno spec modificabile viene ricontrollato a ogni chiamata
}

function isDeepFrozen(plan: BodyPlanSpec): boolean {
  if (deepFrozenSpecs.has(plan)) return true;
  const frozen = (o: object) => Object.isFrozen(o);
  const ok = frozen(plan) && frozen(plan.segments) && frozen(plan.groups) && plan.segments.every((s) => frozen(s) && (!s.at || frozen(s.at))) && plan.groups.every(frozen);
  if (ok) deepFrozenSpecs.add(plan);
  return ok;
}

/** Numero effettivo di appendici richiesto per un gruppo, entro [minCount, maxCount]. Richieste non numeriche → valore di default. */
function requestedCount(g: AppendageGroupSpec, requested: number | undefined): number {
  const base = typeof requested === "number" && Number.isFinite(requested) ? Math.round(requested) : g.count;
  return clamp(base, g.minCount, g.maxCount);
}

/**
 * Applica il tetto globale ripartendo il budget tra i gruppi in proporzione alla richiesta (nessun gruppo viene azzerato a vantaggio
 * di un altro), mantenendo le coppie bilaterali. Deterministico.
 */
function allocateCounts(plan: BodyPlanSpec, requests: readonly number[], budget: number): number[] {
  const total = requests.reduce((a, b) => a + b, 0);
  if (total <= budget) return [...requests];
  const paired = plan.groups.map((g) => plan.symmetry === "bilateral" && (g.placement === "lateral" || g.placement.startsWith("terminal")));
  const s = Math.max(0, budget) / total;
  const out = requests.map((n, i) => {
    let v = Math.floor(n * s);
    if (paired[i]) v -= v % 2;
    return Math.min(n, Math.max(v, Math.min(n, plan.groups[i].minCount)));
  });
  let sum = out.reduce((a, b) => a + b, 0);
  while (sum > budget) {
    let idx = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[idx]) idx = i;
    if (out[idx] === 0) break;
    const step = paired[idx] && out[idx] >= 2 ? 2 : 1;
    out[idx] -= step;
    sum -= step;
  }
  return out;
}

export function generateAnatomy(input: AnatomyInput): AnatomyDescriptor {
  const { phenotype: ph, bodyPlan: plan } = input;
  assertValidSpec(plan);
  const origin = input.origin ?? "explicit";
  const seed = normSeed(input.seed);
  const jitterOn = seed !== undefined;
  const rng = mulberry32(((seed ?? 0) ^ hashToUint(plan.id)) >>> 0);
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
    const axial = plan.layout === "axial";
    return { id: s.id, role: s.role, shape: s.shape, parentId: s.parent, center: v3(axial ? 0 : at[0], axial ? (s.dy ?? 0) : at[1], axial ? centersZ[i] : at[2]), halfExtents: v3((s.width / 2) * wf * w, (s.height / 2) * wf * w, lens[i] / 2) };
  });

  const joints: Joint[] = segments.filter((s) => s.parentId !== null).map((s) => ({ id: `j-ax-${s.id}`, kind: "axial", type: plan.axialJoint, dof: dofOf(plan.axialJoint), parentSegmentId: s.parentId, childSegmentId: s.id, appendageId: null, section: null }));

  // ---- Placche dermiche (MOR-02), solo se il dato esiste ed è sopra soglia ----
  const platesN = armorN !== null && armorN >= SURFACE_COVERING_THRESHOLD ? clamp(Math.round(2 + armorN * 6), ARMOR_PLATE_MIN, ARMOR_PLATE_MAX) : 0;
  const ring = plan.symmetry === "radial" || plan.symmetry === "spherical";
  const appendages: Appendage[] = [];

  const emit = (g: AppendageGroupSpec, n: number): void => {
    const gJ = jit();
    slotsFor(g, n, segments, ring).forEach((sl, idx) => {
      const sJ = plan.symmetry === "none" ? jit() : jitterOn ? ((hashToUint(`${plan.id}:${g.id}:${sl.bucket}`) % 1000) / 1000 - 0.5) * 0.12 : 0;
      const f = 1 + gJ + sJ;
      appendages.push({
        id: `${g.id}-${idx}`, groupId: g.id, kind: g.kind, variant: g.variant ?? null, segmentId: sl.host.id, side: sl.side, index: idx, angle: sl.angle,
        position: v3(sl.x, sl.y, sl.z), direction: sl.dir, length: rd(g.length * f), radius: rd(g.radius * wf * (1 + (gJ + sJ) * 0.5)), sectionCount: g.sections,
      });
    });
  };

  const counts = allocateCounts(plan, plan.groups.map((g) => requestedCount(g, input.appendageCounts?.[g.id])), MAX_APPENDAGES - platesN);
  plan.groups.forEach((g, i) => { if (counts[i] > 0) emit(g, counts[i]); });
  if (platesN > 0) {
    emit({ id: "armor-plates", kind: "plate", variant: "dermal", attach: PLATE_ATTACH, placement: "dorsal", orientation: "up", count: platesN, minCount: platesN, maxCount: platesN, length: 0.1 + 0.25 * (armorN ?? 0), radius: 0.18, sections: 1, joint: "fixed", span: 0.8, yOffset: 0 }, platesN);
  }

  const jointOfGroup = new Map<string, JointType>(plan.groups.map((g) => [g.id, g.joint] as const));
  for (const a of appendages) {
    const jt: JointType = jointOfGroup.get(a.groupId) ?? "fixed";
    joints.push({ id: `j-ap-${a.id}`, kind: "root", type: jt, dof: dofOf(jt), parentSegmentId: a.segmentId, childSegmentId: null, appendageId: a.id, section: 0 });
    // le sezioni interne seguono il tipo di giunto del gruppo; solo l'articolazione sferica (spalla/anca) si riduce a cerniera (gomito/ginocchio)
    const inner: JointType = jt === "ball" ? "hinge" : jt;
    for (let s = 1; s < a.sectionCount; s++) joints.push({ id: `j-in-${a.id}-${s}`, kind: "internal", type: inner, dof: dofOf(inner), parentSegmentId: null, childSegmentId: null, appendageId: a.id, section: s });
  }

  // ---- Simmetria effettiva: quella dichiarata dal body plan, ridotta se le appendici realmente presenti la contraddicono ----
  const ringCounts = new Map<string, number>();
  for (const a of appendages) if (a.angle !== null) ringCounts.set(a.groupId, (ringCounts.get(a.groupId) ?? 0) + 1);
  const ringOrder = [...ringCounts.values()].reduce((a, b) => gcd(a, b), 0);
  let symType: SymmetryType = plan.symmetry;
  let symOrder: number;
  if (symType === "spherical" && appendages.length > 0) symType = "radial"; // appendici su un asse: la sfera non è più isotropa
  if (symType === "bilateral") symOrder = 2;
  else if (symType === "spherical") symOrder = 0;
  else if (symType === "none") symOrder = 1;
  else symOrder = ringOrder; // radiale: MCD dei gruppi disposti ad anello; 0 = rotazione continua (nessun anello)

  // ---- Locomozione (dalla struttura, non dai geni) ----
  const legs = appendages.filter((a) => a.kind === "leg").length;
  const hasLocomotor = appendages.some((a) => LOCOMOTOR_KINDS.includes(a.kind));
  const mode: LocomotionMode =
    plan.locomotion === "legged" ? (legs === 0 ? "limbless" : legs === 2 ? "bipedal" : legs === 4 ? "quadrupedal" : legs === 6 ? "hexapodal" : "multipedal")
      : (plan.locomotion === "appendage-driven" || plan.locomotion === "radial") && !hasLocomotor ? "limbless"
      : plan.locomotion;

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
    "proportions.extents": und("dimensioni dal body plan, modulate dalla sola corporatura"),
    "surface.covering": ph.derived.surfaceCovering.source,
    "surface.furCoverage": trait(t.furDensity, "foltezza del pelo da MOR-01"),
    "surface.armorCoverage": trait(t.dermalArmor, "corazza da MOR-02 normalizzata"),
    locomotion: und("modalità derivata dalla struttura del body plan: non implica velocità né abilità"),
    complexity: und("conteggio strutturale"),
    aesthetic: { kind: "aesthetic", genes: [], certainty: "speculative", note: jitterOn ? "variazione deterministica da seme" : "nessuna variazione" },
  };
  for (const k of REQUIRED_PROVENANCE_KEYS) if (!(k in provenance)) throw new Error(`G2: provenienza mancante: ${k}`);

  const lod = normLod(input.lod);
  const full = assembleDescriptor({
    lod: 3,
    bodyPlan: { id: plan.id, family: plan.family, origin },
    symmetry: { type: symType, order: symOrder },
    segments, appendages, joints,
    sizeScale, robustness: statureN,
    surface: { covering: ph.derived.surfaceCovering.value, furCoverage: furN, armorCoverage: armorN },
    locomotionMode: mode,
    aesthetic: { seed: jitterOn ? (seed as number) : null, jitter: rd(globalJitter) },
    provenance, phenotypeIssues: ph.issues,
  });
  return lod >= 3 ? full : reduceAnatomyDetail(full, lod);
}

// ---- Cache deterministica (per migliaia di organismi: stesso input normalizzato → stesso oggetto immutabile) ----
const CACHE_LIMIT = 4096;
const cache = new WeakMap<BodyPlanSpec, Map<string, AnatomyDescriptor>>();

/**
 * Chiave di cache: contiene TUTTO ciò che il generatore legge (valori e stati dei tratti, valori derivati, problemi, seme normalizzato,
 * lod normalizzato, conteggi effettivi per gruppo). Due input con la stessa chiave producono lo stesso descriptor.
 */
export function anatomyCacheKey(i: AnatomyInput): string {
  const t = i.phenotype.traits;
  const tv = (x: { value: number | null; status: string }) => [x.status, x.value === null ? null : q3(x.value)];
  return canonicalJson([
    normSeed(i.seed) ?? null, i.origin ?? "explicit", normLod(i.lod),
    i.bodyPlan.groups.map((g) => [g.id, requestedCount(g, i.appendageCounts?.[g.id])]),
    tv(t.size), tv(t.bodyStature), tv(t.furDensity), tv(t.dermalArmor),
    q3(i.phenotype.derived.sizeScale.value), q3(i.phenotype.derived.radiusFactor.value), i.phenotype.derived.surfaceCovering.value, i.phenotype.issues,
  ]);
}

/** Come `generateAnatomy`, con cache. Gli spec NON congelati (modificabili) non vengono mai messi in cache. */
export function generateAnatomyCached(input: AnatomyInput): AnatomyDescriptor {
  const plan = input.bodyPlan;
  if (!plan || typeof plan !== "object" || !isDeepFrozen(plan)) return generateAnatomy(input);
  let m = cache.get(plan);
  if (!m) { m = new Map(); cache.set(plan, m); }
  const key = anatomyCacheKey(input);
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
