"use client";

import { useEffect, useRef } from "react";
import type { RenderFrame } from "../../types";

const TERRAIN_COLORS: Record<number, string> = {
  0: "#123a52", // ocean
  1: "#5b7a3a", // plains (base, blended with vegetation)
  2: "#c2a25a", // desert
  3: "#6b6558", // mountain
};

const SPECIES_HUES = [16, 195, 300, 48, 130, 260, 0, 170];

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

    const { organismsX, organismsY, organismsSpecies, organismsSize } = frame;
    for (let i = 0; i < organismsX.length; i++) {
      const hue = SPECIES_HUES[organismsSpecies[i] % SPECIES_HUES.length];
      const r = Math.max(1.2, organismsSize[i] * 1.6);
      ctx.beginPath();
      ctx.fillStyle = `hsl(${hue} 85% 62%)`;
      ctx.arc(organismsX[i] * cellSize, organismsY[i] * cellSize, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frame]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={800}
      className="planet-canvas"
      aria-label="Visualizzazione del pianeta simulato"
      role="img"
    />
  );
}

function shadeTerrain(terrainCode: number, vegetation: number): string {
  if (terrainCode === 0) return TERRAIN_COLORS[0];
  if (terrainCode === 3) return TERRAIN_COLORS[3];
  if (terrainCode === 2) {
    const g = Math.round(140 + vegetation * 40);
    return `rgb(${194 - vegetation * 60}, ${g}, 90)`;
  }
  const r = Math.round(120 - vegetation * 50);
  const g = Math.round(110 + vegetation * 70);
  const b = Math.round(70 - vegetation * 20);
  return `rgb(${r}, ${g}, ${b})`;
}
