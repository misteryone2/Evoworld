"use client";

import type { CameraMode } from "../simulation/Planet3DView";

interface Props {
  mode: CameraMode;
  onChangeMode: (mode: CameraMode) => void;
  /** Animale precedente / successivo nell'ordine del frame. */
  onStep: (step: 1 | -1) => void;
  /** Passa all'animale più vicino a quello seguito. */
  onNearest: () => void;
  /** v1.9.0 — schermo intero: se presente, la barra mostra il pulsante per entrarvi. */
  onEnterImmersive?: () => void;
}

/**
 * v1.7.0 — Terza persona. Scelta tra vista dall'alto e terza persona, e
 * (in terza persona) i pulsanti per passare da un animale all'altro.
 *
 * v1.10.7c — Su iOS (soprattutto nella web-app "Aggiungi a schermo Home") l'evento click
 * non parte sempre in schermo intero: i pulsanti rispondono a pointerdown, che arriva
 * sempre e su ogni dispositivo (mouse incluso). Solo pointerdown, niente click: altrimenti
 * dove il click funziona ogni azione scatterebbe due volte.
 *
 * v1.10.8 — Camera libera: terza persona slegata dagli esseri. Il pulsante "🚶 Libera"
 * osserva un punto qualunque della superficie: trascina per guardarti intorno, tocca il
 * terreno per andarci. I pulsanti di cambio animale restano solo nella terza persona legata.
 */
export function CameraModeBar({ mode, onChangeMode, onStep, onNearest, onEnterImmersive }: Props) {
  const following = mode === "follow";
  const free = mode === "free";
  return (
    <div className="camera-bar" role="group" aria-label="Punto di vista">
      <button
        type="button"
        className={`btn${mode === "orbit" ? " btn-primary" : ""}`}
        aria-pressed={mode === "orbit"}
        onPointerDown={() => onChangeMode("orbit")}
      >
        🌍 Dall&apos;alto
      </button>
      <button
        type="button"
        className={`btn${free ? " btn-primary" : ""}`}
        aria-pressed={free}
        onPointerDown={() => onChangeMode("free")}
      >
        🚶 Libera
      </button>
      <button
        type="button"
        className={`btn${following ? " btn-primary" : ""}`}
        aria-pressed={following}
        onPointerDown={() => onChangeMode("follow")}
      >
        🐾 Terza persona
      </button>
      {onEnterImmersive && (
        <button type="button" className="btn" onPointerDown={onEnterImmersive}>
          ⛶ Schermo intero
        </button>
      )}
      {following && (
        <>
          <button type="button" className="btn" onPointerDown={() => onStep(-1)} aria-label="Animale precedente">
            ◀
          </button>
          <button type="button" className="btn" onPointerDown={() => onStep(1)} aria-label="Animale successivo">
            ▶
          </button>
          <button type="button" className="btn" onPointerDown={onNearest}>
            Più vicino
          </button>
          <span className="camera-bar-hint">Trascina per guardarti intorno · tocca un altro animale per seguirlo</span>
        </>
      )}
      {free && <span className="camera-bar-hint">Trascina per guardarti intorno · tocca il terreno per andarci</span>}
    </div>
  );
}
