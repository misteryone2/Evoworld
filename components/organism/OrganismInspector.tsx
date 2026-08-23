"use client";

import type { Organism } from "../../types";
import { TRAIT_LABELS } from "../../lib/traitLabels";
import { speciesColor } from "../../lib/speciesColor";

interface Props {
  organismId: number | null;
  organism: Organism | null;
  loading: boolean;
  onClose: () => void;
}

/**
 * v1.0.4 — Esplorazione individuale. Shows full detail for one specific
 * organism selected in the 3D view (see Planet3DView's raycasting): its
 * genome (all 13 traits), whether it has an evolved brain, what it
 * currently remembers (v0.5), age/energy, and position. Fetched on demand
 * via useMultiverse.requestOrganismDetail — RenderFrame only carries the
 * handful of visual traits needed to draw a creature, not its full
 * genome/brain/memory, to keep per-frame bandwidth small regardless of
 * population size.
 */
export function OrganismInspector({ organismId, organism, loading, onClose }: Props) {
  if (organismId === null) {
    return (
      <div className="organism-inspector organism-inspector-empty">
        <p>Tocca una creatura nel mondo 3D per osservarla da vicino.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="organism-inspector">
        <p className="organism-inspector-loading">Caricamento organismo #{organismId}…</p>
      </div>
    );
  }

  if (!organism) {
    return (
      <div className="organism-inspector">
        <p className="organism-inspector-loading">
          L&apos;organismo #{organismId} non è più presente (morto o fuori dalla simulazione).
        </p>
        <button type="button" className="btn" onClick={onClose}>
          Chiudi
        </button>
      </div>
    );
  }

  return (
    <div className="organism-inspector">
      <div className="organism-inspector-header">
        <span className="species-swatch large" style={{ background: speciesColor(organism.speciesId) }} aria-hidden="true" />
        <h3>Organismo #{organism.id}</h3>
        <span className="organism-species-tag">specie #{organism.speciesId}</span>
        <button type="button" className="organism-inspector-close" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </div>

      <dl className="species-facts">
        <div className="species-fact">
          <dt>Posizione</dt>
          <dd>
            x={organism.position.x.toFixed(1)}, y={organism.position.y.toFixed(1)}
          </dd>
        </div>
        <div className="species-fact">
          <dt>Età</dt>
          <dd>
            {organism.age.toLocaleString("it-IT")} tick (max {Math.round(organism.genome.lifespan).toLocaleString("it-IT")})
          </dd>
        </div>
        <div className="species-fact">
          <dt>Energia</dt>
          <dd>{organism.energy.toFixed(1)}</dd>
        </div>
        <div className="species-fact">
          <dt>Memoria attuale</dt>
          <dd>
            {organism.memory
              ? organism.memory.kind === "food"
                ? `punto di foraggiamento (tick ${organism.memory.tick.toLocaleString("it-IT")})`
                : `pericolo scampato (tick ${organism.memory.tick.toLocaleString("it-IT")})`
              : "nessuna"}
          </dd>
        </div>
        <div className="species-fact">
          <dt>Cervello evoluto</dt>
          <dd>{organism.brain.length.toLocaleString("it-IT")} pesi (v0.8)</dd>
        </div>
      </dl>

      <h4>Genoma individuale</h4>
      <ul className="genome-list">
        {(Object.keys(TRAIT_LABELS) as Array<keyof typeof TRAIT_LABELS>).map((trait) => (
          <li key={trait}>
            <span>{TRAIT_LABELS[trait]}</span>
            <span>{organism.genome[trait].toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
