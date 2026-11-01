"use client";

import type { SpeciesGenomeStats, TerrainType } from "../../types";
import { TERRAIN_LABELS } from "../../lib/terrainLabels";
import { terrainColorCSS } from "../../lib/terrainColor";
import { TERRAIN_CODE } from "../../simulation/core/renderFrame";

interface Props {
  genomeStats: SpeciesGenomeStats | null;
}

/**
 * v1.4.0 — Adattamento ai biomi. Shows where a living species actually
 * lives (share of individuals per biome), the climate niche its genomes
 * prefer, and how well they fit the places they occupy right now. All of
 * it is derived from SpeciesGenomeStats — pure observability, no
 * simulation rule is touched by this component.
 */
export function SpeciesHabitat({ genomeStats }: Props) {
  const habitat = genomeStats?.habitat;
  if (!genomeStats || !habitat) {
    return <p className="species-habitat-empty">Nessun individuo vivente: l&apos;habitat si calcola sulla popolazione attuale.</p>;
  }

  const g = genomeStats.genomeStats;
  const shares = (Object.entries(habitat.biomeShares) as [TerrainType, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="species-habitat">
      <dl className="species-facts">
        <div className="species-fact">
          <dt>Bioma dominante</dt>
          <dd>
            {TERRAIN_LABELS[habitat.dominantBiome]} ({Math.round((habitat.biomeShares[habitat.dominantBiome] ?? 0) * 100)}%)
          </dd>
        </div>
        <div className="species-fact">
          <dt>Adattamento al luogo</dt>
          <dd>{habitat.meanFitness.toFixed(2)}</dd>
        </div>
        <div className="species-fact">
          <dt>Temperatura preferita</dt>
          <dd>
            {g.preferredTemperature.mean.toFixed(1)} ± {g.temperatureTolerance.mean.toFixed(1)}
          </dd>
        </div>
        <div className="species-fact">
          <dt>Umidità preferita</dt>
          <dd>
            {g.preferredWater.mean.toFixed(2)} ± {g.waterTolerance.mean.toFixed(2)}
          </dd>
        </div>
      </dl>

      <ul className="habitat-shares">
        {shares.map(([biome, share]) => (
          <li key={biome} className="habitat-share">
            <span className="habitat-share-label">{TERRAIN_LABELS[biome]}</span>
            <span className="habitat-share-track">
              <span
                className="habitat-share-fill"
                style={{ width: `${Math.max(2, share * 100)}%`, background: terrainColorCSS(TERRAIN_CODE[biome] ?? 1, 0.6) }}
              />
            </span>
            <span className="habitat-share-value">{Math.round(share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
