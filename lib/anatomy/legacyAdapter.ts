import { computeCreatureAnatomy, type CreatureAnatomy, type CreatureTraits } from "../creatureAnatomy";
import type { DataSource } from "../phenotype/types";
import { assembleDescriptor } from "./assemble";
import { REQUIRED_PROVENANCE_KEYS, type Appendage, type AnatomyDescriptor, type Joint, type JointType, type Segment, type Vec3 } from "./types";
import { rd } from "./util";

/**
 * G2 — Adattatore di compatibilità: converte l'anatomia legacy (lib/creatureAnatomy.ts, quadrupede fisso derivato da 5
 * tratti) in un AnatomyDescriptor e permette di confrontarla con uno nuovo. NON modifica né sostituisce l'anatomia
 * esistente e NON è collegato al renderer.
 *
 * Provenienza: le regole legacy (velocità → lunghezza, carnivoria → mascella/orecchie, evasione → spine…) sono
 * euristiche ESTETICHE, non biologia. Nel descriptor risultano tutte "aesthetic": nessun dato genetico diretto o derivato.
 */
const v3 = (x: number, y: number, z: number): Vec3 => ({ x: rd(x), y: rd(y), z: rd(z) });
const aes = (note: string): DataSource => ({ kind: "aesthetic", genes: [], certainty: "speculative", note: `euristica estetica legacy: ${note}` });
const dof = (t: JointType): 0 | 1 | 2 | 3 => (t === "fixed" ? 0 : t === "hinge" ? 1 : t === "segmental" ? 2 : 3);

export function descriptorFromLegacyAnatomy(a: CreatureAnatomy, opts: { seed?: number } = {}): AnatomyDescriptor {
  const segments: Segment[] = [
    { id: "torso", role: "trunk", shape: "ellipsoid", parentId: null, center: v3(0, 0, 0), halfExtents: v3(a.bodyHalfWidth, a.bodyHalfHeight, a.bodyHalfLength) },
    { id: "head", role: "head", shape: "sphere", parentId: "torso", center: v3(0, a.headY, a.headZ), halfExtents: v3(a.headRadius, a.headRadius, a.headRadius) },
    { id: "tail", role: "tail", shape: "cone", parentId: "torso", center: v3(0, 0, a.tailZ), halfExtents: v3(a.tailRadius, a.tailRadius, a.tailLength / 2) },
  ];
  const joints: Joint[] = [
    { id: "j-ax-head", kind: "axial", type: "flexible", dof: dof("flexible"), parentSegmentId: "torso", childSegmentId: "head", appendageId: null, section: null },
    { id: "j-ax-tail", kind: "axial", type: "flexible", dof: dof("flexible"), parentSegmentId: "torso", childSegmentId: "tail", appendageId: null, section: null },
  ];
  const appendages: Appendage[] = [];
  const add = (groupId: string, kind: Appendage["kind"], variant: string | null, seg: string, side: Appendage["side"], pos: Vec3, dir: Vec3, length: number, radius: number, jt: JointType): void => {
    const index = appendages.filter((x) => x.groupId === groupId).length;
    const id = `${groupId}-${index}`;
    appendages.push({ id, groupId, kind, variant, segmentId: seg, side, index, angle: null, position: pos, direction: dir, length: rd(length), radius: rd(radius), sectionCount: 1 });
    joints.push({ id: `j-ap-${id}`, kind: "root", type: jt, dof: dof(jt), parentSegmentId: seg, childSegmentId: null, appendageId: id, section: 0 });
  };

  for (const z of [a.legFrontZ, a.legBackZ]) for (const sx of [1, -1]) add("legs", "leg", null, "torso", sx > 0 ? "left" : "right", v3(sx * a.legX, -a.bodyHalfHeight, z), v3(0, -1, 0), a.legLength, a.legRadius, "ball");
  for (const sx of [1, -1]) add("eyes", "sensory", "eye", "head", sx > 0 ? "left" : "right", v3(sx * a.eyeX, a.eyeY, a.eyeZ), v3(0, 0, 1), a.eyeRadius, a.eyeRadius, "fixed");
  if (a.earVisible) for (const sx of [1, -1]) add("ears", "sensory", "ear", "head", sx > 0 ? "left" : "right", v3(sx * a.earX, a.earY, a.earZ), v3(0, 1, 0), a.earHeight, a.earRadius, "fixed");
  if (a.jawVisible) add("jaw", "jaw", null, "head", "mid", v3(0, a.jawY, a.jawZ), v3(0, 0, 1), a.jawLength, a.jawRadius, "hinge");
  a.spikes.forEach((s) => add("spikes", "spine", null, "torso", "mid", v3(0, a.bodyHalfHeight * 0.95, s.z), v3(0, 1, 0), s.height, s.radius, "fixed"));

  const provenance: Record<string, DataSource> = {};
  for (const k of REQUIRED_PROVENANCE_KEYS) provenance[k] = aes(k);
  provenance.bodyPlan = { kind: "undetermined", genes: [], certainty: "speculative", note: "quadrupede fisso legacy: nessun gene lo codifica" };

  return assembleDescriptor({
    lod: 3,
    bodyPlan: { id: "legacy-quadruped", family: "complex", origin: "legacy-default" },
    symmetry: { type: "bilateral", order: 2 },
    segments, appendages, joints,
    sizeScale: 1, robustness: 0.5,
    surface: { covering: "unspecified", furCoverage: null, armorCoverage: null },
    locomotionMode: "quadrupedal",
    aesthetic: { seed: opts.seed === undefined ? null : opts.seed >>> 0, jitter: 0 },
    provenance,
    phenotypeIssues: ["legacy-source: nessun dato fenotipico"],
  });
}

