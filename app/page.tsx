"use client";

import { useEffect, useState } from "react";
import { useMultiverse } from "../lib/useMultiverse";
import { useViewport } from "../lib/useViewport";
import { Planet3DView } from "../components/simulation/Planet3DView";
import { Controls } from "../components/ui/Controls";
import { StatsPanel } from "../components/ui/StatsPanel";
import { SpeciesPanel } from "../components/species/SpeciesPanel";
import { PlanetSelector } from "../components/multiverse/PlanetSelector";
import { PlanetComparison } from "../components/multiverse/PlanetComparison";
import { SaveLoadPanel } from "../components/persistence/SaveLoadPanel";
import { HistoryPanel } from "../components/history/HistoryPanel";
import { EventTimeline } from "../components/history/EventTimeline";
import { OrganismInspector } from "../components/organism/OrganismInspector";
import { StartScreen } from "../components/start/StartScreen";
import type { Organism, SavedSession } from "../types";

type ViewMode = "planet" | "confronto" | "salvataggi" | "storico";

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
    recoverPlanet,
    saveSession,
    loadSession,
    requestOrganismDetail,
    requestViewport,
  } = useMultiverse();
  const [view, setView] = useState<ViewMode>("planet");
  const [selectedOrganismId, setSelectedOrganismId] = useState<number | null>(null);
  const [selectedOrganism, setSelectedOrganism] = useState<Organism | null>(null);
  const [organismLoading, setOrganismLoading] = useState(false);
  // v1.0.5 — the start screen is shown until the person explicitly chooses
  // a new world or a saved session to resume; nothing spawns automatically.
  const [started, setStarted] = useState(false);

  // v1.0.6 — on narrow screens the inspector/stats sidebar becomes a
  // slide-up bottom sheet instead of a column stacked under a tall square
  // 3D canvas, so it stays reachable with a thumb without endless scrolling.
  const viewport = useViewport();
  const isMobileLayout = viewport.breakpoint === "mobile";
  const [sheetOpen, setSheetOpen] = useState(false);

  const activePlanet = planets.find((p) => p.id === activeId) ?? null;

  // v1.0.4 — whenever the selection changes (or the active planet
  // changes), fetch full detail for the selected organism. Re-fetches on
  // every new frame while a selection is active too, so the inspector
  // shows live-updating energy/age/position rather than a stale snapshot.
  useEffect(() => {
    if (selectedOrganismId === null || !activePlanet) {
      setSelectedOrganism(null);
      return;
    }
    let cancelled = false;
    setOrganismLoading(true);
    requestOrganismDetail(activePlanet.id, selectedOrganismId)
      .then((organism) => {
        if (!cancelled) setSelectedOrganism(organism);
      })
      .catch(() => {
        if (!cancelled) setSelectedOrganism(null);
      })
      .finally(() => {
        if (!cancelled) setOrganismLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-runs on every new frame (activePlanet.frame reference changes each
    // tick) so the inspector stays live while a creature is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganismId, activePlanet?.id, activePlanet?.frame]);

  // v1.0.6 — selecting a creature on mobile should reveal the inspector
  // automatically, since it lives in a closed-by-default bottom sheet there.
  useEffect(() => {
    if (isMobileLayout && selectedOrganismId !== null) {
      setSheetOpen(true);
    }
  }, [isMobileLayout, selectedOrganismId]);

  if (!started) {
    return (
      <StartScreen
        onNewWorld={(options) => {
          spawnPlanet(options);
          setStarted(true);
        }}
        onContinue={(session: SavedSession) => {
          loadSession(session);
          setStarted(true);
        }}
      />
    );
  }

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
        <button
          type="button"
          role="tab"
          aria-selected={view === "storico"}
          className={`view-toggle-btn${view === "storico" ? " active" : ""}`}
          onClick={() => setView("storico")}
        >
          Storico
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

      {view === "storico" && (
        <div className="history-view">
          <HistoryPanel history={activePlanet?.history ?? []} />
          <div className="history-timeline-section">
            <h3>Cronologia eventi</h3>
            <EventTimeline speciesTree={activePlanet?.frame?.speciesTree ?? []} />
          </div>
        </div>
      )}

      {view === "planet" && (
        <section className="workspace">
          <div className="canvas-column">
            {activePlanet?.error && (
              <div className="worker-error-banner">
                <span>
                  Il pianeta &quot;{activePlanet.name}&quot; ha smesso di rispondere: {activePlanet.error}
                </span>
                <button type="button" className="btn btn-primary" onClick={() => recoverPlanet(activePlanet.id)}>
                  Riavvia pianeta (stesso seed, da zero)
                </button>
              </div>
            )}
            <Planet3DView
              frame={activePlanet?.frame ?? null}
              viewportFrame={activePlanet?.viewportFrame ?? null}
              onRequestViewport={activePlanet ? (request) => requestViewport(activePlanet.id, request) : undefined}
              selectedOrganismId={selectedOrganismId}
              onSelectOrganism={setSelectedOrganismId}
            />
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

          {isMobileLayout ? (
            <>
              <button
                type="button"
                className="mobile-sheet-toggle"
                aria-expanded={sheetOpen}
                aria-controls="mobile-sidebar-sheet"
                onClick={() => setSheetOpen((open) => !open)}
              >
                📊 Statistiche e specie {sheetOpen ? "▾" : "▴"}
              </button>
              {sheetOpen && (
                <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
              )}
              <aside
                id="mobile-sidebar-sheet"
                className={`sidebar mobile-sheet${sheetOpen ? " open" : ""}`}
              >
                <div className="sheet-handle" aria-hidden="true" />
                <OrganismInspector
                  organismId={selectedOrganismId}
                  organism={selectedOrganism}
                  loading={organismLoading}
                  onClose={() => setSelectedOrganismId(null)}
                />
                <StatsPanel stats={activePlanet?.frame?.stats ?? null} />
                {!activePlanet?.ready && <p className="loading">Avvio del motore di simulazione…</p>}
              </aside>
            </>
          ) : (
            <aside className="sidebar">
              <OrganismInspector
                organismId={selectedOrganismId}
                organism={selectedOrganism}
                loading={organismLoading}
                onClose={() => setSelectedOrganismId(null)}
              />
              <StatsPanel stats={activePlanet?.frame?.stats ?? null} />
              {!activePlanet?.ready && <p className="loading">Avvio del motore di simulazione…</p>}
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
