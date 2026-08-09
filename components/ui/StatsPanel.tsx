"use client";

import type { SimulationStats } from "../../types";

interface Props {
  stats: SimulationStats | null;
}

const TRAIT_LABELS: Record<string, string> = {
  size: "Dimensione",
  speed: "Velocità",
  metabolism: "Metabolismo",
  vision: "Vista",
  fertility: "Fertilità",
  lifespan: "Longevità",
};

const SEASON_ICONS: Record<string, string> = {
  primavera: "🌱",
  estate: "☀️",
  autunno: "🍂",
  inverno: "❄️",
};

export function StatsPanel({ stats }: Props) {
  if (!stats) {
    return <div className="stats-panel">Inizializzazione del mondo…</div>;
  }

  return (
    <div className="stats-panel">
      <div className="season-badge">
        <span>{SEASON_ICONS[stats.season]}</span>
        <span>{capitalize(stats.season)}</span>
      </div>

      <div className="stats-grid">
        <Stat label="Anno simulato" value={stats.year.toLocaleString("it-IT")} />
        <Stat label="Popolazione" value={stats.population.toLocaleString("it-IT")} />
        <Stat label="Specie viventi" value={String(stats.speciesAlive)} />
        <Stat label="Specie totali create" value={String(stats.speciesTotalEver)} />
        <Stat label="Specie estinte" value={String(stats.speciesExtinct)} />
        <Stat label="Nascite (ultimo tick)" value={String(stats.births)} />
        <Stat label="Morti (ultimo tick)" value={String(stats.deaths)} />
      </div>

      {stats.averageGenome && (
        <div className="genome-section">
          <h3>Genoma medio della popolazione</h3>
          <ul className="genome-list">
            {Object.entries(stats.averageGenome).map(([trait, value]) => (
              <li key={trait}>
                <span>{TRAIT_LABELS[trait] ?? trait}</span>
                <span>{(value as number).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.population === 0 && (
        <p className="extinction-notice">La popolazione si è estinta. Premi Reset per iniziare un nuovo mondo.</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
