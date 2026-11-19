import {
  ANATOMY_SCHEMA_VERSION,
  type AnatomyComplexity, type AnatomyDescriptor, type AnatomyDiagnostic, type AnatomyExtents,
  type AnatomyLocomotion, type AnatomyProportions, type Appendage, type GroundClearanceStatus, type Joint, type Segment, type Vec3,
} from "./types";
import { canonicalJson, deepFreeze, fnv1a32, rd } from "./util";

export function computeComplexity(segments: readonly Segment[], appendages: readonly Appendage[], joints: readonly Joint[]): AnatomyComplexity {
  const internalJointCount = joints.filter((j) => j.kind === "internal").length;
  const score = rd(segments.length + 0.75 * appendages.length + 0.5 * internalJointCount);
  const level = score < 3 ? 0 : score < 10 ? 1 : score < 24 ? 2 : 3;
  return { segmentCount: segments.length, appendageCount: appendages.length, jointCount: joints.length, internalJointCount, score, level };
}

export function computeFingerprint(d: Omit<AnatomyDescriptor, "fingerprint"> | AnatomyDescriptor): string {
  const { fingerprint: _omit, ...rest } = d as AnatomyDescriptor;
  void _omit;
  return fnv1a32(canonicalJson(rest));
}

export function withFingerprint(d: Omit<AnatomyDescriptor, "fingerprint">): AnatomyDescriptor {
  return deepFreeze({ ...d, fingerprint: computeFingerprint(d) } as AnatomyDescriptor);
}

const v3 = (x: number, y: number, z: number): Vec3 => ({ x: rd(x), y: rd(y), z: rd(z) });
const box = (min: Vec3, max: Vec3): { min: Vec3; max: Vec3 } => ({ min, max });

function segmentBox(s: Segment): { min: Vec3; max: Vec3 } {
  return box(
    v3(s.center.x - s.halfExtents.x, s.center.y - s.halfExtents.y, s.center.z - s.halfExtents.z),
    v3(s.center.x + s.halfExtents.x, s.center.y + s.halfExtents.y, s.center.z + s.halfExtents.z),
  );
}

/**
 * Ogni appendice è il primitivo effettivo di G2: un segmento posizione → posizione + direzione*length,
 * con raggio `radius`. I estremi sono quindi calcolati dalla geometria generata, non da un proxy.
 * `sectionCount` non introduce curvature: il descriptor non memorizza angoli per sezione.
 */
function appendageBox(a: Appendage): { min: Vec3; max: Vec3 } {
  const ex = a.position.x + a.direction.x * a.length;
  const ey = a.position.y + a.direction.y * a.length;
  const ez = a.position.z + a.direction.z * a.length;
  const r = a.radius;
  return box(v3(Math.min(a.position.x, ex) - r, Math.min(a.position.y, ey) - r, Math.min(a.position.z, ez) - r),
             v3(Math.max(a.position.x, ex) + r, Math.max(a.position.y, ey) + r, Math.max(a.position.z, ez) + r));
}

function extentsOf(boxes: readonly { min: Vec3; max: Vec3 }[], sizeScale: number): AnatomyExtents {
  if (boxes.length === 0) {
    const zero = v3(0, 0, 0);
    return { min: zero, max: zero, center: zero, size: zero, scaledSize: zero };
  }
  const min = v3(Math.min(...boxes.map((b) => b.min.x)), Math.min(...boxes.map((b) => b.min.y)), Math.min(...boxes.map((b) => b.min.z)));
  const max = v3(Math.max(...boxes.map((b) => b.max.x)), Math.max(...boxes.map((b) => b.max.y)), Math.max(...boxes.map((b) => b.max.z)));
  const size = v3(max.x - min.x, max.y - min.y, max.z - min.z);
  return {
    min, max,
    center: v3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2),
    size,
    scaledSize: v3(size.x * sizeScale, size.y * sizeScale, size.z * sizeScale),
  };
}

/** Tolleranza di rappresentazione (non una misura biologica) per definire "coplanari" i contatti delle zampe. */
const CONTACT_TOLERANCE_FRACTION = 0.25;
/** Una zampa sostiene il corpo solo se punta abbastanza verso il basso (≥60° sotto l'orizzonte). */
const SUPPORT_DOWN_COS = -0.5;

export interface GroundClearanceAssessment {
  readonly value: number | null;
  readonly status: GroundClearanceStatus;
  readonly reason: string;
  readonly contacts: number;
  readonly maxLimbLength: number;
}

/**
 * Stima il piano d'appoggio usando SOLO la geometria delle zampe: serve un numero sufficiente di contatti
 * rivolti verso il basso e approssimativamente coplanari, posti sotto la base del corpo.
 * Se la posa non lo consente restituisce `null` + motivazione: nessun valore viene inventato.
 * Nessuna dipendenza da terreno, pianeta o simulazione.
 */
