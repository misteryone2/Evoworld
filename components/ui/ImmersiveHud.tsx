"use client";

import type { SimulationStats } from "../../types";

interface Props {
  stats: SimulationStats | null;
  paused: boolean;
  onTogglePause: () => void;
  onExit: () => void;
  /** C'è un animale selezionato: si può aprire il pannello dei suoi dati. */
  canShowDetails: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * v1.9.0 — Schermo intero. Solo ciò che serve a guardare il mondo: anno e stagione,
 * popolazione e specie, pausa e uscita. I dati di un animale stanno in un pannello a
 * scomparsa che compare solo quando un animale è selezionato.
 */
export function ImmersiveHud({ stats, paused, onTogglePause, onExit, canShowDetails, detailsOpen, onToggleDetails }: Props) {
  return (
    <div className="immersive-hud">
      <div className="immersive-hud-info" aria-live="off">
        {stats ? (
          <>
            <span>Anno {stats.year}</span>
            <span>{capitalize(stats.season)}</span>
            <span>{stats.population} animali</span>
            <span>{stats.speciesAlive} specie</span>
          </>
        ) : (
          <span>Avvio del mondo…</span>
        )}
      </div>
      <div className="immersive-hud-actions">
        {canShowDetails && (
          <button type="button" className={`btn${detailsOpen ? " btn-primary" : ""}`} aria-pressed={detailsOpen} onClick={onToggleDetails}>
            ℹ Dati animale
          </button>
        )}
        <button type="button" className="btn" onClick={onTogglePause} aria-pressed={paused} aria-label={paused ? "Riprendi la simulazione" : "Metti in pausa"}>
          {paused ? "▶" : "⏸"}
        </button>
        <button type="button" className="btn" onClick={onExit} aria-label="Esci dallo schermo intero">
          ✕
        </button>
      </div>
    </div>
  );
}
