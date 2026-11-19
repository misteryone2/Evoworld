import type { AnatomyDescriptor, Appendage } from "../anatomy/types";
import { organismHueShift, stableVariation01, type CreatureSurface, type SurfaceMaterialClass } from "./creatureVisualDescriptor";

/**
 * G-consolidamento — ponte read-only tra AnatomyDescriptor (G2/G2.1) e il
 * vocabolario visivo di G1. Non modifica il descriptor, non importa Three.js,
 * non legge la simulazione e non entra nel loop caldo del renderer.
 *
 * Il renderer instanziato di G1 supporta un repertorio chiuso di parti
 * (torso, testa, occhi, coda, mascella, zampe, orecchie, spine, ombra):
 * `renderSupport` dichiara esplicitamente quando un body plan G2 può essere
 * rappresentato solo in modo approssimativo, invece di fingerlo equivalente.
 */

const clamp01 = (v: number): number => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
const average = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

export interface AnatomyVisualMorphology {
  readonly scale: number;
  readonly bodyLength: number;
  readonly bodyHeight: number;
  readonly bodyWidth: number;
  readonly headScale: number;
  readonly neckLength: number;
  readonly limbLength: number;
  readonly limbThickness: number;
  readonly tailLength: number;
  readonly tailThickness: number;
  readonly ornamentation: number;
  readonly bulk: number;
}

export interface AnatomyVisualSurface {
  readonly hueShift: number;
  readonly pattern: CreatureSurface["pattern"];
  readonly materialClass: SurfaceMaterialClass;
  readonly roughness: number;
  readonly sheen: number;
}

export interface AnatomyRenderSupport {
  /** Il renderer instanziato può disegnare una rappresentazione di questa anatomia. */
  readonly supported: boolean;
  /**true solo per l'adattatore legacy, le cui misure coincidono con quelle del renderer. */
  readonly exactGeometry: boolean;
  /** Motivi per cui la rappresentazione è approssimativa o impossibile. */
  readonly reasons: readonly string[];
}

export interface AnatomyVisualProjection {
  readonly fingerprint: string;
  readonly morphology: AnatomyVisualMorphology;
  readonly surface: AnatomyVisualSurface;
  /** Copia del valore hardening: null resta null, mai un proxy inventato. */
  readonly groundClearance: number | null;
  readonly groundClearanceStatus: AnatomyDescriptor["proportions"]["groundClearanceStatus"];
  /** Misura distinta dalla ground clearance (G2.1). */
  readonly maxLimbLength: number;
  readonly renderSupport: AnatomyRenderSupport;
}

function appendagesOf(d: AnatomyDescriptor, kind: Appendage["kind"], variant?: string): Appendage[] {
  return d.appendages.filter((a) => a.kind === kind && (variant === undefined || a.variant === variant));
}

function materialFromCovering(d: AnatomyDescriptor): SurfaceMaterialClass {
  switch (d.surface.covering) {
    case "fur": return "fur";
    case "dermal-plates": return "carapace";
    case "mixed": return "hide";
    default: return "skin";
  }
}

function patternFromSeed(seed: number | null): CreatureSurface["pattern"] {
  const roll = seed === null ? 0.5 : stableVariation01(seed);
  if (roll < 0.55) return "none";
  if (roll < 0.7) return "mottled";
  if (roll < 0.82) return "countershade";
  if (roll < 0.92) return "spots";
  return "stripes";
}

/**
 * Valuta la compatibilità con il renderer instanziato di G1. Non modifica
 * nulla: è un controllo di contratto, pensato per test e per futuri consumer.
 */
