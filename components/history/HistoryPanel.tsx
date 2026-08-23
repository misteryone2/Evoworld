"use client";

import type { HistoryPoint } from "../../types";
import { LineChart } from "./LineChart";

interface Props {
  history: HistoryPoint[];
}

/**
 * v1.0.3 — Osservazione storica. Charts built entirely from HistoryPoint
 * samples accumulated client-side (see useMultiverse.ts) from data every
 * RenderFrame already carries — no new engine computation. Shows
 * population, living species count, biodiversity (Shannon index),
 * evolved-trait averages (carnivory, size), and average vegetation as a
 * proxy for overall planetary "climate" health (the engine doesn't track
 * a single aggregate climate number, only per-cell values, so this is the
 * closest honest equivalent derivable client-side).
 */
export function HistoryPanel({ history }: Props) {
  if (history.length === 0) {
    return <p className="history-empty">Ancora nessun dato storico per questo pianeta.</p>;
  }

  const population = history.map((h) => h.population);
  const speciesAlive = history.map((h) => h.speciesAlive);
  const biodiversity = history.map((h) => h.biodiversity);
  const avgCarnivory = history.map((h) => h.avgCarnivory);
  const avgSize = history.map((h) => h.avgSize);
  const avgVegetation = history.map((h) => h.avgVegetation);

  const first = history[0];
  const last = history[history.length - 1];

  return (
    <div className="history-panel">
      <p className="history-range">
        Dall&apos;anno {first.year} (tick {first.tick.toLocaleString("it-IT")}) all&apos;anno {last.year} (tick{" "}
        {last.tick.toLocaleString("it-IT")}) — {history.length} campioni
      </p>
      <div className="history-grid">
        <LineChart title="Popolazione" values={population} color="var(--signal)" formatValue={(v) => Math.round(v).toLocaleString("it-IT")} />
        <LineChart title="Specie viventi" values={speciesAlive} color="var(--amber)" formatValue={(v) => String(Math.round(v))} />
        <LineChart title="Biodiversità (Shannon)" values={biodiversity} color="var(--signal)" />
        <LineChart title="Carnivoria media" values={avgCarnivory} color="#ff8a65" />
        <LineChart title="Dimensione media" values={avgSize} color="var(--amber)" />
        <LineChart title="Vegetazione media (clima)" values={avgVegetation} color="#7ec4a8" />
      </div>
    </div>
  );
}
