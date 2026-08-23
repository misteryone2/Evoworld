"use client";

import { useEffect, useState } from "react";
import type { SavedSession, SavedSessionSummary } from "../../types";
import { listSessions, loadSession as loadSessionFromDb, deleteSession } from "../../lib/persistence";

interface NewWorldOptions {
  seed?: number;
  width?: number;
  height?: number;
  population?: number;
}

interface Props {
  onNewWorld: (options?: NewWorldOptions) => void;
  onContinue: (session: SavedSession) => void;
}

const SIZE_PRESETS = {
  small: { label: "Piccolo", width: 60, height: 60 },
  medium: { label: "Medio", width: 100, height: 100 },
  large: { label: "Grande", width: 150, height: 150 },
} as const;

const POPULATION_PRESETS = {
  sparse: { label: "Scarsa", population: 80 },
  normal: { label: "Normale", population: 150 },
  abundant: { label: "Abbondante", population: 300 },
} as const;

type SizeKey = keyof typeof SIZE_PRESETS;
type PopulationKey = keyof typeof POPULATION_PRESETS;

/**
 * v1.0.5 — Schermata iniziale. Two paths: start a new world, or resume a
 * previously saved session (v1.0.1). A new world defaults to "Genera
 * pianeta casuale" — one tap, a random seed, no parameters exposed at
 * all — matching the requirement that a fully hands-off mode must exist
 * where the person doesn't control the planet's starting conditions and
 * evolution is left entirely to determine what happens. "Personalizza"
 * only ever exposes parameters the engine already accepts as-is (seed,
 * world size, initial population) — nothing here biases climate, biomes,
 * or genome traits, which would cross into "modificare artificialmente
 * l'evoluzione" territory the project explicitly avoids.
 */
export function StartScreen({ onNewWorld, onContinue }: Props) {
  const [customizing, setCustomizing] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [sizeKey, setSizeKey] = useState<SizeKey>("medium");
  const [populationKey, setPopulationKey] = useState<PopulationKey>("normal");

  const [sessions, setSessions] = useState<SavedSessionSummary[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setSessionsError("Impossibile leggere i salvataggi su questo dispositivo."));
  }, []);

  const handleRandom = () => onNewWorld();

  const handleCustomCreate = () => {
    const size = SIZE_PRESETS[sizeKey];
    const population = POPULATION_PRESETS[populationKey].population;
    const parsedSeed = seedInput.trim() === "" ? undefined : Number(seedInput.trim());
    onNewWorld({
      seed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      width: size.width,
      height: size.height,
      population,
    });
  };

  const handleLoad = async (id: string) => {
    setBusy(true);
    setSessionsError(null);
    try {
      const session = await loadSessionFromDb(id);
      if (!session) {
        setSessionsError("Questo salvataggio non è più disponibile.");
        return;
      }
      onContinue(session);
    } catch {
      setSessionsError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteSession(id);
      setSessions(await listSessions());
    } catch {
      setSessionsError("Eliminazione non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="start-screen">
      <div className="start-screen-inner">
        <h1>EvoWorld</h1>
        <p className="tagline">Crea le regole. Avvia la simulazione. Osserva l&apos;evoluzione.</p>

        <section className="start-section">
          <h2>Nuovo mondo</h2>
          <button type="button" className="btn btn-primary start-random-btn" onClick={handleRandom}>
            Genera pianeta casuale
          </button>
          <p className="start-hint">
            Un click, un seed casuale, nessun parametro da impostare: le condizioni del pianeta e tutto ciò che
            accadrà restano interamente nelle mani dell&apos;evoluzione.
          </p>

          <button type="button" className="start-customize-toggle" onClick={() => setCustomizing((v) => !v)}>
            {customizing ? "Nascondi parametri ▲" : "Personalizza parametri ▾"}
          </button>

          {customizing && (
            <div className="start-customize-form">
              <label className="start-field">
                <span>Seed (opzionale — vuoto = casuale)</span>
                <input
                  type="number"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="es. 42"
                />
              </label>

              <label className="start-field">
                <span>Dimensione del pianeta</span>
                <select value={sizeKey} onChange={(e) => setSizeKey(e.target.value as SizeKey)}>
                  {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label} ({preset.width}×{preset.height})
                    </option>
                  ))}
                </select>
              </label>

              <label className="start-field">
                <span>Popolazione iniziale</span>
                <select value={populationKey} onChange={(e) => setPopulationKey(e.target.value as PopulationKey)}>
                  {Object.entries(POPULATION_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label} ({preset.population})
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="btn btn-primary" onClick={handleCustomCreate}>
                Crea mondo
              </button>
            </div>
          )}
        </section>

        <section className="start-section">
          <h2>Continua</h2>
          {sessionsError && <p className="save-error">{sessionsError}</p>}
          {sessions.length === 0 ? (
            <p className="start-hint">Nessuna simulazione salvata su questo dispositivo.</p>
          ) : (
            <ul className="save-list">
              {sessions.map((s) => (
                <li key={s.id} className="save-item">
                  <div className="save-item-info">
                    <span className="save-item-label">{s.label}</span>
                    <span className="save-item-meta">
                      {s.planetCount} {s.planetCount === 1 ? "pianeta" : "pianeti"} ·{" "}
                      {new Date(s.savedAt).toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="save-item-actions">
                    <button type="button" className="btn" onClick={() => handleLoad(s.id)} disabled={busy}>
                      Continua
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => handleDelete(s.id)} disabled={busy}>
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
