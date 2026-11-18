import { computeComplexity, computeExtents, computeFingerprint } from "./assemble";
import { MORPHOLOGICAL_GENE_IDS } from "../phenotype/derive";
import { ANATOMY_SCHEMA_VERSION, LOCOMOTOR_KINDS, MAX_APPENDAGES, REQUIRED_PROVENANCE_KEYS, type AnatomyDescriptor } from "./types";
import { canonicalJson, rd } from "./util";

export interface AnatomyValidation { readonly ok: boolean; readonly errors: readonly string[] }

const SYMMETRY = new Set(["spherical", "bilateral", "radial", "none"]);
const SIDES = new Set(["left", "right", "mid"]);
const KINDS = new Set(["leg", "arm", "tentacle", "fin", "tail", "flagellum", "claw", "jaw", "spine", "plate", "sensory", "pseudopod"]);
const MODES = new Set(["sessile", "amorphous", "undulatory", "limbless", "bipedal", "quadrupedal", "hexapodal", "multipedal", "radial", "appendage-driven"]);
const COVERINGS = new Set(["unspecified", "bare", "fur", "dermal-plates", "mixed"]);
const PROV_KINDS = new Set(["gene-direct", "gene-derived", "undetermined", "aesthetic"]);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): boolean => !!v && typeof v === "object" && isNum((v as { x: unknown }).x) && isNum((v as { y: unknown }).y) && isNum((v as { z: unknown }).z);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * G2 — Validazione anatomica. Controlla struttura, riferimenti tra segmenti/appendici/articolazioni, simmetria,
 * coerenza dei conteggi, provenienza (nessun gene inventato) e integrità (fingerprint). Non lancia mai: restituisce gli errori.
 */