/** Comodità: dai 5 tratti legacy direttamente al descriptor (usa computeCreatureAnatomy, invariata). */
export function descriptorFromLegacyTraits(traits: CreatureTraits, opts: { seed?: number } = {}): AnatomyDescriptor {
  return descriptorFromLegacyAnatomy(computeCreatureAnatomy(traits), opts);
}

export interface LegacyComparison {
  /** true se la struttura (conteggi di zampe, spine, orecchie, mascella, segmenti) coincide. */
  readonly structurallyEquivalent: boolean;
  readonly differences: readonly string[];
}

/** Confronta l'anatomia legacy con un descriptor: differenze strutturali e di proporzione oltre `tolerance` (relativa). */
export function compareLegacyAnatomy(legacy: CreatureAnatomy, d: AnatomyDescriptor, tolerance = 0.05): LegacyComparison {
  const diff: string[] = [];
  const count = (kind: string, variant?: string) => d.appendages.filter((a) => a.kind === kind && (variant === undefined || a.variant === variant)).length;
  const pairs: [string, number, number][] = [
    ["legs", 4, count("leg")],
    ["eyes", 2, count("sensory", "eye")],
    ["ears", legacy.earVisible ? 2 : 0, count("sensory", "ear")],
    ["jaw", legacy.jawVisible ? 1 : 0, count("jaw")],
    ["spikes", legacy.spikes.length, count("spine")],
    ["segments", 3, d.segments.length],
  ];
  let structural = true;
  for (const [name, expected, actual] of pairs) {
    if (expected !== actual) { structural = false; diff.push(`${name}: legacy=${expected} descriptor=${actual}`); }
  }
  const torso = d.segments.find((s) => s.role === "trunk" || s.role === "core");
  if (torso) {
    const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(1e-9, Math.abs(x));
    if (rel(legacy.bodyHalfLength, torso.halfExtents.z) > tolerance) diff.push(`bodyHalfLength: legacy=${rd(legacy.bodyHalfLength)} descriptor=${torso.halfExtents.z}`);
    if (rel(legacy.bodyHalfWidth, torso.halfExtents.x) > tolerance) diff.push(`bodyHalfWidth: legacy=${rd(legacy.bodyHalfWidth)} descriptor=${torso.halfExtents.x}`);
    if (rel(legacy.bodyHalfHeight, torso.halfExtents.y) > tolerance) diff.push(`bodyHalfHeight: legacy=${rd(legacy.bodyHalfHeight)} descriptor=${torso.halfExtents.y}`);
  }
  return { structurallyEquivalent: structural, differences: diff };
}
