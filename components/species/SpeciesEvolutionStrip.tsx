"use client";

import type { SpeciesSnapshot } from "../../lib/speciesTraitHistory";
import { SpeciesPortrait } from "./SpeciesPortrait";

interface Props {
  samples: SpeciesSnapshot[];
  color: string;
}

/**
 * v1.5.0 — Creature 3D, "evoluzione nel tempo". A row of small portraits of
 * a species' typical body at different moments of its history, oldest first,
 * so you can see its shape drift as its genes do. Pure observability.
 */
export function SpeciesEvolutionStrip({ samples, color }: Props) {
  if (samples.length < 2) {
    return <p className="species-timeline-empty">Servono più momenti nella vita della specie per mostrarne l&apos;evoluzione.</p>;
  }
  return (
    <ol className="species-timeline">
      {samples.map((s, i) => (
        <li key={`${s.tick}-${i}`} className="species-timeline-item">
          <SpeciesPortrait traits={s.traits} color={color} size={56} />
          <span className="species-timeline-label">{i === 0 ? "origine" : `anno ${s.year}`}</span>
        </li>
      ))}
    </ol>
  );
}