export function assessGroundClearance(segments: readonly Segment[], appendages: readonly Appendage[], body: AnatomyExtents): GroundClearanceAssessment {
  if (segments.length === 0) return { value: null, status: "undetermined", reason: "no-body", contacts: 0, maxLimbLength: 0 };
  const legs = appendages.filter((a) => a.kind === "leg");
  const maxLimbLength = rd(legs.reduce((m, a) => Math.max(m, a.length), 0));
  if (legs.length === 0) return { value: null, status: "undetermined", reason: "no-support-limbs", contacts: 0, maxLimbLength };
  const tips = legs.filter((a) => a.direction.y <= SUPPORT_DOWN_COS)
    .map((a) => ({ id: a.id, y: a.position.y + a.direction.y * a.length - a.radius }));
  if (tips.length < 2) return { value: null, status: "undetermined", reason: `insufficient-downward-limbs:${tips.length}`, contacts: tips.length, maxLimbLength };
  const lo = Math.min(...tips.map((t) => t.y));
  const hi = Math.max(...tips.map((t) => t.y));
  const tolerance = Math.max(0.05, CONTACT_TOLERANCE_FRACTION * maxLimbLength);
  if (hi - lo > tolerance) return { value: null, status: "undetermined", reason: "non-coplanar-limb-tips", contacts: tips.length, maxLimbLength };
  const supportY = (lo + hi) / 2;
  if (supportY > body.min.y + tolerance) return { value: null, status: "undetermined", reason: "limbs-do-not-reach-below-body", contacts: tips.length, maxLimbLength };
  return { value: rd(body.min.y - supportY), status: "determined", reason: "coplanar-limb-support-plane", contacts: tips.length, maxLimbLength };
}

export type DerivedProportions = Pick<AnatomyProportions,
  "bodyExtents" | "anatomicalExtents" | "bodyLength" | "bodyWidth" | "bodyHeight" |
  "totalHeight" | "groundClearance" | "groundClearanceStatus" | "groundClearanceReason" | "maxLimbLength">;

export interface AnatomicalExtentsResult {
  readonly body: AnatomyExtents;
  readonly anatomy: AnatomyExtents;
  readonly totalHeight: number;
}

/** AABB del corpo e dell'organismo completo, derivati dalla geometria realmente generata. */
export function computeAnatomicalExtents(segments: readonly Segment[], appendages: readonly Appendage[], sizeScale = 1): AnatomicalExtentsResult {
  const body = extentsOf(segments.map(segmentBox), sizeScale);
  const anatomy = extentsOf([...segments.map(segmentBox), ...appendages.map(appendageBox)], sizeScale);
  return { body, anatomy, totalHeight: anatomy.size.y };
}

/** Backward-compatible: restituisce le proporzioni derivate (campi legacy inclusi). */
export function computeExtents(segments: readonly Segment[], appendages: readonly Appendage[], sizeScale = 1): DerivedProportions {
  const { body, anatomy, totalHeight } = computeAnatomicalExtents(segments, appendages, sizeScale);
  const clearance = assessGroundClearance(segments, appendages, body);
  return {
    bodyExtents: body,
    anatomicalExtents: anatomy,
    bodyLength: body.size.z,
    bodyWidth: body.size.x,
    bodyHeight: body.size.y,
    totalHeight,
    groundClearance: clearance.value,
    groundClearanceStatus: clearance.status,
    groundClearanceReason: clearance.reason,
    maxLimbLength: clearance.maxLimbLength,
  };
}

export type AssembleArgs = Omit<AnatomyDescriptor,
  "fingerprint" | "schemaVersion" | "proportions" | "locomotion" | "complexity" | "declaredAnomalies"> & {
  sizeScale: number;
  robustness: number;
  locomotionMode: AnatomyLocomotion["mode"];
  declaredAnomalies?: readonly AnatomyDiagnostic[];
};

/** Costruisce un descriptor completo (proporzioni, locomozione, complessità, fingerprint) e lo congela. */
export function assembleDescriptor(a: AssembleArgs): AnatomyDescriptor {
  const { sizeScale, robustness, locomotionMode, declaredAnomalies = [], ...rest } = a;
  const ext = computeExtents(a.segments, a.appendages, sizeScale);
  const supportingLimbs = a.appendages.filter((x) => x.kind === "leg").length;
  return withFingerprint({
    schemaVersion: ANATOMY_SCHEMA_VERSION,
    ...rest,
    declaredAnomalies,
    proportions: { sizeScale: rd(sizeScale), robustness: rd(robustness), ...ext },
    locomotion: { mode: locomotionMode, supportingLimbs, groundClearance: ext.groundClearance },
    complexity: computeComplexity(a.segments, a.appendages, a.joints),
  });
}
