"use client";

import { useSimulation } from "../lib/useSimulation";
import { Planet3DView } from "../components/simulation/Planet3DView";
import { Controls } from "../components/ui/Controls";
import { StatsPanel } from "../components/ui/StatsPanel";
import { SpeciesPanel } from "../components/species/SpeciesPanel";

export default function Home() {
  const { frame, speed, setSpeed, togglePause, reset, ready } = useSimulation();

  return (
    <main className="page">
      <header className="page-header">
        <h1>EvoWorld</h1>
        <p className="tagline">Crea le regole. Avvia la simulazione. Osserva l&apos;evoluzione.</p>
      </header>

      <section className="workspace">
        <div className="canvas-column">
          <Planet3DView frame={frame} />
          <Controls speed={speed} onSetSpeed={setSpeed} onTogglePause={togglePause} onReset={() => reset()} />
          <SpeciesPanel frame={frame} />
        </div>

        <aside className="sidebar">
          <StatsPanel stats={frame?.stats ?? null} />
          {!ready && <p className="loading">Avvio del motore di simulazione…</p>}
        </aside>
      </section>
    </main>
  );
}
