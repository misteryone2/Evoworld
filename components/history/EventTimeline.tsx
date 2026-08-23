"use client";

import { useMemo } from "react";
import type { SpeciesRecord } from "../../types";
import { buildEventTimeline } from "../../lib/speciesEvents";
import { speciesColor } from "../../lib/speciesColor";

interface Props {
  speciesTree: SpeciesRecord[];
}

const MAX_EVENTS_SHOWN = 100;

/**
 * v1.0.3 — Osservazione storica. Timeline of speciation and extinction
 * events, built directly from the species registry (every SpeciesRecord
 * has carried originTick/extinctionTick since v0.2.1) — no new engine
 * data needed, this is purely a different view of data that already
 * exists. Most-recent-first, capped to MAX_EVENTS_SHOWN for very long
 * runs with many events.
 */
export function EventTimeline({ speciesTree }: Props) {
  const events = useMemo(() => buildEventTimeline(speciesTree), [speciesTree]);

  if (events.length === 0) {
    return <p className="timeline-empty">Nessun evento ancora registrato.</p>;
  }

  const shown = events.slice(0, MAX_EVENTS_SHOWN);

  return (
    <div className="event-timeline">
      <ul>
        {shown.map((event, i) => (
          <li key={`${event.type}-${event.speciesId}-${event.tick}-${i}`} className={`timeline-item timeline-${event.type}`}>
            <span className="timeline-swatch" style={{ background: speciesColor(event.speciesId) }} aria-hidden="true" />
            <span className="timeline-text">
              {event.type === "origin" ? (
                event.parentSpeciesId !== null ? (
                  <>
                    Specie #{event.speciesId} si separa da #{event.parentSpeciesId}
                  </>
                ) : (
                  <>Specie #{event.speciesId} fondatrice</>
                )
              ) : (
                <>Specie #{event.speciesId} si estingue</>
              )}
            </span>
            <span className="timeline-meta">
              anno {event.year} · tick {event.tick.toLocaleString("it-IT")}
            </span>
          </li>
        ))}
      </ul>
      {events.length > MAX_EVENTS_SHOWN && (
        <p className="timeline-truncated">
          e altri {(events.length - MAX_EVENTS_SHOWN).toLocaleString("it-IT")} eventi precedenti…
        </p>
      )}
    </div>
  );
}
