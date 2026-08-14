"use client";

import { useMemo } from "react";
import type { PlanetInstance } from "../../types";
import { shannonDiversityIndex } from "../../lib/biodiversity";

interface Props {
  planets: PlanetInstance[];
}

interface ComparisonRow {
  id: string;
  name: string;
  seed: number;
  year: number | null;
  population: number | null;
  speciesAlive: number | null;
  speciesTotalEver: number | null;
  biodiversity: number | null;
  avgCarnivory: number | null;
  avgSize: number | null;
}

/**
 * Compares all currently running planets side by side (v0.9). Everything
 * here comes from data each planet's RenderFrame already sends every
 * tick — no new engine computation, just aggregation client-side. The
 * biodiversity column uses the Shannon index (lib/biodiversity.ts):
 * unlike a raw species count, it captures whether a planet's population is
 * spread evenly across its species or dominated by one of them.
 */
export function PlanetComparison({ planets }: Props) {
  const rows: ComparisonRow[] = useMemo(
    () =>
      planets.map((p) => {
        const frame = p.frame;
        if (!frame) {
          return {
            id: p.id,
            name: p.name,
            seed: p.seed,
            year: null,
            population: null,
            speciesAlive: null,
            speciesTotalEver: null,
            biodiversity: null,
            avgCarnivory: null,
            avgSize: null,
          };
        }
        const populations = frame.speciesGenomeStats.map((s) => s.population);
        return {
          id: p.id,
          name: p.name,
          seed: p.seed,
          year: frame.stats.year,
          population: frame.stats.population,
          speciesAlive: frame.stats.speciesAlive,
          speciesTotalEver: frame.stats.speciesTotalEver,
          biodiversity: shannonDiversityIndex(populations),
          avgCarnivory: frame.stats.averageGenome?.carnivory ?? null,
          avgSize: frame.stats.averageGenome?.size ?? null,
        };
      }),
    [planets],
  );

  if (rows.length === 0) {
    return <p className="comparison-empty">Nessun pianeta attivo.</p>;
  }

  return (
    <div className="planet-comparison">
      <p className="comparison-note">
        Indice di biodiversità: entropia di Shannon sulla distribuzione della popolazione tra le specie viventi (0 =
        una sola specie domina, più alto = popolazione ripartita più uniformemente tra più specie).
      </p>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Pianeta</th>
              <th>Seed</th>
              <th>Anno</th>
              <th>Popolazione</th>
              <th>Specie vive</th>
              <th>Specie totali</th>
              <th>Biodiversità</th>
              <th>Carnivoria media</th>
              <th>Dimensione media</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.seed}</td>
                <td>{row.year !== null ? row.year.toLocaleString("it-IT") : "…"}</td>
                <td>{row.population !== null ? row.population.toLocaleString("it-IT") : "…"}</td>
                <td>{row.speciesAlive ?? "…"}</td>
                <td>{row.speciesTotalEver ?? "…"}</td>
                <td>{row.biodiversity !== null ? row.biodiversity.toFixed(2) : "…"}</td>
                <td>{row.avgCarnivory !== null ? row.avgCarnivory.toFixed(2) : "…"}</td>
                <td>{row.avgSize !== null ? row.avgSize.toFixed(2) : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
