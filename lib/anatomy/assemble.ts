import { ANATOMY_SCHEMA_VERSION, type Appendage, type AnatomyComplexity, type AnatomyDescriptor, type AnatomyLocomotion, type AnatomyProportions, type Joint, type Segment } from "./types";
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

const SUPPORT_DIRECTION_Y = -0.5;

/**
 * Proporzioni geometriche. Il corpo (segmenti) e l'organismo completo (segmenti + appendici) sono misurati separatamente.
 * Il terreno si determina SOLO dalle zampe d'appoggio (kind "leg" con direction.y <= -0,5): quota = punto più basso delle loro punte
 * (raggio incluso). La lunghezza di una gamba non è mai usata come distanza dal terreno. Senza zampe d'appoggio i valori sono null.
 */
export function computeExtents(segments: readonly Segment[], appendages: readonly Appendage[]): Omit<AnatomyProportions, "sizeScale" | "robustness"> {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const bmin = { x: Infinity, y: Infinity, z: Infinity };
  const bmax = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const s of segments) {
    for (const ax of ["x", "y", "z"] as const) {
      min[ax] = Math.min(min[ax], s.center[ax] - s.halfExtents[ax]);
      max[ax] = Math.max(max[ax], s.center[ax] + s.halfExtents[ax]);
    }
  }
  for (const ax of ["x", "y", "z"] as const) { bmin[ax] = min[ax]; bmax[ax] = max[ax]; }
  let footY = Infinity;
  for (const a of appendages) {
    const tip = { x: a.position.x + a.direction.x * a.length, y: a.position.y + a.direction.y * a.length, z: a.position.z + a.direction.z * a.length };
    for (const ax of ["x", "y", "z"] as const) {
      bmin[ax] = Math.min(bmin[ax], a.position[ax] - a.radius, tip[ax] - a.radius);
      bmax[ax] = Math.max(bmax[ax], a.position[ax] + a.radius, tip[ax] + a.radius);
    }
    if (a.kind === "leg" && a.direction.y <= SUPPORT_DIRECTION_Y) footY = Math.min(footY, tip.y - a.radius);
  }
  const grounded = Number.isFinite(footY);
  return {
    bodyLength: rd(max.z - min.z), bodyWidth: rd(max.x - min.x), bodyHeight: rd(max.y - min.y),
    extentLength: rd(bmax.z - bmin.z), extentWidth: rd(bmax.x - bmin.x), extentHeight: rd(bmax.y - bmin.y),
    bounds: { min: { x: rd(bmin.x), y: rd(bmin.y), z: rd(bmin.z) }, max: { x: rd(bmax.x), y: rd(bmax.y), z: rd(bmax.z) } },
    groundY: grounded ? rd(footY) : null,
    groundClearance: grounded ? rd(Math.max(0, min.y - footY)) : null,
    heightAboveGround: grounded ? rd(bmax.y - footY) : null,
  };
}

export type AssembleArgs = Omit<AnatomyDescriptor, "fingerprint" | "schemaVersion" | "proportions" | "locomotion" | "complexity"> & {
  sizeScale: number;
  robustness: number;
  locomotionMode: AnatomyLocomotion["mode"];
};

/** Costruisce un descriptor completo (proporzioni, locomozione, complessità, fingerprint) e lo congela. */
export function assembleDescriptor(a: AssembleArgs): AnatomyDescriptor {
  const ext = computeExtents(a.segments, a.appendages);
  const supportingLimbs = a.appendages.filter((x) => x.kind === "leg").length;
  const { sizeScale, robustness, locomotionMode, ...rest } = a;
  return withFingerprint({
    schemaVersion: ANATOMY_SCHEMA_VERSION,
    ...rest,
    proportions: { sizeScale: rd(sizeScale), robustness: rd(robustness), ...ext },
    locomotion: { mode: locomotionMode, supportingLimbs },
    complexity: computeComplexity(a.segments, a.appendages, a.joints),
  });
}
