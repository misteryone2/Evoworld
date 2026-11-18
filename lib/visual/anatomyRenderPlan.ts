import type { CreatureAnatomy, SpikeAnatomy } from "../creatureAnatomy";
import type { AnatomyDescriptor, Appendage, Vec3 } from "../anatomy/types";
import {
  anatomyRenderSupport, projectAnatomyToVisual,
  type AnatomyRenderSupport, type AnatomyVisualProjection,
} from "./anatomyVisualBridge";

/**
 * G-REV-02 — contratto puro tra AnatomyDescriptor (G2/G2.1) e il renderer 3D.
 * Nessun React, nessun Three.js, nessun accesso alla simulazione: il piano è
 * calcolato fuori dal loop caldo e il renderer lo consuma senza mutarlo.
 * Il fallback legacy resta il comportamento predefinito quando non c'è una
 * sorgente oppure il piano non è utilizzabile.
 */

/** Tettopli fissi dei pool generici: il renderer non può crescere senza limite. */
export const GENERIC_RENDER_SLOTS = Object.freeze({
  segment: 6,
  appendage: 12,
  eye: 2,
} as const);
export type CreatureRenderPartKey = keyof typeof GENERIC_RENDER_SLOTS;
const GENERIC_KEYS = Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[];

export interface CreaturePartInstance {
  readonly key: CreatureRenderPartKey;
  /** Slot locale alla creatura, sempre < GENERIC_RENDER_SLOTS[key]. */
  readonly slot: number;
  readonly position: readonly [number, number, number];
  /** Quaternione locale xyzw: ruota l'asse +Y della primitiva verso la direzione dell'appendice. */
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly visible: boolean;
}

/** Geometria usata dal renderer, più i due metadati necessari a non raddoppiare la scala. */
export interface AnatomyRenderGeometry extends CreatureAnatomy {
  readonly sizeScale: number;
  readonly sourceFingerprint: string;
}

export interface AnatomyRenderPlan {
  /** `mapped`: usa i mesh legacy; `parts`: usa anche i pool generici G2. */
  readonly mode: "mapped" | "parts";
  readonly support: AnatomyRenderSupport;
  readonly geometry: AnatomyRenderGeometry | null;
  readonly parts: readonly CreaturePartInstance[] | null;
  readonly projection: AnatomyVisualProjection;
  /** Motivo del fallback: il renderer deve segnalarlo, non inventare geometria. */
  readonly fallbackReason: string | null;
}

