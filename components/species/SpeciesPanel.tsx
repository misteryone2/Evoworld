"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderFrame } from "../../types";
import { SpeciesTree } from "./SpeciesTree";
import { SpeciesDetail } from "./SpeciesDetail";
import { buildTimeline, recordSpeciesSnapshots, type SpeciesSnapshot, type SpeciesTraitStore } from "../../lib/speciesTraitHistory";

interface Props {
  frame: RenderFrame | null;
  /** v1.6.0 — whether the species portrait may use a second WebGL view; false on light profiles (a flat portrait is used instead). */
  portrait3D?: boolean;
}

/** v0.4: albero evolutivo + osservazione. Combines the genealogy tree with a detail/geography panel for the selected species. */
export function SpeciesPanel({ frame, portrait3D = true }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const speciesTree = frame?.speciesTree ?? [];

  // v1.5.0 — remembers each species' typical body over time for the shape
  // timeline. Lives and dies with this panel: page.tsx remounts it (key) when
  // the active planet changes, so species ids never mix across planets.
  const traitStoreRef = useRef<SpeciesTraitStore>(new Map());
  useEffect(() => {
    if (frame) recordSpeciesSnapshots(traitStoreRef.current, frame);
  }, [frame]);

  const { record, parent, directChildren, genomeStats } = useMemo(() => {
    const record = speciesTree.find((r) => r.speciesId === selectedId) ?? null;
    const parent = record?.parentSpeciesId != null ? speciesTree.find((r) => r.speciesId === record.parentSpeciesId) ?? null : null;
    const directChildren = record ? speciesTree.filter((r) => r.parentSpeciesId === record.speciesId) : [];
    const genomeStats = frame?.speciesGenomeStats.find((s) => s.speciesId === selectedId) ?? null;
    return { record, parent, directChildren, genomeStats };
  }, [speciesTree, selectedId, frame]);

  const timeline: SpeciesSnapshot[] = useMemo(() => {
    if (!record || !frame) return [];
    const g = genomeStats?.genomeStats;
    const current: SpeciesSnapshot | null = g
      ? {
          tick: frame.tick,
          year: frame.year,
          traits: { speed: g.speed.mean, carnivory: g.carnivory.mean, vision: g.vision.mean, evasion: g.evasion.mean, huntingSkill: g.huntingSkill.mean },
        }
      : null;
    return buildTimeline(record, traitStoreRef.current.get(record.speciesId) ?? [], current);
  }, [record, genomeStats, frame]);

  if (!frame) {
    return <div className="species-panel">Inizializzazione del mondo…</div>;
  }

  return (
    <div className="species-panel">
      <h2>Albero evolutivo</h2>
      <div className="species-panel-body">
        <SpeciesTree speciesTree={speciesTree} selectedId={selectedId} onSelect={setSelectedId} />
        <SpeciesDetail record={record} parent={parent} directChildren={directChildren} frame={frame} genomeStats={genomeStats} timeline={timeline} portrait3D={portrait3D} />
      </div>
    </div>
  );
}
