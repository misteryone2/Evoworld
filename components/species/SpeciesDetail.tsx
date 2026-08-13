"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RenderFrame, SpeciesGenomeStats, SpeciesRecord } from "../../types";
import { speciesColor } from "../../lib/speciesColor";
import type { VisualTraits } from "../../lib/creatureShape";
import { SpeciesGenetics } from "./SpeciesGenetics";
import { SpeciesPortrait } from "./SpeciesPortrait";

interface Props {
  record: SpeciesRecord | null;
  parent: SpeciesRecord | null;
  directChildren: SpeciesRecord[];
  frame: RenderFrame | null;
  genomeStats: SpeciesGenomeStats | null;
}

/**
 * Geographic distribution isn't tracked by the engine as a stat (see
 * HANDOFF.md limite noto: "segregazione geografica non verificata
 * sistematicamente"). Rather than add new engine bookkeeping, this
 * component derives a live distribution snapshot from the per-organism
 * x/y/speciesId arrays already present in every RenderFrame: current
 * count, centroid, and spread (mean distance from centroid) for the
 * selected species, plus a minimap plotting just its individuals against
 * the full population as faint background dots.
 */
export function SpeciesDetail({ record, parent, directChildren, frame, genomeStats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const geo = useMemo(() => computeGeography(record?.speciesId ?? null, frame), [record, frame]);

  // v0.6: the portrait's "typical individual" is the species' current mean
  // genome when it has living members (genomeStats), or its frozen
  // originGenomeSnapshot when it's extinct and no living genome data exists.
  const visualTraits: VisualTraits | null = useMemo(() => {
    if (!record) return null;
    if (genomeStats) {
      const g = genomeStats.genomeStats;
      return {
        speed: g.speed.mean,
        carnivory: g.carnivory.mean,
        vision: g.vision.mean,
        evasion: g.evasion.mean,
        huntingSkill: g.huntingSkill.mean,
      };
    }
    const s = record.originGenomeSnapshot;
    return { speed: s.speed, carnivory: s.carnivory, vision: s.vision, evasion: s.evasion, huntingSkill: s.huntingSkill };
  }, [record, genomeStats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !record) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { planetWidth, planetHeight, organismsX, organismsY, organismsSpecies } = frame;
    const scaleX = canvas.width / planetWidth;
    const scaleY = canvas.height / planetHeight;

    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background: every other organism, faint, for geographic context.
    for (let i = 0; i < organismsX.length; i++) {
      if (organismsSpecies[i] === record.speciesId) continue;
      ctx.beginPath();
      ctx.fillStyle = "rgba(138, 154, 146, 0.25)";
      ctx.arc(organismsX[i] * scaleX, organismsY[i] * scaleY, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Foreground: this species, highlighted.
    const color = speciesColor(record.speciesId);
    for (let i = 0; i < organismsX.length; i++) {
      if (organismsSpecies[i] !== record.speciesId) continue;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(organismsX[i] * scaleX, organismsY[i] * scaleY, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frame, record]);

  if (!record) {
    return <div className="species-detail-empty">Seleziona una specie dall&apos;albero per vederne i dettagli.</div>;
  }

  return (
    <div className="species-detail">
      <div className="species-detail-header">
        {visualTraits && <SpeciesPortrait traits={visualTraits} color={speciesColor(record.speciesId)} size={56} />}
        <h3>Specie #{record.speciesId}</h3>
        <span className={`species-status ${record.alive ? "alive" : "extinct"}`}>{record.alive ? "viva" : "estinta"}</span>
      </div>

      <dl className="species-facts">
        <Fact label="Origine" value={`anno ${record.originYear} (tick ${record.originTick.toLocaleString("it-IT")})`} />
        {!record.alive && record.extinctionTick !== null && (
          <Fact label="Estinzione" value={`tick ${record.extinctionTick.toLocaleString("it-IT")}`} />
        )}
        <Fact label="Popolazione registrata" value={record.population.toLocaleString("it-IT")} />
        <Fact label="Discendenza diretta" value={directChildren.length > 0 ? directChildren.map((c) => `#${c.speciesId}`).join(", ") : "nessuna"} />
        <Fact label="Specie madre" value={parent ? `#${parent.speciesId}` : "nessuna (specie fondatrice)"} />
      </dl>

      <div className="species-geo">
        <h4>Distribuzione geografica attuale</h4>
        {geo ? (
          <>
            <dl className="species-facts">
              <Fact label="Individui sulla mappa ora" value={String(geo.count)} />
              <Fact label="Centroide" value={`x=${geo.centroidX.toFixed(1)}, y=${geo.centroidY.toFixed(1)}`} />
              <Fact label="Dispersione media" value={`${geo.spread.toFixed(1)} celle`} />
            </dl>
            <canvas ref={canvasRef} width={220} height={220} className="species-minimap" role="img" aria-label={`Distribuzione geografica della specie ${record.speciesId}`} />
          </>
        ) : (
          <p className="species-geo-empty">Nessun individuo di questa specie attualmente sulla mappa.</p>
        )}
      </div>

      <div className="species-genetics-section">
        <h4>Analisi genetica</h4>
        <SpeciesGenetics genomeStats={genomeStats} parentSpeciesId={parent?.speciesId ?? null} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="species-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface Geography {
  count: number;
  centroidX: number;
  centroidY: number;
  spread: number;
}

function computeGeography(speciesId: number | null, frame: RenderFrame | null): Geography | null {
  if (speciesId === null || !frame) return null;
  const { organismsX, organismsY, organismsSpecies } = frame;

  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < organismsX.length; i++) {
    if (organismsSpecies[i] !== speciesId) continue;
    count++;
    sumX += organismsX[i];
    sumY += organismsY[i];
  }
  if (count === 0) return null;

  const centroidX = sumX / count;
  const centroidY = sumY / count;

  let sumDist = 0;
  for (let i = 0; i < organismsX.length; i++) {
    if (organismsSpecies[i] !== speciesId) continue;
    const dx = organismsX[i] - centroidX;
    const dy = organismsY[i] - centroidY;
    sumDist += Math.sqrt(dx * dx + dy * dy);
  }

  return { count, centroidX, centroidY, spread: sumDist / count };
}