export interface CreatureAnatomyRenderSource {
  readonly id?: string;
  /** Deve essere pura e senza allocazioni rilevanti: i piani vanno caching nel provider. */
  planFor(organismId: number, tick: number): AnatomyRenderPlan | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const triple = (v: readonly [number, number, number]): boolean => v.every(finite);
const quad = (v: readonly [number, number, number, number]): boolean => v.every(finite);

/** Gate di sicurezza del renderer: un piano non finito o fuori slot non può mai entrare nel loop. */
export function isUsableAnatomyRenderPlan(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const p = value as AnatomyRenderPlan;
  if (p.mode !== "mapped" && p.mode !== "parts") return false;
  if (!p.support || !p.support.supported || !p.projection) return false;
  if (!p.geometry || !geometryFinite(p.geometry)) return false;
  if (p.mode === "parts" && !Array.isArray(p.parts)) return false;
  if (p.parts && !p.parts.every((part) => part && GENERIC_KEYS.includes(part.key)
    && Number.isInteger(part.slot) && part.slot >= 0 && part.slot < GENERIC_RENDER_SLOTS[part.key]
    && triple(part.position) && quad(part.rotation) && triple(part.scale) && typeof part.visible === "boolean")) return false;
  return true;
}

function geometryFinite(g: AnatomyRenderGeometry): boolean {
  const numbers = [
    g.bodyHalfWidth, g.bodyHalfHeight, g.bodyHalfLength, g.headRadius, g.headY, g.headZ,
    g.eyeRadius, g.eyeX, g.eyeY, g.eyeZ, g.tailLength, g.tailRadius, g.tailZ,
    g.jawLength, g.jawRadius, g.jawY, g.jawZ,
    g.legLength, g.legRadius, g.legX, g.legFrontZ, g.legBackZ,
    g.earHeight, g.earRadius, g.earX, g.earY, g.earZ, g.aggression,
    g.sizeScale,
  ];
  return numbers.every(finite) && typeof g.jawVisible === "boolean" && typeof g.earVisible === "boolean"
    && typeof g.sourceFingerprint === "string" && Array.isArray(g.spikes)
    && g.spikes.every((s: SpikeAnatomy) => finite(s.z) && finite(s.height) && finite(s.radius));
}

const avg = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const rel = (p: Vec3, origin: Vec3): Vec3 => ({ x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z });
const midpoint = (a: Appendage, origin: Vec3): Vec3 => rel({
  x: a.position.x + a.direction.x * a.length * 0.5,
  y: a.position.y + a.direction.y * a.length * 0.5,
  z: a.position.z + a.direction.z * a.length * 0.5,
}, origin);
const ofKind = (d: AnatomyDescriptor, kind: Appendage["kind"], variant?: string): Appendage[] =>
  d.appendages.filter((a) => a.kind === kind && (variant === undefined || a.variant === variant));

/** Quaternione che porta +Y sulla direzione dell'appendice (nessuna dipendenza da Three.js). */
function quatFromUp(direction: Vec3): readonly [number, number, number, number] {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (!finite(len) || len < 1e-9) return [0, 0, 0, 1];
  const x = direction.x / len;
  const y = direction.y / len;
  const z = direction.z / len;
  if (y < -0.999999) return [1, 0, 0, 0];
  const qx = z, qy = 0, qz = -x, qw = 1 + y;
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / n, qy / n, qz / n, qw / n];
}

function geometryFromDescriptor(d: AnatomyDescriptor, aggression: number): AnatomyRenderGeometry | null {
  const trunk = d.segments.find((s) => s.role === "trunk" || s.role === "core") ?? d.segments[0];
  const head = d.segments.find((s) => s.role === "head");
  if (!trunk || !head) return null;
  const origin = trunk.center;
  const eyes = ofKind(d, "sensory", "eye");
  const ears = ofKind(d, "sensory", "ear");
  const legs = ofKind(d, "leg");
  const tailAppendage = ofKind(d, "tail")[0];
  const jawAppendage = ofKind(d, "jaw")[0];
  const ornaments = [...ofKind(d, "spine"), ...ofKind(d, "plate")];
  const tailSegment = d.segments.find((s) => s.role === "tail");
  const jaws = jawAppendage ? midpoint(jawAppendage, origin) : null;
  const legsRel = legs.map((a) => rel(a.position, origin));
  const spikes: SpikeAnatomy[] = ornaments.slice(0, 3).map((a) => {
    const m = midpoint(a, origin);
    return { z: m.z, height: a.length, radius: a.radius };
  });

  const geometry: AnatomyRenderGeometry = {
    bodyHalfWidth: trunk.halfExtents.x,
    bodyHalfHeight: trunk.halfExtents.y,
    bodyHalfLength: trunk.halfExtents.z,
    headRadius: Math.max(head.halfExtents.x, head.halfExtents.y, head.halfExtents.z),
    headY: head.center.y - origin.y,
    headZ: head.center.z - origin.z,
    eyeRadius: avg(eyes.map((a) => a.radius)),
    eyeX: avg(eyes.map((a) => Math.abs(rel(a.position, origin).x))),
    eyeY: avg(eyes.map((a) => rel(a.position, origin).y)),
    eyeZ: avg(eyes.map((a) => rel(a.position, origin).z)),
    tailLength: tailSegment ? tailSegment.halfExtents.z * 2 : tailAppendage?.length ?? 0,
    tailRadius: tailSegment ? tailSegment.halfExtents.x : tailAppendage?.radius ?? 0,
    tailZ: tailSegment ? tailSegment.center.z - origin.z : tailAppendage ? midpoint(tailAppendage, origin).z : 0,
    jawVisible: !!jawAppendage,
    jawLength: jawAppendage?.length ?? 0,
    jawRadius: jawAppendage?.radius ?? 0,
    jawY: jaws?.y ?? 0,
    jawZ: jaws?.z ?? 0,
    spikes,
    legLength: avg(legs.map((a) => a.length)),
    legRadius: avg(legs.map((a) => a.radius)),
    legX: avg(legsRel.map((p) => Math.abs(p.x))),
    legFrontZ: legsRel.length ? Math.max(...legsRel.map((p) => p.z)) : 0,
    legBackZ: legsRel.length ? Math.min(...legsRel.map((p) => p.z)) : 0,
    earVisible: ears.length === 2,
    earHeight: avg(ears.map((a) => a.length)),
    earRadius: avg(ears.map((a) => a.radius)),
    earX: avg(ears.map((a) => Math.abs(rel(a.position, origin).x))),
    earY: avg(ears.map((a) => rel(a.position, origin).y)),
    earZ: avg(ears.map((a) => rel(a.position, origin).z)),
    aggression: finite(aggression) ? Math.min(1, Math.max(0, aggression)) : 0,
    sizeScale: d.proportions.sizeScale,
    sourceFingerprint: d.fingerprint,
  };
  return geometryFinite(geometry) ? Object.freeze({ ...geometry, spikes }) : null;
}

