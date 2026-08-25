"use client";

import { useEffect, useRef } from "react";
import type { RenderFrame, ViewportFrame } from "../../types";
import { speciesColor } from "../../lib/speciesColor";
import { computeCreatureShape } from "../../lib/creatureShape";
import { terrainColorCSS } from "../../lib/terrainColor";
import { drawCreature } from "./drawCreature";

// Terrain codes must match simulation/core/renderFrame.ts TERRAIN_CODE.
const TERRAIN_COLORS: Record<number, string> = {
  0: "#123a52", // ocean
  1: "#5b7a3a", // plains (base, blended with vegetation)
  2: "#c2a25a", // desert
  3: "#6b6558", // mountain
  4: "#1f5c34", // forest
  5: "#c7d4d6", // tundra
  6: "#a68a3c", // savanna
};

const TERRAIN_LABELS: Record<number, string> = {
  0: "Oceano",
  1: "Pianura",
  2: "Deserto",
  3: "Montagna",
  4: "Foresta",
  5: "Tundra",
  6: "Savana",
};

interface Props {
  frame: RenderFrame | null;
  /**
   * v1.1 — World Scale: RenderFrame no longer carries the full per-cell
   * terrain/vegetation grid (see simulation/core/renderFrame.ts). This
   * still-unused legacy 2D view (superseded by Planet3DView since v0.7)
   * now draws from an on-demand ViewportFrame instead, when one is
   * provided; without it, only organisms are drawn, over a flat
   * background — kept simple since nothing in the app currently wires a
   * viewport request up to this component.
   */
  viewportFrame?: ViewportFrame | null;
}

export function PlanetCanvas({ frame, viewportFrame = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { planetWidth, planetHeight } = frame;
    const cellSize = canvas.width / planetWidth;

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (viewportFrame) {
      const { texWidth, texHeight, cellsWidth, cellsHeight, vegetation, terrain } = viewportFrame;
      const texToWorldX = cellsWidth / texWidth;
      const texToWorldY = cellsHeight / texHeight;
      for (let ty = 0; ty < texHeight; ty++) {
        for (let tx = 0; tx < texWidth; tx++) {
          const idx = ty * texWidth + tx;
          ctx.fillStyle = terrainColorCSS(terrain[idx], vegetation[idx]);
          ctx.fillRect(
            tx * texToWorldX * cellSize,
            ty * texToWorldY * cellSize,
            texToWorldX * cellSize + 0.5,
            texToWorldY * cellSize + 0.5,
          );
        }
      }
    }

    const { organismsX, organismsY, organismsSpecies, organismsSize, organismsSpeed, organismsCarnivory, organismsVision, organismsEvasion, organismsHuntingSkill } = frame;
    for (let i = 0; i < organismsX.length; i++) {
      const r = Math.max(1.2, organismsSize[i] * 1.6);
      const color = speciesColor(organismsSpecies[i]);
      const px = organismsX[i] * cellSize;
      const py = organismsY[i] * cellSize;

      // LOD: below ~3px radius a procedural body plan (fangs, spikes, eye)
      // is imperceptible anyway and not worth the extra draw calls when
      // populations reach the thousands — a plain dot reads identically at
      // that size and keeps the frame rate up.
      if (r < 3) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const shape = computeCreatureShape({
        speed: organismsSpeed[i],
        carnivory: organismsCarnivory[i],
        vision: organismsVision[i],
        evasion: organismsEvasion[i],
        huntingSkill: organismsHuntingSkill[i],
      });
      drawCreature(ctx, px, py, r, shape, color);
    }
  }, [frame, viewportFrame]);

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={800}
        height={800}
        className="planet-canvas"
        aria-label="Visualizzazione del pianeta simulato"
        role="img"
      />
      <ul className="biome-legend" aria-label="Legenda dei biomi">
        {Object.entries(TERRAIN_LABELS).map(([code, label]) => (
          <li key={code}>
            <span className="swatch" style={{ background: TERRAIN_COLORS[Number(code)] }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
