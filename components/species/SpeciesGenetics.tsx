"use client";

import type { SpeciesGenomeStats } from "../../types";
import { TRAIT_LABELS } from "../../lib/traitLabels";
import { speciesColor } from "../../lib/speciesColor";

interface Props {
  genomeStats: SpeciesGenomeStats | null;
  parentSpeciesId: number | null;
}

/**
 * v0.4.1 — Analisi genetica. Pure observability UI: renders per-trait
 * mean/min/max/internal variability (stdDev), genetic drift since the
 * species split from its parent, and genetic distance from every other
 * currently-alive species. All data comes from
 * World.getSpeciesGenomeStats() (see simulation/evolution/speciesAnalysis.ts) —
 * no simulation rule is touched by this component.
 */
export function SpeciesGenetics({ genomeStats, parentSpeciesId }: Props) {
  if (!genomeStats) {
    return (
      <p className="species-genetics-empty">
        Nessun individuo vivente di questa specie: l&apos;analisi genetica richiede una popolazione attuale.
      </p>
    );
  }

  const traits = Object.entries(genomeStats.genomeStats) as [keyof typeof TRAIT_LABELS, { mean: number; min: number; max: number; stdDev: number }][];

  return (
    <div className="species-genetics">
      {genomeStats.distanceFromParentOrigin !== null && (
        <div className="species-fact">
          <dt>Deriva dalla specie madre {parentSpeciesId !== null ? `(#${parentSpeciesId})` : ""}</dt>
          <dd>{genomeStats.distanceFromParentOrigin.toFixed(3)}</dd>
        </div>
      )}

      <ul className="trait-bars">
        {traits.map(([trait, s]) => (
          <TraitBar key={trait} label={TRAIT_LABELS[trait]} stats={s} />
        ))}
      </ul>

      {genomeStats.distanceFromOtherSpecies.length > 0 && (
        <div className="species-distances">
          <h5>Distanza genetica dalle altre specie</h5>
          <ul>
            {genomeStats.distanceFromOtherSpecies.map((d) => (
              <li key={d.speciesId}>
                <span className="species-swatch" style={{ background: speciesColor(d.speciesId) }} aria-hidden="true" />
                <span>#{d.speciesId}</span>
                <span className="distance-value">{d.distance.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TraitBar({ label, stats }: { label: string; stats: { mean: number; min: number; max: number; stdDev: number } }) {
  // Traits have very different natural scales (e.g. lifespan 50-2000 vs
  // fertility 0.05-1.0), so the bar shows min/mean/max as raw numbers
  // rather than trying to normalize into a shared visual scale.
  return (
    <li className="trait-bar">
      <div className="trait-bar-header">
        <span>{label}</span>
        <span className="trait-bar-mean">{stats.mean.toFixed(2)}</span>
      </div>
      <div className="trait-bar-range">
        <span>{stats.min.toFixed(2)}</span>
        <span className="trait-bar-stddev">σ {stats.stdDev.toFixed(2)}</span>
        <span>{stats.max.toFixed(2)}</span>
      </div>
    </li>
  );
}
