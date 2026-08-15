"use client";

import { useState } from "react";
import { useMultiverse } from "../lib/useMultiverse";
import { Planet3DView } from "../components/simulation/Planet3DView";
import { Controls } from "../components/ui/Controls";
import { StatsPanel } from "../components/ui/StatsPanel";
import { SpeciesPanel } from "../components/species/SpeciesPanel";
import { PlanetSelector } from "../components/multiverse/PlanetSelector";
import { PlanetComparison } from "../components/multiverse/PlanetComparison";
import { SaveLoadPanel } from "../components/persistence/SaveLoadPanel";

type ViewMode = "planet" | "confronto" | "salvataggi";

export default function Home() {
  const {
    planets,
    activeId,
    setActiveId,
    spawnPlanet,
    removePlanet,
    setSpeed,
    togglePause,
    resetPlanet,
    saveSession,
    loadSession,
  } = useMultiverse();
  const [view, setView] = useState<ViewMode>("planet");

  const activePlanet = planets.find((p) => p.id === activeId) ?? null;

  return (
    <main className="page">
      <header className="page-header">
        <h1>EvoWorld</h1>
        <p className="tagline">Crea le regole. Avvia la simulazione. Osserva l&apos;evoluzione.</p>
      </header>

      <div className="view-toggle" role="tablist" aria-label="Modalità di visualizzazione">
        <button
          type="button"
          role="tab"
          aria-selected={view === "planet"}
          className={`view-toggle-btn${view === "planet" ? " active" : ""}`}
          onClick={() => setView("planet")}
        >
          Vista pianeta
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "confronto"}
          className={`view-toggle-btn${view === "confronto" ? " active" : ""}`}
          onClick={() => setView("confronto")}
        >
          Confronto pianeti
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "salvataggi"}
          className={`view-toggle-btn${view === "salvataggi" ? " active" : ""}`}
          onClick={() => setView("salvataggi")}
        >
          Salvataggi
        </button>
      </div>

      <PlanetSelector
        planets={planets}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={() => spawnPlanet()}
        onRemove={removePlanet}
      />

      {view === "confronto" && <PlanetComparison planets={planets} />}

      {view === "salvataggi" && <SaveLoadPanel onSave={saveSession} onLoad={loadSession} />}

      {view === "planet" && (
        <section className="workspace">
          <div className="canvas-column">
            <Planet3DView frame={activePlanet?.frame ?? null} />
            {activePlanet && (
              <Controls
                speed={activePlanet.speed}
                onSetSpeed={(s) => setSpeed(activePlanet.id, s)}
                onTogglePause={() => togglePause(activePlanet.id)}
                onReset={() => resetPlanet(activePlanet.id)}
              />
            )}
            <SpeciesPanel frame={activePlanet?.frame ?? null} />
          </div>

          <aside className="sidebar">
            <StatsPanel stats={activePlanet?.frame?.stats ?? null} />
            {!activePlanet?.ready && <p className="loading">Avvio del motore di simulazione…</p>}
          </aside>
        </section>
      )}
    </main>
  );
}