export function anatomyRenderSupport(d: AnatomyDescriptor): AnatomyRenderSupport {
  const reasons: string[] = [];
  const legs = appendagesOf(d, "leg").length;
  const eyes = appendagesOf(d, "sensory", "eye").length;
  const spikes = appendagesOf(d, "spine").length + appendagesOf(d, "plate").length;
  const allowedKinds = new Set<Appendage["kind"]>(["leg", "sensory", "tail", "jaw", "spine", "plate"]);
  const unknown = d.appendages.filter((a) => !allowedKinds.has(a.kind));

  if (legs !== 4) reasons.push(`renderer-has-4-leg-slots:anatomy-has-${legs}`);
  if (eyes !== 2) reasons.push(`renderer-has-2-eye-slots:anatomy-has-${eyes}`);
  if (spikes > 3) reasons.push(`renderer-has-3-spike-slots:anatomy-has-${spikes}`);
  if (d.symmetry.type !== "bilateral") reasons.push(`renderer-assumes-bilateral-symmetry:anatomy-is-${d.symmetry.type}`);
  if (unknown.length > 0) reasons.push(`unsupported-appendage-kinds:${[...new Set(unknown.map((a) => a.kind))].join(",")}`);
  if (!d.segments.some((s) => s.role === "head")) reasons.push("missing-head-segment");
  if (!d.segments.some((s) => s.role === "trunk" || s.role === "core")) reasons.push("missing-trunk-segment");

  const exactGeometry = d.bodyPlan.id === "legacy-quadruped" && reasons.length === 0;
  if (!exactGeometry && d.bodyPlan.id !== "quadruped") reasons.push(`body-plan-not-in-renderer-catalog:${d.bodyPlan.id}`);

  return { supported: reasons.length === 0, exactGeometry, reasons: Object.freeze(reasons) };
}

/** Proiezione pura e immutabile delle misure G2.1 nel vocabolario visivo G1. */
export function projectAnatomyToVisual(d: AnatomyDescriptor): AnatomyVisualProjection {
  const p = d.proportions;
  const legs = appendagesOf(d, "leg");
  const head = d.segments.find((s) => s.role === "head");
  const trunk = d.segments.find((s) => s.role === "trunk" || s.role === "core");
  const tail = d.segments.find((s) => s.role === "tail");
  const tailAppendage = appendagesOf(d, "tail")[0];
  const ornaments = appendagesOf(d, "spine").length + appendagesOf(d, "plate").length;
  const fur = d.surface.furCoverage ?? 0;
  const armor = d.surface.armorCoverage ?? 0;

  const morphology: AnatomyVisualMorphology = {
    scale: p.sizeScale,
    bodyLength: p.bodyLength,
    bodyHeight: p.bodyHeight,
    bodyWidth: p.bodyWidth,
    headScale: head ? Math.max(head.halfExtents.x, head.halfExtents.y, head.halfExtents.z) : 0,
    neckLength: head && trunk ? clamp01(head.center.z - trunk.center.z) : 0,
    limbLength: p.maxLimbLength,
    limbThickness: average(legs.map((a) => a.radius)),
    tailLength: tail ? tail.halfExtents.z * 2 : tailAppendage?.length ?? 0,
    tailThickness: tail ? tail.halfExtents.x : tailAppendage?.radius ?? 0,
    ornamentation: clamp01(ornaments / 8),
    bulk: clamp01(p.robustness),
  };

  const surface: AnatomyVisualSurface = {
    hueShift: d.aesthetic.seed === null ? 0 : organismHueShift(d.aesthetic.seed),
    pattern: patternFromSeed(d.aesthetic.seed),
    materialClass: materialFromCovering(d),
    roughness: clamp01(0.45 + armor * 0.35),
    sheen: clamp01(0.15 + fur * 0.25),
  };

  return Object.freeze({
    fingerprint: d.fingerprint,
    morphology: Object.freeze(morphology),
    surface: Object.freeze(surface),
    groundClearance: p.groundClearance,
    groundClearanceStatus: p.groundClearanceStatus,
    maxLimbLength: p.maxLimbLength,
    renderSupport: Object.freeze(anatomyRenderSupport(d)),
  });
}
