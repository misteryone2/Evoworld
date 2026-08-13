import type { CreatureShape } from "../../lib/creatureShape";

/**
 * Draws one procedurally-shaped creature centered at (cx, cy) with the
 * given radius (v0.6 — creature procedurali). Every visual feature maps to
 * a specific genome trait via CreatureShape (see lib/creatureShape.ts):
 *
 *  - body elongation: speed (faster organisms look more streamlined)
 *  - warm outline + jaw wedge: carnivory / huntingSkill (only carnivorous
 *    organisms grow visible fangs at all)
 *  - back spikes: evasion (a purely defensive ornament, not a weapon)
 *  - eye size: vision
 *
 * There is no tracked movement heading in the simulation, so every
 * creature faces a fixed local "forward" (+x before any rotation the
 * caller applies) — a deliberate simplification, not an attempt at
 * directional realism.
 *
 * Used both for individual organisms on PlanetCanvas and for the single
 * representative icon in SpeciesPortrait — same function, same visual
 * language, just called once with mean/snapshot traits instead of once per
 * organism.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  shape: CreatureShape,
  color: string,
): void {
  const { elongation, aggression, eyeSize, spikiness, jawSize } = shape;

  ctx.save();
  ctx.translate(cx, cy);

  const rx = Math.max(0.6, radius * (0.85 + elongation * 0.5));
  const ry = Math.max(0.6, radius * (0.85 - elongation * 0.2));

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (aggression > 0.15) {
    ctx.lineWidth = Math.max(0.3, aggression * 1.2);
    ctx.strokeStyle = `rgba(255, 90, 70, ${0.3 + aggression * 0.5})`;
    ctx.stroke();
  }

  if (spikiness > 0.2) {
    const spikeCount = Math.round(2 + spikiness * 4);
    for (let i = 0; i < spikeCount; i++) {
      const angle = Math.PI * 0.6 + (i / Math.max(1, spikeCount - 1)) * Math.PI * 0.8;
      const baseX = Math.cos(angle) * rx * 0.9;
      const baseY = Math.sin(angle) * ry * 0.9;
      const tipX = Math.cos(angle) * (rx * 0.9 + radius * spikiness * 0.9);
      const tipY = Math.sin(angle) * (ry * 0.9 + radius * spikiness * 0.9);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.3, radius * 0.15);
      ctx.stroke();
    }
  }

  if (aggression > 0.15 && jawSize > 0.1) {
    const jawLength = radius * (0.4 + jawSize * 0.6);
    ctx.beginPath();
    ctx.moveTo(rx * 0.7, -radius * 0.2);
    ctx.lineTo(rx * 0.7 + jawLength, 0);
    ctx.lineTo(rx * 0.7, radius * 0.2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 230, 200, 0.9)";
    ctx.fill();
  }

  const eyeRadius = Math.max(0.3, radius * 0.18 * (0.5 + eyeSize));
  ctx.beginPath();
  ctx.arc(rx * 0.35, -ry * 0.3, eyeRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#0b0f14";
  ctx.fill();

  ctx.restore();
}
