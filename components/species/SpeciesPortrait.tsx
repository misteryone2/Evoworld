"use client";

import { useEffect, useRef } from "react";
import { computeCreatureShape, type VisualTraits } from "../../lib/creatureShape";
import { drawCreature } from "../simulation/drawCreature";

interface Props {
  traits: VisualTraits;
  color: string;
  size?: number;
}

/**
 * Renders a single procedural creature icon (v0.6) representing a species'
 * "typical" individual: the current mean genome for a living species, or
 * the frozen originGenomeSnapshot for an extinct one — see how SpeciesDetail
 * builds the `traits` prop for each case. Reuses the exact same
 * drawCreature function as PlanetCanvas, so the portrait and the dots on
 * the map are visually consistent representations of the same underlying
 * trait data.
 */
export function SpeciesPortrait({ traits, color, size = 72 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shape = computeCreatureShape(traits);
    drawCreature(ctx, canvas.width / 2, canvas.height / 2, canvas.width * 0.32, shape, color);
  }, [traits, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="species-portrait"
      role="img"
      aria-label="Ritratto procedurale della specie"
    />
  );
}
