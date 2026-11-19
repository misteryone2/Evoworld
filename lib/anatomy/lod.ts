import { computeComplexity, computeExtents, withFingerprint } from "./assemble";
import type { AnatomyDescriptor, AppendageKind, DetailTier } from "./types";

/** Appendici che reggono il movimento o il corpo: restano al livello 1. Le altre (sensoriali, difensive, boccali) cadono. */
const ESSENTIAL_KINDS: ReadonlySet<AppendageKind> = new Set<AppendageKind>(["leg", "arm", "tentacle", "fin", "tail", "flagellum", "pseudopod"]);

/**
 * G2 — Dettaglio adattivo. Riduce un descriptor a un livello inferiore (3 = completo, 2 = senza articolazioni interne,
 * 1 = solo appendici essenziali, 0 = solo segmenti). Funzione pura: restituisce un nuovo descriptor valido, con
 * conteggi di complessità ricalcolati sulla rappresentazione ridotta. La locomozione resta quella dell'organismo intero.
 */
export function reduceAnatomyDetail(d: AnatomyDescriptor, tier: DetailTier): AnatomyDescriptor {
  if (tier >= d.lod) return d;
  let appendages = d.appendages;
  let joints = d.joints;
  if (tier <= 2) {
    appendages = appendages.map((a) => (a.sectionCount === 1 ? a : { ...a, sectionCount: 1 }));
    joints = joints.filter((j) => j.kind !== "internal");
  }
  if (tier <= 1) {
    appendages = appendages.filter((a) => ESSENTIAL_KINDS.has(a.kind));
    const keep = new Set(appendages.map((a) => a.id));
    joints = joints.filter((j) => j.appendageId === null || keep.has(j.appendageId));
  }
  if (tier === 0) {
    appendages = [];
    joints = joints.filter((j) => j.kind === "axial");
  }
  const { fingerprint: _f, proportions, locomotion, complexity: _c, ...rest } = d;
  void _f; void _c;
  // Le misure devono descrivere la geometria effettivamente presente a questo livello.
  const ext = computeExtents(d.segments, appendages, proportions.sizeScale);
  return withFingerprint({
    ...rest, lod: tier, appendages, joints,
    proportions: { ...proportions, ...ext },
    locomotion: { ...locomotion, groundClearance: ext.groundClearance },
    complexity: computeComplexity(d.segments, appendages, joints),
  });
}