function partsFromDescriptor(d: AnatomyDescriptor): readonly CreaturePartInstance[] {
  const trunk = d.segments.find((s) => s.role === "trunk" || s.role === "core") ?? d.segments[0];
  const origin = trunk.center;
  const parts: CreaturePartInstance[] = [];
  const used: Record<CreatureRenderPartKey, number> = { segment: 0, appendage: 0, eye: 0 };
  const push = (key: CreatureRenderPartKey, position: Vec3, rotation: readonly [number, number, number, number], scale: readonly [number, number, number]): void => {
    const slot = used[key]++;
    if (slot >= GENERIC_RENDER_SLOTS[key]) return;
    parts.push(Object.freeze({ key, slot, position: Object.freeze([position.x, position.y, position.z]) as readonly [number, number, number], rotation: Object.freeze(rotation) as readonly [number, number, number, number], scale: Object.freeze(scale) as readonly [number, number, number], visible: true }));
  };
  for (const s of d.segments) {
    if (used.segment >= GENERIC_RENDER_SLOTS.segment) break;
    push("segment", rel(s.center, origin), [0, 0, 0, 1], [s.halfExtents.x, s.halfExtents.y, s.halfExtents.z]);
  }
  const renderable = new Set<Appendage["kind"]>(["leg", "tail", "jaw", "spine", "plate", "sensory"]);
  for (const a of d.appendages) {
    if (!renderable.has(a.kind)) continue;
    const key: CreatureRenderPartKey = a.kind === "sensory" && a.variant === "eye" ? "eye" : "appendage";
    if (used[key] >= GENERIC_RENDER_SLOTS[key]) continue;
    const m = midpoint(a, origin);
    push(key, m, quatFromUp(a.direction), [a.radius, a.length * 0.5, a.radius]);
  }
  return Object.freeze(parts);
}

/**
 * Adatto un descriptor G2 a un piano consumabile dal renderer. I body plan non
 * supportati NON vengono "aggiustati": restituiscono un piano con fallbackReason
 * e il renderer resta sulla geometria legacy, dichiarando il motivo.
 */
export function planFromAnatomyDescriptor(d: AnatomyDescriptor, aggression = 0): AnatomyRenderPlan {
  const projection = projectAnatomyToVisual(d);
  const support: AnatomyRenderSupport = projection.renderSupport;
  const base = { support, projection, geometry: null, parts: null, fallbackReason: null as string | null };
  if (!support.supported) {
    return Object.freeze({ ...base, mode: "mapped", fallbackReason: support.reasons.join(";") });
  }
  const geometry = geometryFromDescriptor(d, aggression);
  if (!geometry) {
    return Object.freeze({ ...base, mode: "mapped", fallbackReason: "geometry-mapping-failed" });
  }
  return Object.freeze({
    ...base,
    mode: "parts",
    geometry,
    parts: partsFromDescriptor(d),
  });
}
