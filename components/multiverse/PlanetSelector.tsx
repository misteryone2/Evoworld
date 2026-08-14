"use client";

import type { PlanetInstance } from "../../types";

interface Props {
  planets: PlanetInstance[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/**
 * Horizontal tab strip for switching between running planets (v0.9). Each
 * tab shows the planet's name, its current population once its first
 * frame arrives, and a small pulse indicator while paused/running.
 * Removing the last remaining planet is not allowed from here — the "×"
 * only appears when there's more than one planet, so the person always
 * has at least one running world.
 */
export function PlanetSelector({ planets, activeId, onSelect, onAdd, onRemove }: Props) {
  return (
    <div className="planet-selector" role="tablist" aria-label="Pianeti simulati">
      {planets.map((planet) => (
        <button
          key={planet.id}
          type="button"
          role="tab"
          aria-selected={planet.id === activeId}
          className={`planet-tab${planet.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(planet.id)}
        >
          <span className="planet-tab-name">{planet.name}</span>
          <span className="planet-tab-pop">
            {planet.frame ? planet.frame.stats.population.toLocaleString("it-IT") : "…"}
          </span>
          {planets.length > 1 && (
            <span
              className="planet-tab-remove"
              role="button"
              tabIndex={0}
              aria-label={`Rimuovi ${planet.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(planet.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onRemove(planet.id);
                }
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
      <button type="button" className="planet-tab-add" onClick={onAdd} aria-label="Aggiungi un nuovo pianeta">
        + Nuovo pianeta
      </button>
    </div>
  );
}
