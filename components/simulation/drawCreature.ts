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
 *
 * vNext (graphics pass): leggero miglioramento di leggibilità/volume in 2D
 * (ombra semplice, ventre più chiaro, coda, accenno arti, occhio con pupilla)
 * mantenendo il linguaggio procedurale esistente e nessuna dipendenza dalla
 * simulazione.
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

  const rx = Math.max(0.6, radius * (0.85 + elongation * 0.55));
  const ry = Math.max(0.6, radius * (0.82 - elongation * 0.22));

  // Ombra a terra (solo se abbastanza grande)
  if (radius >= 3) {
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.95, rx * 0.9, ry * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();
  }

  // Coda (dietro il corpo). Le decorazioni fini si disegnano solo quando la
  // creatura è abbastanza grande da essere leggibile: sotto i 3 px restano
  // un punto colorato, così il costo per frame non cresce sulla mappa 2D.
  if (radius >= 2.5) {
    const tailLen = Math.max(0.4, radius * (0.5 + elongation * 1.1));
    ctx.beginPath();
    ctx.moveTo(-rx * 0.75, 0);
    ctx.quadraticCurveTo(-rx - tailLen * 0.6, -ry * 0.15, -rx - tailLen, ry * 0.05);
    ctx.quadraticCurveTo(-rx - tailLen * 0.6, ry * 0.25, -rx * 0.75, ry * 0.15);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Corpo con leggero gradiente per volume (flat fill sui punti minuscoli:
  // createRadialGradient per creatura per frame sarebbe un costo inutile).
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  if (radius >= 4) {
    const grad = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, ry * 0.2, 0, 0, Math.max(rx, ry) * 1.2);
    grad.addColorStop(0, "rgba(255,255,255,0.28)");
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();

  // Ventre più chiaro
  if (radius >= 3) {
    ctx.beginPath();
    ctx.ellipse(rx * 0.05, ry * 0.18, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,245,225,0.18)";
    ctx.fill();
  }

  // Accenno arti (solo se abbastanza grande da essere leggibile)
  if (radius >= 3) {
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = Math.max(0.5, radius * 0.18);
    ctx.lineCap = "round";
    const legY = ry * 0.55;
    const legLen = radius * (0.45 + (1 - elongation) * 0.2);
    for (const lx of [-rx * 0.25, rx * 0.15]) {
      ctx.beginPath();
      ctx.moveTo(lx, legY);
      ctx.lineTo(lx - radius * 0.08, legY + legLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx + radius * 0.22, legY);
      ctx.lineTo(lx + radius * 0.14, legY + legLen);
      ctx.stroke();
    }
  }

  // Contorno predatorio
  if (aggression > 0.15) {
    ctx.lineWidth = Math.max(0.4, aggression * 1.3);
    ctx.strokeStyle = `rgba(255, 90, 70, ${0.28 + aggression * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spine difensive (triangolari, più leggibili)
  if (spikiness > 0.2) {
    const spikeCount = Math.round(2 + spikiness * 4);
    for (let i = 0; i < spikeCount; i++) {
      const angle = Math.PI * 0.62 + (i / Math.max(1, spikeCount - 1)) * Math.PI * 0.76;
      const baseR = 0.92;
      const tipR = baseR + (0.18 + spikiness * 0.55);
      const side = 0.12;
      const ax = Math.cos(angle - side) * rx * baseR;
      const ay = Math.sin(angle - side) * ry * baseR;
      const tx = Math.cos(angle) * rx * tipR;
      const ty = Math.sin(angle) * ry * tipR;
      const cx2 = Math.cos(angle + side) * rx * baseR;
      const cy2 = Math.sin(angle + side) * ry * baseR;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(tx, ty);
      ctx.lineTo(cx2, cy2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Mascella/fauci
  if (aggression > 0.15 && jawSize > 0.1) {
    const jawLength = radius * (0.35 + jawSize * 0.65);
    ctx.beginPath();
    ctx.moveTo(rx * 0.65, -radius * 0.18);
    ctx.lineTo(rx * 0.65 + jawLength, 0);
    ctx.lineTo(rx * 0.65, radius * 0.18);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 235, 210, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,60,40,0.25)";
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  // Testa/accento frontale
  if (radius >= 4) {
    ctx.beginPath();
    ctx.ellipse(rx * 0.45, -ry * 0.05, rx * 0.32, ry * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
  }

  // Occhio con pupilla e riflesso
  const eyeRadius = Math.max(0.35, radius * 0.19 * (0.5 + eyeSize));
  const ex = rx * 0.38;
  const ey = -ry * 0.28;
  ctx.beginPath();
  ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f7fb";
  ctx.fill();
  if (radius >= 3) {
    ctx.beginPath();
    ctx.arc(ex + eyeRadius * 0.15, ey, eyeRadius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0f14";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - eyeRadius * 0.05, ey - eyeRadius * 0.2, eyeRadius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();
  }

  ctx.restore();
}
