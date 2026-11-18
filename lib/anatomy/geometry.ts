import type { Segment } from "./types";

/**
 * G2 — Geometria dei segmenti (pura). Serve a collocare le radici delle appendici SULLA superficie del segmento ospite
 * invece che su un riquadro. Convenzioni in docs/graphics/G2_GEOMETRY_CONVENTIONS.md.
 */
export const BODY_ROLES: ReadonlySet<string> = new Set(["core", "trunk", "thorax", "abdomen", "lobe"]);
/** Le radici sono incassate leggermente nel segmento. */
const EMBED = 0.97;

/** Frazione (0..1) della sezione trasversale massima del segmento alla coordinata z. */
export function profile(s: Segment, z: number): number {
  const hz = s.halfExtents.z;
  const dz = z - s.center.z;
  if (Math.abs(dz) > hz) return 0;
  if (s.shape === "cone") return (dz + hz) / (2 * hz); // apice a -Z
  if (s.shape === "capsule") {
    const cap = Math.min(hz, Math.max(s.halfExtents.x, s.halfExtents.y));
    const edge = hz - cap;
    if (Math.abs(dz) <= edge) return 1;
    const t = (Math.abs(dz) - edge) / cap;
    return Math.sqrt(Math.max(0, 1 - t * t));
  }
  const t = dz / hz;
  return Math.sqrt(Math.max(0, 1 - t * t));
}

/** Quota y della superficie superiore (sy=1) o inferiore (sy=-1) del segmento in (x, z). */
export function surfaceY(s: Segment, x: number, z: number, sy: 1 | -1): number {
  const f = profile(s, z);
  const w = s.halfExtents.x * f;
  const xr = w > 1e-9 ? Math.min(1, Math.abs(x - s.center.x) / w) : 0;
  return s.center.y + sy * s.halfExtents.y * f * Math.sqrt(1 - xr * xr) * EMBED;
}

/** Semilarghezza (|x| dal centro) della superficie laterale alla quota y e coordinata z. */
export function surfaceHalfWidth(s: Segment, y: number, z: number): number {
  const f = profile(s, z);
  const h = s.halfExtents.y * f;
  const yr = h > 1e-9 ? Math.min(1, Math.abs(y - s.center.y) / h) : 0;
  return s.halfExtents.x * f * Math.sqrt(1 - yr * yr) * EMBED;
}

/** Coordinata z della punta anteriore (front=true) o posteriore del segmento alla distanza laterale x e quota y. */
export function surfaceEndZ(s: Segment, x: number, y: number, front: boolean): number {
  const nx = Math.min(1, Math.abs(x - s.center.x) / s.halfExtents.x);
  const ny = Math.min(1, Math.abs(y - s.center.y) / s.halfExtents.y);
  const k = s.shape === "cone" ? 1 : Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * EMBED;
  return s.center.z + (front ? 1 : -1) * s.halfExtents.z * k;
}
