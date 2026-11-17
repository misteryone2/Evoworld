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

export function computeExtents(segments: readonly Segment[], appendages: readonly Appendage[]): Pick<AnatomyProportions, "bodyLength" | "bodyWidth" | "bodyHeight" | "groundClearance"> {
  let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity, xmax = 0;
  for (const s of segments) {
    zmin = Math.min(zmin, s.center.z - s.halfExtents.z);
    zmax = Math.max(zmax, s.center.z + s.halfExtents.z);
    ymin = Math.min(ymin, s.center.y - s.halfExtents.y);
    ymax = Math.max(ymax, s.center.y + s.halfExtents.y);
    xmax = Math.max(xmax, Math.abs(s.center.x) + s.halfExtents.x);
  }
  let clearance = 0;
  for (const a of appendages) if (a.kind === "leg") clearance = Math.max(clearance, a.length);
  return { bodyLength: rd(zmax - zmin), bodyWidth: rd(2 * xmax), bodyHeight: rd(ymax - ymin), groundClearance: rd(clearance) };
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
    locomotion: { mode: locomotionMode, supportingLimbs, groundClearance: ext.groundClearance },
    complexity: computeComplexity(a.segments, a.appendages, a.joints),
  });
}
