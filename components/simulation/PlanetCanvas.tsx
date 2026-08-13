"use client";

import { useEffect, useRef } from "react";
import type { RenderFrame } from "../../types";
import { speciesColor } from "../../lib/speciesColor";
import { computeCreatureShape } from "../../lib/creatureShape";
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
}

export function PlanetCanvas({ frame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { planetWidth, planetHeight, vegetation, terrain } = frame;
    const cellSize = canvas.width / planetWidth;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < planetHeight; y++) {
      for (let x = 0; x < planetWidth; x++) {
        const idx = y * planetWidth + x;
        const t = terrain[idx];
        const veg = vegetation[idx];
        ctx.fillStyle = shadeTerrain(t, veg);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
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
  }, [frame]);

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

function shadeTerrain(terrainCode: number, vegetation: number): string {
  // ocean, mountain, tundra: fixed color, not vegetation-blended.
  if (terrainCode === 0 || terrainCode === 3 || terrainCode === 5) {
    return TERRAIN_COLORS[terrainCode];
  }
  if (terrainCode === 2) {
    // desert lightly greens with vegetation
    const g = Math.round(140 + vegetation * 40);
    return `rgb(${194 - vegetation * 60}, ${g}, 90)`;
  }
  if (terrainCode === 4) {
    // forest: darker and richer with more vegetation
    const g = Math.round(70 + vegetation * 70);
    return `rgb(${20 + (1 - vegetation) * 30}, ${g}, ${40 + (1 - vegetation) * 20})`;
  }
  if (terrainCode === 6) {
    // savanna: warm tan blended slightly with green
    const g = Math.round(120 + vegetation * 40);
    return `rgb(${168 - vegetation * 30}, ${g}, 60)`;
  }
  // plains: interpolate from dry tan to lush green based on vegetation
  const r = Math.round(120 - vegetation * 50);
  const g = Math.round(110 + vegetation * 70);
  const b = Math.round(70 - vegetation * 20);
  return `rgb(${r}, ${g}, ${b})`;
}
