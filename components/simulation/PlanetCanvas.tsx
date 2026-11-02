"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import type { RenderFrame, ViewportFrame, ViewportRequest } from "../../types";
import { speciesColor } from "../../lib/speciesColor";
import { computeCreatureShape } from "../../lib/creatureShape";
import { terrainColorRGB, applyWaterOverlayRGB, applySeasonalTintRGB } from "../../lib/terrainColor";
import { computeRenderStride } from "../../lib/renderSampling";
import { pickNearestOrganism } from "../../lib/canvasPicking";
import { TICKS_PER_YEAR } from "../../simulation/core/constants";
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

/** Side (in pixels) of the square map. Smaller than the old 800 px: far fewer pixels to fill on weak devices. */
const CANVAS_SIZE = 640;
/** How often (ms) the camera-less 2D map checks whether the terrain texture is due for a refresh. */
const TERRAIN_CHECK_INTERVAL_MS = 1000;

interface Props {
  frame: RenderFrame | null;
  /**
   * v1.1 — World Scale: RenderFrame no longer carries the full per-cell
   * terrain/vegetation grid (see simulation/core/renderFrame.ts), so the
   * terrain comes from an on-demand ViewportFrame.
   */
  viewportFrame?: ViewportFrame | null;
  /**
   * v1.6.0 — Modalità leggera. This flat map is now the app's fallback view
   * for devices that cannot (or should not) run the 3D view: it requests its
   * own terrain texture, draws it once per texture (not once per simulation
   * frame), samples creatures down to `maxCreatures`, and lets a tap select
   * a creature just like in 3D.
   */
  onRequestViewport?: (request: ViewportRequest) => void;
  /** Widest terrain texture to request (cells per side). */
  terrainSize?: number;
  /** How often (ms) the terrain texture is refreshed. */
  terrainRefreshMs?: number;
  /** Most creatures drawn at once; above it a uniform sample is drawn. */
  maxCreatures?: number;
  selectedOrganismId?: number | null;
  onSelectOrganism?: (organismId: number | null) => void;
}

export function PlanetCanvas({
  frame,
  viewportFrame = null,
  onRequestViewport,
  terrainSize = 256,
  terrainRefreshMs = 6000,
  maxCreatures = 600,
  selectedOrganismId = null,
  onSelectOrganism,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(frame);
  const requestRef = useRef(onRequestViewport);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);
  useEffect(() => {
    requestRef.current = onRequestViewport;
  }, [onRequestViewport]);

  // Ask for the whole planet's terrain, now and then every terrainRefreshMs.
  useEffect(() => {
    let lastRequestAt = 0;
    const maybeRequest = () => {
      const f = frameRef.current;
      if (!f || !requestRef.current) return;
      const now = Date.now();
      if (now - lastRequestAt < terrainRefreshMs) return;
      lastRequestAt = now;
      requestRef.current({
        centerX: f.planetWidth / 2,
        centerY: f.planetHeight / 2,
        radiusX: f.planetWidth / 2,
        radiusY: f.planetHeight / 2,
        maxWidth: terrainSize,
        maxHeight: terrainSize,
      });
    };
    maybeRequest();
    const handle = setInterval(maybeRequest, TERRAIN_CHECK_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [terrainRefreshMs, terrainSize]);

  // Paint the terrain texture once per new ViewportFrame, into a small
  // offscreen canvas as raw pixels (one ImageData write instead of one
  // fillRect per texel).
  useEffect(() => {
    if (!viewportFrame) return;
    const { texWidth, texHeight, vegetation, terrain, temperature, riverFlow, lake, planetHeight, originY, cellsHeight, tick } = viewportFrame;
    let off = terrainCanvasRef.current;
    if (!off) {
      off = document.createElement("canvas");
      terrainCanvasRef.current = off;
    }
    off.width = texWidth;
    off.height = texHeight;
    const octx = off.getContext("2d");
    if (!octx) return;
    const image = octx.createImageData(texWidth, texHeight);
    const yearPhase = (tick % TICKS_PER_YEAR) / TICKS_PER_YEAR;
    for (let ty = 0; ty < texHeight; ty++) {
      const worldY = (((originY + ((ty + 0.5) / texHeight) * cellsHeight) % planetHeight) + planetHeight) % planetHeight;
      const seasonPhase = worldY < planetHeight / 2 ? yearPhase : (yearPhase + 0.5) % 1;
      for (let tx = 0; tx < texWidth; tx++) {
        const i = ty * texWidth + tx;
        const [r, g, b] = applySeasonalTintRGB(
          applyWaterOverlayRGB(terrainColorRGB(terrain[i], vegetation[i]), riverFlow[i], lake[i] === 1),
          terrain[i],
          vegetation[i],
          temperature[i],
          seasonPhase,
        );
        const o = i * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    octx.putImageData(image, 0, 0);
  }, [viewportFrame]);

  // Draw terrain + creatures on every new simulation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { planetWidth, planetHeight } = frame;
    const cellSize = canvas.width / planetWidth;

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (terrainCanvasRef.current && viewportFrame) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrainCanvasRef.current, 0, 0, canvas.width, canvas.height);
    }

    const { organismsX, organismsY, organismsSpecies, organismsSize, organismsSpeed, organismsCarnivory, organismsVision, organismsEvasion, organismsHuntingSkill, organismsId } = frame;
    const stride = computeRenderStride(organismsX.length, maxCreatures);
    for (let i = 0; i < organismsX.length; i += stride) {
      const r = Math.max(1.2, organismsSize[i] * 1.6);
      const color = speciesColor(organismsSpecies[i]);
      const px = organismsX[i] * cellSize;
      const py = organismsY[i] * cellSize;

      // LOD: below ~3px radius a procedural body plan is imperceptible
      // anyway; a plain dot reads identically and is far cheaper.
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

    // Highlight ring for the selected creature, found in the full (unsampled) arrays.
    if (selectedOrganismId !== null) {
      for (let i = 0; i < organismsId.length; i++) {
        if (organismsId[i] !== selectedOrganismId) continue;
        ctx.beginPath();
        ctx.strokeStyle = "#6bffb0";
        ctx.lineWidth = 2;
        ctx.arc(organismsX[i] * cellSize, organismsY[i] * cellSize, Math.max(6, organismsSize[i] * 2.4), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
  }, [frame, viewportFrame, maxCreatures, selectedOrganismId]);

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const f = frameRef.current;
    const canvas = canvasRef.current;
    if (!f || !canvas || !onSelectOrganism) return;
    const rect = canvas.getBoundingClientRect();
    const gridX = ((event.clientX - rect.left) / rect.width) * f.planetWidth;
    const gridY = ((event.clientY - rect.top) / rect.height) * f.planetHeight;
    // About 14 screen pixels of reach, expressed in cells.
    const reach = Math.max(2, (14 / rect.width) * f.planetWidth);
    onSelectOrganism(pickNearestOrganism(f.organismsX, f.organismsY, f.organismsId, gridX, gridY, f.planetWidth, f.planetHeight, reach));
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="planet-canvas"
        aria-label="Visualizzazione del pianeta simulato"
        role="img"
        onClick={handleClick}
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
