"use client";

import { useEffect, useState } from "react";
import { useMultiverse } from "../lib/useMultiverse";
import { useQuality } from "../lib/useQuality";
import { useViewport } from "../lib/useViewport";
import { Planet3DView, type CameraMode } from "../components/simulation/Planet3DView";
import { CameraModeBar } from "../components/ui/CameraModeBar";
import { nearestOrganismId, randomOrganismId, stepOrganismId } from "../lib/followTarget";
import { PlanetCanvas } from "../components/simulation/PlanetCanvas";
import { QualitySelector } from "../components/ui/QualitySelector";
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
    setPerformance,
  } = useMultiverse();
  // v1.6.0 — Modalità leggera: how much to draw and report, from the device
  // (or the person's choice). In automatic mode it also eases off by itself
  // if the 3D view turns out to be too slow.
  const quality = useQuality();
  const { workerFrameIntervalMs, speciesStatsIntervalMs } = quality.profile;
  useEffect(() => {
    setPerformance(workerFrameIntervalMs, speciesStatsIntervalMs);
  }, [setPerformance, workerFrameIntervalMs, speciesStatsIntervalMs]);
  const defaultWorldSize = quality.profile.defaultWorldSize;
  const [view, setView] = useState<ViewMode>("planet");
  const [selectedOrganismId, setSelectedOrganismId] = useState<number | null>(null);
  // v1.7.0 — vista dall'alto o terza persona sull'animale selezionato (solo con il rendering 3D).
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
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
  // In terza persona il pannello non si apre da solo a ogni cambio di animale: coprirebbe la vista.
  useEffect(() => {
    if (isMobileLayout && selectedOrganismId !== null && cameraMode === "orbit") {
      setSheetOpen(true);
    }
  }, [isMobileLayout, selectedOrganismId, cameraMode]);

  // v1.7.0 — la terza persona esiste solo con un animale selezionato e con il rendering 3D.
  const canFollow = quality.profile.renderer !== "canvas2d";
  useEffect(() => {
    if (cameraMode === "follow" && (selectedOrganismId === null || !canFollow)) setCameraMode("orbit");
  }, [cameraMode, selectedOrganismId, canFollow]);
  useEffect(() => {
    setCameraMode("orbit");
  }, [activePlanet?.id]);

  const changeCameraMode = (mode: CameraMode) => {
    if (mode === "orbit") {
      setCameraMode("orbit");
      return;
    }
    // Entrando in terza persona senza un animale scelto, se ne sceglie uno a caso.
    let id = selectedOrganismId;
    if (id === null && activePlanet?.frame) id = randomOrganismId(activePlanet.frame);
    if (id === null) return;
    setSelectedOrganismId(id);
    setCameraMode("follow");
  };

  if (!started) {
    return (
      <StartScreen
        onNewWorld={(options) => {
          spawnPlanet({ width: defaultWorldSize, height: defaultWorldSize, ...options });
          setStarted(true);
        }}
        defaultWorldSize={defaultWorldSize}
        qualitySelector={
          <QualitySelector
            preference={quality.preference}
            level={quality.level}
            detectedLevel={quality.detectedLevel}
            hasWebGL2={quality.hasWebGL2}
            onChange={quality.setPreference}
          />
        }
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
        <QualitySelector
          preference={quality.preference}
          level={quality.level}
          detectedLevel={quality.detectedLevel}
          hasWebGL2={quality.hasWebGL2}
          onChange={quality.setPreference}
        />
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
        onAdd={() => spawnPlanet({ width: defaultWorldSize, height: defaultWorldSize })}
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
            {!quality.ready ? (
              <p className="loading">Rilevamento del dispositivo…</p>
            ) : quality.profile.renderer === "canvas2d" ? (
              <PlanetCanvas
                frame={activePlanet?.frame ?? null}
                viewportFrame={activePlanet?.viewportFrame ?? null}
                onRequestViewport={activePlanet ? (request) => requestViewport(activePlanet.id, request) : undefined}
                terrainSize={Math.min(256, quality.profile.terrainMaxWidth)}
                terrainRefreshMs={quality.profile.terrainRefreshMs}
                maxCreatures={quality.profile.maxCreatures}
                selectedOrganismId={selectedOrganismId}
                onSelectOrganism={setSelectedOrganismId}
              />
            ) : (
              <Planet3DView
                key={quality.level}
                frame={activePlanet?.frame ?? null}
                viewportFrame={activePlanet?.viewportFrame ?? null}
                onRequestViewport={activePlanet ? (request) => requestViewport(activePlanet.id, request) : undefined}
                selectedOrganismId={selectedOrganismId}
                onSelectOrganism={setSelectedOrganismId}
                quality={quality.profile}
                onSlow={quality.reportSlow}
                cameraMode={cameraMode}
              />
            )}
            {quality.ready && quality.profile.renderer !== "canvas2d" && activePlanet && (
              <CameraModeBar
                mode={cameraMode}
                onChangeMode={changeCameraMode}
                onStep={(step) => {
                  const next = activePlanet.frame ? stepOrganismId(activePlanet.frame, selectedOrganismId, step) : null;
                  if (next !== null) setSelectedOrganismId(next);
                }}
                onNearest={() => {
                  const f = activePlanet.frame;
                  if (!f) return;
                  const i = selectedOrganismId === null ? -1 : Array.prototype.indexOf.call(f.organismsId, selectedOrganismId);
                  const next = i >= 0 ? nearestOrganismId(f, f.organismsX[i], f.organismsY[i], selectedOrganismId) : randomOrganismId(f);
                  if (next !== null) setSelectedOrganismId(next);
                }}
              />
            )}
            {activePlanet && (
              <Controls
                speed={activePlanet.speed}
                onSetSpeed={(s) => setSpeed(activePlanet.id, s)}
                onTogglePause={() => togglePause(activePlanet.id)}
                onReset={() => resetPlanet(activePlanet.id)}
              />
            )}
            <SpeciesPanel key={activePlanet?.id ?? "none"} frame={activePlanet?.frame ?? null} portrait3D={quality.profile.portrait3D} />
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
