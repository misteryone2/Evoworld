"use client";

import type { SimulationSpeed } from "../../types";

const SPEEDS: SimulationSpeed[] = [1, 10, 100, 1000];

interface Props {
  speed: SimulationSpeed;
  onSetSpeed: (speed: SimulationSpeed) => void;
  onTogglePause: () => void;
  onReset: () => void;
}

export function Controls({ speed, onSetSpeed, onTogglePause, onReset }: Props) {
  const paused = speed === 0;

  return (
    <div className="controls">
      <button className="btn btn-primary" onClick={onTogglePause} aria-pressed={paused}>
        {paused ? "▶ Play" : "⏸ Pausa"}
      </button>

      <div className="speed-group" role="group" aria-label="Velocità di simulazione">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn btn-speed ${!paused && speed === s ? "active" : ""}`}
            onClick={() => onSetSpeed(s)}
          >
            x{s}
          </button>
        ))}
      </div>

      <button className="btn btn-danger" onClick={onReset}>
        ↺ Reset
      </button>
    </div>
  );
}
