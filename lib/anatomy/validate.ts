import { computeComplexity, computeExtents, computeFingerprint } from "./assemble";
import { MORPHOLOGICAL_GENE_IDS } from "../phenotype/derive";
import { ANATOMY_SCHEMA_VERSION, MAX_APPENDAGES, REQUIRED_PROVENANCE_KEYS, type AnatomyDescriptor, type AnatomyDiagnostic, type AnatomyStatus, type Vec3 } from "./types";
import { canonicalJson, rd } from "./util";

export interface AnatomyInspection {
  readonly status: AnatomyStatus;
  /** true se non ci sono errori INVALID (i WARNING sono ammessi). */
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly diagnostics: readonly AnatomyDiagnostic[];
}

/** Forma legacy del risultato: invariata, per non rompere i consumer esistenti. */
export interface AnatomyValidation { readonly ok: boolean; readonly errors: readonly string[] }

const SYMMETRY = new Set(["spherical", "bilateral", "radial", "none"]);
const SIDES = new Set(["left", "right", "mid"]);
const KINDS = new Set(["leg", "arm", "tentacle", "fin", "tail", "flagellum", "claw", "jaw", "spine", "plate", "sensory", "pseudopod"]);
const MODES = new Set(["sessile", "amorphous", "undulatory", "limbless", "bipedal", "quadrupedal", "hexapodal", "multipedal", "radial", "appendage-driven"]);
const COVERINGS = new Set(["unspecified", "bare", "fur", "dermal-plates", "mixed"]);
const PROV_KINDS = new Set(["gene-direct", "gene-derived", "undetermined", "aesthetic"]);
/** Kind per cui una singola appendice mediana in un piano bilaterale è plausibile (es. mascella legacy). */
const MIDLINE_OK = new Set(["jaw", "sensory", "spine", "plate", "tail", "flagellum", "pseudopod"]);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is Vec3 => !!v && typeof v === "object" && isNum((v as Vec3).x) && isNum((v as Vec3).y) && isNum((v as Vec3).z);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const near = (a: number, b: number, tol = 1e-4): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

interface Box { min: Vec3; max: Vec3 }
function segmentBox(s: { center: Vec3; halfExtents: Vec3 }): Box {
  return {
    min: { x: s.center.x - s.halfExtents.x, y: s.center.y - s.halfExtents.y, z: s.center.z - s.halfExtents.z },
    max: { x: s.center.x + s.halfExtents.x, y: s.center.y + s.halfExtents.y, z: s.center.z + s.halfExtents.z },
  };
}
function distanceToBox(p: Vec3, b: Box): number {
  return Math.hypot(Math.max(b.min.x - p.x, 0, p.x - b.max.x), Math.max(b.min.y - p.y, 0, p.y - b.max.y), Math.max(b.min.z - p.z, 0, p.z - b.max.z));
}
function volume(b: Box): number {
  return Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z);
}
function overlapVolume(a: Box, b: Box): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}

/**
 * G2 — Ispezione anatomica completa: integrità strutturale, geometria, simmetria, provenienza e fingerprint.
 * Restituisce VALID / WARNING / INVALID con diagnostici identificativi e motivati. Non lancia mai.
 */