export function validateAnatomy(input: unknown): AnatomyValidation {
  const errors: string[] = [];
  const d = input as AnatomyDescriptor;
  if (!d || typeof d !== "object") return { ok: false, errors: ["not-an-object"] };
  if (d.schemaVersion !== ANATOMY_SCHEMA_VERSION) return { ok: false, errors: [`unsupported-schema-version:${String(d.schemaVersion)}`] };
  if (!isArr(d.segments) || !isArr(d.appendages) || !isArr(d.joints)) return { ok: false, errors: ["missing-collections"] };
  if (![0, 1, 2, 3].includes(d.lod)) errors.push(`bad-lod:${String(d.lod)}`);

  // ---- Segmenti ----
  const segIds = new Set<string>();
  for (const s of d.segments) {
    if (typeof s.id !== "string" || !s.id) errors.push("segment-without-id");
    else if (segIds.has(s.id)) errors.push(`duplicate-segment:${s.id}`);
    else segIds.add(s.id);
    if (!isVec(s.center)) errors.push(`bad-center:${s.id}`);
    if (!isVec(s.halfExtents) || !(s.halfExtents.x > 0 && s.halfExtents.y > 0 && s.halfExtents.z > 0)) errors.push(`bad-extents:${s.id}`);
  }
  const roots = d.segments.filter((s) => s.parentId === null);
  if (d.segments.length === 0) errors.push("no-segments");
  else if (roots.length !== 1) errors.push(`roots:${roots.length}`);
  const parentOf = new Map(d.segments.map((s) => [s.id, s.parentId] as const));
  for (const s of d.segments) {
    if (s.parentId !== null && !segIds.has(s.parentId)) errors.push(`unknown-parent:${s.id}->${s.parentId}`);
    let cur: string | null = s.id;
    let steps = 0;
    while (cur !== null && steps++ <= d.segments.length) cur = parentOf.get(cur) ?? null;
    if (cur !== null) errors.push(`parent-cycle:${s.id}`);
  }

  // ---- Appendici ----
  if (d.appendages.length > MAX_APPENDAGES) errors.push(`too-many-appendages:${d.appendages.length}`);
  const appById = new Map<string, (typeof d.appendages)[number]>();
  for (const a of d.appendages) {
    if (appById.has(a.id)) errors.push(`duplicate-appendage:${a.id}`);
    appById.set(a.id, a);
    if (!segIds.has(a.segmentId)) errors.push(`appendage-unknown-segment:${a.id}->${a.segmentId}`);
    if (!KINDS.has(a.kind)) errors.push(`bad-kind:${a.id}`);
    if (!SIDES.has(a.side)) errors.push(`bad-side:${a.id}`);
    if (!isVec(a.position) || !isVec(a.direction)) errors.push(`bad-vector:${a.id}`);
    else {
      if (Math.abs(Math.hypot(a.direction.x, a.direction.y, a.direction.z) - 1) > 1e-3) errors.push(`direction-not-unit:${a.id}`);
      const host = d.segments.find((sg) => sg.id === a.segmentId);
      if (host && isVec(host.center) && isVec(host.halfExtents)) {
        for (const ax of ["x", "y", "z"] as const) if (Math.abs(a.position[ax] - host.center[ax]) > host.halfExtents[ax] * 1.1 + (isNum(a.radius) ? a.radius : 0) + 1e-6) { errors.push(`appendage-off-host:${a.id}:${ax}`); break; }
      }
    }
    if (!(isNum(a.length) && a.length > 0 && isNum(a.radius) && a.radius > 0)) errors.push(`bad-dimensions:${a.id}`);
    if (!Number.isInteger(a.sectionCount) || a.sectionCount < 1 || a.sectionCount > 3) errors.push(`bad-section-count:${a.id}`);
  }

  // ---- Articolazioni ----
  const jointIds = new Set<string>();
  const axialChildren = new Map<string, number>();
  const rootJoints = new Map<string, number>();
  const internalJoints = new Map<string, Set<number>>();
  for (const j of d.joints) {
    if (jointIds.has(j.id)) errors.push(`duplicate-joint:${j.id}`);
    jointIds.add(j.id);
    if (j.kind === "axial") {
      const child = d.segments.find((s) => s.id === j.childSegmentId);
      if (!j.parentSegmentId || !segIds.has(j.parentSegmentId) || !child) errors.push(`axial-bad-reference:${j.id}`);
      else if (child.parentId !== j.parentSegmentId) errors.push(`axial-parent-mismatch:${j.id}`);
      else axialChildren.set(child.id, (axialChildren.get(child.id) ?? 0) + 1);
    } else if (j.kind === "root") {
      const a = j.appendageId ? appById.get(j.appendageId) : undefined;
      if (!a || !j.parentSegmentId || !segIds.has(j.parentSegmentId)) errors.push(`root-bad-reference:${j.id}`);
      else if (a.segmentId !== j.parentSegmentId) errors.push(`root-segment-mismatch:${j.id}`);
      else rootJoints.set(a.id, (rootJoints.get(a.id) ?? 0) + 1);
    } else if (j.kind === "internal") {
      const a = j.appendageId ? appById.get(j.appendageId) : undefined;
      if (!a || !Number.isInteger(j.section) || (j.section as number) < 1 || (j.section as number) >= a.sectionCount) errors.push(`internal-bad-reference:${j.id}`);
      else {
        const set = internalJoints.get(a.id) ?? new Set<number>();
        if (set.has(j.section as number)) errors.push(`internal-duplicate-section:${j.id}`);
        set.add(j.section as number);
        internalJoints.set(a.id, set);
      }
    } else errors.push(`bad-joint-kind:${j.id}`);
  }
  for (const s of d.segments) if (s.parentId !== null && axialChildren.get(s.id) !== 1) errors.push(`segment-axial-joint:${s.id}`);
  for (const a of d.appendages) {
    if (rootJoints.get(a.id) !== 1) errors.push(`appendage-root-joint:${a.id}`);
    if ((internalJoints.get(a.id)?.size ?? 0) !== a.sectionCount - 1 && d.lod >= 3) errors.push(`appendage-internal-joints:${a.id}`);
  }

  // ---- Simmetria ----
  if (!d.symmetry || !SYMMETRY.has(d.symmetry.type) || !Number.isInteger(d.symmetry.order) || d.symmetry.order < 0) errors.push("bad-symmetry");
  else if (d.symmetry.type === "bilateral") {
    if (d.symmetry.order !== 2) errors.push("bilateral-order");
    for (const s of d.segments) if (Math.abs(s.center.x) > 1e-6) errors.push(`bilateral-segment-off-axis:${s.id}`);
    const sig = (a: (typeof d.appendages)[number]) => [a.groupId, a.kind, a.variant ?? "", a.segmentId, rd(a.position.y), rd(a.position.z), rd(Math.abs(a.position.x)), rd(a.length), rd(a.radius)].join("|");
    const bal = new Map<string, number>();
    for (const a of d.appendages) {
      if (a.side === "left") bal.set(sig(a), (bal.get(sig(a)) ?? 0) + 1);
      else if (a.side === "right") bal.set(sig(a), (bal.get(sig(a)) ?? 0) - 1);
    }
    for (const [k, v] of bal) if (v !== 0) errors.push(`asymmetric-pair:${k}`);
  } else if (d.symmetry.type === "spherical") {
    if (d.symmetry.order !== 0) errors.push("spherical-order");
    if (d.appendages.length > 0) errors.push("spherical-with-appendages");
  } else if (d.symmetry.type === "none") {
    if (d.symmetry.order !== 1) errors.push("none-order");
  } else if (d.symmetry.type === "radial") {
    const byGroup = new Map<string, (typeof d.appendages)[number][]>();
    for (const a of d.appendages) byGroup.set(a.groupId, [...(byGroup.get(a.groupId) ?? []), a]);
    for (const [gid, list] of byGroup) {
      if (list.length < 2) continue;
      if (list.some((a) => a.angle === null)) { errors.push(`radial-group-not-ring:${gid}`); continue; }
      if (d.symmetry.order === 0 || list.length % d.symmetry.order !== 0) errors.push(`radial-order-incompatible:${gid}:${list.length}/${d.symmetry.order}`);
      const angs = list.map((a) => a.angle as number).sort((x, y) => x - y);
      const step = (2 * Math.PI) / list.length;
      for (let i = 1; i < angs.length; i++) if (Math.abs(angs[i] - angs[i - 1] - step) > 1e-3) { errors.push(`radial-angles-uneven:${gid}`); break; }
    }
  }

  // ---- Proporzioni, superficie, locomozione, complessità ----
  const p = d.proportions;
  const vec3 = (v: unknown) => isVec(v);
  if (!p || ![p.sizeScale, p.robustness, p.bodyLength, p.bodyWidth, p.bodyHeight, p.extentLength, p.extentWidth, p.extentHeight].every(isNum) || p.sizeScale <= 0 || p.bodyLength <= 0 || p.bodyWidth <= 0 || p.bodyHeight <= 0 || !p.bounds || !vec3(p.bounds.min) || !vec3(p.bounds.max)) errors.push("bad-proportions");
  else {
    for (const k of ["groundY", "groundClearance", "heightAboveGround"] as const) if (p[k] !== null && !isNum(p[k])) errors.push(`bad-${k}`);
    if (p.groundClearance !== null && p.groundClearance < 0) errors.push("negative-ground-clearance");
    if ((p.groundY === null) !== (p.groundClearance === null) || (p.groundY === null) !== (p.heightAboveGround === null)) errors.push("ground-fields-inconsistent");
    // l'estensione complessiva non può essere minore di quella del solo corpo, e deve coincidere con il ricalcolo dalla geometria (livello completo)
    if (p.extentLength + 1e-6 < p.bodyLength || p.extentWidth + 1e-6 < p.bodyWidth || p.extentHeight + 1e-6 < p.bodyHeight) errors.push("extent-smaller-than-body");
    if (d.lod === 3 && errors.length === 0) {
      const ext = computeExtents(d.segments, d.appendages);
      if (canonicalJson({ ...ext }) !== canonicalJson({ bodyLength: p.bodyLength, bodyWidth: p.bodyWidth, bodyHeight: p.bodyHeight, extentLength: p.extentLength, extentWidth: p.extentWidth, extentHeight: p.extentHeight, bounds: p.bounds, groundY: p.groundY, groundClearance: p.groundClearance, heightAboveGround: p.heightAboveGround })) errors.push("proportions-mismatch");
    }
  }
  if (!d.surface || !COVERINGS.has(d.surface.covering)) errors.push("bad-covering");
  else for (const k of ["furCoverage", "armorCoverage"] as const) {
    const v = d.surface[k];
    if (v !== null && !(isNum(v) && v >= 0 && v <= 1)) errors.push(`bad-${k}`);
  }
  if (!d.locomotion || !MODES.has(d.locomotion.mode)) errors.push("bad-locomotion");
  else if (d.lod >= 1) {
    const legs = d.appendages.filter((a) => a.kind === "leg").length;
    const m = d.locomotion.mode;
    if (d.locomotion.supportingLimbs !== legs) errors.push("supporting-limbs-mismatch");
    if ((m === "appendage-driven" || m === "radial") && !d.appendages.some((a) => LOCOMOTOR_KINDS.includes(a.kind))) errors.push(`locomotion-without-locomotor-appendages:${m}`);
    if ((m === "bipedal" && legs !== 2) || (m === "quadrupedal" && legs !== 4) || (m === "hexapodal" && legs !== 6) || (m === "limbless" && legs !== 0) || (m === "multipedal" && [0, 2, 4, 6].includes(legs))) errors.push(`locomotion-inconsistent:${m}:${legs}`);
  }
  const cx = computeComplexity(d.segments, d.appendages, d.joints);
  if (!d.complexity || canonicalJson(d.complexity) !== canonicalJson(cx)) errors.push("complexity-mismatch");
  if (!d.bodyPlan || typeof d.bodyPlan.id !== "string" || !["simple", "multicellular", "complex", "specialized"].includes(d.bodyPlan.family) || !["explicit", "legacy-default", "seeded-speculative"].includes(d.bodyPlan.origin)) errors.push("bad-body-plan");

  // ---- Provenienza: nessun gene inventato ----
  const prov = d.provenance as Record<string, { kind?: string; genes?: unknown }> | undefined;
  if (!prov || typeof prov !== "object") errors.push("missing-provenance");
  else {
    for (const key of REQUIRED_PROVENANCE_KEYS) if (!prov[key]) errors.push(`missing-provenance:${key}`);
    for (const [key, src] of Object.entries(prov)) {
      if (!src || !PROV_KINDS.has(String(src.kind)) || !isArr(src.genes)) { errors.push(`bad-provenance:${key}`); continue; }
      const genes = src.genes as string[];
      if (src.kind === "gene-direct" || src.kind === "gene-derived") {
        if (genes.length === 0) errors.push(`provenance-without-gene:${key}`);
        for (const g of genes) if (!MORPHOLOGICAL_GENE_IDS.includes(g)) errors.push(`provenance-non-morphological-gene:${key}:${g}`);
      } else if (genes.length > 0) errors.push(`provenance-genes-not-allowed:${key}`);
    }
  }

  if (typeof d.fingerprint !== "string" || d.fingerprint !== computeFingerprint(d)) errors.push("fingerprint-mismatch");
  return { ok: errors.length === 0, errors };
}
