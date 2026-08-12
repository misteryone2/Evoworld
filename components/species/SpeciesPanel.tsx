"use client";

import { useMemo, useState } from "react";
import type { RenderFrame } from "../../types";
import { SpeciesTree } from "./SpeciesTree";
import { SpeciesDetail } from "./SpeciesDetail";

interface Props {
  frame: RenderFrame | null;
}

/** v0.4: albero evolutivo + osservazione. Combines the genealogy tree with a detail/geography panel for the selected species. */
export function SpeciesPanel({ frame }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const speciesTree = frame?.speciesTree ?? [];

  const { record, parent, directChildren, genomeStats } = useMemo(() => {
    const record = speciesTree.find((r) => r.speciesId === selectedId) ?? null;
    const parent = record?.parentSpeciesId != null ? speciesTree.find((r) => r.speciesId === record.parentSpeciesId) ?? null : null;
    const directChildren = record ? speciesTree.filter((r) => r.parentSpeciesId === record.speciesId) : [];
    const genomeStats = frame?.speciesGenomeStats.find((s) => s.speciesId === selectedId) ?? null;
    return { record, parent, directChildren, genomeStats };
  }, [speciesTree, selectedId, frame]);

  if (!frame) {
    return <div className="species-panel">Inizializzazione del mondo…</div>;
  }

  return (
    <div className="species-panel">
      <h2>Albero evolutivo</h2>
      <div className="species-panel-body">
        <SpeciesTree speciesTree={speciesTree} selectedId={selectedId} onSelect={setSelectedId} />
        <SpeciesDetail record={record} parent={parent} directChildren={directChildren} frame={frame} genomeStats={genomeStats} />
      </div>
    </div>
  );
}