export function inspectAnatomy(input: unknown): AnatomyInspection {
  const diagnostics: AnatomyDiagnostic[] = [];
  const err = (code: string, message: string, target?: string): void => { diagnostics.push({ code, status: "INVALID", message, ...(target ? { target } : {}) }); };
  const warn = (code: string, message: string, target?: string): void => { diagnostics.push({ code, status: "WARNING", message, ...(target ? { target } : {}) }); };
  const d = input as AnatomyDescriptor;
  if (!d || typeof d !== "object") return { status: "INVALID", ok: false, errors: ["not-an-object"], warnings: [], diagnostics: [{ code: "not-an-object", status: "INVALID", message: "il descriptor non è un oggetto" }] };
  if (d.schemaVersion !== ANATOMY_SCHEMA_VERSION) {
    const code = `unsupported-schema-version:${String(d.schemaVersion)}`;
    return { status: "INVALID", ok: false, errors: [code], warnings: [], diagnostics: [{ code, status: "INVALID", message: "versione dello schema non supportata" }] };
  }
  if (!isArr(d.segments) || !isArr(d.appendages) || !isArr(d.joints)) {
    err("missing-collections", "collezioni segmenti/appendici/articolazioni mancanti");
    return { status: "INVALID", ok: false, errors: diagnostics.map((x) => x.code), warnings: [], diagnostics };
  }
  if (![0, 1, 2, 3].includes(d.lod)) err(`bad-lod:${String(d.lod)}`, "livello di dettaglio non valido");

  // ---- Segmenti ----
  const segIds = new Set<string>();
  for (const s of d.segments) {
    if (typeof s.id !== "string" || !s.id) err("segment-without-id", "segmento senza identificativo");
    else if (segIds.has(s.id)) err(`duplicate-segment:${s.id}`, "identificativo di segmento duplicato", s.id);
    else segIds.add(s.id);
    if (!isVec(s.center)) err(`bad-center:${s.id}`, "centro non valido", s.id);
    if (!isVec(s.halfExtents) || !(s.halfExtents.x > 0 && s.halfExtents.y > 0 && s.halfExtents.z > 0)) err(`bad-extents:${s.id}`, "semi-estensioni zero, negative o non finite", s.id);
  }
  const roots = d.segments.filter((s) => s.parentId === null);
  if (d.segments.length === 0) err("no-segments", "nessun segmento");
  else if (roots.length !== 1) err(`roots:${roots.length}`, "deve esistere una sola radice");
  const parentOf = new Map(d.segments.map((s) => [s.id, s.parentId] as const));
  for (const s of d.segments) {
    if (s.parentId !== null && !segIds.has(s.parentId)) err(`unknown-parent:${s.id}->${s.parentId}`, "genitore sconosciuto", s.id);
    let cur: string | null = s.id;
    let steps = 0;
    while (cur !== null && steps++ <= d.segments.length) cur = parentOf.get(cur) ?? null;
    if (cur !== null) err(`parent-cycle:${s.id}`, "ciclo nella gerarchia dei segmenti", s.id);
  }

  // ---- Appendici ----
  if (d.appendages.length > MAX_APPENDAGES) err(`too-many-appendages:${d.appendages.length}`, "tetto delle appendici superato");
  const appById = new Map<string, (typeof d.appendages)[number]>();
  for (const a of d.appendages) {
    if (appById.has(a.id)) err(`duplicate-appendage:${a.id}`, "identificativo di appendice duplicato", a.id);
    appById.set(a.id, a);
    const host = segIds.has(a.segmentId) ? d.segments.find((s) => s.id === a.segmentId) : undefined;
    if (!host) err(`appendage-unknown-segment:${a.id}->${a.segmentId}`, "segmento di attacco sconosciuto", a.id);
    if (!KINDS.has(a.kind)) err(`bad-kind:${a.id}`, "tipo di appendice non riconosciuto", a.id);
    if (!SIDES.has(a.side)) err(`bad-side:${a.id}`, "lato non riconosciuto", a.id);
    if (!isVec(a.position) || !isVec(a.direction)) err(`bad-vector:${a.id}`, "vettore non valido", a.id);
    else {
      const dl = Math.hypot(a.direction.x, a.direction.y, a.direction.z);
      if (!(dl > 0.5 && dl < 1.5)) err(`degenerate-direction:${a.id}`, "direzione di appendice degenere (non unitaria)", a.id);
      if (host && isVec(a.position) && isVec(host.center) && isVec(host.halfExtents)) {
        const gap = distanceToBox(a.position, segmentBox(host));
        const tolerance = 0.05 + a.radius + 0.1 * Math.max(host.halfExtents.x, host.halfExtents.y, host.halfExtents.z);
        if (gap > tolerance) err(`appendage-detached:${a.id}`, "radice dell'appendice lontana dal segmento ospite", a.id);
      }
    }
    if (!(isNum(a.length) && a.length > 0 && isNum(a.radius) && a.radius > 0)) err(`bad-dimensions:${a.id}`, "dimensioni zero, negative o non finite", a.id);
    if (!Number.isInteger(a.sectionCount) || a.sectionCount < 1 || a.sectionCount > 3) err(`bad-section-count:${a.id}`, "numero di sezioni non valido", a.id);
    if (typeof a.groupId !== "string" || !a.groupId) err(`bad-group:${a.id}`, "gruppo mancante", a.id);
  }

  // ---- Articolazioni ----
  const jointIds = new Set<string>();
  const axialChildren = new Map<string, number>();
  const rootJoints = new Map<string, number>();
  const internalJoints = new Map<string, Set<number>>();
  for (const j of d.joints) {
    if (jointIds.has(j.id)) err(`duplicate-joint:${j.id}`, "articolazione duplicata", j.id);
    jointIds.add(j.id);
    if (j.kind === "axial") {
      const child = d.segments.find((s) => s.id === j.childSegmentId);
      if (!j.parentSegmentId || !segIds.has(j.parentSegmentId) || !child) err(`axial-bad-reference:${j.id}`, "riferimento di articolazione assiale invalido", j.id);
      else if (child.parentId !== j.parentSegmentId) err(`axial-parent-mismatch:${j.id}`, "genitore assiale non coerente", j.id);
      else axialChildren.set(child.id, (axialChildren.get(child.id) ?? 0) + 1);
    } else if (j.kind === "root") {
      const a = j.appendageId ? appById.get(j.appendageId) : undefined;
      if (!a || !j.parentSegmentId || !segIds.has(j.parentSegmentId)) err(`root-bad-reference:${j.id}`, "riferimento di articolazione radice invalido", j.id);
      else if (a.segmentId !== j.parentSegmentId) err(`root-segment-mismatch:${j.id}`, "segmento radice non coerente", j.id);
      else rootJoints.set(a.id, (rootJoints.get(a.id) ?? 0) + 1);
    } else if (j.kind === "internal") {
      const a = j.appendageId ? appById.get(j.appendageId) : undefined;
      if (!a || !Number.isInteger(j.section) || (j.section as number) < 1 || (j.section as number) >= a.sectionCount) err(`internal-bad-reference:${j.id}`, "riferimento di articolazione interna invalido", j.id);
      else {
        const set = internalJoints.get(a.id) ?? new Set<number>();
        if (set.has(j.section as number)) err(`internal-duplicate-section:${j.id}`, "sezione articolata duplicata", j.id);
        set.add(j.section as number);
        internalJoints.set(a.id, set);
      }
    } else err(`bad-joint-kind:${j.id}`, "tipo di articolazione sconosciuto", j.id);
  }
  for (const s of d.segments) if (s.parentId !== null && axialChildren.get(s.id) !== 1) err(`segment-axial-joint:${s.id}`, "manca un'articolazione assiale", s.id);
  for (const a of d.appendages) {
    if (rootJoints.get(a.id) !== 1) err(`appendage-root-joint:${a.id}`, "manca un'articolazione radice", a.id);
    if ((internalJoints.get(a.id)?.size ?? 0) !== a.sectionCount - 1 && d.lod >= 3) err(`appendage-internal-joints:${a.id}`, "articolazioni interne incomplete", a.id);
  }

  // ---- Geometria: sovrapposizioni e coincidenze (controlli selettivi, non collision detection pesante) ----
  const boxes = d.segments.map(segmentBox);
  for (let i = 0; i < d.segments.length; i++) {
    for (let k = i + 1; k < d.segments.length; k++) {
      const si = d.segments[i], sk = d.segments[k];
      if (si.parentId === sk.id || sk.parentId === si.id) continue; // sovrapposizione attesa all'articolazione
      const small = Math.min(volume(boxes[i]), volume(boxes[k]));
      if (small > 0 && overlapVolume(boxes[i], boxes[k]) / small > 0.9) {
        warn(`segment-overlap:${si.id}:${sk.id}`, "segmenti non adiacenti quasi completamente sovrapposti", si.id);
      }
    }
  }
  for (let i = 0; i < d.appendages.length; i++) {
    for (let k = i + 1; k < d.appendages.length; k++) {
      const a = d.appendages[i], b = d.appendages[k];
      if (a.groupId !== b.groupId || a.side !== b.side || !isVec(a.position) || !isVec(b.position) || !isVec(a.direction) || !isVec(b.direction)) continue;
      const dot = a.direction.x * b.direction.x + a.direction.y * b.direction.y + a.direction.z * b.direction.z;
      if (dist(a.position, b.position) <= 1e-3 && dot >= 0.999 && near(a.length, b.length, 1e-3)) {
        warn(`coincident-appendages:${a.id}:${b.id}`, "appendici coincidenti con direzione e lunghezza uguali", a.id);
      }
    }
  }

  // ---- Simmetria ----
  const anomalies = isArr(d.declaredAnomalies) ? d.declaredAnomalies : [];
  if (d.declaredAnomalies !== undefined && !isArr(d.declaredAnomalies)) err("bad-declared-anomalies", "anomalie dichiarate non valide");
  const declaredOddGroups = new Set<string>();
  for (const x of anomalies) {
    const a = x as AnatomyDiagnostic;
    if (!a || typeof a.code !== "string" || typeof a.message !== "string" || a.status !== "WARNING") err("bad-declared-anomaly", "anomalia dichiarata non valida", typeof a?.target === "string" ? a.target : undefined);
    else {
      if ((a.code.startsWith("odd-appendage-count:") || a.code.startsWith("omitted-appendages:")) && a.target) declaredOddGroups.add(a.target);
      warn(a.code, a.message, a.target); // le anomalie dichiarate restano visibili: non vengono nascoste
    }
  }
  if (!d.symmetry || !SYMMETRY.has(d.symmetry.type) || !Number.isInteger(d.symmetry.order) || d.symmetry.order < 0) err("bad-symmetry", "simmetria non valida");
  else if (d.symmetry.type === "bilateral") {
    if (d.symmetry.order !== 2) err("bilateral-order", "l'ordine bilaterale deve essere 2");
    for (const s of d.segments) if (isVec(s.center) && Math.abs(s.center.x) > 1e-6) err(`bilateral-segment-off-axis:${s.id}`, "segmento fuori dall'asse di simmetria", s.id);
    const sig = (a: (typeof d.appendages)[number]) => [
      a.groupId, a.kind, a.variant ?? "", a.segmentId, rd(a.position.y), rd(a.position.z), rd(Math.abs(a.position.x)),
      rd(Math.abs(a.direction.x)), rd(a.direction.y), rd(a.direction.z), a.angle === null ? "" : rd(a.angle), rd(a.length), rd(a.radius),
    ].join("|");
    const bal = new Map<string, number>();
    for (const a of d.appendages) {
      if (declaredOddGroups.has(a.groupId)) continue; // anomalia dichiarata: non viene nascosta, ma non è un errore
      if (a.side === "left") bal.set(sig(a), (bal.get(sig(a)) ?? 0) + 1);
      else if (a.side === "right") bal.set(sig(a), (bal.get(sig(a)) ?? 0) - 1);
      else if (a.side === "mid" && !MIDLINE_OK.has(a.kind)) warn(`unpaired-mid-appendage:${a.id}`, "appendice mediana di tipo normalmente accoppiato", a.id);
    }
    for (const [k, v] of bal) if (v !== 0) err(`asymmetric-pair:${k}`, "coppia bilaterale non speculare (posizione, direzione o dimensioni)");
  } else if (d.symmetry.type === "spherical") {
    if (d.symmetry.order !== 0) err("spherical-order", "l'ordine sferico deve essere 0");
  } else if (d.symmetry.type === "none") {
    if (d.symmetry.order !== 1) err("none-order", "l'ordine di assenza di simmetria deve essere 1");
  } else {
    // Radiale: gruppi con angolo devono avere spaziatura uniforme e membri coerenti.
    const byGroup = new Map<string, (typeof d.appendages)[number][]>();
    for (const a of d.appendages) if (typeof a.angle === "number" && a.groupId) {
      const arr = byGroup.get(a.groupId) ?? [];
      arr.push(a);
      byGroup.set(a.groupId, arr);
    }
    const root = d.segments.find((s) => s.parentId === null);
    if (root && isVec(root.center) && Math.hypot(root.center.x, root.center.z) > 1e-6) err(`radial-root-off-axis:${root.id}`, "radice del corpo fuori dall'asse radiale", root.id);
    let largest = 0;
    for (const arr of byGroup.values()) largest = Math.max(largest, arr.length);
    for (const [gid, arr] of byGroup) {
      if (arr.length < 2) continue;
      if (arr.length === largest && arr.length !== d.symmetry.order) err(`radial-order-mismatch:${gid}`, "l'ordine radiale non corrisponde al numero di appendici del gruppo", gid);
      const angles = arr.map((a) => a.angle as number).sort((a, b) => a - b);
      const step = (2 * Math.PI) / arr.length;
      for (let k = 0; k < angles.length; k++) {
        if (k > 0 && angles[k] - angles[k - 1] < step * 0.9) err(`radial-spacing:${gid}`, "angolazioni radiali degenerate", gid);
        const ratio = (angles[k] - angles[0]) / step;
        if (Math.abs(ratio - Math.round(ratio)) > 1e-4) err(`radial-spacing:${gid}`, "angolazioni non equamente spaziate", gid);
      }
      const first = arr[0];
      for (const a of arr) if (!near(a.length, first.length) || !near(a.radius, first.radius)) err(`radial-inconsistent:${gid}`, "appendici radiali con dimensioni disomogenee", a.id);
    }
  }

  // ---- Proporzioni, superficie, locomozione, complessità ----
  const p = d.proportions;
  const numeric = p && [p.sizeScale, p.robustness, p.bodyLength, p.bodyWidth, p.bodyHeight, p.totalHeight, p.maxLimbLength].every(isNum);
  if (!numeric || p.sizeScale <= 0 || p.bodyLength <= 0 || p.bodyWidth <= 0 || p.bodyHeight <= 0) err("bad-proportions", "proporzioni non valide");
  if (!p || !(p.groundClearance === null || (isNum(p.groundClearance) && p.groundClearance >= 0))) err("bad-ground-clearance", "ground clearance deve essere un numero non negativo o null");
  if (!p || !["determined", "undetermined"].includes(p.groundClearanceStatus)) err("bad-ground-clearance-status", "stato di determinazione della clearance non valido");
  if (!p || typeof p.groundClearanceReason !== "string") err("bad-ground-clearance-reason", "motivazione della clearance mancante");
  if (p && p.groundClearanceStatus === "undetermined" && p.groundClearance !== null) err("ground-clearance-status-mismatch", "clearance dichiarata non determinabile ma valorizzata");
  if (p && p.groundClearanceStatus === "determined" && p.groundClearance === null) err("ground-clearance-status-mismatch", "clearance dichiarata determinabile ma assente");
  const extOk = p && [p.bodyExtents, p.anatomicalExtents].every((e) => e && [e.min, e.max, e.center, e.size, e.scaledSize].every(isVec));
  if (!extOk) err("bad-extents", "AABB anatomici non validi");
  if (!d.surface || !COVERINGS.has(d.surface.covering)) err("bad-covering", "copertura non riconosciuta");
  else for (const k of ["furCoverage", "armorCoverage"] as const) {
    const v = d.surface[k];
    if (v !== null && !(isNum(v) && v >= 0 && v <= 1)) err(`bad-${k}`, "copertura fuori intervallo");
  }
  if (!d.locomotion || !MODES.has(d.locomotion.mode)) err("bad-locomotion", "modalità di locomozione non riconosciuta");
  else if (d.lod >= 1) {
    const legs = d.appendages.filter((a) => a.kind === "leg").length;
    const m = d.locomotion.mode;
    if (d.locomotion.supportingLimbs !== legs) err("supporting-limbs-mismatch", "numero di arti di supporto non coerente");
    if ((m === "bipedal" && legs !== 2) || (m === "quadrupedal" && legs !== 4) || (m === "hexapodal" && legs !== 6) || (m === "limbless" && legs !== 0) || (m === "multipedal" && [0, 2, 4, 6].includes(legs))) err(`locomotion-inconsistent:${m}:${legs}`, "modalità di locomozione non coerente con il numero di zampe");
  }
  if (p && d.locomotion && d.locomotion.groundClearance !== p.groundClearance) err("locomotion-clearance-mismatch", "clearance della locomozione diversa da quella delle proporzioni");
  const cx = computeComplexity(d.segments, d.appendages, d.joints);
  if (!d.complexity || canonicalJson(d.complexity) !== canonicalJson(cx)) err("complexity-mismatch", "conteggi di complessità non coerenti");
  if (!d.bodyPlan || typeof d.bodyPlan.id !== "string" || !["simple", "multicellular", "complex", "specialized"].includes(d.bodyPlan.family) || !["explicit", "legacy-default", "seeded-speculative"].includes(d.bodyPlan.origin)) err("bad-body-plan", "body plan non valido");

  // ---- Extents ricalcolati dalla geometria ----
  if (p && extOk) {
    const derived = computeExtents(d.segments, d.appendages, p.sizeScale);
    const scalars = ["bodyLength", "bodyWidth", "bodyHeight", "totalHeight"] as const;
    for (const key of scalars) if (!near(p[key], derived[key])) err(`extents-mismatch:${key}`, "misura non coerente con la geometria", key);
    if (!near(p.maxLimbLength, derived.maxLimbLength)) err("limb-length-mismatch", "lunghezza massima delle zampe non coerente");
    if (p.groundClearance !== null && derived.groundClearance !== null && !near(p.groundClearance, derived.groundClearance)) err("ground-clearance-mismatch", "clearance non coerente con la posa delle zampe");
    if (p.groundClearanceStatus !== derived.groundClearanceStatus) err("ground-clearance-status-mismatch", "stato di determinazione non coerente con la geometria");
    const extPairs: [keyof typeof p.bodyExtents, keyof typeof p.anatomicalExtents][] = [["min", "min"], ["max", "max"], ["center", "center"], ["size", "size"], ["scaledSize", "scaledSize"]];
    for (const [bodyKey, anaKey] of extPairs) {
      for (const axis of ["x", "y", "z"] as const) {
        if (!near(p.bodyExtents[bodyKey][axis], derived.bodyExtents[bodyKey][axis])) err(`extents-mismatch:bodyExtents.${bodyKey}.${axis}`, "AABB del corpo non coerente");
        if (!near(p.anatomicalExtents[anaKey][axis], derived.anatomicalExtents[anaKey][axis])) err(`extents-mismatch:anatomicalExtents.${anaKey}.${axis}`, "AABB anatomico non coerente");
      }
    }
  }

  // ---- Provenienza: nessun gene inventato ----
  const prov = d.provenance as Record<string, { kind?: string; genes?: unknown }> | undefined;
  if (!prov || typeof prov !== "object") err("missing-provenance", "provenienza mancante");
  else {
    for (const key of REQUIRED_PROVENANCE_KEYS) if (!prov[key]) err(`missing-provenance:${key}`, "chiave di provenienza obbligatoria mancante", key);
    for (const [key, src] of Object.entries(prov)) {
      if (!src || !PROV_KINDS.has(String(src.kind)) || !isArr(src.genes)) { err(`bad-provenance:${key}`, "provenienza non valida", key); continue; }
      const genes = src.genes as string[];
      if (src.kind === "gene-direct" || src.kind === "gene-derived") {
        if (genes.length === 0) err(`provenance-without-gene:${key}`, "provenienza genetica senza geni", key);
        for (const g of genes) if (!MORPHOLOGICAL_GENE_IDS.includes(g)) err(`provenance-non-morphological-gene:${key}:${g}`, "gene non morfologico nella provenienza", key);
      } else if (genes.length > 0) err(`provenance-genes-not-allowed:${key}`, "geni dichiarati in una provenienza non genetica", key);
    }
  }

  if (typeof d.fingerprint !== "string" || d.fingerprint !== computeFingerprint(d)) err("fingerprint-mismatch", "fingerprint non coerente con il contenuto canonico");

  const errors = diagnostics.filter((x) => x.status === "INVALID").map((x) => x.code);
  const warnings = diagnostics.filter((x) => x.status === "WARNING").map((x) => x.code);
  const status: AnatomyStatus = errors.length ? "INVALID" : warnings.length ? "WARNING" : "VALID";
  return { status, ok: errors.length === 0, errors, warnings, diagnostics };
}

/** Wrapper legacy: mantiene la firma `{ ok, errors }` dei consumer esistenti. */
export function validateAnatomy(input: unknown): AnatomyValidation {
  const { ok, errors } = inspectAnatomy(input);
  return { ok, errors };
}
