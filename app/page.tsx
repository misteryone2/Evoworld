"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useMultiverse } from "../lib/useMultiverse";
import { useQuality } from "../lib/useQuality";
import { useViewport } from "../lib/useViewport";
import { useThrottledValue } from "../lib/useThrottledValue";
import { ImmersiveHud } from "../components/ui/ImmersiveHud";
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

// v1.9.0 — i pannelli si ridisegnano solo quando cambiano le loro proprietà (con i valori già rallentati sotto),
// non a ogni frame del mondo: col tempo hanno più specie da mostrare e ogni ridisegno costa di più.
const SpeciesPanelMemo = memo(SpeciesPanel);
const StatsPanelMemo = memo(StatsPanel);
const OrganismInspectorMemo = memo(OrganismInspector);
/** Ogni quanto (ms) i pannelli ricevono un nuovo frame. */
const PANEL_REFRESH_MS = 500;
const INSPECTOR_REFRESH_MS = 250;

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
  // v1.10.8 — la vista predefinita è la camera libera: terza persona slegata dagli esseri.
  const [cameraMode, setCameraMode] = useState<CameraMode>("free");
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
  const panelFrame = useThrottledValue(activePlanet?.frame ?? null, PANEL_REFRESH_MS);
  const inspectorFrame = useThrottledValue(activePlanet?.frame ?? null, INSPECTOR_REFRESH_MS);

  // v1.9.0 — schermo intero: il canvas riempie lo schermo, restano un'intestazione minima e, solo con un
  // animale selezionato, un pannello a scomparsa con i suoi dati.
  const [immersive, setImmersive] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  const nativeFullscreen = useRef(false);
  // v1.10.7 — su telefono in verticale mostro l'invito a ruotare (iPhone non consente di bloccare l'orientamento via codice).
  const [rotateHint, setRotateHint] = useState(false);
  const enterImmersive = useCallback(() => {
    setImmersive(true);
    const root = document.documentElement;
    // v1.10.7b — iPhone e iPod: NIENTE fullscreen nativo. Su iOS 16.4+ requestFullscreen esiste e ha
    // successo, ma WebKit in modalità fullscreen nativa non consegna i tocchi sugli elementi sovrapposti
    // (HUD, pulsanti): il gioco si vede ma i pulsanti non rispondono. Si usa lo schermo intero "di pagina"
    // (il pannello fixed inset 0 qui sotto), dove i tocchi funzionano. Android e PC tengono il nativo,
    // e con esso il blocco dell'orientamento in orizzontale.
    const isIphoneLike = /iP(hone|od)/.test(navigator.userAgent);
    if (!isIphoneLike && root.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => {
          nativeFullscreen.current = true;
          // v1.10.7 — telefoni: blocca l'orientamento in orizzontale. Funziona solo in schermo intero nativo
          // (Android e simili); dove non è supportato (iPhone) interviene l'invito a ruotare qui sotto.
          try {
            const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            orientation.lock?.("landscape").catch(() => {});
          } catch {
            /* orientamento non bloccabile: nessun problema */
          }
        })
        .catch(() => {
          // iPhone e alcuni browser non lo permettono: resta lo schermo intero "della pagina".
        });
    }
  }, []);
  const exitImmersive = useCallback(() => {
    setImmersive(false);
    if (document.fullscreenElement) {
      nativeFullscreen.current = false;
      document.exitFullscreen().catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitImmersive();
    };
    const onFullscreenChange = () => {
      // L'utente è uscito dallo schermo intero del browser (per esempio con Esc): si esce anche dalla modalità.
      if (!document.fullscreenElement && nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    // v1.10.7c — iOS, soprattutto nella web-app "Aggiungi a schermo Home": senza queste regole il tocco
    // prolungato seleziona il testo come in una pagina web e i tocchi vengono trattati come selezione
    // invece che come pressioni dei pulsanti. Disattiviamo selezione, callout ed evidenziazione del tocco
    // dentro la modalità immersiva, e forziamo touch-action sui pulsanti.
    const style = document.createElement("style");
    style.textContent = [
      ".canvas-column.immersive, .canvas-column.immersive * {",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "  -webkit-touch-callout: none !important;",
      "  -webkit-tap-highlight-color: transparent;",
      "  touch-action: manipulation;",
      "}",
      ".canvas-column.immersive button { touch-action: manipulation; cursor: pointer; }",
      // v1.10.8b — i pulsanti dell'HUD restano sopra il pannello dati (che altrimenti li copre quando è aperto).
      ".canvas-column.immersive .immersive-hud { position: relative; z-index: 120; }",
    ].join("\n");
    document.head.appendChild(style);
    // v1.10.7 — rileva "telefono in verticale": pointer grosso (touch) + orientamento portrait.
    // Piccolo ritardo per dare il tempo al blocco orizzontale (dove esiste) di agire prima del messaggio.
    const checkOrientation = () => {
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      setRotateHint(touch && portrait);
    };
    const checkOrientationDelayed = () => window.setTimeout(checkOrientation, 600);
    const orientationTimer = checkOrientationDelayed();
    window.addEventListener("resize", checkOrientationDelayed);
    window.addEventListener("orientationchange", checkOrientationDelayed);
    return () => {
      window.clearTimeout(orientationTimer);
      style.remove();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", checkOrientationDelayed);
      window.removeEventListener("orientationchange", checkOrientationDelayed);
    };
  }, [immersive, exitImmersive]);
  useEffect(() => {
    if (selectedOrganismId === null) setDrawerOpen(null);
  }, [selectedOrganismId]);

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
    // Re-runs on every new (throttled) frame so the inspector stays live while a
    // creature is selected, without a worker round-trip for every simulation frame (v1.9.0).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganismId, activePlanet?.id, inspectorFrame]);

  // v1.0.6 — selecting a creature on mobile should reveal the inspector
  // automatically, since it lives in a closed-by-default bottom sheet there.
  // In terza persona il pannello non si apre da solo a ogni cambio di animale: coprirebbe la vista.
  useEffect(() => {
    if (isMobileLayout && selectedOrganismId !== null && cameraMode === "orbit") {
      setSheetOpen(true);
    }
  }, [isMobileLayout, selectedOrganismId, cameraMode]);

  // v1.7.0 — la terza persona legata esiste solo con un animale selezionato e con il rendering 3D.
  const canFollow = quality.profile.renderer !== "canvas2d";
  // v1.10.8 — se l'animale seguito sparisce o non c'è, si torna alla camera libera (non alla vista dall'alto).
  useEffect(() => {
    if (cameraMode === "follow" && (selectedOrganismId === null || !canFollow)) setCameraMode("free");
  }, [cameraMode, selectedOrganismId, canFollow]);
  useEffect(() => {
    setCameraMode("free");
  }, [activePlanet?.id]);

  const changeCameraMode = (mode: CameraMode) => {
    // v1.10.8 — la camera libera non ha bisogno di un animale: si entra e si esce liberamente.
    if (mode === "orbit" || mode === "free") {
      setCameraMode(mode);
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
        // v1.10.7 — il gioco si apre direttamente in schermo intero: il gesto del pulsante della schermata
        // iniziale è quello che i browser chiedono per lo schermo intero nativo (PC e Android). Su iPhone,
        // che non lo consente, enterImmersive degrada da sola allo schermo intero "della pagina".
        onNewWorld={(options) => {
          spawnPlanet({ width: defaultWorldSize, height: defaultWorldSize, ...options });
          setStarted(true);
          enterImmersive();
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
          enterImmersive();
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
          <div className={`canvas-column${immersive ? " immersive" : ""}`}>
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
                onEnterImmersive={immersive ? undefined : enterImmersive}
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
            {immersive && rotateHint && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 60,
                  background: "rgba(0, 0, 0, 0.88)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "#fff",
                  textAlign: "center",
                  padding: 24,
                }}
                role="status"
              >
                <span style={{ fontSize: 44 }} aria-hidden="true">
                  🔄
                </span>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.4 }}>
                  Ruota il telefono: il gioco si gioca in orizzontale
                </p>
              </div>
            )}
            {immersive && activePlanet && (
              <ImmersiveHud
                stats={panelFrame?.stats ?? null}
                paused={activePlanet.speed === 0}
                onTogglePause={() => togglePause(activePlanet.id)}
                onExit={exitImmersive}
                canShowDetails={selectedOrganismId !== null}
                // v1.10.8b — in schermo intero il pannello dati parte sempre CHIUSO: in orizzontale il telefono
                // è largo e il pannello si apriva di default come fiancata laterale fissa, coprendo anche i
                // pulsanti per chiuderlo. Si apre solo col pulsante "ℹ Dati animale".
                detailsOpen={drawerOpen ?? false}
                onToggleDetails={() => setDrawerOpen(!(drawerOpen ?? false))}
              />
            )}
            {!immersive && activePlanet && (
              <Controls
                speed={activePlanet.speed}
                onSetSpeed={(s) => setSpeed(activePlanet.id, s)}
                onTogglePause={() => togglePause(activePlanet.id)}
                onReset={() => resetPlanet(activePlanet.id)}
              />
            )}
            {!immersive && <SpeciesPanelMemo key={activePlanet?.id ?? "none"} frame={panelFrame} portrait3D={quality.profile.portrait3D} />}
          </div>

          {immersive ? (
            selectedOrganismId !== null && (
              <aside className={`immersive-drawer${(drawerOpen ?? !isMobileLayout) ? " open" : ""}`} aria-label="Dati dell'animale selezionato">
                <OrganismInspectorMemo
                  organismId={selectedOrganismId}
                  organism={selectedOrganism}
                  loading={organismLoading}
                  onClose={() => setSelectedOrganismId(null)}
                />
              </aside>
            )
          ) : isMobileLayout ? (
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
                <OrganismInspectorMemo
                  organismId={selectedOrganismId}
                  organism={selectedOrganism}
                  loading={organismLoading}
                  onClose={() => setSelectedOrganismId(null)}
                />
                <StatsPanelMemo stats={panelFrame?.stats ?? null} />
                {!activePlanet?.ready && <p className="loading">Avvio del motore di simulazione…</p>}
              </aside>
            </>
          ) : (
            <aside className="sidebar">
              <OrganismInspectorMemo
                organismId={selectedOrganismId}
                organism={selectedOrganism}
                loading={organismLoading}
                onClose={() => setSelectedOrganismId(null)}
              />
              <StatsPanelMemo stats={panelFrame?.stats ?? null} />
              {!activePlanet?.ready && <p className="loading">Avvio del motore di simulazione…</p>}
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
