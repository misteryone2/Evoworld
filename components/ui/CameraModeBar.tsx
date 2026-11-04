"use client";

import type { CameraMode } from "../simulation/Planet3DView";

interface Props {
  mode: CameraMode;
  onChangeMode: (mode: CameraMode) => void;
  /** Animale precedente / successivo nell'ordine del frame. */
  onStep: (step: 1 | -1) => void;
  /** Passa all'animale più vicino a quello seguito. */
  onNearest: () => void;
}

/**
 * v1.7.0 — Terza persona. Scelta tra vista dall'alto e terza persona, e
 * (in terza persona) i pulsanti per passare da un animale all'altro.
 */
export function CameraModeBar({ mode, onChangeMode, onStep, onNearest }: Props) {
  const following = mode === "follow";
  return (
    <div className="camera-bar" role="group" aria-label="Punto di vista">
      <button type="button" className={`btn${!following ? " btn-primary" : ""}`} aria-pressed={!following} onClick={() => onChangeMode("orbit")}>
        🌍 Dall&apos;alto
      </button>
      <button type="button" className={`btn${following ? " btn-primary" : ""}`} aria-pressed={following} onClick={() => onChangeMode("follow")}>
        🐾 Terza persona
      </button>
      {following && (
        <>
          <button type="button" className="btn" onClick={() => onStep(-1)} aria-label="Animale precedente">
            ◀
          </button>
          <button type="button" className="btn" onClick={() => onStep(1)} aria-label="Animale successivo">
            ▶
          </button>
          <button type="button" className="btn" onClick={onNearest}>
            Più vicino
          </button>
          <span className="camera-bar-hint">Trascina per guardarti intorno · tocca un altro animale per seguirlo</span>
        </>
      )}
    </div>
  );
}
